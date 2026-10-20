// node --test still/test/*.test.mjs   (Junyan, 2026-10-20, d70: "check whether the car rental block hides Day's end and
// fix it". A 40 hour car rental on his calendar ended after tomorrow, so the "last block ends" rule never fired and
// Day's end never came up. An event over 12 hours is a booking (a car, a stay), not a block of his time, the same
// rule quest-suggest.js and quest-agenda.js already use.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const html = fs.readFileSync(here + "quest.html", "utf8");
const line = re => { const m = re.exec(html); assert.ok(m, String(re)); return m[0]; };
const src = [
  line(/const isSleep = b => [^\n]*/), line(/const isBooking = b => [^\n]*/), line(/const lastItemEnd = [^\n]*/),
  line(/function currentOf\(all, t\)[^\n]*/), line(/function nextOf\(all, t\)[^\n]*/),
].join("\n");
const Q = new Function(src + "\nreturn { isBooking, lastItemEnd, currentOf, nextOf };")();
const T = (d, hm) => new Date(`2026-10-${d}T${hm}:00-04:00`);
const B = (t, s, e, kind = "fixed") => ({ t, s, e, kind });
const day = [
  B("Car rental", T(20, "08:00"), T(22, "00:00"), "travel"),   // 40 hours
  B("Lunch", T(20, "12:00"), T(20, "13:00"), "fuel"),
  B("Wind down", T(20, "21:30"), T(20, "22:30"), "rest"),
  B("Sleep", T(20, "23:00"), T(21, "07:00"), "rest"),
];

test("a 40 hour car rental is a booking, a normal block is not", () => {
  assert.equal(Q.isBooking(day[0]), true);
  assert.equal(Q.isBooking(day[1]), false);
  assert.equal(Q.isBooking(B("Long day out", T(20, "08:00"), T(20, "20:00"))), false);   // 12 hours exactly still counts
});

test("Day's end: the last real block decides it, not the rental", () => {
  assert.equal(+Q.lastItemEnd(day), +T(20, "22:30"));
  assert.equal(Q.lastItemEnd([day[0]]), null);
});

test("Right now and Next skip the rental", () => {
  assert.equal(Q.currentOf(day, T(20, "10:00")), null);
  assert.equal(Q.currentOf(day, T(20, "12:30")).t, "Lunch");
  const pre = [B("Car rental", T(20, "08:00"), T(22, "00:00")), B("Lunch", T(20, "12:00"), T(20, "13:00"))];
  assert.equal(Q.nextOf(pre, T(20, "07:00")).t, "Lunch");
});
