// node --test still/test/*.test.mjs   (Junyan, 2026-10-19: prep-list and plain steps are fun tiles too (d23); nothing slides
// the rest of the day (d50); a stretched end stops at the next block (d51); every add uses the own-block snap)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const load = f => { const ctx = {}; ctx.globalThis = ctx; vm.runInNewContext(fs.readFileSync(here + f, "utf8"), ctx); return ctx; };
const A = load("quest-agenda.js").QuestAgenda;
const B = load("quest-basics.js").QuestBasics;
const html = fs.readFileSync(here + "quest.html", "utf8");
const bag = fs.readFileSync(here + "bag.js", "utf8");
const T = (hm) => new Date(`2026-10-19T${hm}:00+02:00`);
const hm = d => new Date(+d + 2 * 3600000).toISOString().slice(11, 16);
const J = (key, s, e, t, extra = {}) => ({ key, id:"ev-" + key, calId:A.JOINT, cal:"Joint Plans", s:T(s), e:T(e), t, kind:"fixed", ...extra });
const Y = (key, s, e, t) => ({ key, id:"ev-" + key, calId:A.JUNYAN, cal:"Junyan", s:T(s), e:T(e), t, kind:"fixed" });
const Q = (key, s, e, t) => ({ key, s:T(s), e:T(e), t, extra:true, kind:"task" });
const at = r => `${hm(r.s)}-${hm(r.e)}`;
const fn = name => { const i = html.indexOf(name); assert.ok(i >= 0, name); return html.slice(i, html.indexOf("\n  }\n", i)); };

/* ---------- d23: tiles everywhere ---------- */
test("every plain step gets an icon for its tile", () => {
  for (const id of ["domestics", "winddown", "groom"]) for (const m of ["home", "travel"]) for (const wd of [0, 1, 2, 3, 4, 5, 6])
    for (const st of B.basic(id, m, wd).steps) assert.ok(B.stepIcon(st.t), `${id}: ${st.t}`);
  assert.equal(B.stepIcon("Tidy the room"), "🛏️");
  assert.equal(B.stepIcon("Wash the dishes"), "🍽️");
  assert.equal(B.stepIcon("Sweep"), "🧹");
  assert.equal(B.stepIcon("Plus One: Vacuum"), "🧹");
  assert.equal(B.stepIcon("Something nobody planned for"), "✅");
  assert.equal(B.stepIcon("Pack the passport"), "🎒");
});

