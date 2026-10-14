// node --test still/test/*.test.mjs   (Your move, pick from a list: Junyan 2026-10-14, d10 A, d7, d8)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(new URL("../quest-agenda.js", import.meta.url), "utf8"), ctx);
const A = ctx.QuestAgenda;
const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 14, h, m));   // Oct 14, h:m UTC
const iso = d => new Date(d).toISOString();
const plain = x => JSON.parse(JSON.stringify(x));

test("a pick starts at now rounded up to 5 minutes once the gap has begun, else at the gap start", () => {
  let r = A.pickSpan(at(19, 0), at(21, 0), at(19, 22), 5);
  assert.equal(iso(r.s), iso(at(19, 25)));
  r = A.pickSpan(at(19, 0), at(21, 0), at(18, 10), 5);
  assert.equal(iso(r.s), iso(at(19, 0)));
  r = A.pickSpan(at(19, 0), at(21, 0), at(19, 25), 5);   // already on a 5 minute mark
  assert.equal(iso(r.s), iso(at(19, 25)));
});

test("a pick lasts the task's estimate, at least 15 minutes, and never past the gap end", () => {
  assert.equal(iso(A.pickSpan(at(19), at(21), at(18), 5).e), iso(at(19, 15)));
  assert.equal(iso(A.pickSpan(at(19), at(21), at(18), 30).e), iso(at(19, 30)));
  assert.equal(iso(A.pickSpan(at(19), at(19, 40), at(18), 60).e), iso(at(19, 40)));
  assert.equal(iso(A.pickSpan(at(19), at(19, 10), at(18), 30).e), iso(at(19, 10)));
});

test("two picks with the same start get different keys", () => {
  const a = A.addKey(at(19, 25)), b = A.addKey(at(19, 25));
  assert.notEqual(a, b);
  assert.match(a, /^x\d+-[a-z0-9]+$/);
});

test("picking a task that is not on today's plan adds one block", () => {
  const r = A.placePick([], { t:"Walk", pickId:"walk", s:at(19, 25), e:at(19, 55) }, "x1-a");
  assert.equal(r.moved, false);
  assert.equal(r.key, "x1-a");
  assert.deepEqual(plain(r.adds), [{ key:"x1-a", s:iso(at(19, 25)), e:iso(at(19, 55)), t:"Walk", type:"task", cal:"you", pickId:"walk" }]);
});

test("picking a task that is already on today's plan moves its block, never a second copy", () => {
  const adds = [{ key:"x9-a", s:iso(at(15)), e:iso(at(15, 20)), t:"Pay the bill", type:"task", cal:"you", taskId:"T1" },
    { key:"x7-b", s:iso(at(12)), e:iso(at(12, 30)), t:"Lunch", type:"task", cal:"you" }];
  const r = A.placePick(adds, { t:"Pay the bill", taskId:"T1", pickId:"task:T1", s:at(19, 25), e:at(19, 40) }, "new-key");
  assert.equal(r.moved, true);
  assert.equal(r.key, "x9-a");   // same block, so its check-ins stay with it
  assert.equal(r.adds.length, 2);
  const b = r.adds.find(x => x.taskId === "T1");
  assert.equal(b.s, iso(at(19, 25))); assert.equal(b.e, iso(at(19, 40)));
  assert.equal(adds[0].s, iso(at(15)), "the list it was given is left alone");
});

test("a practice or rest pick matches today's block of the same name too", () => {
  const adds = [{ key:"x5-a", s:iso(at(8)), e:iso(at(8, 15)), t:"Isha Kriya", type:"task", cal:"you" }];
  const r = A.placePick(adds, { t:"Isha Kriya", pickId:"isha kriya", s:at(19, 25), e:at(19, 40) }, "k");
  assert.equal(r.moved, true); assert.equal(r.adds.length, 1); assert.equal(r.adds[0].pickId, "isha kriya");
  // a Notion task never matches by name alone
  const r2 = A.placePick([{ key:"x5-a", s:iso(at(8)), e:iso(at(8, 15)), t:"Call Chase", type:"task", cal:"you" }],
    { t:"Call Chase", taskId:"T2", pickId:"task:T2", s:at(19), e:at(19, 15) }, "k2");
  assert.equal(r2.moved, false); assert.equal(r2.adds.length, 2);
});

test("old duplicates of the task collapse into the one moved block, and Undo brings them back", () => {
  const adds = [{ key:"x1", s:iso(at(9)), e:iso(at(9, 15)), t:"Walk", type:"task", cal:"you" },
    { key:"x2", s:iso(at(10)), e:iso(at(10, 15)), t:"Walk", type:"task", cal:"you" },
    { key:"x3", s:iso(at(11)), e:iso(at(11, 15)), t:"Lunch", type:"task", cal:"you" }];
  const r = A.placePick(adds, { t:"Walk", pickId:"walk", s:at(19), e:at(19, 30) }, "k");
  assert.deepEqual([...r.adds.map(x => x.key)].sort(), ["x1", "x3"]);
  const back = A.undoPick(r.adds, r);
  assert.deepEqual(plain(back.slice().sort((p, q) => p.key < q.key ? -1 : 1)), plain(adds));
});

