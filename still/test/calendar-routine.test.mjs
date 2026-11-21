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
  assert.equal(hm(b.morning.e), "22 9:30 am", "the morning ends at the next day's first plan");
  assert.equal(hm(b.morning.s), "22 8:30 am");
  assert.equal(b.sleep.e, b.morning.s); assert.equal(b.wind.e, b.sleep.s);
  assert.equal(hm(b.sleep.s), "22 12:30 am"); assert.equal(hm(b.wind.s), "21 11:30 pm");
  assert.equal(b.sleep.e - b.sleep.s, 8 * 3600000);
});

test("no plan the next morning: the routine ends at 9 am; an early class moves it earlier, a late one stops at 10 am", () => {
  assert.equal(hm(by(C.routineBlocks(DAY, [], TO)).morning.e), "22 9:00 am");
  assert.equal(hm(by(C.routineBlocks(DAY, [ev("Gym", NEXT, 7, 0, 8, 0)], TO)).morning.e), "22 7:00 am");
  assert.equal(hm(by(C.routineBlocks(DAY, [ev("Brunch", NEXT, 12, 0, 13, 0)], TO)).morning.e), "22 10:00 am");
});

test("a late night: wind down starts when the evening ends, and sleep gets shorter, not the morning", () => {
  const b = by(C.routineBlocks(DAY, [ev("DLX - Bday Dance!", DAY, 22, 30, 23, 45), ev("Shambhavi", NEXT, 9, 30, 10, 30)], TO));
  assert.equal(hm(b.wind.s), "21 11:45 pm");
  assert.equal(hm(b.sleep.s), "22 12:30 am", "45 min of wind down still fits before 12:30, so sleep keeps its 8 hours");
  const c = by(C.routineBlocks(DAY, [{ title: "Party", s: at(DAY, 23, 0), e: at(NEXT, 1, 30) }, ev("Shambhavi", NEXT, 9, 30, 10, 30)], TO));
  assert.equal(hm(c.wind.s), "22 1:30 am"); assert.equal(hm(c.sleep.s), "22 2:00 am", "wind down shrinks to 30 min");
  assert.equal(hm(c.sleep.e), "22 8:30 am"); assert.match(c.sleep.why, /6 h 30|6h 30|6:30/);
});

test("Domestic: the first free hour after 9 am; less when no hour is free; none under 30 min", () => {
  const day = [ev("Work", DAY, 9, 0, 10, 0), ev("Lunch", DAY, 10, 30, 11, 0), ev("Samba", DAY, 11, 0, 13, 0)];
  const d = by(C.routineBlocks(DAY, day, TO)).domestic;
  assert.equal(hm(d.s), "21 1:00 pm"); assert.equal(d.e - d.s, 3600000);
  const full = [ev("A", DAY, 9, 0, 10, 0), ev("B", DAY, 10, 45, 12, 0), ev("C", DAY, 12, 20, 23, 30)];
  const f = by(C.routineBlocks(DAY, full, TO)).domestic;
  assert.equal(hm(f.s), "21 10:00 am"); assert.equal(f.e - f.s, 45 * 60000); assert.match(f.why, /Only/);
  const packed = [ev("A", DAY, 9, 0, 10, 0), ev("B", DAY, 10, 20, 23, 30)];
  assert.equal(by(C.routineBlocks(DAY, packed, TO)).domestic, undefined);
});

test("today: Domestic starts no earlier than now, rounded up to the quarter hour", () => {
  const d = by(C.routineBlocks(DAY, [], TO, at(DAY, 16, 40))).domestic;
  assert.equal(hm(d.s), "21 4:45 pm");
});

test("a block he already has is not suggested again, and the others keep their times", () => {
  const mine = [ev("Wind down", DAY, 23, 30, 23, 59), ev("Shambhavi", NEXT, 9, 30, 10, 30), ev("Laundry", DAY, 14, 0, 15, 0)];
  const b = by(C.routineBlocks(DAY, mine, TO));
  assert.equal(b.wind, undefined); assert.equal(b.domestic, undefined);
  assert.equal(hm(b.sleep.s), "22 12:30 am", "his own wind down does not push sleep later");
  assert.equal(hm(b.morning.e), "22 9:30 am");
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