test("a block's checklist: every step is a tile, none is a plain checkbox row; plain steps keep paying nothing", () => {
  const bh = fn("function basicHtml(");
  assert.ok(!/\$\{ck\}\$\{W\.tick\[i\]/.test(bh), "no checkbox rows for steps");
  assert.match(bh, /steps\.map\(\(\[x, i\]\) => stepTile\(/, "every step goes through stepTile");
  const st = fn("function stepTile(");
  assert.match(st, /stepIcon\(/, "a plain step's tile has its own icon");
  // a plain step pays nothing (no habit), so its tile shows no amount
  const W = { tick:{}, paid:{} }, steps = B.domestics("home", 1).steps, i = steps.findIndex(x => /Sweep/.test(x.t));
  const r = B.tickStep(W, { W }, "domestics", i, steps[i], 11, () => 2);
  assert.equal(r.on, true); assert.equal(r.pay, null);
});

test("2026-10-20: Tidy the room pays body +2 once a day, and an untick takes it back", () => {
  assert.match(html, /\["tidy", "Tidy the room", 2, 1, "🛏️", "Tidy the room", "blk", "Morning"\]/, "a Morning habit, so meterOf gives body");
  const steps = B.domestics("travel", 1).steps, i = steps.findIndex(x => /Tidy/.test(x.t));
  assert.equal(steps[i].h, "tidy");
  const W = { tick:{}, paid:{} }, all = { W };
  const r = B.tickStep(W, all, "domestics", i, steps[i], 11, () => 2);
  assert.equal(r.pay.h, "tidy"); assert.equal(r.pay.d, 2);
  B.applyTick(W, i, r); assert.ok(W.paid[i]);
  const off = B.tickStep(W, all, "domestics", i, steps[i], 11, () => 2);
  assert.equal(off.on, false); assert.equal(off.back.d, 2);
  // a second Domestics the same day finds the daily limit used (gain 0): no second payment
  const W2 = { tick:{}, paid:{} }, again = B.tickStep(W2, { W, W2 }, "domestics", i, steps[i], 11, () => 0);
  assert.equal(again.pay, null);
});

test("2026-10-20: a block's tile sheet has no Done button, no paid line and no legend; the last tick closes it", () => {
  const bh = fn("function basicHtml(");
  assert.ok(!/data-bdone|Nothing paid yet|Paid so far|fills prana|each one pays once/.test(bh));
  assert.match(bh, /"Steps"\} \$\{steps\.filter/, "the STEPS n/m header stays");
  assert.ok(!/data-bdone/.test(html), "no handler left for the old button");
  const ts = fn("function tapStep(");
  assert.match(ts, /B\.steps\.every\(\(x, j\) => skip\[j\] \|\| t\.W\.tick\[j\]\)/);
  assert.match(ts, /basicDone\(blk\)/);
});

test("prep lists (the insight agent's) are tiles in the window and in the planner, with the same tick rule", () => {
  const ow = fn("function openWork(");
  assert.ok(!/class="wck\$\{W\.tick\[i\]/.test(ow), "no checkbox rows in the window");
  assert.match(ow, /prepTile\(/);
  assert.match(ow, /data-tick/);
  const md = fn("function moDetail(");
  // only a hotel desk list (tick plus a typed answer) keeps its rows
  assert.match(md, /\$\{bk \? items\.map\(\(x, i\) => `<button class="mo-ck/, "no checkbox rows in the planner but the desk list");
  assert.match(md, /prepTile\(/);
  const pt = fn("function prepTile(");
  assert.match(pt, /class="htile/); assert.match(pt, /data-tick=/); assert.match(pt, /stepIcon\(/);
});

/* ---------- d50: nothing slides the rest of the day ---------- */
test("no button or item pushes today's plan", () => {
  for (const gone of ["function shiftFrom(", "function stretch(", "function extend(", "function openExtend(", "function openShiftMenu(",
    "Need more time", "Shift the rest of the day", "Make room", "moved 15 min later", 'id="rShift"'])
    assert.ok(!html.includes(gone), gone);
  assert.ok(!/giveItem\("(buffer|map)"/.test(html), "the Buffer Stone and Trail Map are no longer handed out");
  const ctxSrc = html.slice(html.indexOf("const BAG_CTX"), html.indexOf("function openBag("));
  assert.ok(!/shiftFrom|openShiftMenu/.test(ctxSrc));
  assert.ok(!/Adds 15 minutes before your next block|Replans the rest of your day/.test(bag), "the bag says what they do now");
  assert.match(fn("function openRecover("), /rAbsorb/, "welcome back still offers Absorb it");
});

/* ---------- d51: a stretched end stops at the next block ---------- */
test("clampEdge: an end dragged into the next block stops at its start; the block does not jump", () => {
  const day = [J("dom", "11:00", "12:30", "Domestics"), J("lunch", "13:00", "14:00", "Lunch"), Q("read", "15:00", "15:30", "Read")];
  const r = A.clampEdge(day, { ...day[0], e:T("13:45") }, "bottom", day[0]);
  assert.equal(at(r), "11:00-13:00"); assert.equal(r.hit.key, "lunch");
  // into a Quest add too
  const r2 = A.clampEdge(day, { ...day[1], e:T("15:15") }, "bottom", day[1]);
  assert.equal(at(r2), "13:00-15:00");
  // a clear stretch stays
  const r3 = A.clampEdge(day, { ...day[2], e:T("16:15") }, "bottom", day[2]);
  assert.equal(at(r3), "15:00-16:15"); assert.equal(r3.hit, null);
  // a start dragged up into the block before stops at its end
  const r4 = A.clampEdge(day, { ...day[1], s:T("12:00") }, "top", day[1]);
  assert.equal(at(r4), "12:30-14:00"); assert.equal(r4.hit.key, "dom");
  // Junyan calendar events neither stop it nor get stopped
  const mix = [Y("call", "12:00", "13:00", "Call"), J("a", "11:00", "11:30", "A")];
  assert.equal(A.clampEdge(mix, { ...mix[1], e:T("12:45") }, "bottom", mix[1]).hit, null);
  // a block that already overlapped the next one before the drag never shrinks below where it was
  const ov = [J("x", "10:00", "11:30", "X"), J("y", "11:00", "12:00", "Y")];
  assert.equal(at(A.clampEdge(ov, { ...ov[0], e:T("11:45") }, "bottom", ov[0])), "10:00-11:30");
  // nothing else changes
  const before = JSON.stringify(day); A.clampEdge(day, { ...day[0], e:T("15:00") }, "bottom", day[0]);
  assert.equal(JSON.stringify(day), before);
});

test("the calendar drag: an edge drag clamps, only a whole-block move snaps", () => {
  const cd = fn("async function commitDrag(");
  assert.match(cd, /placeEdge\(/);
  assert.ok(cd.indexOf("placeEdge(") < cd.indexOf('"/cal/event"'), "clamped before the calendar write");
  assert.match(html, /commitDrag\(d\.b, d\.dk, r\.s, r\.e, d\.mode\)/, "the drag passes which edge moved");
  // saving the clamped edge does not snap the block again
  assert.match(cd, /saveBlock\(b, s, e, b\.t, true\)/);
  assert.match(fn("function saveBlock("), /placed/);
});

/* ---------- every add uses the own-block snap ---------- */
test("every add path places its block with placeOwn before it writes", () => {
  const before = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b); return i >= 0 && j >= 0 && i < j; };
  const sug = fn("async function sugAdd(");
  assert.ok(before(sug, "placeOwn(", '"/cal/event"'), "suggestion adds");
  assert.ok(before(fn("function addSadhana("), "placeOwn(", "o.adds.push"), "practice add (Shambhavi)");
  assert.ok(before(fn("async function startNow("), "placeOwn(", "o.adds.push"), "recover adds");
  assert.ok(before(fn("async function nearbyPut("), "placeOwn(", "o.adds.push"), "Nearby adds");
  const mo = html.slice(html.indexOf("    add: (t, s, e, extra) => {"), html.indexOf("    // done in Notion;"));
  assert.ok(before(mo, "placeOwn(", "o.adds.push"), "morning non-gym adds");
  const ab = html.slice(html.indexOf("    addBasic: (id, s) =>"), html.indexOf("    setMode:"));
  assert.ok(before(ab, "placeOwn(", "o.adds.push"), "Fill it basics");
  const pb = fn("async function placeBasics(");
  assert.ok(before(pb, "placeOwn(", "o.adds.push"), "basics placement");
  // the idea sheet's today add goes through addBlockCal or addBlock, which place it
  assert.match(fn("async function openScheduleIdea("), /\(cal \? addBlockCal : addBlock\)\(title, s, e\)/);
  // no o.adds.push anywhere without a placeOwn shortly before it
  for (const m of html.matchAll(/o\.adds\.push\(/g))
    assert.ok(html.slice(m.index - 1500, m.index).includes("placeOwn("), "an add with no placeOwn: " + html.slice(m.index - 120, m.index + 60));
});

test("placeOwn can see adds placed earlier in the same batch", () => {
  assert.match(fn("function placeOwn("), /more/);
  // freeSlot itself: a second basic placed after the first lands after it
  const first = Q("caney", "09:00", "09:15", "Caney");
  const r = A.freeSlot([first], Q("dom", "09:00", "09:30", "Domestics"));
  assert.equal(at(r), "09:15-09:45");
});

/* ---------- 2026-10-23: the items system is gone ("Let's completely remove the items system") ---------- */
test("no item is handed out, the bag keeps only keepsakes", () => {
  assert.ok(!/giveItem|lotusGiven/.test(html), "nothing hands out items");
  const ctxSrc = html.slice(html.indexOf("const BAG_CTX"), html.indexOf("function openBag("));
  assert.ok(!/lotus|water|breath|bell|lantern|scout/.test(ctxSrc), "no item actions left");
  assert.match(html, /const noItems = /, "items already in the bag are cleared");
  assert.ok(!/bag-grid|Quick bar/.test(bag.slice(bag.indexOf("function bagHTML("), bag.indexOf("function shelfHTML("))), "the bag sheet shows no item grid");
});
