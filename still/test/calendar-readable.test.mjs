// node --test still/test/calendar-readable.test.mjs  (calendar readability fixes, 2026-11-06:
// Junyan's real week was "unreadable": Staff scheduling split columns into 5 to 8 lanes, titles cut to 3 letters,
// raw ISO due dates in the Tasks panel, calendar colours not his Google/Notion ones).
import test from "node:test";
import assert from "node:assert/strict";
import "../calendar-core.js";
const C = globalThis.CalCore;
const TO = "America/Toronto";

test("Staff scheduling is told apart by its calendar name", () => {
  assert.equal(C.isStaff("Staff scheduling"), true);
  assert.equal(C.isStaff("Staff Scheduling"), true);
  assert.equal(C.isStaff("Junyan"), false);
  assert.equal(C.isStaff(""), false);
});

test("back-to-back and overlapping Staff events fold into one run", () => {
  const runs = C.staffRuns([
    { id: "a", s: 600, e: 630 }, { id: "b", s: 630, e: 660 }, { id: "c", s: 640, e: 700 },
    { id: "d", s: 800, e: 830 }, { id: "e", s: 830, e: 845 },
    { id: "f", s: 1200, e: 1230 },
  ]);
  assert.deepEqual(runs.map((r) => [r.s, r.e, r.items.map((x) => x.id).join("")]), [[600, 700, "abc"], [800, 845, "de"], [1200, 1230, "f"]]);
  assert.deepEqual(C.staffRuns([]), []);
});

test("overlap layout never shows more than the lane cap; the rest go into a +N chip", () => {
  // 8 events all at 1 pm, like the screenshot's flood
  const items = Array.from({ length: 8 }, (_, i) => ({ id: "x" + i, s: 780, e: 840 + i }));
  const { shown, more } = C.layoutCapped(items, 3);
  assert.equal(shown.length, 3);
  assert.ok(shown.every((x) => x.cols === 3 && x.col < 3));
  assert.equal(more.length, 1);
  assert.equal(more[0].items.length, 5);
  assert.equal(more[0].s, 780);
  // a quiet stretch keeps the full width
  const solo = C.layoutCapped([{ id: "d", s: 1080, e: 1140 }], 3);
  assert.deepEqual([solo.shown[0].col, solo.shown[0].cols, solo.more.length], [0, 1, 0]);
  // two overlaps stay two lanes, nothing hidden
  const two = C.layoutCapped([{ id: "a", s: 0, e: 60 }, { id: "b", s: 30, e: 90 }], 3);
  assert.deepEqual([two.shown.map((x) => x.cols), two.more.length], [[2, 2], 0]);
});

test("a hidden event in one cluster does not leak into the next", () => {
  const items = [{ id: "a", s: 0, e: 60 }, { id: "b", s: 0, e: 60 }, { id: "c", s: 0, e: 60 }, { id: "d", s: 120, e: 180 }];
  const { shown, more } = C.layoutCapped(items, 2);
  assert.equal(more.length, 1);
  assert.deepEqual(more[0].items.map((x) => x.id), ["c"]);
  assert.equal(shown.find((x) => x.id === "d").cols, 1);
});

test("card text: the time goes before the title is cut, and titles wrap to two lines when there is room", () => {
  // short 30 min card: one line, time inline only when the title fits beside it
  assert.deepEqual(C.cardText({ title: "Dinner", h: 26, w: 180 }), { lines: 1, time: "inline" });
  assert.deepEqual(C.cardText({ title: "Studio cleaning and reset", h: 26, w: 120 }), { lines: 1, time: "none" });
  // 45 min card with a long title: two title lines, no time line
  assert.deepEqual(C.cardText({ title: "Hike at Rattlesnake Point", h: 40, w: 110 }), { lines: 2, time: "none" });
  // tall card: two title lines and the time
  assert.deepEqual(C.cardText({ title: "Hike at Rattlesnake Point", h: 110, w: 110 }), { lines: 2, time: "line" });
  // tall card, short title: one line plus time
  assert.deepEqual(C.cardText({ title: "Gym", h: 110, w: 110 }), { lines: 1, time: "line" });
});

test("due dates read plainly", () => {
  const t = "2026-11-06";
  assert.equal(C.dueText("2026-10-15T17:25:00.000+00:00", t, TO), "overdue 3 weeks");
  assert.equal(C.dueText("2026-11-06", t, TO), "due today");
  assert.equal(C.dueText("2026-11-07", t, TO), "due tomorrow");
  assert.equal(C.dueText("2026-11-05", t, TO), "overdue 1 day");
  assert.equal(C.dueText("2026-11-03", t, TO), "overdue 3 days");
  assert.equal(C.dueText("2026-11-10", t, TO), "due Tue");
  assert.equal(C.dueText("2026-11-20", t, TO), "due Nov 20");
  assert.equal(C.dueText("2027-01-04", t, TO), "due Jan 4, 2027");
  assert.equal(C.dueText("2026-08-18", t, TO), "overdue 2 months");
  assert.equal(C.dueText("", t, TO), "");
  // a UTC evening time is still the same Toronto day
  assert.equal(C.dueText("2026-11-07T02:00:00.000+00:00", t, TO), "due today");
});

test("long-overdue open tasks are set aside, nothing else is", () => {
  const t = "2026-11-06";
  assert.equal(C.isStale({ due: "2026-10-15T17:25:00.000+00:00" }, t, TO), true);
  assert.equal(C.isStale({ due: "2026-11-03" }, t, TO), false, "a few days late stays in view");
  assert.equal(C.isStale({ due: "2026-10-01", done: true }, t, TO), false, "a task ticked this session stays where it was");
  assert.equal(C.isStale({}, t, TO), false);
});
