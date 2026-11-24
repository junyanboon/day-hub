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
  assert.equal(C.kindOf({ title: "Gym & Sauna" }), "gym");
  assert.equal(C.kindOf({ title: "Gym · Jack Woods" }), "gym");
  assert.equal(C.kindOf({ title: "Training day" }), "gym");
  assert.equal(C.kindOf({ title: "Zouk Training" }), "dance");
  assert.equal(C.kindOf({ title: "Lambada WS" }), "dance");
  assert.equal(C.kindOf({ title: "Solo Battle WS" }), "dance");
  assert.equal(C.kindOf({ title: "Practica" }), "dance");
  assert.equal(C.kindOf({ title: "Work block · 🎯 0/2" }), "deep");
  assert.equal(C.kindOf({ title: "Morning Yoga" }), "yoga");
  assert.equal(C.kindOf({ title: "Isha Kriya" }), "rest");
  assert.equal(C.kindOf({ title: "Wind down" }), "wind");
  assert.equal(C.kindOf({ title: "Dinner with Caney" }), "cook");
  assert.equal(C.kindOf({ title: "Groceries together" }), "cook");
  assert.equal(C.kindOf({ title: "Prep focaccia" }), "cook");
  assert.equal(C.kindOf({ title: "Dinner w/ everyone?" }), "social");
  assert.equal(C.kindOf({ title: "Visit Mom" }), "social");
  assert.equal(C.kindOf({ title: "Caney's Birthday" }), "social");
  assert.equal(C.kindOf({ title: "Dentist" }), "errand");
  assert.equal(C.kindOf({ title: "Packing & Errands" }), "pack");   // "pack" wins since slice 02 (d23)
  assert.equal(C.kindOf({ title: "Montreal: train" }), "travel");
  assert.equal(C.kindOf({ title: "Flight to São Paulo" }), "travel");
  assert.equal(C.kindOf({ title: "Drive" }), "commute");   // Commute blocks, 2026-11-24: bus and drive left Travel
  assert.equal(C.kindOf({ title: "Stay at FICTION" }), "travel");
  assert.equal(C.kindOf({ title: "Viewing, Studio B", calName: "Staff scheduling" }), "studio");
  assert.equal(C.kindOf({ title: "Need FBS", calName: "Staff scheduling" }), "studio");
  assert.equal(C.kindOf({ title: "901 Bell Internet will expire", calName: "Staff Scheduling" }), "studio");
  assert.equal(C.kindOf({ title: "Remembrance Day" }), "other");
  assert.equal(C.kindOf({ title: "Gym", kind: "cook" }), "cook");
  assert.equal(C.kindOf({ title: "Gym", kind: "food" }), "cook");
  assert.equal(C.kindOf({ title: "Drive", kind: "work" }), "studio");
  assert.equal(C.kindOf({ title: "Hotel", kind: "out" }), "travel");
  assert.equal(C.kindOf({ title: "Call the bank", kind: "ex" }), "gym");
  assert.equal(C.kindOf({ title: "Zouk night", kind: "ex" }), "dance");
  assert.equal(C.kindOf({ title: "Zouk night", kind: "other" }), "other");
  assert.deepEqual(C.KINDS.map((x) => x[0]), ["deep", "studio", "yoga", "gym", "dance", "cook", "travel", "commute", "pack", "social", "errand", "wind", "rest", "home", "other"]);
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

/* Commute blocks (Junyan, 2026-11-24, d1 "1 yes": one block type called Commute, three emojis picked by the title) */
test("commute, transit and drive titles land on Commute; trip words stay on Travel", () => {
  for (const t of ["Commute", "Transit", "Subway", "TTC", "Streetcar", "Bus to Zouk Training", "Drive", "Drive home", "Driving", "Morning commute"])
    assert.equal(C.kindOf({ title: t }), "commute", t);
  for (const t of ["Montreal: train", "Flight to São Paulo", "Airport", "Hotel", "Stay at FICTION", "Check-in", "Ferry", "Airbnb check-out", "Train to Montreal"])
    assert.equal(C.kindOf({ title: t }), "travel", t);
  assert.equal(C.kindOf({ title: "Pack for the drive" }), "pack", "Packing still comes first");
  assert.equal(C.kindOf({ title: "Drive", kind: "social" }), "social", "a hand-set type still wins");
  assert.equal(C.kindOf({ title: "Zouk", kind: "commute" }), "commute", "and Commute can be hand-set");
  assert.equal(C.kindOf({ title: "Busy day" }), "other", "bus is a whole word");
  assert.deepEqual(C.KINDS.find(([k]) => k === "commute"), ["commute", "Commute"]);
});

