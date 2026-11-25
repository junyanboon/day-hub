// node --test still/test/commute-remember-location.test.mjs
// Remember a Location text (Junyan, 2026-11-25, d38 "38 yes"): teach the page once that a Location text such as "Studio 509A"
// means a real address, and every Commute block whose To comes from that text goes there, whatever the event is called.
// Rules in calendar-commute.js, page wiring read from calendar.html. No test reads the real clock: every time is a fixed instant.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../calendar-core.js";
import "../calendar-commute.js";
const K = globalThis.CalCommute;
const TZ = "America/Toronto";
const at = (iso) => Date.parse(iso);
const ev = (id, title, s, e, x = {}) => ({ id, calId: "joint", title, s: at(s), e: at(e), allDay: false, k: globalThis.CalCore.kindOf({ title, kind: x.kind }), location: "", ...x });
const html = fs.readFileSync(new URL("../calendar.html", import.meta.url), "utf8");

test("locationKey: lower case, punctuation and extra spaces dropped, numbers kept", () => {
  assert.equal(K.locationKey("  Studio   509A "), "studio 509a");
  assert.equal(K.locationKey("Studio, 509A."), "studio 509a");
  assert.notEqual(K.locationKey("Studio 509A"), K.locationKey("Studio 5"), "numbers are kept, unlike titleKey");
  assert.equal(K.locationKey(""), "");
  assert.equal(K.locationKey(null), "");
  assert.equal(K.locationKey("!!!"), "");
});

test("rememberLocation: the row for a Location text, in the shape of rememberPlace", () => {
  const r = K.rememberLocation({ text: " Studio 509A ", address: "509 Bloor St W, Toronto", lat: 43.66, lng: -79.41 });
  assert.deepEqual(r, { name: "Studio 509A", address: "509 Bloor St W, Toronto", lat: 43.66, lng: -79.41, category: "commute-for", list: "loc:studio 509a",
    notes: "Where the Commute block goes when an event's Location is this text", savedBy: "Calendar" });
  assert.equal(K.rememberLocation({ text: "", address: "x" }), null);
  assert.equal(K.rememberLocation({ text: "Studio 509A", address: " " }), null);
  assert.equal(K.rememberLocation({ text: "Studio 509A", address: "x" }).lat, null);
});

const mem = [K.rememberLocation({ text: "Studio 509A", address: "509 Bloor St W, Toronto", lat: 43.66, lng: -79.41 })];
const block = ev("c1", "Commute", "2026-11-26T22:45:00Z", "2026-11-26T23:30:00Z");
const next = (title, location) => ev("n1", title, "2026-11-26T23:30:00Z", "2026-11-27T01:00:00Z", { location });

test("target: the next event's Location text with a remembered row goes to the real address, whatever the event is called", () => {
  for (const title of ["DM Advanced Training", "Something Else Entirely"]) {
    const t = K.target({ ev: block, events: [block, next(title, "Studio 509A")], tz: TZ, remembered: mem });
    assert.deepEqual([t.source, t.address, t.lat, t.lng, t.name, K.needsAsk(t)], ["location", "509 Bloor St W, Toronto", 43.66, -79.41, "Studio 509A", false], title);
  }
  const t = K.target({ ev: block, events: [block, next("X", "  studio  509a. ")], tz: TZ, remembered: mem });
  assert.equal(t.source, "location", "same key: case, spaces and punctuation do not matter");
});
test("target: the block's own Location text is matched too", () => {
  const t = K.target({ ev: { ...block, location: "Studio 509A" }, events: [block], tz: TZ, remembered: mem });
  assert.deepEqual([t.source, t.address, t.name], ["location", "509 Bloor St W, Toronto", "Studio 509A"]);
});
test("target: a near-miss or part of a text does not match; the Location text is sent as it is", () => {
  for (const loc of ["Studio 5", "Studio 509", "Studio 509A Annex", "509A"]) {
    const t = K.target({ ev: block, events: [block, next("X", loc)], tz: TZ, remembered: mem });
    assert.deepEqual([t.source, t.address], ["next", loc], loc);
  }
});
test("target: a place he picked or typed for this block still wins; so does the block's own text over the next event's", () => {
  const typed = K.target({ ev: block, events: [block, next("X", "Studio 509A")], tz: TZ, remembered: mem, typed: { address: "10 Typed Rd", lat: 1, lng: 2 } });
  assert.deepEqual([typed.source, typed.address], ["typed", "10 Typed Rd"]);
  const own = K.target({ ev: { ...block, location: "388 Carlaw Ave" }, events: [block, next("X", "Studio 509A")], tz: TZ, remembered: mem });
  assert.deepEqual([own.source, own.address], ["block", "388 Carlaw Ave"]);
});
test("target: the title memory (for: rows) keeps working, and a loc: row is never read as a title row", () => {
  const forRow = { category: "commute-for", list: "for:dm advanced training", address: "Bloor St W at Bathurst St", lat: 43.66, lng: -79.4, name: "DM Advanced Training" };
  const t = K.target({ ev: block, events: [block, next("DM Advanced Training", "")], tz: TZ, remembered: [forRow, ...mem] });
  assert.deepEqual([t.source, t.address], ["remembered", "Bloor St W at Bathurst St"]);
  const none = K.target({ ev: block, events: [block, next("Studio 509A", "")], tz: TZ, remembered: mem });
  assert.equal(none.source, "none", "an event TITLE of Studio 509A does not use the Location memory");
  const other = { ...mem[0], category: "trip", list: mem[0].list };
  assert.equal(K.target({ ev: block, events: [block, next("X", "Studio 509A")], tz: TZ, remembered: [other] }).source, "next", "only commute-for rows count");
});
test("rowText shows the real address with the Location text beside it", () => {
  const t = K.target({ ev: block, events: [block, next("X", "Studio 509A")], tz: TZ, remembered: mem });
  assert.deepEqual(K.rowText(t), { main: "Studio 509A", sub: "509 Bloor St W, Toronto" });
});

test("page: the To box has a second switch, read wherever the other switches are read", () => {
  assert.match(html, /id="cmRemLoc"/);
  assert.match(html, /Remember "\$\{esc\(t\.locText\)\}" as this place/);
  assert.match(html, /CalCommute\.rememberLocation\(/);
  assert.match(html, /#cmRemLoc/);
  assert.match(html, /const BUILD = "2026-11-25d remember a location text";/);
  assert.match(html, /calendar-commute\.js\?v=6/);
  assert.match(html, /Remembered "\$\{/);
});
