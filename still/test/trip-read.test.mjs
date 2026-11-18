// node --test still/test/trip-read.test.mjs
// Slice 05, read a trip (Junyan, 2026-11-18: "70 yes, 71 yes, 72 yes, 73 yes it's probably not needed at all", then
// "74 yes": build mock https://claude.ai/artifact/DoUcZHR3SbkquBrUoyKnCA as drawn). Computer only (d14), read only.
// The rules live in CalCore.tripRead (calendar-core.js) on top of Day Quest's own helpers (quest-trips.js), passed in
// as T. Expected words come from the mock and Day Quest's trip page. Browser check: test/e2e/calendar-trip-read.e2e.mjs.
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
const MTL = "2026 🇨🇦 Montreal Birthday";
const plain = (x) => JSON.parse(JSON.stringify(x));
/* Day Quest's helpers run in their own vm realm, so arrays built from theirs are compared by value */
const same = (a, b, msg) => assert.deepEqual(plain(a), plain(b), msg);

const PLACES = [
  { id: "mtl-alliance", name: "Alliance Dance Company", address: "2529 Rue Ontario E, Montréal", lat: 45.5341, lng: -73.5523, category: "dance", trip: MTL },
  { id: "mtl-piernas", name: "Las Piernas", address: "2019 Rue Moreau, Montréal", lat: 45.5418, lng: -73.5437, category: "dance", trip: MTL },
  { id: "mtl-studio", name: "Studio 2790", address: "2790 Rue Hochelaga, Montréal", lat: 45.5446, lng: -73.5437, category: "dance", trip: MTL },
  { id: "mtl-royal", name: "Mount Royal lookout", address: "Kondiaronk Belvedere, Montréal", lat: 45.5039, lng: -73.5874, category: "hike", trip: MTL },
];
const TRIP = { name: MTL, start: "2026-11-12", end: "2026-11-17" };
const seed = () => T.SEED.items.map((i) => ({ ...i }));
const read = (x = {}) => C.tripRead({ trip: TRIP, items: seed(), extras: {}, places: PLACES, spots: {}, today: "2026-11-18", T, ...x });
const rowsOf = (d) => d.rows.map((r) => [r.time, r.end, r.name, r.tag && r.tag.text, r.sub, r.miss]);

