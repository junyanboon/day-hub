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
  assert.match(html, /const BUILD = "2026-11-25m trip home";/);
  assert.match(html, /calendar-commute\.js\?v=12/);
  assert.match(html, /CalCommute\.rememberToast\(/);
});

/* ---- 2026-11-25e: d43 (a text that cannot be remembered gets no switch) and d42 (Forget) ---- */
const keyOfLen = (n) => "a".repeat(n);   // locationKey("aaa...") is the same string, so "loc:" + key is n + 4 characters

test("canRememberLocation: key not empty and \"loc:\" + key at most 120 characters (the server cuts list at 120)", () => {
  assert.equal(K.canRememberLocation(keyOfLen(116)), true, "116 + 4 = 120 fits");
  assert.equal(K.canRememberLocation(keyOfLen(117)), false, "117 + 4 = 121 is cut by the server");
  assert.equal(K.canRememberLocation("Studio 509A"), true, "a normal room name");
  assert.equal(K.canRememberLocation("😀🎉"), false, "emoji only: empty key");
  assert.equal(K.canRememberLocation("!!! ... ???"), false, "punctuation only: empty key");
  assert.equal(K.canRememberLocation(""), false);
  assert.equal(K.canRememberLocation(null), false);
  assert.equal(K.canRememberLocation("  " + keyOfLen(116) + "  "), true, "spaces around do not count");
  assert.equal(K.canRememberLocation(("ab " + "c").repeat(20)), true, "a long text whose key is short enough");
});
test("rememberLocation returns null when the text cannot be remembered, and a row when it can", () => {
  assert.equal(K.rememberLocation({ text: keyOfLen(117), address: "x" }), null);
  assert.equal(K.rememberLocation({ text: "😀", address: "x" }), null);
  const r = K.rememberLocation({ text: keyOfLen(116), address: "x" });
  assert.equal(r.list.length, 120);
  assert.equal(r.list, "loc:" + keyOfLen(116));
});
test("a row saved for a 116 character key is found by the exact lookup (list is not cut)", () => {
  const long = keyOfLen(116), row = { ...K.rememberLocation({ text: long, address: "1 Long St", lat: 1, lng: 2 }), id: "p9" };
  const t = K.target({ ev: block, events: [block, next("X", long)], tz: TZ, remembered: [row] });
  assert.deepEqual([t.source, t.address], ["location", "1 Long St"]);
});

test("locationMemory: the remembered loc: row for a Location text, else null", () => {
  const row = { ...mem[0], id: "p1" };
  assert.equal(K.locationMemory([row], " studio  509a. "), row);
  assert.equal(K.locationMemory([row], "Studio 5"), null);
  assert.equal(K.locationMemory([row], ""), null);
  assert.equal(K.locationMemory([], "Studio 509A"), null);
  assert.equal(K.locationMemory(null, "Studio 509A"), null);
  assert.equal(K.locationMemory([{ ...row, category: "trip" }], "Studio 509A"), null, "only commute-for rows");
  assert.equal(K.locationMemory([{ ...row, list: "for:studio 509a" }], "Studio 509A"), null, "a title row is never a loc: row");
  assert.equal(K.locationMemory([{ ...row, address: " " }], "Studio 509A"), null);
});
test("forgetLine: the words beside the Forget link", () => {
  assert.equal(K.forgetLine({ ...mem[0], id: "p1" }, "Studio 509A"), '"Studio 509A" goes to 509 Bloor St W, Toronto');
});

test("rememberToast: one switch keeps today's words; two switches give one true message", () => {
  const ok = { ok: true }, no = (error) => ({ ok: false, error });
  assert.deepEqual(K.rememberToast({ title: "DM Class", text: "Studio 509A", t: ok }), { text: "Remembered for every DM Class", bad: false });
  assert.deepEqual(K.rememberToast({ title: "DM Class", text: "Studio 509A", l: ok }), { text: 'Remembered "Studio 509A"', bad: false });
  assert.deepEqual(K.rememberToast({ title: "DM Class", text: "Studio 509A", t: no("boom") }), { text: "Not remembered: boom", bad: true });
  assert.deepEqual(K.rememberToast({ title: "DM Class", text: "Studio 509A", l: no("boom") }), { text: "Not remembered: boom", bad: true });
  assert.deepEqual(K.rememberToast({ title: "DM Class", text: "Studio 509A", t: ok, l: ok }), { text: 'Remembered for every DM Class and "Studio 509A"', bad: false });
  assert.deepEqual(K.rememberToast({ title: "DM Class", text: "Studio 509A", t: ok, l: no("boom") }), { text: 'Remembered for every DM Class. Not remembered "Studio 509A": boom', bad: true });
  assert.deepEqual(K.rememberToast({ title: "DM Class", text: "Studio 509A", t: no("boom"), l: ok }), { text: 'Remembered "Studio 509A". Not remembered for every DM Class: boom', bad: true });
  assert.deepEqual(K.rememberToast({ title: "DM Class", text: "Studio 509A", t: no("boom"), l: no("boom") }), { text: 'Not remembered for every DM Class or "Studio 509A": boom', bad: true });
  assert.deepEqual(K.rememberToast({ title: "DM Class", text: "Studio 509A", t: no("a"), l: no("b") }), { text: 'Not remembered for every DM Class or "Studio 509A": a and b', bad: true });
  assert.equal(K.rememberToast({ title: "DM Class", text: "Studio 509A" }), null, "nothing was asked: no message");
});

test("target after a forget: the row is gone, so the Location text goes as written; a typed place is untouched", () => {
  const evs = [block, next("X", "Studio 509A")];
  assert.equal(K.target({ ev: block, events: evs, tz: TZ, remembered: mem }).source, "location");
  const gone = K.target({ ev: block, events: evs, tz: TZ, remembered: [] });
  assert.deepEqual([gone.source, gone.address], ["next", "Studio 509A"]);
  const typed = K.target({ ev: block, events: evs, tz: TZ, remembered: [], typed: { address: "10 Typed Rd", lat: 1, lng: 2 } });
  assert.deepEqual([typed.source, typed.address], ["typed", "10 Typed Rd"]);
});

test("page: d43 switch rule, combined message, d42 Forget wiring", () => {
  assert.match(html, /CalCommute\.canRememberLocation\(t\.locText\)/);
  assert.match(html, /CalCommute\.rememberToast\(/);
  assert.match(html, /data-cm="forgetloc"/);
  assert.match(html, /CalCommute\.locationMemory\(/);
  assert.match(html, /op: "del"/);
  assert.match(html, /Forgot "\$\{/);
  assert.match(html, /Not forgotten\. Try again in a moment\./);
  assert.doesNotMatch(html, /\(to && t\.locText \? `<label class="cmrem"><input type="checkbox" role="switch" id="cmRemLoc"/, "the switch is no longer drawn for any non-empty text");
});
