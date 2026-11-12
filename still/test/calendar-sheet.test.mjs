// node --test still/test/calendar-sheet.test.mjs  (slice 02, 2026-11-12: the event sheet becomes plain rows on the phone)
// The sheet keeps a form {title, day, start, end, allDay, endDay, location, description, kind, calId}; Save sends only
// what changed, in one PATCH. These pin the rule that turns the form into those fields (calendar-core.js sheet*).
import test from "node:test";
import assert from "node:assert/strict";
import "../calendar-core.js";
const C = globalThis.CalCore;
const TO = "America/Toronto";

/** "Need FBS", Fri Nov 13 2026, 1:45 to 2:15 pm Toronto (EST, -05:00). */
const fbs = { id: "e1", calId: "joint", title: "Need FBS", start: "2026-11-13T13:45:00-05:00", end: "2026-11-13T14:15:00-05:00", allDay: false, location: "", description: "" };

test("an untouched sheet sends nothing", () => {
  assert.deepEqual(C.sheetPatch(fbs, C.sheetForm(fbs, TO), TO), {});
});

test("a new title is the only thing sent", () => {
  const f = { ...C.sheetForm(fbs, TO), title: "  Need FBS · Elena " };
  assert.deepEqual(C.sheetPatch(fbs, f, TO), { title: "Need FBS · Elena" });
});

test("a new start moves the end so the length stays, and Save sends start and end", () => {
  const f = C.sheetStart(C.sheetForm(fbs, TO), "15:00");
  assert.equal(f.start, "15:00");
  assert.equal(f.end, "15:30", "30 min event keeps 30 min");
  assert.deepEqual(C.sheetPatch(fbs, f, TO), { start: "2026-11-13T20:00:00.000Z", end: "2026-11-13T20:30:00.000Z" });
});

test("a start late in the evening pushes the end past midnight into the next day", () => {
  const f = C.sheetStart(C.sheetForm(fbs, TO), "23:50");
  assert.equal(f.end, "00:20");
  assert.deepEqual(C.sheetPatch(fbs, f, TO), { start: "2026-11-14T04:50:00.000Z", end: "2026-11-14T05:20:00.000Z" });
});

test("an end at or before the start means it ends the next day", () => {
  const f = C.sheetEnd(C.sheetForm(fbs, TO), "01:00");
  assert.deepEqual(C.sheetPatch(fbs, f, TO), { start: "2026-11-13T18:45:00.000Z", end: "2026-11-14T06:00:00.000Z" });
  const same = C.sheetEnd(C.sheetForm(fbs, TO), "13:45");
  assert.equal(C.sheetPatch(fbs, same, TO).end, "2026-11-14T18:45:00.000Z", "same as the start: 24 hours");
});

test("a later end on its own makes the event longer and leaves the start alone in the patch values", () => {
  const f = C.sheetEnd(C.sheetForm(fbs, TO), "15:15");
  assert.deepEqual(C.sheetPatch(fbs, f, TO), { start: "2026-11-13T18:45:00.000Z", end: "2026-11-13T20:15:00.000Z" });
});

test("an event that already runs past midnight opens with the right length, and a new start keeps it", () => {
  const late = { ...fbs, start: "2026-11-13T22:00:00-05:00", end: "2026-11-14T02:00:00-05:00" };
  const f = C.sheetForm(late, TO);
  assert.deepEqual([f.day, f.start, f.end, f.days], ["2026-11-13", "22:00", "02:00", 0]);
  assert.deepEqual(C.sheetPatch(late, f, TO), {});
  assert.equal(C.sheetStart(f, "21:00").end, "01:00");
});

test("All-day on: the event becomes that whole day, sent as dates with allDay", () => {
  const f = C.sheetAllDay(C.sheetForm(fbs, TO), true);
  assert.deepEqual(C.sheetPatch(fbs, f, TO), { allDay: true, start: "2026-11-13", end: "2026-11-14" });
});

test("All-day off: 9:00 AM for one hour on the same day", () => {
  const stay = { id: "e2", calId: "joint", title: "Stay at FICTION", start: "2026-11-15", end: "2026-11-18", allDay: true };
  const f0 = C.sheetForm(stay, TO);
  assert.deepEqual([f0.day, f0.endDay], ["2026-11-15", "2026-11-17"], "the last day is shown, not Google's day after");
  const f = C.sheetAllDay(f0, false);
  assert.deepEqual([f.start, f.end], ["09:00", "10:00"]);
  assert.deepEqual(C.sheetPatch(stay, f, TO), { allDay: false, start: "2026-11-15T14:00:00.000Z", end: "2026-11-15T15:00:00.000Z" });
});

