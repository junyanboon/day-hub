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
  for (const [k] of C.KINDS) assert.equal(typeof C.pageLink === "function" ? C.pageLink(k, "") : null, null, k);
});

test("the Trips page lists the saved Montreal trip as Now on 2026-11-13", () => {
  const seed = [{ name: T.MTL, start: T.SEED.start, end: T.SEED.end, icon: "🧳" }];
  const rows = C.tripRows(T.splitTrips(T.mergeTrips(seed), "2026-11-13").upcoming, T.whenLabel);
  assert.deepEqual([...rows].map((r) => ({ ...r })), [{ title: "🧳 2026 🇨🇦 Montreal Birthday", dates: "Nov 12 to Nov 17, 2026", when: "Now" }]);
});

test("Trips rows: soonest first, past trips and Toronto left out, dates across a year end", () => {
  const list = [
    { name: "2027 🇧🇷 Brazil Carnaval", start: "2027-02-12", end: "2027-02-20" },
    { name: "2026 🇨🇦 Montreal Birthday", start: "2026-11-12", end: "2026-11-17" },
    { name: "2025 Egypt", start: "2025-03-01", end: "2025-03-09" },
    { name: "Toronto", start: "2026-11-01", end: "2026-12-31" },
    { name: "2026 New Year", start: "2026-12-30", end: "2027-01-02" },
    { name: "Day trip", start: "2026-11-20", end: "2026-11-20" },
  ];
  const rows = C.tripRows(T.splitTrips(T.mergeTrips(list), "2026-11-13").upcoming, T.whenLabel);
  assert.deepEqual([...rows].map((r) => [r.title, r.dates, r.when]), [
    ["🧳 2026 🇨🇦 Montreal Birthday", "Nov 12 to Nov 17, 2026", "Now"],
    ["🧳 Day trip", "Nov 20, 2026", "7 days away"],
    ["🧳 2026 New Year", "Dec 30, 2026 to Jan 2, 2027", "47 days away"],
    ["🧳 2027 🇧🇷 Brazil Carnaval", "Feb 12 to Feb 20, 2027", "91 days away"],
  ]);
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

test("Day Quest still opens on its own Trips page when the address ends in #trips", () => {
  assert.equal(T.startView("#trips"), "trips");
  assert.equal(T.startView("#Trips"), "trips");
  for (const h of ["", "#", "#pair=abc123", "#tripsx", "#gym"]) assert.equal(T.startView(h), null, h);
});
