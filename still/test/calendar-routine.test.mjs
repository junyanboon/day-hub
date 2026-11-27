// node --test still/test/calendar-routine.test.mjs   (Junyan, 2026-11-21: "suggestions in the day for a Domestic block
// (1 hr if possible but less if necessary) a Wind Down + Sleep + Morning Routine (3 connected) blocks.")
import test from "node:test";
import assert from "node:assert/strict";
import "../calendar-core.js";
const C = globalThis.CalCore;
const TO = "America/Toronto", DAY = "2026-11-21", NEXT = "2026-11-22";
const at = (day, h, m = 0) => C.instant(day, h * 60 + m, TO);
const ev = (title, day, h1, m1, h2, m2) => ({ title, s: at(day, h1, m1), e: at(day, h2, m2) });
const hm = (ms) => { const w = C.wall(ms, TO), h = Math.floor(w.min / 60), m = w.min % 60; return `${w.day.slice(8)} ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const by = (list) => Object.fromEntries(list.map((b) => [b.key, b]));

test("a clear evening: wind down, 8 hours of sleep and the morning routine sit back to back", () => {
  const b = by(C.routineBlocks(DAY, [ev("Shambhavi", NEXT, 9, 30, 10, 30)], TO));
  assert.equal(hm(b.morning.s), "22 7:00 am", "the morning follows the wake up (bedtime 11 pm, 8 hours), well before the 9:30 plan");
  assert.equal(hm(b.morning.e), "22 8:00 am");
  assert.equal(b.sleep.e, b.morning.s); assert.equal(b.wind.e, b.sleep.s);
  assert.equal(hm(b.sleep.s), "21 11:00 pm"); assert.equal(hm(b.wind.s), "21 10:00 pm");
  assert.equal(b.sleep.e - b.sleep.s, 8 * 3600000);
});

test("no plan the next morning: bed at 11 pm, up at 7, routine 7 to 8; an early class moves it earlier, a late one never pushes bed past bedtime", () => {
  assert.equal(hm(by(C.routineBlocks(DAY, [], TO)).morning.e), "22 8:00 am");
  assert.equal(hm(by(C.routineBlocks(DAY, [ev("Gym", NEXT, 7, 0, 8, 0)], TO)).morning.e), "22 7:00 am");
  assert.equal(hm(by(C.routineBlocks(DAY, [ev("Brunch", NEXT, 12, 0, 13, 0)], TO)).morning.e), "22 8:00 am");
});

test("a late night: wind down starts when the evening ends, and sleep gets shorter, not the morning", () => {
  const b = by(C.routineBlocks(DAY, [ev("DLX - Bday Dance!", DAY, 22, 30, 23, 45), ev("Shambhavi", NEXT, 9, 30, 10, 30)], TO));
  assert.equal(hm(b.wind.s), "21 11:45 pm");
  assert.equal(hm(b.sleep.s), "22 12:15 am", "wind down shrinks to its 30 min minimum, bed moves from 11 pm to 12:15 am");
  const c = by(C.routineBlocks(DAY, [{ title: "Party", s: at(DAY, 23, 0), e: at(NEXT, 1, 30) }, ev("Shambhavi", NEXT, 9, 30, 10, 30)], TO));
  assert.equal(hm(c.wind.s), "22 1:30 am"); assert.equal(hm(c.sleep.s), "22 2:00 am", "wind down shrinks to 30 min");
  assert.equal(hm(c.sleep.e), "22 8:30 am"); assert.match(c.sleep.why, /6 h 30|6h 30|6:30/);
});

test("Domestic: the first free hour after 9 am; less when no hour is free; none under 30 min", () => {
  const day = [ev("Work", DAY, 9, 0, 10, 0), ev("Lunch", DAY, 10, 15, 11, 0), ev("Samba", DAY, 11, 0, 13, 0)];
  const d = by(C.routineBlocks(DAY, day, TO)).domestic;
  assert.equal(hm(d.s), "21 1:00 pm"); assert.equal(d.e - d.s, 3600000);
  const full = [ev("A", DAY, 9, 0, 10, 0), ev("B", DAY, 10, 45, 12, 0), ev("C", DAY, 12, 20, 23, 30)];
  const f = by(C.routineBlocks(DAY, full, TO)).domestic;
  assert.equal(hm(f.s), "21 10:00 am"); assert.equal(f.e - f.s, 45 * 60000); assert.equal(f.why, "Your first free 45 min");
  const packed = [ev("A", DAY, 9, 0, 10, 0), ev("B", DAY, 10, 20, 23, 30)];
  assert.equal(by(C.routineBlocks(DAY, packed, TO)).domestic, undefined);
});

test("d70: Domestic takes the EARLIEST free window of 30 min or more, an hour when it fits, else the window rounded down to 15", () => {
  // his day: nothing free from 9 am until 11:30, then 11:30 to noon free before the 12 pm Drive
  const day = [ev("Work", DAY, 9, 0, 11, 30), ev("Drive", DAY, 12, 0, 12, 30), ev("Samba", DAY, 12, 30, 14, 0), ev("Pickup", DAY, 14, 0, 14, 30), ev("Nutty pudding", DAY, 15, 0, 16, 0)];
  const d = by(C.routineBlocks(DAY, day, TO)).domestic;
  assert.deepEqual([hm(d.s), hm(d.e)], ["21 11:30 am", "21 12:00 pm"]);
  assert.equal(d.why, "Your first free 30 min");
  // a longer window later does not win over the earlier 30 minutes
  assert.equal(hm(by(C.routineBlocks(DAY, [ev("A", DAY, 9, 0, 10, 0), ev("B", DAY, 10, 40, 11, 0)], TO)).domestic.s), "21 10:00 am");
  // 70 minutes free: an hour; 50 minutes free: 45 (rounded down to 15)
  const hr = by(C.routineBlocks(DAY, [ev("A", DAY, 9, 0, 10, 0), ev("B", DAY, 11, 10, 12, 0)], TO)).domestic;
  assert.deepEqual([hm(hr.s), hr.e - hr.s, hr.why], ["21 10:00 am", 3600000, "Your first free hour"]);
  const m50 = by(C.routineBlocks(DAY, [ev("A", DAY, 9, 0, 10, 0), ev("B", DAY, 10, 50, 12, 0)], TO)).domestic;
  assert.equal(m50.e - m50.s, 45 * 60000);
});

test("d70: today is searched from 9 am too, so the suggestion stays where it was (the clock is no longer an input)", () => {
  assert.equal(C.routineBlocks.length, 3, "routineBlocks(day, events, tz): no now");
  assert.equal(hm(by(C.routineBlocks(DAY, [], TO)).domestic.s), "21 9:00 am");
});

test("a block he already has is not suggested again, and the others keep their times", () => {
  const mine = [ev("Wind down", DAY, 22, 0, 22, 45), ev("Shambhavi", NEXT, 9, 30, 10, 30), ev("Laundry", DAY, 14, 0, 15, 0)];
  const b = by(C.routineBlocks(DAY, mine, TO));
  assert.equal(b.wind, undefined); assert.equal(b.domestic, undefined);
  assert.equal(hm(b.sleep.s), "21 11:00 pm", "his own wind down, over before bedtime, does not push sleep later");
  assert.equal(hm(b.morning.e), "22 8:00 am");
});

test("his own wind down that runs late: the suggested sleep starts when it ends", () => {
  const b = by(C.routineBlocks(DAY, [ev("Wind down", DAY, 23, 45, 23, 59), { title: "x", s: 0, e: 0 }, ev("Yoga", NEXT, 6, 45, 7, 45)], TO));
  assert.equal(b.wind, undefined);
  assert.equal(hm(b.sleep.s), "21 11:59 pm"); assert.equal(hm(b.sleep.e), "22 5:45 am");
});

test("Domestic is its own type with its own colour in every look, and no page of its own (d62)", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  assert.equal(C.guessKind("Laundry"), "home"); assert.equal(C.guessKind("Domestic"), "home");
  assert.equal(by(C.routineBlocks(DAY, [], TO)).domestic.kind, "home");
  assert.ok(html.includes("--k-home:var(--fuchsia)"));
  assert.equal((html.match(/--fuchsia:#/g) || []).length, 5, "all five looks set fuchsia");
  assert.match(html, /home: "🧺"/);
  assert.match(html, /k !== "home"/);
});

test("Accept on one night block adds all three for that day (d63)", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  assert.match(html, /const NIGHT = \["wind", "sleep", "morning"\]/);
  assert.match(html, /return acceptNight\(set, g, over\)/);
});
