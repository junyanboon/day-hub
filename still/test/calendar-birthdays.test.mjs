// node --test still/test/calendar-birthdays.test.mjs
// Community Birthdays (Junyan, 2026-11-24: "put it somewhere that it doesn't get in the way"): a display-only calendar.
// The behaviour is proved in a browser by still/test/e2e/calendar-birthdays.e2e.mjs; this file holds the pure parts and
// the rules the page source must keep (no clock is read here).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "../calendar-core.js";
const C = globalThis.CalCore;

const html = fs.readFileSync(fileURLToPath(new URL("../calendar.html", import.meta.url)), "utf8");
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));

test("an event is display only when its calendar or the event says so", () => {
  assert.equal(C.isDisplayOnly({ displayOnly: true }, null), true);
  assert.equal(C.isDisplayOnly({}, { displayOnly: true }), true);
  assert.equal(C.isDisplayOnly({}, { writable: false }), false);
  assert.equal(C.isDisplayOnly({}, undefined), false);
  assert.equal(C.isDisplayOnly(undefined, undefined), false);
});

test("the chip says the cake for one birthday, a count for more, nothing for none", () => {
  assert.equal(C.birthdayChip(0), "");
  assert.equal(C.birthdayChip(1), "🎂");
  assert.equal(C.birthdayChip(2), "🎂 2");
  assert.equal(C.birthdayChip(5), "🎂 5");
});

test("eventsFor leaves display-only events out, so every plan, count and suggestion built on it never sees them", () => {
  const body = html.slice(html.indexOf("function eventsFor("), html.indexOf("/** Cards (cards.js)"));
  assert.match(body, /C\.isDisplayOnly\(e, calOf\(e\.calId\)\)/);
});

test("a birthday can never be opened for editing: findByKey skips display-only events", () => {
  const body = html.slice(html.indexOf("function findByKey("), html.indexOf("function findByKey(") + 700);
  assert.match(body, /isDisplayOnly/);
});

test("the day header chip has a 44 px touch target on the phone, and the page names the Birthdays list", () => {
  const phone = css.match(/@media\(max-width:760px\)\{\.dn \.bday\{([^}]*)\}/);
  assert.ok(phone, "a phone rule for the chip");
  assert.match(phone[1], /min-height:44px/);
  assert.match(phone[1], /min-width:44px/);
  assert.match(html, /title: "Birthdays"/);
});
