// node --test still/test/*.test.mjs   (Junyan, 2026-10-20, d71: "'all-day' bookings should just be excluded from here".
// A 40 hour car rental drew as a side column in the day view and squeezed every real block to half width.)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require("../quest-agenda.js");
const A = globalThis.QuestAgenda;
const T = (d, hm) => +new Date(`2026-10-${d}T${hm}:00-04:00`);
const it = (t, s, e) => ({ st:{ t, s, e }, s, e });

test("a 40 hour booking makes no column: real blocks keep full width", () => {
  const rental = it("Car rental", T(20, "13:00"), T(22, "05:00"));
  const lunch = it("Lunch", T(20, "13:30"), T(20, "14:30")), gym = it("Gym", T(20, "17:00"), T(20, "18:00"));
  const ev = A.timelineLanes([rental, lunch, gym]);
  assert.deepEqual(ev.map(x => x.st.t), ["Lunch", "Gym"]);
  ev.forEach(x => { assert.equal(x.n, 1); assert.equal(x.lane, 0); });
});

test("an all-day event is left out too, a 12 hour block stays, real overlaps still share", () => {
  assert.equal(A.isLong({ s:T(20, "00:00"), e:T(21, "00:00") }), true);
  assert.equal(A.isLong({ s:T(20, "08:00"), e:T(20, "20:00") }), false);
  const ev = A.timelineLanes([it("A", T(20, "09:00"), T(20, "10:00")), it("B", T(20, "09:30"), T(20, "10:30"))]);
  assert.deepEqual(ev.map(x => x.n), [2, 2]);
});
