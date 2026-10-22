// node --test still/test/*.test.mjs   (Junyan, 2026-10-22: "adding and moving things is really slow and glitchy".
// Measured in the preview against a mock with still-api's delays: an add showed after about 3 s (the calendar save, then a
// full pull of about 30 requests), the edit box's Save after 3.6 s, and a drop of a block added in Quest after 0.8 s (a
// pull and a save of the edit layer). Now each lands at once, the save and the read-back run behind it, and a failed save
// takes it back with a toast.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(here + "quest-agenda.js", "utf8"), ctx);
const A = ctx.QuestAgenda;
const html = fs.readFileSync(here + "quest.html", "utf8");
const fn = name => { const i = html.indexOf(name); assert.ok(i >= 0, name); return html.slice(i, html.indexOf("\n  }\n", i)); };
const J = x => JSON.parse(JSON.stringify(x));
const MIN = 60000, T0 = Date.parse("2026-10-22T13:00:00Z");

test("an add on its way shows at once where he put it, as a ghost that cannot be dragged yet", () => {
  const list = [{ key:"a", id:"ev1", t:"Lunch", s:new Date(T0), e:new Date(T0 + 60 * MIN) }];
  const ghosts = { g1:{ key:"g1", s:T0 + 120 * MIN, e:T0 + 150 * MIN, t:"Call the bank", calId:A.JOINT, cal:"Joint Plans", at:T0 } };
  const out = A.withGhosts(list, ghosts, T0 + 1000);
  assert.equal(out.length, 2);
  const g = out[1];
  assert.equal(g.t, "Call the bank"); assert.equal(+g.s, T0 + 120 * MIN); assert.equal(g.ghost, true); assert.equal(g.pending, true);
  assert.equal(g.game, false);
  assert.equal(A.dragKind(g, { paired:true }).kind, "lock");
  assert.match(A.dragKind(g, { paired:true }).why, /Still saving/);
  assert.equal(list.length, 1, "the plan list itself is not changed");
});

test("the ghost goes once the plan read back holds the event, by id, or by name and start before the calendar answered", () => {
  const g = { key:"g1", s:T0, e:T0 + 30 * MIN, t:"Pack bags", at:T0 };
  const back = [{ key:"x", id:"ev9", t:"Pack bags", s:new Date(T0), e:new Date(T0 + 30 * MIN) }];
  assert.equal(A.withGhosts(back, { g1:g }, T0).length, 1, "same name and start");
  assert.equal(A.withGhosts(back, { g1:{ ...g, id:"ev9" } }, T0).length, 1, "same id");
  assert.equal(A.withGhosts(back, { g1:{ ...g, id:"ev10" } }, T0).length, 2, "another event with that name stays apart");
  assert.equal(A.withGhosts([], { g1:g }, T0 + 3 * 60 * MIN + 1).length, 0, "gone after 3 minutes");
});

test("ghosts fall in time order with the rest", () => {
  const list = [{ key:"a", t:"A", s:new Date(T0), e:new Date(T0 + MIN) }, { key:"c", t:"C", s:new Date(T0 + 60 * MIN), e:new Date(T0 + 61 * MIN) }];
  const out = A.withGhosts(list, { g:{ key:"g", t:"B", s:T0 + 30 * MIN, e:T0 + 40 * MIN, at:T0 } }, T0);
  assert.deepEqual(out.map(b => b.t), ["A", "B", "C"]);
});

test("a change waiting on the calendar shows its new name too, until the plan read back has both", () => {
  const b = { key:"k", id:"ev1", t:"Call", s:new Date(T0), e:new Date(T0 + 30 * MIN) };
  const pend = { "id:ev1":{ s:T0, e:T0 + 60 * MIN, t:"Call the bank", at:T0 } };
  const [x] = A.applyPending([b], pend, T0 + 1000);
  assert.equal(x.t, "Call the bank"); assert.equal(+x.e, T0 + 60 * MIN); assert.equal(x.pending, true);
  const [y] = A.applyPending([{ ...b, t:"Call the bank", e:new Date(T0 + 60 * MIN) }], pend, T0 + 1000);
  assert.equal(y.pending, undefined, "read back: drawn as the plan has it");
  // a move without a name keeps the plan's name
  const [z] = A.applyPending([b], { "id:ev1":{ s:T0 + 60 * MIN, e:T0 + 90 * MIN, at:T0 } }, T0 + 1000);
  assert.equal(z.t, "Call");
});

