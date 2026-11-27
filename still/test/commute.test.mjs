// node --test still/test/commute.test.mjs  (Commute blocks, slice 1, Junyan 2026-11-24: "1 yes, 2 A, 3 yes, 4 A")
// The rules behind the Commute panel: where the block is going, when to ask, the Google Maps link, the photo size.
// No test reads the real clock: every time here is a fixed instant.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "../calendar-core.js";
import "../calendar-commute.js";
const K = globalThis.CalCommute;
const TZ = "America/Toronto";
const at = (iso) => Date.parse(iso);
const ev = (id, title, s, e, x = {}) => ({ id, calId: "joint", title, s: at(s), e: at(e), allDay: false, k: globalThis.CalCore.kindOf({ title, kind: x.kind }), location: "", ...x });

test("Google Maps link: each mode, both addresses, encoded", () => {
  const u = (mode) => new URL(K.mapsLink({ from: "12 Home St, Toronto", to: "Bloor St W at Bathurst St", mode }));
  for (const [mode, tm] of [["transit", "transit"], ["drive", "driving"], ["commute", "walking"]]) {
    const x = u(mode);
    assert.equal(x.origin + x.pathname, "https://www.google.com/maps/dir/");
    assert.equal(x.searchParams.get("api"), "1");
    assert.equal(x.searchParams.get("origin"), "12 Home St, Toronto");
    assert.equal(x.searchParams.get("destination"), "Bloor St W at Bathurst St");
    assert.equal(x.searchParams.get("travelmode"), tm, mode);
  }
  assert.match(K.mapsLink({ from: "A & B", to: "C", mode: "drive" }), /origin=A%20%26%20B&destination=C&travelmode=driving$/);
  assert.equal(new URL(K.mapsLink({ to: "C", mode: "transit" })).searchParams.has("origin"), false, "no From: Google uses where you are");
  assert.equal(K.mapsLink({ from: "A", to: "", mode: "transit" }), "", "no destination, no link");
  assert.equal(new URL(K.mapsLink({ from: "A", to: "B", mode: "bogus" })).searchParams.get("travelmode"), "walking");
});

test("To comes from the block's own location, then the next event that day, then a place saved for that event", () => {
  const block = ev("c1", "Commute", "2026-11-26T22:45:00Z", "2026-11-26T23:30:00Z");
  const next = ev("n1", "DM Advanced Training", "2026-11-26T23:30:00Z", "2026-11-27T01:00:00Z");
  const events = [block, next, ev("late", "Dinner", "2026-11-27T01:30:00Z", "2026-11-27T02:30:00Z", { location: "5 Far Ave" })];
  const t0 = K.target({ ev: block, events, tz: TZ, remembered: [] });
  assert.equal(t0.source, "none"); assert.equal(t0.nextTitle, "DM Advanced Training");
  assert.equal(K.needsAsk(t0), true, "no address anywhere: ask");
  assert.equal(K.target({ ev: { ...block, location: "388 Carlaw Ave" }, events, tz: TZ, remembered: [] }).address, "388 Carlaw Ave");
  assert.equal(K.target({ ev: { ...block, location: "388 Carlaw Ave" }, events, tz: TZ, remembered: [] }).source, "block");
  const withLoc = events.map((x) => x.id === "n1" ? { ...x, location: "1 Studio Way" } : x);
  const t1 = K.target({ ev: block, events: withLoc, tz: TZ, remembered: [] });
  assert.deepEqual([t1.source, t1.address, K.needsAsk(t1)], ["next", "1 Studio Way", false]);
  const mem = [{ id: "pl-1", name: "DM Advanced Training", address: "Bloor St W at Bathurst St", lat: 43.66, lng: -79.41, category: "commute-for", list: "for:dm advanced training" }];
  const t2 = K.target({ ev: block, events, tz: TZ, remembered: mem });
  assert.deepEqual([t2.source, t2.address, t2.lat, K.needsAsk(t2)], ["remembered", "Bloor St W at Bathurst St", 43.66, false]);
  assert.equal(K.target({ ev: block, events: withLoc, tz: TZ, remembered: mem }).source, "next", "an address on the event beats a remembered one");
  const typed = K.target({ ev: block, events, tz: TZ, remembered: [], typed: { address: "10 Typed Rd", lat: 1, lng: 2 } });
  assert.deepEqual([typed.source, typed.address, K.needsAsk(typed)], ["typed", "10 Typed Rd", false]);
});

test("the next event is the next timed one that day: not all-day, not another commute, not the day after", () => {
  const block = ev("c1", "Bus", "2026-11-26T14:00:00Z", "2026-11-26T14:30:00Z");
  const events = [block,
    { ...ev("ad", "Pay rent", "2026-11-26T05:00:00Z", "2026-11-27T05:00:00Z"), allDay: true },
    ev("c2", "Drive", "2026-11-26T14:30:00Z", "2026-11-26T15:00:00Z"),
    ev("early", "Yoga", "2026-11-26T12:00:00Z", "2026-11-26T13:00:00Z"),
    ev("tmrw", "Gym", "2026-11-27T15:00:00Z", "2026-11-27T16:00:00Z", { location: "Tomorrow Gym" })];
  assert.equal(K.target({ ev: block, events, tz: TZ, remembered: [] }).nextTitle, "", "nothing later that day");
  events.push(ev("late", "Zouk Training", "2026-11-26T18:00:00Z", "2026-11-26T19:30:00Z"));
  assert.equal(K.target({ ev: block, events, tz: TZ, remembered: [] }).nextTitle, "Zouk Training");
  assert.equal(K.target({ ev: block, events: events.filter((x) => x.id !== "late"), tz: TZ, remembered: [] }).source, "none", "no next event and no address: ask");
});

test("Remember for every <event title>: the key ignores case, emoji, and counters", () => {
  assert.equal(K.titleKey("DM Advanced Training"), "dm advanced training");
  assert.equal(K.titleKey("  🎯 DM  Advanced Training · 0/2 "), "dm advanced training");
  assert.equal(K.rememberPlace({ title: "DM Advanced Training", address: "Bloor St W", lat: 43.6, lng: -79.4 }).list, "for:dm advanced training");
  assert.equal(K.rememberPlace({ title: "DM Advanced Training", address: "Bloor St W", lat: 43.6, lng: -79.4 }).category, "commute-for");
  assert.equal(K.rememberPlace({ title: "", address: "x" }), null);
});