/* ---- d70: the itinerary, each plan once on its own local day, as the mock draws it */
test("the days: All, then one button per trip day, each heading in full", () => {
  const m = read();
  same(m.days.map((d) => d.chip), ["Thu 12", "Fri 13", "Sat 14", "Sun 15", "Mon 16", "Tue 17"]);
  same(m.days.map((d) => d.label), ["Thu Nov 12", "Fri Nov 13", "Sat Nov 14", "Sun Nov 15", "Mon Nov 16", "Tue Nov 17"]);
});
test("each plan: start time, 'to' its end, icon and name, a status tag only for Need to book, Maybe and Idea, and its place", () => {
  const d = read().days;
  same(rowsOf(d[0]), [["8:30 pm", "to 11:00 pm", "💃 Pre-Party?", "Maybe", "📍 Studio 2790", ""]]);
  same(rowsOf(d[1]), [
    ["5:00 pm", "", "🏨 Montreal stay", "Need to book", "Check-in 5:00 pm (Fri), check-out 10:30 am (Tue)", "Missing: address"],
    ["9:00 pm", "", "💃 Lambada workshop", null, "📍 Alliance Dance Company", ""],
    ["10:00 pm", "to 2:00 am", "🎶 Social", null, "📍 Alliance Dance Company", ""],
  ]);
  same(rowsOf(d[3]).map((r) => [r[2], r[3], r[4], r[5]]), [
    ["💃 Lambada, Zouk workshops + Practica", null, "📍 Alliance Dance Company", ""],
    ["🍽 Dinner with everyone?", "Maybe", "No place yet", "Missing: address"],
  ]);
  same(rowsOf(d[4]).map((r) => [r[2], r[3], r[5]]), [
    ["🥾 Mount Royal walk", "Idea", ""],
    ["♨ Spa & Recovery Day", "Need to book", "Missing: address"],
    ["🎂 Dinner with Montreal friends?", "Maybe", "Missing: address"],
  ]);
  assert.equal(d[4].rows[0].tag.cls, "maybe");
  assert.equal(d[4].rows[1].tag.cls, "need");
});
test("a plan with a time in another zone sits on its own local day (Day Quest's localDay)", () => {
  const items = [{ id: "f1", name: "Flight home", start: "2026-11-17T03:30:00Z", tz: "America/Toronto", status: "Prepaid", fields: {} }];
  const m = read({ items });
  same(m.days[4].rows.map((r) => r.name), ["Flight home"], "03:30Z on the 17th is 10:30 pm on the 16th in Toronto");
  assert.equal(m.days[4].rows[0].time, "10:30 pm", "and its time is the Toronto wall clock");
  assert.equal(m.detail("f1").rows.find((r) => r.k === "When").v, "Mon Nov 16, 10:30 pm");
});
test("Staying on the days between, Check-out on the last day, Still on for other plans that run several days", () => {
  const items = [...seed(), { id: "pass", name: "Festival pass", start: "2026-11-13", end: "2026-11-16", status: "Prepaid", fields: {} }];
  const d = read({ items }).days;
  same(plain(d[1].lines), []);
  same(plain(d[2].lines), [["Staying", "Montreal stay"], ["Still on", "Festival pass"]]);
  same(plain(d[4].lines), [["Staying", "Montreal stay"]]);
  same(plain(d[5].lines), [["Check-out", "Montreal stay", "by 10:30 am"]]);
});
test("plans with no date are left out (Junyan 2026-11-18: drop Maybe); plans outside the trip dates at the bottom, only when there are any", () => {
  const items = [...seed(), { id: "u1", name: "Poutine crawl", start: "", status: "Idea", fields: {} },
    { id: "o1", name: "Brunch", start: "2026-11-18T11:00:00-05:00", status: "Maybe", fields: {} }];
  const m = read({ items });
  assert.equal("maybe" in m, false);
  assert.equal(JSON.stringify(m.shown(-1)).includes("Poutine crawl"), false);
  same(m.outside.map((r) => [r.time, r.name]), [["11:00 am", "Brunch"]]);
  same(plain(read().outside), []);
});
test("a day button shows that day only; the outside group goes", () => {
  const items = [...seed(), { id: "u1", name: "Poutine crawl", start: "", status: "Idea", fields: {} },
    { id: "o1", name: "Brunch", start: "2026-11-18T11:00:00-05:00", status: "Maybe", fields: {} }];
  const m = read({ items });
  const one = m.shown(2), all = m.shown(-1);
  same(one.days.map((d) => d.label), ["Sat Nov 14"]);
  assert.equal(one.outside.length, 0);
  assert.equal(all.days.length, 6);
  assert.equal(all.outside.length, 1);
});
test("a plan on a saved place carries that place, so its pin can grow", () => {
  const r = read().days[1].rows[1];
  assert.equal(r.at, "mtl-alliance");
  assert.equal(read().days[3].rows[1].at, "", "no address: no place");
});

/* ---- the head */
test("the head: icon, full name, the dates with weekdays and who, and an amber chip per Need to book plan", () => {
  const h = plain(read().head);
  same([h.icon, h.title, h.meta], ["🇨🇦", MTL, "Thu Nov 12 to Tue Nov 17 · You + Caney"]);
  same(h.chips, [{ text: "Hotel not booked", cls: "need" }, { text: "Spa & Recovery not booked", cls: "need" }]);
});
test("a trip that has not started also says how many days away", () => {
  same(plain(read({ today: "2026-11-02" }).head.chips[0]), { text: "10 days away", cls: "" });
  same(plain(read({ today: "2026-11-11" }).head.chips[0]), { text: "1 day away", cls: "" });
  assert.equal(read({ today: "2026-11-12" }).head.chips.length, 2, "started today: no days away");
});
test("a booked plan, or a status saved in Day Quest's extras on a calendar copy, drops its chip and tag", () => {
  const items = seed().map((i) => (i.name === "Montreal stay" ? { ...i, status: "Prepaid" } : i));
  same(read({ items }).head.chips.map((c) => c.text), ["Spa & Recovery not booked"]);
  assert.equal(read({ items }).days[1].rows[0].tag, null);
  const m = read({ extras: { "seed-spa": { status: "Prepaid" } } });
  same(m.head.chips.map((c) => c.text), ["Hotel not booked"]);
});

