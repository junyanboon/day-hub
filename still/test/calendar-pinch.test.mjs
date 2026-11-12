// node --test still/test/calendar-pinch.test.mjs
// Pinch stretches the hours (Junyan, 2026-11-12, d1 "1 yes ... all I care about is having a very smooth functional
// exprience"): two fingers on the day grid stretch or squeeze the hour rows, from the whole day on one screen up to
// 168px an hour, starting at 56. The time under the midpoint of the fingers stays under them. Taller cards show more.
// Spec: fleet/wayfinder/one-system/calendar-phone/SPEC.md, slice 01.
import test from "node:test";
import assert from "node:assert/strict";
import "../calendar-core.js";
const C = globalThis.CalCore;

test("the hour height follows the spread of the fingers", () => {
  assert.equal(C.pinchHeight(56, 100, 200, 25, 168), 112, "fingers twice as far apart: rows twice as tall");
  assert.equal(C.pinchHeight(56, 200, 100, 25, 168), 28, "fingers half as far apart: rows half as tall");
  assert.equal(C.pinchHeight(80, 150, 150, 25, 168), 80, "no change in spread: no change");
});

test("the hour height stops at both limits", () => {
  assert.equal(C.pinchHeight(56, 100, 400, 25, 168), 168, "never taller than 168px an hour");
  assert.equal(C.pinchHeight(56, 400, 100, 25, 168), 25, "never shorter than the whole day on one screen");
  assert.equal(C.pinchHeight(56, 0, 100, 25, 168), 56, "fingers on one spot at the start: no change");
});

test("the smallest height fits the whole day between the day header and the bottom bar, never above 56", () => {
  // his iPhone home screen app: a 760px day view, a 46px day header, 98px of bottom bar laid over the view
  assert.ok(Math.abs(C.hourMin(760, 46, 98) - 25.67) < 0.01, "616px of grid for 24 hours: about 25.7px an hour");
  assert.equal(C.hourMin(1600, 46, 0), 56, "a tall screen whose day fits at 56 never goes above today's 56");
  assert.equal(C.hourMin(100, 46, 98), 8, "a squashed view keeps rows at least 8px");
});

test("the time under the fingers stays under the fingers", () => {
  // 56px an hour, scrolled 400px, 46px day header, fingers 300px below the top of the view: 654px into the grid
  const m = C.pinchMinute(400, 300, 46, 56);
  assert.ok(Math.abs(m - 654 / 56 * 60) < 1e-9, "about 11:41 am under the fingers");
  // the rows double: the same minute must sit 300px below the top again
  const top = C.pinchScroll(m, 300, 46, 112, 5000);
  assert.ok(Math.abs(top - (46 + 654 * 2 - 300)) < 1e-9, "the new scroll puts 11:41 am back under the fingers");
  assert.equal(C.pinchScroll(C.pinchMinute(0, 60, 46, 56), 60, 46, 28, 5000), 0, "near the top of the day the scroll stops at 0");
  assert.equal(C.pinchScroll(1380, 300, 46, 168, 3000), 3000, "near the end of the day the scroll stops at the bottom");
  assert.equal(C.pinchMinute(0, 10, 46, 56), 0, "fingers on the day header read as midnight");
  assert.equal(C.pinchMinute(1300, 700, 46, 56), 1440, "fingers below the last hour read as the end of the day");
});

test("a card shows more as it gets taller", () => {
  assert.equal(C.cardFit(30, 56), "sm", "a half hour at 56px is 28px: title only");
  assert.equal(C.cardFit(30, 112), "tall", "the same half hour at 112px is 56px: start and end");
  assert.equal(C.cardFit(45, 56), "", "45 minutes at 56px is 42px: title and start time");
  assert.equal(C.cardFit(60, 56), "tall", "an hour at 56px is tall, as today");
  assert.equal(C.cardFit(0, 168), "sm", "a zero minute card keeps its 19px floor");
});

test("a tall card on the phone reads start and end", () => {
  assert.equal(C.cardTime(825, 855), "1:45 to 2:15 pm");
  assert.equal(C.cardTime(780, 840), "1 to 2 pm");
  assert.equal(C.cardTime(690, 730), "11:30 am to 12:10 pm", "across noon both halves are named");
  assert.equal(C.cardTime(1380, 1440), "11 pm to 12 am", "a card that ends at midnight");
});

test("the hour height a phone starts with", () => {
  const store = (v) => ({ getItem: (k) => (k === "cal-hour" ? v : null) });
  assert.equal(C.startHour(store("90"), true), 90, "the phone remembers its height");
  assert.equal(C.startHour(store("90"), false), 56, "a desktop always draws 56");
  assert.equal(C.startHour(store(null), true), 56, "nothing saved: today's 56");
  assert.equal(C.startHour(store("nope"), true), 56, "a broken value: today's 56");
  assert.equal(C.startHour(store("900"), true), 168, "a saved value past the top limit stops at 168");
  assert.equal(C.startHour({ getItem() { throw new Error("blocked"); } }, true), 56, "storage that throws: today's 56");
});
