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
test("the Arrive line: the real spare minutes before the next event, or when the block ends", () => {
  const t = tgt();
  assert.equal(K.arriveLine({ minutes: 27 }, t, hmT), "Arrive 1:10 pm, 5 min before Zouk Training");
  assert.equal(K.arriveLine({ minutes: 34, arriveAt: at("2026-11-24T18:09:00Z") }, t, hmT), "Arrive 1:09 pm, 6 min before Zouk Training", "transit arrives when Google says");
  assert.equal(K.arriveLine({ minutes: 34, arriveAt: at("2026-11-24T18:20:00Z") }, t, hmT), "Arrive 1:20 pm, 5 min after Zouk Training starts");
  assert.equal(K.arriveLine({ minutes: 27 }, K.arriveTarget(block, [block], TZ), hmT), "Arrive 1:10 pm, when the block ends");
  assert.equal(K.arriveLine({ tooFar: true }, t, hmT), "");
});
test("best way: the quickest is marked, a walk that is too far never is, and nothing is marked without minutes", () => {
  assert.equal(K.bestWay({ walk: { minutes: 50 }, transit: { minutes: 34 }, drive: { minutes: 27 } }), "drive");
  assert.equal(K.bestWay({ walk: { tooFar: true, km: 9 }, transit: { minutes: 34 }, drive: { minutes: 40 } }), "transit");
  assert.equal(K.bestWay({ walk: { minutes: 20 }, transit: { minutes: 20 } }), "commute", "a tie goes to walking: the walk is the chip named Commute");
  assert.equal(K.bestWay({}), ""); assert.equal(K.bestWay(null), "");
});
test("a way he picked by hand still wins: the quicker row only offers a switch, and only for 3 minutes or more", () => {
  const ways = { walk: { tooFar: true }, transit: { minutes: 34 }, drive: { minutes: 27 } };
  assert.deepEqual(K.quickerThan(ways, "transit"), { chip: "drive", by: 7 });
  assert.equal(K.quickerThan(ways, "drive"), null, "already the quickest");
  assert.equal(K.quickerThan({ transit: { minutes: 34 }, drive: { minutes: 32 } }, "transit"), null, "2 minutes is not worth a row");
  assert.equal(K.quickerThan({ transit: { tooFar: true }, drive: { minutes: 5 } }, "transit"), null);
  const src = fs.readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function cmPaint()"), src.indexOf("function cmDrop("));
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
  for (const w of [/leave by/i, /heads up/i, /check now/i, /the way there/i, /best way/i]) assert.match(src, w, String(w));
  assert.doesNotMatch(src, /routes\.googleapis|GOOGLE_ROUTES|api[_-]?key/i, "the key is never on the page");
  assert.doesNotMatch(src, /parking near/i, "no Parking near row: it has no source");
  assert.match(src, /Directions need the Google key/);
  assert.match(src, /Where are you going\?/);
  assert.match(src, /Remember for every/);
  assert.match(src, /Open in Google Maps/);
  assert.match(src, /capture="environment"/);
  assert.match(src, /accept="image\/\*"/);
  assert.match(src, /From last time you went here/);
  assert.match(src, /The place too/);
  assert.match(src, /Show where I am/);
  assert.match(src, /Whole trip/);
  assert.match(src, /Open map/);
  assert.doesNotMatch(src.replace(/navigator\.geolocation\.getCurrentPosition/, ""), /getCurrentPosition|watchPosition/, "location is asked only from the Show where I am press");
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
  assert.ok(at(pSheet, 'id="cmWhen"') < sbox && at(pSheet, 'id="cmWhen"') > at(pSheet, 'id="pTitle"'), "the time line sits between the title and the box");
  assert.ok(sbox < at(pSheet, 'id="pDel"'));
});
test("d6: inside the box the order is Going by, From, To or the ask, Open in Google Maps, the small map, then photos and notes; Home is asked last (slice 2 puts Leave by after Going by, and The way there, Heads up and Check now after To)", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  const src = html.slice(html.indexOf("function cmPaint()"), html.indexOf("function cmDrop("));
  const order = ['Going by', 'dp.leave', '<span class="lbl">From</span>', '<span class="lbl">To</span>', 'dp.way + dp.heads + dp.check', 'Where are you going?', 'Open in Google Maps', 'id="cmMap"', 'Photos and notes', 'Add your home address'];
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