/* ---- d71: the details panel, read only */
const kv = (d) => d.rows.map((r) => [r.k, r.v, !!r.need, (r.links || []).map((l) => l.text)]);
test("a stay: Check-in and Check-out with their days, Status, Address missing in amber, the six-line checklist; a calendar copy takes no file", () => {
  const d = plain(read().detail("seed-stay"));
  same([d.icon, d.name, d.tag && d.tag.text], ["🏨", "Montreal stay", "Need to book"]);
  same(kv(d), [
    ["Check-in", "5:00 pm (Fri)", false, []],
    ["Check-out", "10:30 am (Tue)", false, []],
    ["Status", "Need to Book", false, []],
    ["Address", "Missing", true, []],
  ]);
  same(d.check.map((c) => [c.text, c.done]), [
    ["Research and pick the place", false], ["Upload confirmation #", false], ["Cancellation policy", false],
    ["Address (opens in Google Maps)", false], ["Pay outstanding balance", false], ["Pictures of the room & amenities", false],
  ]);
  same([d.drop, "book" in d, "notion" in d], [false, false, false]);
});
test("an activity: When, Status, Address with Google Maps and Directions; no checklist", () => {
  const d = plain(read().detail("seed-fri-social"));
  same(kv(d), [
    ["When", "Fri Nov 13, 10:00 pm to 2:00 am", false, []],
    ["Status", "Planned", false, []],
    ["Address", "Alliance Dance Company, 2529 Rue Ontario E, Montréal", false, ["Google Maps ↗", "Directions ↗"]],
  ]);
  const links = d.rows[2].links.map((l) => l.href);
  same(links, [
    "https://www.google.com/maps/search/?api=1&query=Alliance%20Dance%20Company%2C%202529%20Rue%20Ontario%20E%2C%20Montr%C3%A9al",
    "https://www.google.com/maps/dir/?api=1&destination=Alliance%20Dance%20Company%2C%202529%20Rue%20Ontario%20E%2C%20Montr%C3%A9al",
  ]);
  assert.equal(d.check, null);
  assert.equal(d.at, "mtl-alliance");
});
test("only the fields with a value show; a missing one shows in amber as Missing; Notes and Files when there; a Notion card takes a dropped file", () => {
  const stay = { id: "n1", db: "planner", icon: "🏨", name: "Montreal stay", start: "2026-11-13T17:00:00-05:00", end: "2026-11-17T10:30:00-05:00",
    status: "Prepaid", tags: "Hotel", url: "https://www.notion.so/n1",
    files: [{ name: "booking.pdf", url: "https://files.example/booking.pdf" }],
    fields: { Address: { type: "rich_text", value: "1255 Rue Jeanne-Mance, Montréal" }, "Booked Through": { type: "select", value: "Expedia" },
      "Points / Cash": { type: "rich_text", value: "$612 cash" }, "Credit Card": { type: "select", value: "Amex Cobalt" } } };
  const extras = { n1: { notes: "Ask for a quiet room", check: { 0: true, 3: true }, files: ["https://drive.example/x"] } };
  const d = plain(read({ items: [stay], extras }).detail("n1"));
  same(kv(d), [
    ["Check-in", "5:00 pm (Fri)", false, []],
    ["Check-out", "10:30 am (Tue)", false, []],
    ["Status", "Prepaid", false, []],
    ["Address", "1255 Rue Jeanne-Mance, Montréal", false, ["Google Maps ↗", "Directions ↗"]],
    ["Booked through", "Expedia", false, []],
    ["Points / Cash", "$612 cash", false, []],
    ["Card", "Amex Cobalt", false, []],
    ["Cancel by", "Missing", true, []],
    ["Confirmation #", "Missing", true, []],
    ["Files", "", false, ["booking.pdf ↗", "drive.example/x ↗"]],
    ["Notes", "Ask for a quiet room", false, []],
  ]);
  same(d.check.map((c) => c.done), [true, false, false, true, false, false], "ticks as saved");
  assert.equal(d.tag, null);
  same([d.drop, "book" in d, "notion" in d], [true, false, false]);
});
test("a booked plan with no file in Notion: Files shows Missing", () => {
  const it = { id: "n2", name: "Lambada workshop", start: "2026-11-13T21:00:00-05:00", status: "Prepaid", files: [], address: "Alliance Dance Company", fields: {} };
  same(kv(plain(read({ items: [it] }).detail("n2"))).find((r) => r[0] === "Files"), ["Files", "Missing", true, []]);
});
test("transport: Departs and Arrives", () => {
  const it = { id: "t1", name: "Train to Montreal", start: "2026-11-12T08:00:00-05:00", end: "2026-11-12T13:05:00-05:00", status: "Prepaid", fields: {} };
  const rows = kv(plain(read({ items: [it] }).detail("t1")));
  same(rows.slice(0, 3), [["When", "Thu Nov 12, 8:00 am to 1:05 pm", false, []], ["Departs", "Thu Nov 12, 8:00 am", false, []], ["Arrives", "Thu Nov 12, 1:05 pm", false, []]]);
  same(rows.find((r) => r[0] === "Confirmation #"), ["Confirmation #", "Missing", true, []]);
});
test("a card with no files column takes no file; an unknown plan has no details", () => {
  const it = { id: "s1", name: "Spa", start: "2026-11-16T11:00:00-05:00", status: "Need to Book", fields: {} };
  assert.equal(read({ items: [it] }).detail("s1").drop, false);
  assert.equal(read().detail("nope"), null);
});