/* writeOps as the page has it, with the page around it stubbed. pull(): what pullOps does next ("fresh" brings the
   server's copy, "none" brings nothing, as offline with an empty outbox). */
function ops(start){
  const src = html.slice(html.indexOf("  const OPS_WAIT = [];"), html.indexOf("  const keyOf = b =>"));
  const make = new Function("start", "S", `
    let OPS = start; const DRY = false, OPS_OUT = "out", dayKey = () => "Thu Oct 22 2026";
    const store = { set:(k, v) => S.out.push(JSON.parse(v)[dayKey()]) }, readJSON = () => ({});
    const QuestOffline = { queueOps:(o, d, x) => ({ [d]:JSON.parse(JSON.stringify(x)) }) };
    const saveSnap = () => {}, flushOps = async () => {};
    const render = () => S.renders.push(JSON.parse(JSON.stringify(OPS)));
    const pullOps = () => new Promise(res => S.pulls.push(kind => { if (kind === "fresh") OPS = JSON.parse(JSON.stringify(S.server)); res(); }));
    ${src}
    return { writeOps, get OPS(){ return OPS; } };`);
  const S = { renders:[], pulls:[], out:[], server:J(start) };
  return { S, P:make(J(start), S) };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const add = (key, t) => o => { o.adds.push({ key, t }); };
const empty = () => ({ edits:{}, drops:[], adds:[], ts:0 });

test("writeOps: his change is drawn before the pull answers, then made once on the server's fresh copy", async () => {
  const { S, P } = ops(empty());
  S.server.adds.push({ key:"other", t:"From the laptop" });
  const done = P.writeOps(add("x1", "Stretch"), true);
  assert.deepEqual(S.renders[0].adds.map(a => a.key), ["x1"], "on screen at once");
  await tick(); S.pulls.shift()("fresh"); await done;
  assert.deepEqual(P.OPS.adds.map(a => a.key), ["other", "x1"], "the laptop's add is kept, his is there once");
  assert.deepEqual(S.out[0].adds.map(a => a.key), ["other", "x1"]);
});

test("writeOps: when the pull brings nothing, the change is not made twice", async () => {
  const { S, P } = ops(empty());
  const done = P.writeOps(add("x1", "Stretch"), true);
  await tick(); S.pulls.shift()("none"); await done;
  assert.deepEqual(P.OPS.adds.map(a => a.key), ["x1"]);
  assert.deepEqual(S.out[0].adds.map(a => a.key), ["x1"]);
});

test("writeOps: two quick changes both stay on screen, take turns, and each is sent once", async () => {
  const { S, P } = ops(empty());
  const d1 = P.writeOps(add("x1", "One"), true), d2 = P.writeOps(add("x2", "Two"), true);
  assert.deepEqual(S.renders[1].adds.map(a => a.key), ["x1", "x2"], "both on screen before any pull");
  await tick();
  assert.equal(S.pulls.length, 1, "the second waits for the first");
  S.pulls.shift()("fresh"); await d1;
  assert.deepEqual(S.out[0].adds.map(a => a.key), ["x1"], "the first save sends only the first");
  assert.deepEqual(P.OPS.adds.map(a => a.key), ["x1", "x2"], "the second is still on screen after the first pull");
  S.server = J(S.out[0]);
  await tick(); S.pulls.shift()("fresh"); await d2;
  assert.deepEqual(P.OPS.adds.map(a => a.key), ["x1", "x2"]);
  assert.deepEqual(S.out[1].adds.map(a => a.key), ["x1", "x2"]);
});

test("writeOps without early (the planner's own placing) works as before: pull, then change", async () => {
  const { S, P } = ops(empty());
  const done = P.writeOps(add("b1", "Basics"));
  assert.equal(S.renders.length, 0, "nothing drawn before the pull");
  await tick(); S.pulls.shift()("none"); await done;
  assert.deepEqual(P.OPS.adds.map(a => a.key), ["b1"]);
});

test("his own move, add and remove in today's plan use the early path", () => {
  assert.match(fn("function saveBlock("), /writeOps\(o => setBlock\(o, b, s, e, t\), true\)/);
  assert.match(fn("function addBlock("), /\}, true\);/);
  assert.match(fn("function dropBlock("), /\}, true\);/);
  // the planner's placing keeps the old path: its change writes log lines, which must not run twice
  assert.match(fn("async function placeBasics("), /await writeOps\(o => \{[\s\S]*\}\);\n/);
});

