// node --test still/test/*.test.mjs   (the agenda calendar, Junyan 2026-10-14)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(new URL("../quest-agenda.js", import.meta.url), "utf8"), ctx);
const A = ctx.QuestAgenda;
const at = (d, h, m = 0) => new Date(Date.UTC(2026, 9, d, h, m));   // Oct d, h:m UTC
const iso = d => d.toISOString();

test("the agenda runs from yesterday to three days ahead, across a month end", () => {
  assert.deepEqual([...A.agendaDays("2026-10-14")], ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
  assert.deepEqual([...A.agendaDays("2026-10-30")], ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
});

test("an event shared by two days' plans shows once, and the game's copy wins", () => {
  const game = [{ s:at(14, 19, 30), e:at(15, 3, 30), t:"Sleep", id:"sl", key:"k1" }, { s:at(14, 9), e:at(14, 10), t:"Walk", key:"x1" }];
  const tomorrow = [{ s:iso(at(14, 19, 30)), e:iso(at(15, 3, 30)), t:"Sleep", id:"sl" }, { s:iso(at(15, 9)), e:iso(at(15, 10)), t:"Bus", id:"bus" }];
  const yesterday = [{ s:iso(at(13, 9)), e:iso(at(13, 10)), t:"Walk" }];
  const out = A.mergeAgenda(game, [yesterday, tomorrow]);
  assert.deepEqual([...out.map(b => b.t)], ["Walk", "Walk", "Sleep", "Bus"]);
  assert.equal(out.find(b => b.id === "sl").game, true);
  assert.equal(out.find(b => b.id === "bus").game, false);
  assert.ok(out.every(b => Object.prototype.toString.call(b.s) === "[object Date]"));
});

test("moving keeps the length and snaps to 15 minutes, also into the next day", () => {
  const s = at(14, 9), e = at(14, 10, 30);
  // 54 px an hour: 40 px is 44 min, snaps to 45
  let r = A.dragResult("move", s, e, 40, 54);
  assert.equal(iso(r.s), iso(at(14, 9, 45))); assert.equal(iso(r.e), iso(at(14, 11, 15)));
  r = A.dragResult("move", s, e, 24 * 54, 54);
  assert.equal(iso(r.s), iso(at(15, 9)));
  r = A.dragResult("move", s, e, -5, 54);   // a wobble is no move
  assert.equal(iso(r.s), iso(s));
});

test("stretching the top or bottom edge changes one end and never goes under 15 minutes", () => {
  const s = at(14, 9), e = at(14, 10);
  assert.equal(iso(A.dragResult("bottom", s, e, 27, 54).e), iso(at(14, 10, 30)));
  assert.equal(iso(A.dragResult("bottom", s, e, 27, 54).s), iso(s));
  assert.equal(iso(A.dragResult("top", s, e, -54, 54).s), iso(at(14, 8)));
  assert.equal(iso(A.dragResult("top", s, e, 500, 54).s), iso(at(14, 9, 45)));
  assert.equal(iso(A.dragResult("bottom", s, e, -500, 54).e), iso(at(14, 9, 15)));
});

test("what can be dragged, and where it is saved", () => {
  const paired = { paired:true, dry:false };
  assert.equal(A.dragKind({ kind:"open", type:"focus", t:"Open space" }, paired).kind, "free");
  assert.equal(A.dragKind({ kind:"break", type:"break", t:"Rest" }, paired).kind, "free");
  assert.equal(A.dragKind({ kind:"fixed", t:"Tour - See notes", id:"a", calId:"c" }, paired).kind, "cal");
  const lock = A.dragKind({ kind:"fixed", t:"Sunset", id:"a", calId:"c" }, { paired:false });
  assert.equal(lock.kind, "lock"); assert.match(lock.why, /Pair this device/);
  assert.equal(A.dragKind({ kind:"practice", t:"Isha Kriya", key:"x1", game:true }, paired).kind, "day");
  assert.equal(A.dragKind({ kind:"practice", t:"Isha Kriya", key:"x1", game:false }, paired).kind, "lock");
  assert.equal(A.dragKind({ kind:"fixed", t:"Sunset", id:"a", calId:"c" }, { paired:false, dry:true }).dry, true);
});

test("overlapping blocks share the width", () => {
  const out = A.lanes([{ s:1, e:5 }, { s:2, e:3 }, { s:6, e:7 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(out.map(x => [x.lane, x.n]))), [[0, 2], [1, 2], [0, 1]]);
});

test("a moved block shows at its new place until the plan agrees, for 3 minutes at most", () => {
  const b = { s:at(14, 9), e:at(14, 10), t:"Sunset", id:"a" };
  const pend = { "id:a": { s:+at(14, 11), e:+at(14, 12), at:1000 } };
  let [x] = A.applyPending([b], pend, 1000 + 60000);
  assert.equal(iso(x.s), iso(at(14, 11))); assert.equal(x.pending, true);
  [x] = A.applyPending([b], pend, 1000 + 4 * 60000);
  assert.equal(iso(x.s), iso(at(14, 9)));
  [x] = A.applyPending([{ ...b, s:at(14, 11), e:at(14, 12) }], pend, 2000);
  assert.equal(x.pending, undefined);
});