test("an all-day event moved to another day keeps how many days it spans; its end day can change on its own", () => {
  const stay = { id: "e2", calId: "joint", title: "Stay at FICTION", start: "2026-11-15", end: "2026-11-18", allDay: true };
  const moved = C.sheetDay(C.sheetForm(stay, TO), "2026-11-20");
  assert.deepEqual(C.sheetPatch(stay, moved, TO), { allDay: true, start: "2026-11-20", end: "2026-11-23" });
  const shorter = C.sheetEndDay(C.sheetForm(stay, TO), "2026-11-15");
  assert.deepEqual(C.sheetPatch(stay, shorter, TO), { allDay: true, start: "2026-11-15", end: "2026-11-16" });
  const before = C.sheetEndDay(C.sheetForm(stay, TO), "2026-11-10");
  assert.equal(C.sheetPatch(stay, before, TO).end, "2026-11-16", "an end day before the start day is the start day");
});

test("a day change across the November clock change keeps the wall time", () => {
  // Fri Oct 30 2026, 9:00 to 10:00 EDT (-04:00); the clocks go back Sun Nov 1.
  const yoga = { ...fbs, start: "2026-10-30T13:00:00.000Z", end: "2026-10-30T14:00:00.000Z" };
  const f = C.sheetDay(C.sheetForm(yoga, TO), "2026-11-02");
  assert.deepEqual(C.sheetPatch(yoga, f, TO), { start: "2026-11-02T14:00:00.000Z", end: "2026-11-02T15:00:00.000Z" });
});

test("a day change across the March clock change keeps the wall time", () => {
  // Fri Mar 12 2027, 9:00 to 10:00 EST (-05:00); the clocks go forward Sun Mar 14 2027.
  const yoga = { ...fbs, start: "2027-03-12T14:00:00.000Z", end: "2027-03-12T15:00:00.000Z" };
  const f = C.sheetDay(C.sheetForm(yoga, TO), "2027-03-15");
  assert.deepEqual(C.sheetPatch(yoga, f, TO), { start: "2027-03-15T13:00:00.000Z", end: "2027-03-15T14:00:00.000Z" });
});

test("location and notes are sent only when changed, location trimmed", () => {
  const f = { ...C.sheetForm(fbs, TO), location: " 527 Bloor St W ", description: "Bring the keys\nand the mop" };
  assert.deepEqual(C.sheetPatch(fbs, f, TO), { location: "527 Bloor St W", description: "Bring the keys\nand the mop" });
  const had = { ...fbs, location: "527 Bloor St W", description: "Keys" };
  assert.deepEqual(C.sheetPatch(had, C.sheetForm(had, TO), TO), {});
  assert.deepEqual(C.sheetPatch(had, { ...C.sheetForm(had, TO), location: "", description: "" }, TO), { location: "", description: "" });
});

test("a new calendar and a new type are sent as toCalId and kind; back to the guess sends an empty kind", () => {
  const f = { ...C.sheetForm(fbs, TO), calId: "junyan", kind: "studio" };
  assert.deepEqual(C.sheetPatch(fbs, f, TO), { toCalId: "junyan", kind: "studio" });
  const set = { ...fbs, kind: "studio" };
  assert.deepEqual(C.sheetPatch(set, { ...C.sheetForm(set, TO), kind: "" }, TO), { kind: "" });
});

test("notes with Google formatting are spotted, and shown as plain text", () => {
  assert.equal(C.notesRich("Bring the keys\nand the mop"), false);
  assert.equal(C.notesRich("I <3 zouk, 2 < 3"), false);
  assert.equal(C.notesRich('See <a href="https://x.ca">the plan</a><br>Thanks'), true);
  assert.equal(C.notesText('See <a href="https://x.ca">the plan</a><br>Fish &amp; chips<p>Two</p>'), "See the plan\nFish & chips\nTwo");
});

test("the rows' words: Fri, Nov 13 and 1:45 PM", () => {
  assert.equal(C.dayText("2026-11-13"), "Fri, Nov 13");
  assert.equal(C.clock(13 * 60 + 45), "1:45 PM");
  assert.equal(C.clock(9 * 60), "9:00 AM");
  assert.equal(C.clock(0), "12:00 AM");
});