test("photo notes are tied to the place: a saved place by id, any other by its address", () => {
  assert.equal(K.placeKey({ id: "pl-9", address: "x" }), "a:x", "the address is the place, saved or typed");
  assert.equal(K.placeKey({ id: "pl-9" }), "p:pl-9");
  assert.equal(K.placeKey({ address: " Bloor St W  at Bathurst St " }), "a:bloor st w at bathurst st");
  assert.equal(K.placeKey({ address: "" }), "");
});

test("a photo is shrunk to a long side of about 1600 px and keeps its shape", () => {
  assert.deepEqual(K.fitSize(4032, 3024, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(K.fitSize(3024, 4032, 1600), { w: 1200, h: 1600 });
  assert.deepEqual(K.fitSize(800, 600, 1600), { w: 800, h: 600 }, "never enlarged");
});

/* ---- slice 2 (Junyan, 2026-11-24, d1 to d9): the rules behind leave-by, best way, Heads up and the check ---- */
const NOW = at("2026-11-24T16:00:00Z");
const hmT = (ms) => globalThis.CalCore.hm(globalThis.CalCore.wall(ms, TZ).min);
const block = ev("c1", "Commute", "2026-11-24T17:00:00Z", "2026-11-24T18:10:00Z");
const next = ev("n1", "Zouk Training", "2026-11-24T18:15:00Z", "2026-11-24T19:15:00Z");
const tgt = () => K.arriveTarget(block, [block, next], TZ);
test("arrive-by is 5 minutes before the next event that day, else the end of the block", () => {
  assert.deepEqual(tgt(), { at: at("2026-11-24T18:10:00Z"), nextTitle: "Zouk Training", buffer: 5 });
  const alone = K.arriveTarget(block, [block], TZ);
  assert.deepEqual(alone, { at: block.e, nextTitle: "", buffer: 0 });
  const tomorrow = ev("n2", "Class", "2026-11-25T18:15:00Z", "2026-11-25T19:15:00Z");
  assert.equal(K.arriveTarget(block, [block, tomorrow], TZ).nextTitle, "", "an event on another day is not the next event");
});
test("leave-by per mode: walk and drive count back from arrive-by, transit keeps the server's real departure", () => {
  const t = tgt();
  assert.equal(K.leaveBy({ mode: "walk", minutes: 50 }, t.at), t.at - 50 * 60000);
  assert.equal(K.leaveBy({ mode: "drive", minutes: 27 }, t.at + 30000), t.at - 27 * 60000, "seconds are dropped, never rounded up");
  assert.equal(K.leaveBy({ mode: "transit", minutes: 34, leaveAt: at("2026-11-24T17:36:00Z") }, t.at), at("2026-11-24T17:36:00Z"));
  assert.equal(K.leaveBy({ mode: "walk", tooFar: true, km: 9 }, t.at), null);
  assert.equal(K.leaveBy(null, t.at), null);
});
test("the trip view: arrive time, the real spare minutes before the next plan, late wording, or when the block ends", () => {
  const t = tgt();
  assert.deepEqual(K.tripView({ minutes: 27 }, t, hmT), { arrive: "1:10 pm", minutes: 27, spare: 5, late: false, nextTitle: "Zouk Training", nextAt: "1:15 pm", lead: "Spare time before Zouk Training at 1:15 pm" });
  const tr = K.tripView({ minutes: 34, arriveAt: at("2026-11-24T18:09:00Z") }, t, hmT);
  assert.equal(tr.arrive, "1:09 pm", "transit arrives when Google says"); assert.equal(tr.spare, 6);
  const late = K.tripView({ minutes: 34, arriveAt: at("2026-11-24T18:20:00Z") }, t, hmT);
  assert.deepEqual([late.arrive, late.spare, late.late, late.lead], ["1:20 pm", -5, true, "5 min after Zouk Training starts"]);
  const none = K.tripView({ minutes: 27 }, K.arriveTarget(block, [block], TZ), hmT);
  assert.deepEqual([none.arrive, none.spare, none.nextTitle, none.lead], ["1:10 pm", null, "", "Arrives when the block ends"]);
  assert.equal(K.tripView({ tooFar: true }, t, hmT), null);
});
test("Be there early by: the arrive-by time is 5, 10, 15 or 20 minutes before the next plan (5 when unset), and the block's end with no next plan", () => {
  const nextAt = at("2026-11-24T18:15:00Z");
  assert.deepEqual(K.EARLY_CHOICES, [5, 10, 15, 20]);
  for (const n of [5, 10, 15, 20]) {
    const x = K.arriveTarget(block, [block, next], TZ, n);
    assert.equal(x.at, next.s - n * 60000, n + " min before the plan"); assert.equal(x.buffer, n); assert.equal(x.nextTitle, "Zouk Training");
    assert.equal(K.tripView({ minutes: 27 }, x, hmT).spare, n, "walk or drive arrive at the target: the spare time is the pick");
  }
  assert.equal(K.arriveTarget(block, [block, next], TZ).at, next.s - 5 * 60000, "left out: 5, as before");
  for (const bad of [undefined, null, "", "x", 0, 7, 25, NaN]) assert.equal(K.arriveTarget(block, [block, next], TZ, bad).buffer, 5, String(bad) + " is 5");
  assert.equal(K.earlyMin("15"), 15, "a stored string counts"); assert.equal(K.earlyMin(null), 5);
  const none = K.arriveTarget(block, [block], TZ, 20);
  assert.deepEqual([none.at, none.buffer, none.nextTitle], [block.e, 0, ""], "no next plan: arrive when the block ends, whatever the pick");
  assert.equal(K.leaveBy({ minutes: 27 }, K.arriveTarget(block, [block, next], TZ, 15).at), nextAt - 15 * 60000 - 27 * 60000, "walk or drive leave earlier by the pick");
});
test("best way: the quickest is marked, a walk that is too far never is, and nothing is marked without minutes", () => {
  assert.equal(K.bestWay({ walk: { minutes: 50 }, transit: { minutes: 34 }, drive: { minutes: 27 } }), "drive");
  assert.equal(K.bestWay({ walk: { tooFar: true, km: 9 }, transit: { minutes: 34 }, drive: { minutes: 40 } }), "transit");
  assert.equal(K.bestWay({ walk: { minutes: 20 }, transit: { minutes: 20 } }), "commute", "a tie goes to walking: the walk is the chip named Walk");
  assert.equal(K.bestWay({}), ""); assert.equal(K.bestWay(null), "");
});
test("a way he picked by hand still wins: the quicker row only offers a switch, and only for 3 minutes or more", () => {
  const ways = { walk: { tooFar: true }, transit: { minutes: 34 }, drive: { minutes: 27 } };
  assert.deepEqual(K.quickerThan(ways, "transit"), { chip: "drive", by: 7 });
  assert.equal(K.quickerThan(ways, "drive"), null, "already the quickest");
  assert.equal(K.quickerThan({ transit: { minutes: 34 }, drive: { minutes: 32 } }, "transit"), null, "2 minutes is not worth a row");
  assert.equal(K.quickerThan({ transit: { tooFar: true }, drive: { minutes: 5 } }, "transit"), null);
  const src = fs.readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function cmPaint()"), src.indexOf("const CMW ="));
  assert.match(fn, /const mode = C\.modeOf\(ev\)/, "the way drawn is the one saved on the block");
  assert.doesNotMatch(src.slice(src.indexOf("/* commute:start */"), src.indexOf("/* commute:end */")), /patchEvent\(ev, \{ mode: best/, "the page never changes the way by itself");
});
test("Heads up: TTC only on a transit trip, closures only on a drive, weather on every way", () => {
  const al = [{ id: "ttc:1", mode: "transit" }, { id: "road:1", mode: "drive" }, { id: "wx:snow", mode: "any" }];
  assert.deepEqual(K.alertsFor(al, "transit").map((a) => a.id), ["ttc:1", "wx:snow"]);
  assert.deepEqual(K.alertsFor(al, "drive").map((a) => a.id), ["road:1", "wx:snow"]);
  assert.deepEqual(K.alertsFor(al, "commute").map((a) => a.id), ["wx:snow"]);
});
test("Check now groups alerts into New, Still on and Cleared by their ids", () => {
  const A = (id) => ({ id }), g = K.groupAlerts([A("a"), A("b")], [A("b"), A("c")]);
  assert.deepEqual([g.added, g.still, g.cleared].map((x) => x.map((a) => a.id)), [["c"], ["b"], ["a"]]);
  assert.equal(g.compared, true);
  const first = K.groupAlerts(null, [A("a")]);
  assert.deepEqual([first.added.length, first.still.length, first.cleared.length, first.compared], [0, 1, 0, false], "no earlier check: nothing is called new");
});
test("the leave-by change reads 6 min earlier or later, and nothing when it did not move", () => {
  const t = at("2026-11-24T17:36:00Z");
  assert.equal(K.leaveShift(t, t - 6 * 60000), "6 min earlier");
  assert.equal(K.leaveShift(t, t + 4 * 60000), "4 min later");
  assert.equal(K.leaveShift(t, t + 20000), "");
  assert.equal(K.leaveShift(null, t), "");
});
test("the page checks by itself once, only inside the hour before leaving", () => {
  const leaveAt = at("2026-11-24T17:36:00Z"), m = (min) => leaveAt - min * 60000;
  assert.equal(K.autoCheckDue({ now: m(61), leaveAt, done: false }), false);
  assert.equal(K.autoCheckDue({ now: m(60), leaveAt, done: false }), true);
  assert.equal(K.autoCheckDue({ now: m(1), leaveAt, done: false }), true);
  assert.equal(K.autoCheckDue({ now: m(1), leaveAt, done: true }), false, "once");
  assert.equal(K.autoCheckDue({ now: leaveAt, leaveAt, done: false }), false, "not after leaving");
  assert.equal(K.autoCheckDue({ now: m(10), leaveAt: null, done: false }), false);
});
test("the route line decodes Google's encoded polyline", () => {
  assert.deepEqual(K.decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  assert.deepEqual(K.decodePolyline(""), []);
});
test("no tests in this file read the real clock", () => {
  const me = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
  assert.equal(/new Date\(\)|Date\.now\(\)/.test(me), false);
});

test("the page: the box sits in both panels, only for a Commute block, and draws no directions of its own", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  assert.equal((html.match(/\$\{commuteBox\(ev\)\}|cm = commuteBox\(ev\)/g) || []).length, 2, "computer panel and phone sheet");
  assert.match(html, /function commuteBox\(ev\) \{ return ev\.k === "commute" && !ev\.isNew && !ev\.ghost/);
  const src = html.slice(html.indexOf("/* commute:start */"), html.indexOf("/* commute:end */"));
  assert.ok(src.length > 3000);
  for (const w of [/leave by/i, /heads up/i, /check again/i, /the way there/i, /best way/i]) assert.match(src, w, String(w));
  assert.doesNotMatch(src, /routes\.googleapis|GOOGLE_ROUTES|api[_-]?key/i, "the key is never on the page");
  assert.doesNotMatch(src, /parking near/i, "no Parking near row: it has no source");
  assert.match(readFileSync(new URL("../calendar-commute.js", import.meta.url), "utf8"), /Directions need the Google key/, "the words for a missing key now live in the rule file (notOkText)");
  assert.match(src, /Where are you going\?/);
  assert.match(src, /Remember for every/);
  assert.match(src, /Open in Google Maps/);
  assert.match(src, /capture="environment"/);
  assert.match(src, /accept="image\/\*"/);
  assert.match(src, /From last time you went here/);
  assert.match(src, /The place too/);
  assert.doesNotMatch(src, /getCurrentPosition|watchPosition|geolocation/, "the page never asks for his location");
});
/* d21, d23 (Junyan, 2026-11-24: "21 remove it", "23 yes"): no full screen map, and the walking chip reads Walk */
test("d21: the Commute panel has no Open map button and nothing on the page can make a full screen map layer", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  const src = html.slice(html.indexOf("/* commute:start */"), html.indexOf("/* commute:end */"));
  assert.doesNotMatch(src, /Open map/);
  assert.doesNotMatch(src, /data-cm="(map|gps|fit|close)"/);
  assert.match(src, /Open in Google Maps/, "the Google Maps link stays");
  assert.doesNotMatch(src, /id="cmMap"/, "the small map is gone (d31 B: the weather box took its place)");
  for (const w of [/cmbig/i, /cmbar/i, /cmOpenBig/, /cmGps/, /cmBigMap/, /Show where I am/, /Whole trip/, /Open map/, /createElement\("div"\);\s*o\.className/]) assert.doesNotMatch(html, w, String(w));
  assert.doesNotMatch(html, /d\.cm === "(map|gps|fit|close)"/, "no action is left to open one");
  const core = readFileSync(new URL("../calendar-core.js", import.meta.url), "utf8");
  assert.doesNotMatch(core, /cmbig/i);
});
test("d23: the three Going by chips read Walk, Transit and Drive, and the block type is still Commute", async () => {
  const C = globalThis.CalCore;
  assert.deepEqual(C.MODES.map((m) => m[2]), ["Walk", "Transit", "Drive"]);
  assert.deepEqual(C.KINDS.find(([k]) => k === "commute"), ["commute", "Commute"]);
});
test("the card shows the mode's emoji, and Commute has no page of its own", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  assert.match(html, /const kicon = \(e\) => \(e\.k === "commute"/);
  assert.match(html, /<span class="ei" aria-hidden="true">\$\{kicon\(e\)\}<\/span>/);
  assert.match(html, /k !== "commute"\);/);
});

/* ---- d6 (Junyan, 2026-11-24, "6 yes"): a Commute block draws its Commute part first ---- */
test("d6: in the computer panel and the phone sheet the Commute box comes right after the title and time, before the usual fields", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  const fn = (name, next) => html.slice(html.indexOf("function " + name + "("), html.indexOf(next));
  const pEvent = fn("pEvent", "/* ---------- the phone's event sheet");
  const at = (src, needle) => { const i = src.indexOf(needle); assert.ok(i > 0, needle); return i; };
  assert.equal((pEvent.match(/\$\{commuteBox\(ev\)\}/g) || []).length, 1);
  const box = at(pEvent, "${commuteBox(ev)}");
  assert.ok(at(pEvent, 'id="pTitle"') < box, "after the title");
  for (const later of ['<p class="lbl" style="margin:0">Length</p>', '<p class="lbl" style="margin:0">Block type</p>', 'for="pCal"', 'id="pSave"'])
    assert.ok(box < at(pEvent, later), "before " + later);
  const pSheet = fn("pSheet", "/** The words in the sheet's rows");
  assert.equal((pSheet.match(/\$\{cm\}/g) || []).length, 1);
  assert.match(pSheet, /cm = commuteBox\(ev\)/);
  const sbox = at(pSheet, "${cm}");
  assert.ok(at(pSheet, 'id="pTitle"') < sbox, "after the title");
  assert.ok(sbox < at(pSheet, '<div class="rows">'), "before Day, Starts, Ends, Location, Notes, Type, Calendar");
  assert.doesNotMatch(pSheet, /cmWhen/, "no date and time line above the box (Junyan, 2026-11-24)");
  assert.ok(sbox < at(pSheet, 'id="pDel"'));
});
test("d6: inside the box the order is Going by, From, To or the ask, Open in Google Maps, the weather box (d31 B, where the small map was), then photos and notes; Home is asked last (d40: Leave by with the quiet checked line after Going by; then From and To, the weather, Heads up, The way there and the map buttons)", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  const src = html.slice(html.indexOf("function cmPaint()"), html.indexOf("const CMW ="));
  const order = ['Going by', 'dp.leave', 'cmRow("from"', 'cmRow("to"', 'cmWxBox(ev)', 'dp.heads + dp.quick + dp.way', 'id="cmLinks"', 'else if (!inPlace) h += cmEditBox', 'Photos and notes', 'Add your home address'];
  let last = -1;
  for (const w of order) { const i = src.indexOf(w); assert.ok(i > last, w + " out of order"); last = i; }
});

/* ---- d9 (Junyan, 2026-11-24, "9 yes"): the To and From are kept on the server, with this browser as the fallback ---- */
test("d9: the page saves, reads and clears a block's To and From on the server, and sends an old browser copy up once", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  const src = html.slice(html.indexOf("/* commute:start */"), html.indexOf("/* commute:end */"));
  assert.match(src, /send\("\/quest\/commute\/route", "POST", \{ block: key, \[side\]: o \? cmPlaceBody\(o\) : null \}\)/, "save and clear one side by the block's key");
  assert.match(src, /api\("\/quest\/commute\/route\?block=" \+ encodeURIComponent\(key\)\)/, "read it when the panel opens");
  assert.match(src, /onlyIfEmpty = true/, "an old browser copy only fills an empty end");
  assert.match(src, /CM\.up = true/, "and is sent once");
  assert.match(src, /pending: true/, "a change made while offline is kept here, marked pending");
  assert.match(src, /this device only/, "and says so");
  assert.match(src, /const cmTyped = \(ev\) => \(cmRoute\(ev\) && cmRoute\(ev\)\.to\) \|\| cmGet\(CMK\.to\)\[keyOf\(ev\)\]/, "the server's To first, the browser copy as fallback");
  assert.match(src, /const cmFromPicked = \(ev\) => \(cmRoute\(ev\) && cmRoute\(ev\)\.from\) \|\| cmGet\(CMK\.from\)/, "the same for From");
  assert.doesNotMatch(src, /cmSet\(CMK\.(to|from), key, await cmFound/, "no write goes to the browser alone any more");
  assert.equal(keyHint(html), true);
});
const keyHint = (html) => /const keyOf = \(e\) => \(e\.ghost \? "g\|" : "e\|"\) \+ e\.calId \+ "\|" \+ e\.id;/.test(html);   // the block's key is the same on every device: calendar id and event id

/* ---- Junyan, 2026-11-24 (feedback; d17 A, d18 yes, d19 yes): From is where the day left off, To falls back to Home,
   Length is one minus / plus line, Block type is one small line, no date line on a Commute block, tiles carry a Referer ---- */
const HOME = { name: "Home", address: "1 Made Up Rd, Toronto", lat: 43.7, lng: -79.4, id: "pl-home" };
const html2 = () => fs.readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
const day = (h, m = 0) => new Date(globalThis.CalCore.instant("2026-11-26", h * 60 + m, TZ)).toISOString();   // a Toronto wall time on a fixed day
const tgtOf = (events, over = {}) => (x) => K.target({ ev: x, events, tz: TZ, remembered: [], ...over });

test("From: the place of the block before it that day; a Commute block gives its To, any other block its location", () => {
  const yoga = ev("y", "Yoga", day(8), day(9), { location: "9 Yoga Ln" });
  const cm1 = ev("c1", "Commute", day(9), day(9, 30));
  const lunch = ev("l", "Lunch", day(12), day(13), { location: "7 Lunch St" });
  const cm2 = ev("c2", "Commute", day(14), day(14, 30));
  const events = [yoga, cm1, lunch, cm2];
  const p = K.previousPlace({ ev: cm2, events, tz: TZ, targetOf: tgtOf(events) });
  assert.deepEqual([p.address, p.title], ["7 Lunch St", "Lunch"], "the nearest earlier block that has a place");
  const events2 = [yoga, ev("l2", "Lunch", day(12), day(13)), cm2];
  assert.equal(K.previousPlace({ ev: cm2, events: events2, tz: TZ, targetOf: tgtOf(events2) }).address, "9 Yoga Ln", "walks back past a block with no place");
  const trip = { ...cm1, location: "5 Trip Ave" };
  const events3 = [trip, ev("l3", "Lunch", day(12), day(13)), cm2];
  assert.equal(K.previousPlace({ ev: cm2, events: events3, tz: TZ, targetOf: tgtOf(events3) }).address, "5 Trip Ave", "a Commute block before it gives its To");
  const events4 = [ev("c0", "Commute", day(8), day(8, 30)), cm2];
  assert.equal(K.previousPlace({ ev: cm2, events: events4, tz: TZ, targetOf: tgtOf(events4) }), null, "a Commute block with no To gives nothing");
});
test("From: all-day, suggested, later, other-day and the block itself never count", () => {
  const cm = ev("c", "Commute", day(14), day(14, 30));
  const events = [cm,
    { ...ev("ad", "Rent", day(0), day(23)), allDay: true, location: "1 AllDay St" },
    ev("g", "Idea", day(10), day(11), { location: "2 Ghost St", ghost: true }),
    ev("later", "Dinner", day(18), day(19), { location: "3 Later St" }),
    ev("yday", "Gym", "2026-11-25T15:00:00Z", "2026-11-25T16:00:00Z", { location: "4 Yesterday St" })];
  assert.equal(K.previousPlace({ ev: cm, events, tz: TZ, targetOf: tgtOf(events) }), null);
});
test("From order: the one he picked, then the block before, then Home, else nothing (Where you are)", () => {
  const cm = ev("c", "Commute", day(14), day(14, 30));
  const prev = ev("p", "Class", day(12), day(13), { location: "8 Class Rd" });
  const mk = (o) => K.fromFor({ ev: cm, events: [prev, cm], tz: TZ, targetOf: tgtOf([prev, cm]), ...o });
  const picked = { name: "", address: "6 Picked Pl" };
  assert.equal(mk({ picked, home: HOME }).address, "6 Picked Pl");
  assert.equal(mk({ home: HOME }).address, "8 Class Rd");
  const first = K.fromFor({ ev: cm, events: [cm], tz: TZ, targetOf: tgtOf([cm]), home: HOME });
  assert.deepEqual([first.name, first.address], ["Home", HOME.address], "the first trip of the day starts at Home");
  assert.equal(K.fromFor({ ev: cm, events: [cm], tz: TZ, targetOf: tgtOf([cm]), home: null }), null, "no Home saved: Where you are");
});
test("To: when nothing says where, it is Home, shown as Home; a trip from Home to Home keeps the ask", () => {
  const cm = ev("c", "Commute", day(14), day(14, 30));
  const elsewhere = { name: "", address: "8 Class Rd" };
  const t = K.target({ ev: cm, events: [cm], tz: TZ, remembered: [], home: HOME, from: elsewhere });
  assert.deepEqual([t.source, t.name, t.address, K.needsAsk(t)], ["home", "Home", HOME.address, false]);
  const same = K.target({ ev: cm, events: [cm], tz: TZ, remembered: [], home: HOME, from: { ...HOME } });
  assert.deepEqual([same.source, K.needsAsk(same)], ["none", true], "Home to Home is never offered");
  const typedHome = K.target({ ev: cm, events: [cm], tz: TZ, remembered: [], home: HOME, from: { name: "", address: " 1 made up rd, toronto " } });
  assert.equal(K.needsAsk(typedHome), true, "the same address typed another way is still Home");
  assert.equal(K.needsAsk(K.target({ ev: cm, events: [cm], tz: TZ, remembered: [], home: null, from: elsewhere })), true, "no Home saved: asks as before");
  assert.equal(K.target({ ev: { ...cm, location: "388 Carlaw Ave" }, events: [cm], tz: TZ, remembered: [], home: HOME, from: elsewhere }).source, "block", "an obvious end still wins over Home");
});
test("Length: minus and plus move the end by 15 minutes, never under 15", () => {
  assert.equal(K.stepDur(45, 1), 60); assert.equal(K.stepDur(45, -1), 30);
  assert.equal(K.stepDur(15, -1), 15); assert.equal(K.stepDur(20, -1), 15); assert.equal(K.stepDur(50, 1), 65);
});
test("the page: Length is one minus / plus line with the end time, disabled where the chips were", () => {
  const h = html2(), i = h.indexOf("function pEvent(ev)"), fn = h.slice(i, h.indexOf("function pSheet(ev)"));
  assert.doesNotMatch(fn, /durs\.map/, "no row of length chips");
  assert.match(fn, /aria-label="15 minutes shorter"/); assert.match(fn, /aria-label="15 minutes longer"/);
  assert.match(fn, /data-lenstep="-1"/); assert.match(fn, /data-lenstep="1"/);
  assert.match(fn, /ends \$\{esc\(C\.hm\(C\.toMin\(S\.form\.tf\.end\)\)\)\}/, "beside the length: ends 12:45 pm");
  assert.match(h, /\.lenrow button\{[^}]*min-height:44px/, "44px tall for touch");
  assert.match(h, /d\.lenstep/, "the buttons are wired");
  assert.match(h, /S\.form\.dur = CalCommute\.stepDur\(S\.form\.dur, \+d\.lenstep\)/, "it saves the way the chips did: S.form.dur");
  assert.match(h, /\$\("#pBody \.lenrow|\.lenrow \[data-lenval\]|data-lenval/, "the length and the end time repaint as he taps");
  const row = fn.slice(fn.indexOf("lenrow"), fn.indexOf("lenrow") + 700);
  assert.match(row, /\$\{dis\}/, "read-only: disabled");
});
test("the page: Block type is one small line on an existing block, the chips come with change; a new block keeps all chips", () => {
  const h = html2(), fn = h.slice(h.indexOf("function pEvent(ev)"), h.indexOf("function pSheet(ev)"));
  assert.match(fn, /isNew \?/, "the new block form branches");
  assert.match(fn, /data-typechange/); assert.match(fn, /change<\/button>/);
  assert.match(fn, /KNAME\[S\.form\.kind \|\| guess\]/, "the chosen kind, or the guess when none is chosen");
  assert.match(fn, / · /);
  assert.match(h, /"typechange" in d/, "change shows the chip row in place");
  assert.equal((fn.match(/Guess: /g) || []).length, 1, "one chip row, built once and shown by change or for a new block");
});
test("the page: a Commute block shows no date and time line, other blocks keep theirs", () => {
  const h = html2();
  assert.doesNotMatch(h, /id="cmWhen"/);
  const fn = h.slice(h.indexOf("function pEvent(ev)"), h.indexOf("function pSheet(ev)"));
  assert.match(fn, /ev\.k === "commute" \? "" : esc\(whenText\(ev\)\)/, "desktop panel drops only the date text for Commute");
  assert.match(fn, /starts in/); assert.match(fn, /Repeats/);
  assert.match(h.slice(h.indexOf("function pSheet(ev)")), /\$\{cm\}/, "the sheet still draws the Commute part");
});
test("the page: the Travel map's tile layer (the only one left, d31 B) asks for the site's origin as Referer", () => {
  const h = html2(), n = (h.match(/L\.tileLayer\(/g) || []).length;
  assert.equal(n, 1);
  assert.equal((h.match(/L\.tileLayer\("https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png", \{[^}]*referrerPolicy: "strict-origin-when-cross-origin"/g) || []).length, 1);
});

/* ---- d24 to d27 (Junyan, 2026-11-24, "Yes to all four"): tap the line, a places list, Open in Organic Maps ---- */
const OMGLAD = { name: "Gladstone Hotel", address: "1214 Queen St W, Toronto", lat: 43.6429, lng: -79.4259 };
const OMHOME = { name: "Home", address: "10 Bay St, Toronto", lat: 43.6407, lng: -79.3763 };
test("d26: Organic Maps link with both ends: the trip from From to To in the picked way (omaps.app/route, documented at omaps.app/api)", () => {
  assert.equal(K.organicMapsLink({ from: OMHOME, to: OMGLAD, mode: "commute" }),
    "https://omaps.app/route?sll=43.6407,-79.3763&saddr=Home&dll=43.6429,-79.4259&daddr=Gladstone%20Hotel&type=pedestrian");
  assert.match(K.organicMapsLink({ from: OMHOME, to: OMGLAD, mode: "transit" }), /&type=transit$/);
  assert.match(K.organicMapsLink({ from: OMHOME, to: OMGLAD, mode: "drive" }), /&type=vehicle$/);
  assert.match(K.organicMapsLink({ from: OMHOME, to: OMGLAD, mode: "nonsense" }), /&type=pedestrian$/, "an unknown way walks, as the Google link does");
});
test("d26: Organic Maps link names a place by its name, else its address, and escapes it", () => {
  const l = K.organicMapsLink({ from: { address: "1 A&B St #2", lat: 1, lng: 2 }, to: { name: "", address: "Café 5/6", lat: 3, lng: 4 }, mode: "drive" });
  assert.match(l, /saddr=1%20A%26B%20St%20%232&/); assert.match(l, /daddr=Caf%C3%A9%205%2F6&/);
});
test("d26: Organic Maps link with only the To spot: just that point on the map", () => {
  const noFrom = { name: "", address: "Somewhere", lat: null, lng: null };
  assert.equal(K.organicMapsLink({ from: noFrom, to: OMGLAD, mode: "commute" }), "https://omaps.app/map?v=1&ll=43.6429,-79.4259&n=Gladstone%20Hotel");
  assert.equal(K.organicMapsLink({ from: null, to: OMGLAD, mode: "transit" }), "https://omaps.app/map?v=1&ll=43.6429,-79.4259&n=Gladstone%20Hotel");
  assert.equal(K.organicMapsLink({ from: { ...OMHOME, lat: 43.6, lng: null }, to: OMGLAD, mode: "drive" }).startsWith("https://omaps.app/map?"), true, "half a coordinate counts as none");
});
test("d26: no Organic Maps link when the To has no coordinates", () => {
  assert.equal(K.organicMapsLink({ from: OMHOME, to: { name: "X", address: "X", lat: null, lng: null }, mode: "commute" }), "");
  assert.equal(K.organicMapsLink({ from: OMHOME, to: null, mode: "commute" }), "");
  assert.equal(K.organicMapsLink({ from: OMHOME, to: { address: "X", lat: "abc", lng: 1 }, mode: "commute" }), "");
});
test("d25: the places list asks only from 3 characters on", () => {
  assert.equal(K.placesAskable("ab"), false); assert.equal(K.placesAskable("  ab  "), false);
  assert.equal(K.placesAskable("abc"), true); assert.equal(K.placesAskable(" abc "), true); assert.equal(K.placesAskable(null), false);
});
test("d25: a places answer gives up to 5 rows, and only an ok answer gives any; stopped is flagged, the rest show nothing", () => {
  const s = (n) => Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "Place " + i, sub: "Toronto" }));
  assert.deepEqual(K.readSuggestions({ state: "ok", suggestions: s(7) }).items.map((x) => x.id), ["p0", "p1", "p2", "p3", "p4"]);
  assert.deepEqual(K.readSuggestions({ state: "ok", suggestions: [{ id: "a", name: "A" }, { id: "", name: "no id" }, { name: "none" }, { id: "b", name: "  " }] }).items, [{ id: "a", name: "A", sub: "" }]);
  for (const st of ["no-key", "error"]) assert.deepEqual(K.readSuggestions({ state: st, message: "m" }), { items: [], stopped: false });
  assert.deepEqual(K.readSuggestions({ state: "stopped", message: "m" }), { items: [], stopped: true });
  for (const bad of [null, undefined, {}, "x", { state: "ok" }]) assert.deepEqual(K.readSuggestions(bad), { items: [], stopped: false });
});
test("d25: a place answer gives name, address, lat and lng, or nothing", () => {
  assert.deepEqual(K.readPlace({ state: "ok", place: { id: "x", name: "St. Michael's Hospital", address: "30 Bond St, Toronto, ON", lat: 43.65, lng: -79.377 } }),
    { name: "St. Michael's Hospital", address: "30 Bond St, Toronto, ON", lat: 43.65, lng: -79.377 });
  assert.equal(K.readPlace({ state: "ok", place: { name: "No coords", address: "A" } }), null, "a place with no coordinates is not a pick");
  assert.equal(K.readPlace({ state: "stopped", message: "m" }), null);
  assert.equal(K.readPlace({ state: "ok", place: { id: "x", name: "", address: "", lat: 1, lng: 2 } }), null);
  assert.equal(K.readPlace(null), null);
});
test("d24: how a place reads on a row: the name over its address, Home alone, a typed place once", () => {
  assert.deepEqual(K.rowText({ name: "St. Michael's Hospital", address: "Bond Street, Toronto, ON" }), { main: "St. Michael's Hospital", sub: "Bond Street, Toronto, ON" });
  assert.deepEqual(K.rowText({ name: "Home", address: "10 Bay St" }), { main: "Home", sub: "" });
  assert.deepEqual(K.rowText({ name: "55 Offline Ave", address: "55 Offline Ave" }), { main: "55 Offline Ave", sub: "" });
  assert.deepEqual(K.rowText({ name: "", address: "1 Yonge St" }), { main: "1 Yonge St", sub: "" });
  assert.deepEqual(K.rowText(null), { main: "", sub: "" });
});

test("d24: no Change button on From or To; each line is one real button with its screen reader words; a read-only calendar gets no button", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  const src = html.slice(html.indexOf("/* commute:start */"), html.indexOf("/* commute:end */"));
  assert.doesNotMatch(src, /data-cm="editfrom"/); assert.doesNotMatch(src, /data-cm="edit"/); assert.doesNotMatch(src, />Change</);
  assert.doesNotMatch(src, /Use this/, "Go or Enter on the keyboard does what Use this did");
  assert.match(src, /Change where you start/); assert.match(src, /Change where you are going/);
  const row = src.slice(src.indexOf("function cmRow("), src.indexOf("function cmEditBox("));
  assert.match(row, /return can \? `<button type="button" class="cmr"/, "a real button when he can edit");
  assert.match(row, /: `<div class="cmr">/, "a plain line when the calendar is read-only");
  assert.match(html, /button\.cmr\{[^}]*padding/, "styled as a button");
  assert.match(html, /\.cmr\{[^}]*min-height:44px/, "44px or taller");
});
test("d24: the open box has the label, the typing box with enterkeyhint go, the list, Saved places and Cancel, in that order", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  const fn = html.slice(html.indexOf("function cmEditBox("), html.indexOf("function cmKeepTyped("));
  assert.match(fn, /enterkeyhint="go"/);
  let last = -1;
  for (const w of ['<label class="lbl"', '<input id=', 'id="cmSug"', 'id="cmKeep"', '>Saved places</p>', 'Remember for every', '>Cancel<']) { const i = fn.indexOf(w); assert.ok(i > last, w + " out of order"); last = i; }
  assert.match(fn, /CalCommute\.savedChips\(CM\.places, home\)/, "Home first when a home is saved (the rule is tested above)");
});
test("d25: the page asks places after 300 ms and 3 characters, shows no error for 404, and says one soft line for stopped", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  const src = html.slice(html.indexOf("/* commute:start */"), html.indexOf("/* commute:end */"));
  assert.match(src, /setTimeout\(\(\) => L\.ask\(side, q\), 300\)/);
  assert.match(src, /\/quest\/commute\/places/); assert.match(src, /\/quest\/commute\/place"/);
  assert.match(src, /Place suggestions are off for the rest of the month\. Type the full address\./);
  const ask = src.slice(src.indexOf("L.ask = async ("), src.indexOf("return L;"));
  assert.match(ask, /catch \(e\) \{[^}]*\}/, "a failed request is swallowed");
  assert.doesNotMatch(ask, /toast\(/, "and never shown");
  assert.match(ask, /L\.q !== q/, "a slow answer for changed text is dropped");
});
test("d28: one shared list piece serves the Commute box and the Location row, each with its own element, state and session", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  assert.equal((html.match(/function makePlaceList\(/g) || []).length, 1, "one list piece");
  assert.match(html, /const CMS = makePlaceList\(\{ id: "cmSug"/); assert.match(html, /const LOC = makePlaceList\(\{ id: "locSug"/);
  assert.equal((html.match(/\/quest\/commute\/places"/g) || []).length, 1, "the ask is written once");
  assert.match(html, /<div class="cmsug locsug" id="locSug" aria-live="polite"><\/div>/, "announced like the Commute list");
  assert.match(html, /data-f="location"[^>]*aria-controls="locSug"/);
  assert.match(html, /\.cmsug button\{[^}]*min-height:44px/, "rows are 44px or taller");
  const loc = html.slice(html.indexOf("const LOC = makePlaceList("), html.indexOf("const CM = {"));
  assert.doesNotMatch(loc, /geocode\(|cmPin\(|cmFound\(/, "never geocode just for the bias");
  const pick = html.slice(html.indexOf("async function locPick("), html.indexOf("async function cmAct("));
  assert.match(pick, /CalCommute\.locationText\(o \|\| \{ name: x\.name, address: x\.sub \}\)/, "a failed lookup falls back to name and sub");
  assert.match(pick, /sheetInput\(i\)/, "saved the way a typed Location is: through the sheet form and the Save button");
  assert.doesNotMatch(pick, /patchEvent\(|createEvent\(/, "no new save path");
});
test("d29: the switch sits under the places list and above Saved places; a pick or Go with it on saves the place once", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  const fn = html.slice(html.indexOf("function cmEditBox("), html.indexOf("function cmKeepTyped("));
  assert.ok(fn.indexOf('id="cmSug"') < fn.indexOf('id="cmKeep"') && fn.indexOf('id="cmKeep"') < fn.indexOf("Saved places"));
  assert.match(fn, /role="switch" id="cmKeep"[^>]*> <span>Keep in Saved places<\/span>/);
  assert.doesNotMatch(fn, /id="cmKeep"[^>]*checked/, "off every time a box opens");
  const keep = html.slice(html.indexOf("async function cmKeepPlace("), html.indexOf("/** A row of the places list was tapped"));
  assert.match(keep, /CalCommute\.keepPlace\(o\)/); assert.match(keep, /CalCommute\.alreadyKept\(CM\.places, place\)/);
  assert.match(keep, /\/quest\/places", "POST", \{ op: "put", place \}/); assert.match(keep, /Saved to your places/);
});
test("d26: the page links Open in Organic Maps next to Open in Google Maps from the pure function", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  assert.match(html, /Open in Organic Maps/); assert.match(html, /CalCommute\.organicMapsLink\(/);
});

/* ---- the Location row's places list and "Keep in Saved places" (Junyan, 2026-11-24, d28 to d30: "yes to all thre") ---- */
test("d28: a picked place reads 'Name, full address' in Location; just the address when it already starts with the name", () => {
  assert.equal(K.locationText({ name: "St. Michael's Hospital", address: "30 Bond St, Toronto, ON M5B 1W8" }), "St. Michael's Hospital, 30 Bond St, Toronto, ON M5B 1W8");
  assert.equal(K.locationText({ name: "30 Bond St", address: "30 Bond St, Toronto, ON" }), "30 Bond St, Toronto, ON");
  assert.equal(K.locationText({ name: "  30 BOND st ", address: "30 Bond St, Toronto" }), "30 Bond St, Toronto", "case and spaces ignored");
  assert.equal(K.locationText({ name: "Saigon Lotus", address: "" }), "Saigon Lotus", "no address: the name alone");
  assert.equal(K.locationText({ name: "Saigon Lotus", address: "Saigon Lotus" }), "Saigon Lotus");
  // the call failed: the row's own words, name and sub
  assert.equal(K.locationText({ name: "Saigon Lotus", address: "Queen St W, Toronto" }), "Saigon Lotus, Queen St W, Toronto");
  assert.equal(K.locationText(null), "");
});
test("d29: a place is kept only with coordinates and something to call it, in the shape the server wants", () => {
  const p = K.keepPlace({ name: "  Saigon Lotus ", address: "1 Queen St W, Toronto", lat: 43.65, lng: -79.38 });
  assert.deepEqual(p, { name: "Saigon Lotus", address: "1 Queen St W, Toronto", lat: 43.65, lng: -79.38, category: "saved", savedBy: "Calendar", list: "", notes: "Kept from the Commute box" });
  assert.equal(K.keepPlace({ name: "Nowhere", address: "Nowhere", lat: null, lng: null }), null, "no coordinates: not kept");
  assert.equal(K.keepPlace({ name: "", address: "", lat: 1, lng: 2 }), null, "nothing to call it: not kept");
  assert.equal(K.keepPlace(null), null);
  assert.equal(K.keepPlace({ name: "Typed text", address: "Typed text", lat: 0, lng: 0 }).lat, 0, "0,0 is a spot, not missing");
});
test("d29: no second copy of a place already in the chips (same name and address, case and spaces ignored)", () => {
  const places = [{ id: "a", name: "Saigon Lotus", address: "1 Queen St W, Toronto", lat: 1, lng: 2, category: "saved" }, { id: "b", name: "Cafe", address: "", category: "place" }];
  assert.equal(K.alreadyKept(places, { name: "saigon  lotus", address: "1 queen st w,Toronto" }), true);
  assert.equal(K.alreadyKept(places, { name: "Saigon Lotus", address: "2 Queen St W" }), false, "another address is another place");
  assert.equal(K.alreadyKept(places, { name: "CAFE", address: "" }), true);
  assert.equal(K.alreadyKept([], { name: "x", address: "y" }), false);
  assert.equal(K.alreadyKept(null, { name: "x", address: "y" }), false);
});
test("d29: the Saved places chips show Home first, then kept places, then the Trips places as before (12 at most)", () => {
  const home = { id: "h", name: "Home", category: "home", address: "1 Home St" };
  const trips = Array.from({ length: 14 }, (_, i) => ({ id: "t" + i, name: "Trip " + i, category: "place", address: "x", lat: 1, lng: 1 }));
  const kept = { id: "k1", name: "Saigon Lotus", category: "saved", address: "1 Queen St W", lat: 1, lng: 2 };
  const remembered = { id: "r1", name: "DM", category: "commute-for", address: "a" };
  const noPin = { id: "n1", name: "Nothing", category: "place", address: "", lat: null };
  const chips = K.savedChips([home, remembered, ...trips, noPin, kept], home);
  assert.deepEqual(chips.map((p) => p.id), ["h", "k1", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10", "t11"], "Home, then the kept one, then the 12 Trips places");
  assert.equal(chips[0].name, "Home");
  assert.equal(chips.filter((p) => p.id !== "h").length, 13, "the kept place never pushes a Trips place out of its 12");
  assert.equal(chips.some((p) => p.id === "r1" || p.id === "n1"), false, "remembered-for and pin-less places stay out");
  assert.deepEqual(K.savedChips([], null), []); assert.deepEqual(K.savedChips(null, null), []);
  assert.deepEqual(K.savedChips(trips.slice(0, 2), null).map((p) => p.id), ["t0", "t1"], "no Home saved: no Home chip");
});
test("the page: the computer panel has Starts and Ends time boxes above Length, saved through the sheet's rule", () => {
  const h = html2(), fn = h.slice(h.indexOf("function pEvent(ev)"), h.indexOf("function pSheet(ev)"));
  assert.match(fn, /for="pStart"[^>]*>Starts</); assert.match(fn, /for="pEnd"[^>]*>Ends</);
  assert.match(fn, /id="pStart" type="time"/); assert.match(fn, /id="pEnd" type="time"/);
  assert.ok(fn.indexOf('id="pStart"') < fn.indexOf("lenrow") && fn.indexOf('id="pEnd"') < fn.indexOf("lenrow"), "above the Length row");
  assert.match(h, /C\.sheetStart\(S\.form\.tf/); assert.match(h, /C\.sheetEnd\(S\.form\.tf/); assert.match(h, /C\.sheetLen\(S\.form\.tf/);
  const save = h.slice(h.indexOf("async function saveEvent()"), h.indexOf("/** A plain list in the panel"));
  assert.match(save, /C\.sheetWhen\(S\.form\.tf/, "Save writes the times from the same form");
});
