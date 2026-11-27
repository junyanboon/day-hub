// node --test still/test/calendar-bedtime.test.mjs   (Junyan, 2026-11-27: "why is it floating at 12am instead of 10pm?",
// "3 11pm is bed time"; "wind down should be a candle morning routine should be the sun emoji and sleep is a bed emoji";
// "I want it to float directly in the calendar".) Fixed instants only: no test reads the real clock.
import test from "node:test";
import assert from "node:assert/strict";
import "../calendar-core.js";
const C = globalThis.CalCore;
const TO = "America/Toronto", FRI = "2026-11-27", SAT = "2026-11-28";
const at = (day, h, m = 0) => C.instant(day, h * 60 + m, TO);
const ev = (title, day, h1, m1, h2, m2) => ({ title, s: at(day, h1, m1), e: at(day, h2, m2) });
const hm = (ms) => { const w = C.wall(ms, TO), h = Math.floor(w.min / 60), m = w.min % 60; return `${w.day.slice(8)} ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const by = (list) => Object.fromEntries(list.map((b) => [b.key, b]));
const FRIDAY = [ev("Samba", FRI, 18, 0, 19, 0)];

test("Friday Nov 27, no bedtime chosen: Wind Down 10 to 11 pm, Sleep 11 pm to 7 am, Morning Routine 7 to 8 am Saturday", () => {
  const b = by(C.routineBlocks(FRI, FRIDAY, TO));
  assert.deepEqual([hm(b.wind.s), hm(b.wind.e)], ["27 10:00 pm", "27 11:00 pm"]);
  assert.deepEqual([hm(b.sleep.s), hm(b.sleep.e)], ["27 11:00 pm", "28 7:00 am"]);
  assert.deepEqual([hm(b.morning.s), hm(b.morning.e)], ["28 7:00 am", "28 8:00 am"]);
  assert.equal(b.morning.why, "Right after you wake");
});

test("the Bedtime setting: default 11 pm, a pick moves the whole night, junk falls back to 11 pm", () => {
  assert.equal(C.BEDTIME.default, 23 * 60);
  assert.equal(C.bedtimeOf(null), 23 * 60); assert.equal(C.bedtimeOf("abc"), 23 * 60); assert.equal(C.bedtimeOf("1320"), 22 * 60);
  const b = by(C.routineBlocks(FRI, FRIDAY, TO, { bedtime: 22 * 60 + 30 }));
  assert.equal(hm(b.wind.s), "27 9:30 pm"); assert.equal(hm(b.sleep.s), "27 10:30 pm"); assert.equal(hm(b.morning.s), "28 6:30 am");
  const after = by(C.routineBlocks(FRI, [...FRIDAY, ev("Brunch", SAT, 10, 0, 11, 0)], TO, { bedtime: 30 }));   // 12:30 am means after midnight, the next calendar day
  assert.equal(hm(after.sleep.s), "28 12:30 am"); assert.equal(hm(after.wind.s), "27 11:30 pm"); assert.equal(hm(after.morning.s), "28 8:30 am");
  const capped = by(C.routineBlocks(FRI, FRIDAY, TO, { bedtime: 30 }));   // no plan: the routine still ends by 9 am, so bed cannot be after 12:00 am
  assert.equal(hm(capped.sleep.s), "28 12:00 am"); assert.equal(hm(capped.morning.e), "28 9:00 am");
});

test("an early plan the next morning still pulls the whole night earlier; a late one never pushes bed past bedtime", () => {
  const early = by(C.routineBlocks(FRI, [ev("Yoga", SAT, 6, 30, 7, 30)], TO));
  assert.equal(hm(early.morning.e), "28 6:30 am", "Morning Routine still ends when the plan starts");
  assert.equal(hm(early.sleep.e), "28 5:30 am"); assert.equal(hm(early.sleep.s), "27 9:30 pm"); assert.equal(hm(early.wind.s), "27 8:30 pm");
  assert.match(early.morning.why, /^Before Yoga/);
  const late = by(C.routineBlocks(FRI, [ev("Brunch", SAT, 11, 0, 12, 0)], TO));
  assert.equal(hm(late.sleep.s), "27 11:00 pm"); assert.equal(hm(late.morning.s), "28 7:00 am");
});

test("a late evening still works: wind down starts when it ends, sleep gets shorter, the wake up is capped by the next plan", () => {
  const b = by(C.routineBlocks(FRI, [{ title: "Party", s: at(FRI, 23, 0), e: at(SAT, 1, 30) }, ev("Shambhavi", SAT, 9, 30, 10, 30)], TO));
  assert.equal(hm(b.wind.s), "28 1:30 am"); assert.equal(hm(b.sleep.s), "28 2:00 am");
  assert.equal(hm(b.sleep.e), "28 8:30 am"); assert.equal(hm(b.morning.e), "28 9:30 am"); assert.match(b.morning.why, /^Before Shambhavi/);
  assert.match(b.sleep.why, /6 h 30|6h 30|6:30/);
  const mild = by(C.routineBlocks(FRI, [ev("Class", FRI, 21, 30, 22, 30)], TO));   // the class ends 10:30, so wind down starts then
  assert.equal(hm(mild.wind.s), "27 10:30 pm"); assert.equal(hm(mild.sleep.s), "27 11:00 pm", "30 min of wind down is the least, bed stays 11 pm");
});

test("his own Wind Down that night: not suggested again; sleep starts when it ends if that is after bedtime", () => {
  const same = by(C.routineBlocks(FRI, [ev("Wind down", FRI, 21, 45, 22, 45)], TO));
  assert.equal(same.wind, undefined); assert.equal(hm(same.sleep.s), "27 11:00 pm");
  const later = by(C.routineBlocks(FRI, [ev("Wind down", FRI, 23, 0, 23, 45)], TO));
  assert.equal(later.wind, undefined); assert.equal(hm(later.sleep.s), "27 11:45 pm"); assert.equal(hm(later.sleep.e), "28 7:45 am");
});

test("a plan that runs through the night leaves no Wind Down or Sleep to suggest, the morning stays", () => {
  const b = by(C.routineBlocks(FRI, [{ title: "Trip", s: at(FRI, 20, 0), e: at(SAT, 12, 0) }], TO));
  assert.equal(b.wind, undefined); assert.equal(b.sleep, undefined); assert.ok(b.morning);
});

test("Wind Down, Sleep and Morning Routine wear a candle, a bed and a sun; nothing else does", () => {
  assert.equal(C.nightIcon("Wind Down"), "\u{1F56F}️"); assert.equal(C.nightIcon("wind down"), "\u{1F56F}️");
  assert.equal(C.nightIcon("Sleep"), "\u{1F6CF}️"); assert.equal(C.nightIcon("Morning Routine"), "☀️");
  assert.equal(C.nightIcon("Sleep over at Anna's"), ""); assert.equal(C.nightIcon("Commute"), ""); assert.equal(C.nightIcon(""), "");
});

test("a night block floats: one piece, in the column of the day it starts, running on past midnight", () => {
  const sleep = { title: "Sleep", s: at(FRI, 23, 0), e: at(SAT, 7, 0) };
  assert.deepEqual(C.floatPiece(sleep, TO), { day: FRI, top: 23 * 60, bottom: 31 * 60 });
  const wind = { title: "Wind Down", s: at(FRI, 22, 0), e: at(FRI, 23, 0) };
  assert.deepEqual(C.floatPiece(wind, TO), { day: FRI, top: 22 * 60, bottom: 23 * 60 });
  const morning = { title: "Morning Routine", s: at(SAT, 7, 0), e: at(SAT, 8, 0) };
  assert.deepEqual(C.floatPiece(morning, TO), { day: SAT, top: 7 * 60, bottom: 8 * 60 });
  assert.equal(C.floats({ title: "Sleep" }), true); assert.equal(C.floats({ title: "Wind Down" }), true);
  assert.equal(C.floats({ title: "Gym" }), false);
});

test("the extension below midnight is as tall as the longest floated night, in whole hours, and none when nothing crosses", () => {
  assert.equal(C.tailHours([]), 0);
  assert.equal(C.tailHours([{ top: 22 * 60, bottom: 23 * 60 }]), 0);
  assert.equal(C.tailHours([{ top: 23 * 60, bottom: 31 * 60 }, { top: 22 * 60, bottom: 23 * 60 }]), 7);
  assert.equal(C.tailHours([{ top: 23 * 60, bottom: 31 * 60 + 15 }]), 8);
});
