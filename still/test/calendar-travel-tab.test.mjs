// node --test still/test/calendar-travel-tab.test.mjs
// Junyan, 2026-11-13: "When I hit the travel icon it is goign to the day quest rather than staying on the calendar app.
// I want it to stay on the calendar app." This replaces t9 (2026-11-12, "9 yes"), which sent the Travel tab to Day
// Quest's Trips page on a wide screen. The plane now opens the calendar's own Trips page, the same in-app page as
// Deep Work, listing his trips from the same data Day Quest's Trips view reads (still-api /quest/trips, with Day
// Quest's saved Montreal copy until the server answers). The live browser check is
// still/test/e2e/calendar-trips.e2e.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import "../calendar-core.js";

const C = globalThis.CalCore;
const src = fs.readFileSync(fileURLToPath(new URL("../quest-trips.js", import.meta.url)), "utf8");
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(src, ctx);
const T = ctx.QuestTrips;

test("no block type sends the calendar out to another app any more", () => {
  assert.equal(C.pageLink, undefined, "t9's link to Day Quest Trips is gone from CalCore");
});

/* Look A (Junyan, 2026-11-13, d3: "3A"): one card per trip with Day Quest's own chips. The numbers are the ones
   still-api /quest/trips sends (need, booked, bookings), kept through mergeTrips. */
const SAMPLE = [
  { name: "2026 🇨🇦 Montreal Birthday", start: "2026-11-12", end: "2026-11-17", need: 3, booked: 7, bookings: 43 },
  { name: "2027 🇧🇷 Brazil Carnaval", start: "2027-01-02", end: "2027-02-07", booked: 13, bookings: 14 },
  { name: "2025 Egypt", start: "2025-03-01", end: "2025-03-09", bookings: 1 },
  { name: "2024 Lisbon", start: "2024-05-01", end: "2024-05-01" },
  { name: "Toronto", start: "2026-11-01", end: "2026-12-31", bookings: 9 },
  { name: "2023 Oaxaca" },
  { name: "Someday Japan" },
];
const cards = () => C.tripCards(T.splitTrips(T.mergeTrips(SAMPLE), "2026-11-13"), T.whenLabel);
const plain = (list) => [...list].map((c) => ({ name: c.name, title: c.title, dates: c.dates, chips: [...c.chips].map((x) => [x.cls, x.text]) }));

test("Upcoming: the two cards of look A, every chip with its wording, soonest first", () => {
  assert.deepEqual(plain(cards().upcoming), [
    { name: "2026 🇨🇦 Montreal Birthday", title: "🧳 2026 🇨🇦 Montreal Birthday", dates: "Nov 12, 2026 to Nov 17, 2026",
      chips: [["now", "Now"], ["need", "3 to book"], ["paid", "7 booked"], ["", "43 bookings"]] },
    { name: "2027 🇧🇷 Brazil Carnaval", title: "🧳 2027 🇧🇷 Brazil Carnaval", dates: "Jan 2, 2027 to Feb 7, 2027",
      chips: [["", "50 days away"], ["paid", "13 booked"], ["", "14 bookings"]] },
  ]);
});

test("Past: newest first with days ago, a one-day trip shows one date, one booking is singular, Toronto is never a trip", () => {
  const c = cards();
  assert.deepEqual(plain(c.past), [
    { name: "2025 Egypt", title: "🧳 2025 Egypt", dates: "Mar 1, 2025 to Mar 9, 2025", chips: [["", "614 days ago"], ["", "1 booking"]] },
    { name: "2024 Lisbon", title: "🧳 2024 Lisbon", dates: "May 1, 2024", chips: [["", "926 days ago"]] },
    { name: "2023 Oaxaca", title: "🧳 2023 Oaxaca", dates: "No dates yet", chips: [] },
  ]);
  assert.deepEqual(plain(c.needsDates), [{ name: "Someday Japan", title: "🧳 Someday Japan", dates: "No dates yet", chips: [] }]);
  assert.deepEqual({ ...c.counts }, { upcoming: 2, past: 4 }, "Past counts the undated trips too, as Day Quest's tab does");
});

test("a trip's own icon wins over the suitcase", () => {
  const c = C.tripCards(T.splitTrips([{ name: "Ski week", icon: "⛷️", start: "2026-12-01", end: "2026-12-05" }], "2026-11-13"), T.whenLabel);
  assert.equal(c.upcoming[0].title, "⛷️ Ski week");
});

test("Local and + New trip are plain links to Day Quest's own Local tab and new-trip flow, ?api= carried along", () => {
  assert.deepEqual({ ...C.tripLinks("?api=http%3A%2F%2Flocalhost%3A8806") }, {
    local: "quest.html?api=http%3A%2F%2Flocalhost%3A8806#trips-local",
    add: "quest.html?api=http%3A%2F%2Flocalhost%3A8806#trips-new",
  });
  assert.deepEqual({ ...C.tripLinks("") }, { local: "quest.html#trips-local", add: "quest.html#trips-new" });
});

test("the calendar can load quest-trips.js for its helpers without Day Quest's sidebar drawing on it", () => {
  const touched = [];
  const doc = new Proxy({ currentScript: { dataset: { helpers: "" } } }, {
    get(o, p) { if (p in o) return o[p]; touched.push(String(p)); return () => { throw new Error("document." + String(p) + " used"); }; },
  });
  const win = { matchMedia: () => ({ matches: true, addEventListener() {} }), localStorage: { getItem: () => "" } };
  const c = { document: doc, window: win, location: { search: "", hash: "" } }; c.globalThis = c;
  assert.doesNotThrow(() => vm.runInNewContext(src, c));
  assert.equal(typeof c.QuestTrips.splitTrips, "function");
  assert.deepEqual(touched, []);
});

test("Day Quest opens on its Trips page, its Local tab or its new-trip flow from the address", () => {
  assert.equal(T.startView("#trips"), "trips");
  assert.equal(T.startView("#Trips"), "trips");
  assert.equal(T.startView("#trips-local"), "local", "the calendar's Local tab lands on Day Quest's Local tab");
  assert.equal(T.startView("#trips-new"), "new", "the calendar's + New trip starts Day Quest's new-trip flow");
  for (const h of ["", "#", "#pair=abc123", "#tripsx", "#gym", "#trips-localx", "#trips-"]) assert.equal(T.startView(h), null, h);
});