/* d8 (Junyan, 2026-11-24, "8 yes"): bus, drive and driving count only when the title reads as a trip */
test("bus, drive and driving make a Commute only when the title reads as a trip (d8)", () => {
  for (const t of ["Drive", "Bus", "Driving", "Drive home", "Drive to Mom's", "Bus to studio", "Driving to the airport", "Take the bus to work",
    "Bus back", "Drive over", "Drive there", "Drive: Mom's", "\u{1F697} Drive"])
    assert.equal(C.kindOf({ title: t }), "commute", t);
  for (const t of ["Google Drive backup", "Test drive", "hard drive cleanup", "Bus tickets", "Business", "Business plan", "Drive-in movie", "Take the bus", "Driveway sealing", "Drives"])
    assert.notEqual(C.kindOf({ title: t }), "commute", t + " is not a trip");
  assert.equal(C.kindOf({ title: "Google Drive backup" }), "other");
  assert.equal(C.kindOf({ title: "Bus tickets" }), "other");
  for (const t of ["Morning commute", "Commuting", "Transit", "Subway", "TTC", "Streetcar", "Check the TTC schedule", "Late streetcar"])
    assert.equal(C.kindOf({ title: t }), "commute", t + " counts anywhere");
  assert.equal(C.kindOf({ title: "Test drive", kind: "commute" }), "commute", "a hand-set Commute still wins");
  assert.ok(!C.KINDS.some(([k]) => k === "bus" || k === "drive"), "bus and drive are not a travel word");
});

/* d10 (Junyan, 2026-11-24, "10 yes"): a title that starts with Drive or Driving and has "to" later is a Commute by car */
test("Drive or Driving at the start of the title, with a later 'to', is a Commute by car (d10)", () => {
  for (const t of ["Drive Caney to school", "Driving Mom to the airport"]) {
    assert.equal(C.kindOf({ title: t }), "commute", t);
    assert.equal(C.modeOf({ title: t }), "drive", t + " has the drive emoji");
  }
  assert.deepEqual(C.MODES.find(([m]) => m === C.modeOf({ title: "Drive Caney to school" })).slice(0, 2), ["drive", "\u{1F697}"]);
  for (const t of ["Google Drive backup to the cloud", "Test drive to decide", "Drive-in movie to remember", "Drives to nowhere", "Take the bus"])
    assert.notEqual(C.kindOf({ title: t }), "commute", t + " stays off Commute");
});

test("the mode (its emoji) is guessed from the title, and a hand-picked mode beats the guess", () => {
  const m = (title, mode) => C.modeOf({ title, mode });
  for (const t of ["Transit", "Subway", "TTC to work", "Streetcar", "Bus to Zouk Training", "Take the bus"]) assert.equal(m(t), "transit", t);
  for (const t of ["Drive", "Drive home", "Driving", "Take the car"]) assert.equal(m(t), "drive", t);
  for (const t of ["Commute", "Morning commute", "Walk to work", ""]) assert.equal(m(t), "commute", t);
  assert.equal(m("Drive", "transit"), "transit", "picked by hand");
  assert.equal(m("Commute", "drive"), "drive");
  assert.equal(m("Drive", "rocket"), "drive", "an unknown mode is ignored");
  assert.equal(m("Drive to the subway"), "drive", "the first word wins");
  assert.deepEqual(C.MODES.map((x) => [x[0], x[1], x[2]]), [["commute", "🚶", "Commute"], ["transit", "🚇", "Transit"], ["drive", "🚗", "Drive"]]);
});
