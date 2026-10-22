// node --test still/test/*.test.mjs   (Junyan, 2026-10-19: "don't push any plans only move the things that I'm moving on the
// calendar specifically", "nothing should be pushed". This reverses the make-room pushes of #34 and #36: when the block
// he moves or adds lands on another, his block goes to the next free 15-minute slot and nothing else moves.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const load = f => { const ctx = {}; ctx.globalThis = ctx; vm.runInNewContext(fs.readFileSync(here + f, "utf8"), ctx); return ctx; };
const A = load("quest-agenda.js").QuestAgenda;
const html = fs.readFileSync(here + "quest.html", "utf8");
const T = (hm) => new Date(`2026-10-19T${hm}:00+02:00`);
const hm = d => new Date(+d + 2 * 3600000).toISOString().slice(11, 16);
const J = (key, s, e, t, extra = {}) => ({ key, id:"ev-" + key, calId:A.JOINT, cal:"Joint Plans", s:T(s), e:T(e), t, kind:"fixed", ...extra });
const Y = (key, s, e, t) => ({ key, id:"ev-" + key, calId:A.JUNYAN, cal:"Junyan", s:T(s), e:T(e), t, kind:"fixed" });
const Q = (key, s, e, t) => ({ key, s:T(s), e:T(e), t, extra:true, kind:"task" });
const at = r => `${hm(r.s)}-${hm(r.e)}`;
const fn = name => { const i = html.indexOf(name); assert.ok(i >= 0, name); return html.slice(i, html.indexOf("\n  }\n", i)); };

test("freeSlot: a block that lands on another goes to the next 15-minute mark after it, the same length", () => {
  const day = [J("gym", "14:00", "15:00", "Gym"), J("rest", "15:10", "16:50", "Rest")];
  // Read (Quest, 30 min) dropped at 14:30 lands on Gym: next free slot after Gym is 15:00? Rest starts 15:10, so no: after Rest, 17:00
  const r = A.freeSlot(day, Q("read", "14:30", "15:00", "Read"));
  assert.equal(at(r), "17:00-17:30"); assert.equal(r.hit.key, "gym");
  // a 10-minute block fits in the gap 15:00 to 15:10
  assert.equal(at(A.freeSlot(day, Q("tea", "14:30", "14:40", "Tea"))), "15:00-15:10");
  // a block in a clear spot stays where he put it, even off the 15-minute grid
  const free = A.freeSlot(day, Q("call", "17:07", "17:22", "Call"));
  assert.equal(at(free), "17:07-17:22"); assert.equal(free.hit, null);
  // touching is fine
  assert.equal(A.freeSlot(day, Q("x", "13:00", "14:00", "X")).hit, null);
});

test("freeSlot: nothing else moves; it returns only where his block goes", () => {
  const day = [J("a", "09:00", "10:00", "A"), J("b", "10:00", "11:00", "B"), Q("c", "11:00", "11:30", "C")];
  const before = JSON.stringify(day);
  const r = A.freeSlot(day, J("m", "09:30", "10:30", "Moved"));
  assert.equal(at(r), "11:30-12:30");
  assert.equal(JSON.stringify(day), before, "the other blocks are untouched");
  assert.deepEqual(Object.keys(r).sort(), ["e", "hit", "s"]);
});

test("freeSlot: Junyan calendar events neither block nor snap; open space and breathers never block; past bedtime is fine", () => {
  const day = [Y("call", "14:00", "15:00", "Call"), J("o", "13:00", "16:00", "Open space", { kind:"open" }), J("din", "23:00", "23:45", "Dinner")];
  assert.equal(A.freeSlot(day, Q("read", "14:15", "14:45", "Read")).hit, null, "a Junyan event does not block");
  assert.equal(A.freeSlot([J("g", "14:00", "15:00", "Gym")], Y("mine", "14:15", "14:45", "Mine")).hit, null, "a Junyan block is not snapped");
  const late = A.freeSlot(day, { ...Q("late", "23:30", "23:30", "Late"), e:new Date(+T("23:30") + 3600000) });
  assert.equal(at(late), "23:45-00:45");
});

test("freeSlot: the block's own calendar copy does not block it (same key or same event id)", () => {
  const day = [J("gym", "14:00", "15:00", "Gym")];
  assert.equal(A.freeSlot(day, { ...day[0], s:T("14:30"), e:T("15:30") }).hit, null);
  assert.equal(A.freeSlot(day, { ...day[0], key:"new", s:T("14:30"), e:T("15:30") }).hit, null);
});

test("the page: no push anywhere; every move and add path places only his block", () => {
  assert.ok(!/makeRoom|roomFor|roomJoint|shiftBlocks|settleDay|shiftPlan|MAX_SHIFT/.test(html + fs.readFileSync(here + "quest-agenda.js", "utf8")),
    "the push code is gone");
  assert.ok(!/"\/cal\/shift"/.test(html), "the page never calls /cal/shift");
  assert.ok(!/id="aRoom"|Make room \(push|id="eMove"|Move everything after it too/.test(html), "the two boxes are gone");
  for (const f of ["function saveBlock(", "async function saveBlockCal(", "async function addBlockCal(", "function addBlock(", "async function moveGymNow(", "async function commitDrag("])
    assert.match(fn(f), /placeOwn\(/, f + " places its block");
  // the calendar write sends the placed time, after placing
  const sc = fn("async function saveBlockCal(");
  assert.ok(sc.indexOf("placeOwn(") < sc.indexOf('"/cal/event"'));
  const ac = fn("async function addBlockCal(");
  assert.ok(ac.indexOf("placeOwn(") < ac.indexOf('"/cal/event"'));
  const cd = fn("async function commitDrag(");
  assert.ok(cd.indexOf("placeOwn(") < cd.indexOf('"/cal/event"'));
  // saving a block writes only that block
  assert.match(fn("function saveBlock("), /writeOps\(o => setBlock\(o, b, s, e, t\), true\)/);
  // a gym session added from the morning still goes on the Junyan calendar (the calId argument moved up one)
  assert.match(html, /return addBlockCal\(t, s, e, \(AGD\(\) \? AGD\(\)\.JUNYAN : undefined\)\);/);
  // no caller passes the old makeRoom flag where the calendar now goes
  assert.ok(!/addBlockCal\b[^\n]*\(t(itle)?, s, e, (false|true|!)/.test(html), "no boolean in the calId place");
  assert.ok(!/addBlock\)\(title, s, e, false\)/.test(html), "the idea sheet adds to Joint Plans by default");
});
