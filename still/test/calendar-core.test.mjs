// node --test still/test/calendar-core.test.mjs  (the calendar app, still/calendar.html, 2026-11-03)
import test from "node:test";
import assert from "node:assert/strict";
import "../calendar-core.js";
const C = globalThis.CalCore;
const TO = "America/Toronto";

test("wall time in a zone, across the DST change", () => {
  assert.deepEqual(C.wall(Date.parse("2026-11-03T19:20:00Z"), TO), { day: "2026-11-03", min: 14 * 60 + 20, dow: 2 });
  assert.deepEqual(C.wall(Date.parse("2026-07-01T04:30:00Z"), TO), { day: "2026-07-01", min: 30, dow: 3 });
  assert.equal(C.wall(Date.parse("2026-11-03T19:20:00Z"), "America/Sao_Paulo").min, 16 * 60 + 20);
});

test("a wall time in a zone becomes the right instant, both sides of DST", () => {
  assert.equal(new Date(C.instant("2026-11-03", 9 * 60, TO)).toISOString(), "2026-11-03T14:00:00.000Z");
  assert.equal(new Date(C.instant("2026-10-30", 9 * 60, TO)).toISOString(), "2026-10-30T13:00:00.000Z");
  // the fall-back day is 25 hours long
  assert.equal(C.instant("2026-11-02", 0, TO) - C.instant("2026-11-01", 0, TO), 25 * 3600000);
  assert.equal(new Date(C.instant("2026-11-04", 15 * 60, "Asia/Tokyo")).toISOString(), "2026-11-04T06:00:00.000Z");
});

test("days, Monday weeks and ISO week numbers", () => {
  assert.equal(C.addDays("2026-11-03", 1), "2026-11-04");
  assert.equal(C.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(C.weekStart("2026-11-03"), "2026-11-02");
  assert.equal(C.weekStart("2026-11-08"), "2026-11-02", "Sunday belongs to the week that started Monday");
  assert.equal(C.isoWeek("2026-11-03"), 45);
  assert.equal(C.isoWeek("2027-01-01"), 53);
  assert.equal(C.isoWeek("2026-01-01"), 1);
  assert.equal(C.addMonths("2026-01-31", 1), "2026-02-01");
});

test("kind is guessed from the title (d96), a hand-set kind wins", () => {
  assert.equal(C.kindOf({ title: "Gym & Sauna" }), "ex");
  assert.equal(C.kindOf({ title: "Zouk Training" }), "ex");
  assert.equal(C.kindOf({ title: "Dinner with Caney" }), "food");
  assert.equal(C.kindOf({ title: "Groceries together" }), "food");
  assert.equal(C.kindOf({ title: "Dentist" }), "out");
  assert.equal(C.kindOf({ title: "Montreal: train" }), "out");
  assert.equal(C.kindOf({ title: "Flight to São Paulo" }), "out");
  assert.equal(C.kindOf({ title: "Training day" }), "ex", "training is not a train");
  assert.equal(C.kindOf({ title: "Viewing, Studio B", calName: "Staff scheduling" }), "work");
  assert.equal(C.kindOf({ title: "Call Mom" }), "other");
  assert.equal(C.kindOf({ title: "Gym", kind: "food" }), "food");
});

test("overlapping events share the width, others take all of it", () => {
  const L = C.layout([{ id: "a", s: 0, e: 60 }, { id: "b", s: 30, e: 90 }, { id: "c", s: 120, e: 150 }, { id: "d", s: 40, e: 50 }]);
  const by = Object.fromEntries(L.map((x) => [x.id, x]));
  assert.equal(by.a.cols, 3); assert.equal(by.b.cols, 3); assert.equal(by.d.cols, 3);
  assert.notEqual(by.a.col, by.b.col);
  assert.equal(by.c.cols, 1); assert.equal(by.c.col, 0);
});

test("drag order: the number between the new neighbours", () => {
  assert.equal(C.orderBetween(1, 2), 1.5);
  assert.equal(C.orderBetween(null, 5), 4);
  assert.equal(C.orderBetween(5, null), 6);
  assert.equal(C.orderBetween(null, null), 1);
});

test("dropping a task: new order and priority for the target group", () => {
  const tasks = [
    { id: "a", priority: "🔴 High", order: 1 }, { id: "b", priority: "🔴 High", order: 2 },
    { id: "c", priority: "🟡 Medium", order: null }, { id: "e", priority: "🟡 Medium", order: null }, { id: "d", priority: "", order: 3 }];
  assert.deepEqual(C.dropTask(tasks, "c", "🔴 High", "b"), { priority: "🔴 High", order: 1.5, renumber: [] });
  assert.deepEqual(C.dropTask(tasks, "a", "🔴 High", null), { priority: "🔴 High", order: 3, renumber: [] });
  assert.deepEqual(C.dropTask(tasks, "a", "", null), { priority: "", order: 4, renumber: [] });
  // unordered group: numbered 1..n so the task lands where it was dropped (between c and e), not on top
  assert.deepEqual(C.dropTask(tasks, "a", "🟡 Medium", "e"), { priority: "🟡 Medium", order: 2, renumber: [{ id: "c", order: 1 }, { id: "e", order: 3 }] });
  assert.deepEqual(C.dropTask(tasks, "a", "🟡 Medium", null).order, 3);
});

test("task block length is the Estimate, 30 minutes when it has none", () => {
  assert.equal(C.blockMinutes({ estMin: 10 }), 15, "at least 15 minutes, on the grid");
  assert.equal(C.blockMinutes({ estMin: 90 }), 90);
  assert.equal(C.blockMinutes({ estMin: 0 }), 30);
});

test("an event's pieces per day in a zone (overnight events show on both days)", () => {
  const s = C.instant("2026-11-03", 22 * 60, TO), e = C.instant("2026-11-04", 60, TO);
  const p = C.pieces({ start: s, end: e }, ["2026-11-03", "2026-11-04", "2026-11-05"], TO);
  assert.deepEqual(p.map((x) => [x.day, x.top, x.bottom]), [["2026-11-03", 1320, 1440], ["2026-11-04", 0, 60]]);
});

test("all-day events cover their days (end date is exclusive)", () => {
  const ev = { allDay: true, start: "2026-11-13", end: "2026-11-18" };
  assert.equal(C.coversDay(ev, "2026-11-13"), true);
  assert.equal(C.coversDay(ev, "2026-11-17"), true);
  assert.equal(C.coversDay(ev, "2026-11-18"), false);
});

test("months a range needs, for the per-month cache", () => {
  assert.deepEqual(C.monthsFor("2026-11-30", "2026-12-06"), ["2026-11", "2026-12"]);
  assert.deepEqual(C.monthsFor("2026-11-02", "2026-11-08"), ["2026-11"]);
});

test("time labels", () => {
  assert.equal(C.hm(14 * 60 + 20), "2:20 pm");
  assert.equal(C.hm(0), "12 am");
  assert.equal(C.hm(12 * 60), "12 pm");
  assert.equal(C.dur(90), "1 h 30 min");
  assert.equal(C.dur(45), "45 min");
});
