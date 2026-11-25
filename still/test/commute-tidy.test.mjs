// node --test still/test/commute-tidy.test.mjs
// The tidy Commute panel (Junyan, 2026-11-25: "36 yes 37 yes ... 39 yes", then "38 yes, 40 yes, 41 yes"): the rules behind the quiet
// "Checked ... Check again" line, the Heads up short lines and "on your route", the clearer no-route message (d37), and the weather tidy-up
// (d36). Pure rules only: the page wiring is read in commute-tidy-page.test.mjs and the e2e file. No test reads the real clock.
import test from "node:test";
import assert from "node:assert/strict";
import "../calendar-core.js";
import "../calendar-commute.js";
const K = globalThis.CalCommute;

test("the quiet checked line: the time, 'by itself' when the page's own check made it", () => {
  assert.equal(K.checkedLine({ at: 1, auto: false, fmt: () => "10:45 am" }), "Checked 10:45 am");
  assert.equal(K.checkedLine({ at: 1, auto: true, fmt: () => "10:45 am" }), "Checked by itself 10:45 am");
  assert.equal(K.checkedLine({ at: 1, fmt: () => "9 am" }), "Checked 9 am", "no flag means pressed or loaded, not by itself");
  assert.equal(K.checkedLine({ at: NaN, auto: false, fmt: () => "" }), "", "no time, no line text");
});

test("an alert's short line: Until date and on your route; a short description is the line itself; a long one waits for a tap", () => {
  const long = "x".repeat(120);
  assert.deepEqual(K.alertLine({ detail: "Until Nov 27. Lane closures for watermain work." }), { short: "Until Nov 27", expandable: true, detail: "Until Nov 27. Lane closures for watermain work." });
  assert.deepEqual(K.alertLine({ detail: "Until Nov 27. Lane closures for watermain work." }, { onRoute: true }), { short: "On your route · Until Nov 27", expandable: true, detail: "Until Nov 27. Lane closures for watermain work." });
  assert.deepEqual(K.alertLine({ detail: "Until Nov 27." }), { short: "Until Nov 27", expandable: false, detail: "" }, "nothing more to show: no tap");
  assert.deepEqual(K.alertLine({ detail: "Hold on to your hat." }), { short: "Hold on to your hat.", expandable: false, detail: "" }, "a short description needs no hiding");
  assert.deepEqual(K.alertLine({ detail: long }), { short: "Tap for details", expandable: true, detail: long });
  assert.deepEqual(K.alertLine({ detail: long }, { onRoute: true }), { short: "On your route", expandable: true, detail: long });
  assert.deepEqual(K.alertLine({ detail: "" }), { short: "", expandable: false, detail: "" });
  assert.deepEqual(K.alertLine({}, { onRoute: true }), { short: "On your route", expandable: false, detail: "" });
});

test("on your route: only a drive closure whose street is one of the way's roads, by name (abbreviations and case ignored)", () => {
  const way = { roads: [{ road: "Dundas St W", km: 2 }, { road: "Gardiner Expressway", km: 5 }] };
  const a = (road) => ({ kind: "closure", mode: "drive", title: `${road} is closed between A and B` });
  assert.equal(K.onRoute(a("Dundas Street West"), way, "drive"), true);
  assert.equal(K.onRoute(a("dundas st. w"), way, "drive"), true);
  assert.equal(K.onRoute(a("Gardiner Expressway"), way, "drive"), true);
  assert.equal(K.onRoute(a("Queen St W"), way, "drive"), false, "another street");
  assert.equal(K.onRoute(a("Dundas St E"), way, "drive"), false, "same street, other direction");
  assert.equal(K.onRoute(a("Dundas Street West"), way, "transit"), false, "closures are a drive alert");
  assert.equal(K.onRoute({ kind: "ttc", title: "Line 1: delays" }, way, "drive"), false);
  assert.equal(K.onRoute(a("Dundas Street West"), { minutes: 9 }, "drive"), false, "no roads on the page: cannot tell");
  assert.equal(K.onRoute(a("Dundas Street West"), null, "drive"), false);
  assert.equal(K.onRoute({ kind: "closure", title: "" }, way, "drive"), false);
});

test("d37: no route and no pin for the To names the place and says what to do; with a pin the old words stay", () => {
  assert.equal(K.noRouteText({ err: "Google found no route.", to: "Studio 509A", noPin: true }), 'Google cannot find "Studio 509A". Tap To and pick the real place.');
  assert.equal(K.noRouteText({ err: "Google found no route.", to: "Studio 509A", noPin: false }), "Google found no route.");
  assert.equal(K.noRouteText({ err: "Google could not give directions just now.", to: "Studio 509A", noPin: true }), "Google could not give directions just now.", "another failure keeps its own words");
  assert.equal(K.noRouteText({ err: "Google found no route.", to: "", noPin: true }), "Google found no route.", "nothing to name");
  assert.equal(K.noRouteText({ err: "", to: "X", noPin: true }), "No directions for this way.");
  assert.equal(K.noRouteText({ err: undefined, to: "X", noPin: false }), "No directions for this way.");
});

test("d36 a: one 'block over' rule for the directions and the weather", () => {
  assert.equal(K.blockEnded(1000, 1000), true, "ends this very moment: over");
  assert.equal(K.blockEnded(1001, 1000), false);
  assert.equal(K.blockEnded(undefined, 1000), false, "no end known: not over");
  assert.equal(K.weatherWindow({ at: 0, end: 1000, now: 1000, tz: "America/Toronto" }), "ended", "the weather window uses the same rule");
});

test("d36 b: when no hour can be read, the answer reaching past the end of its hours says far, anything else none", () => {
  const res = { hourly: { time: [1000, 4600] } };
  assert.equal(K.missingHour(res, 4600 * 1000 + 3 * 3600000), "far");
  assert.equal(K.missingHour(res, 0), "none", "before its first hour");
  assert.equal(K.missingHour(null, 5e9), "none");
  assert.equal(K.missingHour({}, 5e9), "none");
  assert.equal(K.missingHour({ hourly: { time: [] } }, 5e9), "none");
  assert.equal(K.missingHour(res, NaN), "none");
});

test("d36 c: the rain and snow code lists are the ones the old copies had, now derived from the code table", () => {
  const RAIN = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 97, 99], SNOW = [71, 73, 75, 77, 85, 86];
  assert.deepEqual([...K.RAIN_CODES].sort((a, b) => a - b), RAIN);
  assert.deepEqual([...K.SNOW_CODES].sort((a, b) => a - b), SNOW);
  assert.equal(K.weatherWords(63).words, "rain");
  for (const c of RAIN) assert.equal(K.weatherTip({ temp: 5, pop: 0, code: c }), "Bring an umbrella.");
  for (const c of SNOW) assert.equal(K.weatherTip({ temp: -5, pop: 0, code: c }), "Snow is likely. Dress for it.");
});