test("an add to Google Calendar shows a ghost before the save, takes it back on failure, and has no alert", () => {
  const f = fn("async function addBlockCal(");
  assert.ok(f.indexOf("GHOST[g] = ") < f.indexOf('"/cal/event"'), "the ghost goes up before the save");
  assert.match(f, /catch \(err\) \{\s*delete GHOST\[g\]; redrawCal\(\);/);
  assert.match(f, /GHOST\[g\]\.id = made\.id/);
  assert.doesNotMatch(f, /alert\(/);
  assert.match(f, /await pullCal\(\)/);
});

test("the edit box's Save shows the new time and name before the calendar answers; a failure is a toast", () => {
  const f = fn("async function saveBlockCal(");
  assert.ok(f.indexOf("PEND[k] = ") < f.indexOf('"/cal/event"'));
  assert.match(f, /delete PEND\[k\];\s*calToast\(/);
  assert.doesNotMatch(f, /alert\(/);
  assert.match(f, /await pullCal\(\)/);
});

test("after his own calendar write only the calendar is read back, not the whole pull", () => {
  const f = fn("async function pullCal(");
  assert.match(f, /Promise\.all\(\[pullPlan\(\), pullAgenda\(\)\]\)/);
  assert.doesNotMatch(f, /pullAll|pullTasks|pullState/);
  assert.match(fn("async function commitDrag("), /await pullCal\(\)/);
  assert.doesNotMatch(fn("async function commitDrag("), /pullAll/);
  // a block added in Quest: the toast does not wait for the save
  assert.match(fn("async function commitDrag("), /const saving = saveBlock\(b, s, e, b\.t, true\);\s*calToast/);
});

test("the agenda draws ghosts, and the once-a-second redraw waits while a block is held", () => {
  assert.match(fn("function agendaBlocks("), /withGhosts\(merged, GHOST, Date\.now\(\)\)/);
  assert.match(html, /setInterval\(\(\) => \{ tick\(\); if \(!\$\("sheet"\)\.classList\.contains\("open"\) && !\(DRAG && DRAG\.live\)\) render\(\); \}, 1000\);/);
  // a pull in between keeps his changes still on their way
  // only when this pull's own copy replaced the edit layer, so a save's turn that already put them back is not doubled
  assert.match(fn("async function pullAll("), /pullOps\(\)\.then\(got => \{ if \(got\) OPS_WAIT\.forEach\(m => m\(OPS\)\); \}\)/);
  assert.match(fn("async function pullOps("), /const late = QuestOffline\.pendingOps/);
});

test("a gym reschedule lands at once and the sheet closes before the calendar answers; a failure puts it back", () => {
  const f = fn("async function moveGymNow(");
  assert.ok(f.indexOf("closeSheet(); redrawCal();") < f.indexOf('"/cal/event"'));
  assert.match(f, /catch \(err\) \{ delete PEND\[k\]; redrawCal\(\); calToast\(/);
});