test("Undo of an add removes only that block, even when another starts at the same time", () => {
  const other = { key:A.addKey(at(19, 25)), s:iso(at(19, 25)), e:iso(at(19, 40)), t:"Nadi Shuddhi", type:"task", cal:"you" };
  const r = A.placePick([other], { t:"Walk", pickId:"walk", s:at(19, 25), e:at(19, 55) }, A.addKey(at(19, 25)));
  assert.equal(r.adds.length, 2);
  assert.deepEqual(plain(A.undoPick(r.adds, r)), plain([other]));
});

test("a picked block uses up the free time it covers: no Your move under or beside it", () => {
  const open = { s:at(18), e:at(21), t:"Open space", kind:"open", key:"o1", game:true };
  const pick = { s:at(19, 25), e:at(19, 40), t:"Walk", kind:"body", key:"x1-a", extra:true, game:true };
  const dinner = { s:at(21), e:at(22), t:"Dinner", kind:"fuel", key:"d" };
  const out = A.carveFree([open, pick, dinner]);
  const free = out.filter(b => b.kind === "open");
  assert.deepEqual(plain(free.map(b => [iso(b.s), iso(b.e)])), [[iso(at(18)), iso(at(19, 25))], [iso(at(19, 40)), iso(at(21))]]);
  assert.ok(free.every(b => !(b.s < pick.e && b.e > pick.s)), "no free block overlaps the pick");
  assert.deepEqual(plain(out.map(b => b.t)), ["Open space", "Walk", "Open space", "Dinner"]);
  assert.equal(open.e.getTime(), at(21).getTime(), "the block it was given is left alone");
});

test("a pick that fills the gap, or leaves under 5 minutes of it, leaves no Your move there", () => {
  const open = { s:at(19), e:at(19, 30), t:"Open space", kind:"open", key:"o1" };
  let out = A.carveFree([open, { s:at(19), e:at(19, 30), t:"Walk", kind:"body", key:"x", extra:true }]);
  assert.deepEqual(plain(out.map(b => b.t)), ["Walk"]);
  out = A.carveFree([open, { s:at(19, 3), e:at(19, 27), t:"Walk", kind:"body", key:"x", extra:true }]);
  assert.deepEqual(plain(out.map(b => b.t)), ["Walk"]);
  // calendar events are left to the planner: only blocks added in Quest use up open space
  out = A.carveFree([open, { s:at(19), e:at(19, 30), t:"Tour", kind:"fixed", key:"t", id:"cal1" }]);
  assert.deepEqual(plain(out.map(b => b.t)), ["Open space", "Tour"]);
});

test("time range reads like 7:25 to 7:40 PM", () => {
  assert.equal(A.rangeText("7:25 PM", "7:40 PM"), "7:25 to 7:40 PM");
  assert.equal(A.rangeText("11:45 AM", "12:15 PM"), "11:45 AM to 12:15 PM");
  assert.equal(A.rangeText("19:25", "19:40"), "19:25 to 19:40");
});

test("the list knows which tasks are already on today's plan (the Move here tag)", () => {
  const adds = [{ key:"x1", t:"Walk", taskId:undefined }, { key:"x2", t:"Pay", taskId:"T1" }];
  assert.equal(adds.some(a => A.samePick(a, { t:"Walk", pickId:"walk" })), true);
  assert.equal(adds.some(a => A.samePick(a, { t:"NSDR", pickId:"nsdr" })), false);
  assert.equal(adds.some(a => A.samePick(a, { t:"Pay something", taskId:"T1" })), true);
});

test("a block that is already history (ended or checked in) stays put; the pick adds a new one", () => {
  const adds = [{ key:"x1", s:iso(at(8)), e:iso(at(8, 30)), t:"Walk", type:"task", cal:"you" },
    { key:"x2", s:iso(at(9)), e:iso(at(9, 15)), t:"Pay", type:"task", cal:"you", taskId:"T1" }];
  const done = a => a.key === "x1" || a.key === "x2";
  let r = A.placePick(adds, { t:"Walk", pickId:"walk", s:at(19), e:at(19, 30) }, "k1", done);
  assert.equal(r.moved, false); assert.equal(r.adds.length, 3); assert.equal(r.adds[0].s, iso(at(8)));
  r = A.placePick(adds, { t:"Pay", taskId:"T1", s:at(19), e:at(19, 15) }, "k2", done);
  assert.equal(r.moved, false); assert.equal(r.adds.length, 3);
});

// quest.html is the caller: it names picks with pickId (the module's field) and tells placePick which
// blocks are already history, so a re-pick never drags this morning's checked-in block to the evening
test("quest.html calls placePick with pickId picks and a history check", () => {
  const html = fs.readFileSync(new URL("../quest.html", import.meta.url), "utf8");
  const move = html.slice(html.indexOf("function openMove("), html.indexOf("function undoToast("));
  assert.ok(move.length > 100, "openMove and pickMove are there");
  assert.doesNotMatch(move, /[{,]\s*pick:/, "no old pick: field");
  assert.match(move, /pickId:/);
  assert.match(move, /placePick\([^;]*newKey\([^)]*\),\s*\w+\)/, "placePick gets a fourth argument (done)");
  assert.match(move, /samePick\([^)]*\)\s*&&\s*!\w+\(a\)/, "the Move here tag skips blocks that are history");
});
