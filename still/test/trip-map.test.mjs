// node --test still/test/trip-map.test.mjs
// Slice 04, the trip map and saved places (Junyan, 2026-11-17: "31 yes, 32 yes, 33 no, 34 later", then "35 yes, 36 yes":
// build mock https://claude.ai/artifact/BQLvpC1YQjAUDhuBJefsRi as drawn; Montreal Birthday starts with the four
// Montreal places). The rules live in CalCore (calendar-core.js); calendar.html draws them with Leaflet. Day Quest's own
// helpers (quest-trips.js) are passed in, as the Packing page does. The browser check is test/e2e/calendar-trip-map.e2e.mjs.
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

const ALLIANCE = { id: "mtl-alliance", name: "Alliance Dance Company", address: "2529 Rue Ontario E, Montréal", lat: 45.5341, lng: -73.5523, category: "dance", trip: MTL };
const PIERNAS = { id: "mtl-piernas", name: "Las Piernas", address: "2019 Rue Moreau, Montréal", lat: 45.5418, lng: -73.5437, category: "dance", trip: MTL };

/* ---- the pin match rule (Day Quest's drawMap): a plan sits on a saved place when its address names the place or its street */
test("a plan sits on a saved place when its address names that place", () => {
  assert.equal(C.pinMatch("Alliance Dance Company, 2529 Rue Ontario E, Montréal", ALLIANCE), true);
  assert.equal(C.pinMatch("alliance dance company", ALLIANCE), true, "case does not matter");
});
test("a plan sits on a saved place when its address names the place's street", () => {
  assert.equal(C.pinMatch("2529 Rue Ontario E, Montreal QC", ALLIANCE), true);
});
test("a plan elsewhere, or with no address, sits on no saved place", () => {
  assert.equal(C.pinMatch("1255 Rue Jeanne-Mance, Montréal", ALLIANCE), false);
  assert.equal(C.pinMatch("", ALLIANCE), false);
  assert.equal(C.pinMatch("Somewhere", { name: "", address: "" }), false, "an empty place never matches everything");
});

/* ---- how the map starts (Day Quest's mapStart) */
test("the map starts fitted to the pins", () => {
  assert.deepEqual(plain(C.mapStart([ALLIANCE, { name: "No pin", lat: null, lng: null }], "Montreal", null)), { pins: [[45.5341, -73.5523]] });
});
test("with no pins, the map starts on the trip's destination; else on the world", () => {
  assert.deepEqual(plain(C.mapStart([], "Brazil Carnaval", { lat: -22.9, lng: -43.2 })), { center: [-22.9, -43.2], zoom: 5 });
  assert.deepEqual(plain(C.mapStart([], "Brazil Carnaval", null)), { world: true });
  assert.deepEqual(plain(C.mapStart([], "", { lat: 1, lng: 2 })), { world: true });
});

/* ---- the Directions link (Day Quest's gdir): Google Maps directions to the pin, else to the address */
test("Directions goes to Google Maps directions: the pin when there is one, else the address, else the name", () => {
  assert.equal(C.gdir(ALLIANCE), "https://www.google.com/maps/dir/?api=1&destination=45.5341%2C-73.5523");
  assert.equal(C.gdir({ name: "Café X", address: "12 Rue St-Denis, Montréal", lat: null }), "https://www.google.com/maps/dir/?api=1&destination=12%20Rue%20St-Denis%2C%20Montr%C3%A9al");
  assert.equal(C.gdir({ name: "Café X", address: "" }), "https://www.google.com/maps/dir/?api=1&destination=Caf%C3%A9%20X");
});

/* ---- the map of one trip: pins, count badges, the itinerary, the saved places list, the card */
const plan = (id, name, start, address, x = {}) => ({ id, name, start, end: "", status: "Planned", tags: "", address, fields: {}, ...x });
const ITEMS = [
  plan("p1", "Pre-Party?", "2026-11-12T20:30:00-05:00", "Studio 2790, 2790 Rue Hochelaga, Montréal"),
  plan("p2", "Montreal stay", "2026-11-13T17:00:00-05:00", "", { tags: "Hotel", kind: "stay", fields: { Address: { type: "rich_text", value: "1255 Rue Jeanne-Mance, Montréal" } } }),
  plan("p3", "Lambada workshop", "2026-11-13T21:00:00-05:00", "Alliance Dance Company, 2529 Rue Ontario E, Montréal"),
  plan("p4", "Social", "2026-11-13T22:00:00-05:00", "Alliance Dance Company, 2529 Rue Ontario E, Montréal"),
  plan("p5", "Zouk workshop + Social", "2026-11-14T21:00:00-05:00", "Las Piernas, 2019 Rue Moreau, Montréal"),
  plan("p6", "Lambada, Zouk workshops + Practica", "2026-11-15T13:00:00-05:00", "Alliance Dance Company, 2529 Rue Ontario E, Montréal"),
  plan("p7", "Dinner with everyone?", "2026-11-15T17:30:00-05:00", ""),
];
const STUDIO = { id: "mtl-studio", name: "Studio 2790", address: "2790 Rue Hochelaga, Montréal", lat: 45.5446, lng: -73.5437, category: "dance", trip: MTL };
const LOST = { id: "x1", name: "Le Mystère", address: "Le Mystère, Montreal", lat: null, lng: null, category: "place", trip: MTL };
const SPOTS = { "1255 rue jeanne-mance, montréal": { lat: 45.5079, lng: -73.5646 } };
const model = (places = [ALLIANCE, PIERNAS, STUDIO, LOST], spots = SPOTS) => C.tripMap({ items: ITEMS, places, spots, T });

test("each saved place with a pin is a tile with its kind, and a count when plans sit there", () => {
  const pins = model().pins.filter((p) => !p.plan).map((p) => [p.name, p.emoji, p.count]);
  assert.deepEqual(pins, [["Alliance Dance Company", "💃", 3], ["Las Piernas", "💃", 1], ["Studio 2790", "💃", 1]], "the place with no pin draws no tile");
});
test("the kind of a saved place: 💃 dance, 🥾 hike, 🍜 food, 📍 anything else", () => {
  const e = (category) => C.tripMap({ items: [], places: [{ ...ALLIANCE, category }], spots: {}, T }).places[0].emoji;
  assert.deepEqual(["dance", "hike", "food", "restaurant", "place", ""].map(e), ["💃", "🥾", "🍜", "🍜", "📍", "📍"]);
});
test("a plan whose address is not a saved place gets a plain blue dot, once its address is found on the map", () => {
  const dots = model().pins.filter((p) => p.plan);
  assert.deepEqual(plain(dots.map((d) => [d.name, d.lat, d.lng])), [["Montreal stay", 45.5079, -73.5646]]);
  assert.equal(model(undefined, {}).pins.filter((p) => p.plan).length, 0, "not found yet: no dot");
});
test("plain dots only for plan addresses: what still needs looking up", () => {
  assert.deepEqual(plain(model(undefined, {}).lookups), ["1255 Rue Jeanne-Mance, Montréal"]);
  assert.deepEqual(plain(model().lookups), []);
});

test("the itinerary: plans by day, with the time and where each one sits", () => {
  const days = plain(model().days);
  assert.deepEqual(days.map((d) => d.label), ["Thu Nov 12", "Fri Nov 13", "Sat Nov 14", "Sun Nov 15"]);
  assert.deepEqual(days[1].plans.map((p) => [p.time, p.name, p.where]), [
    ["5:00 PM", "Check in: Montreal stay", "📍 Montreal stay"],
    ["9:00 PM", "Lambada workshop", "📍 Alliance Dance Company"],
    ["10:00 PM", "Social", "📍 Alliance Dance Company"],
  ]);
  assert.deepEqual(days[3].plans.map((p) => [p.name, p.at, p.where]), [
    ["Lambada, Zouk workshops + Practica", "mtl-alliance", "📍 Alliance Dance Company"],
    ["Dinner with everyone?", "", "No place yet"],
  ]);
});

test("Saved places N: one row each, with its street and how many plans sit there; a place with no pin says so", () => {
  const m = model();
  assert.equal(m.places.length, 4);
  assert.deepEqual(plain(m.places.map((p) => [p.name, p.sub, p.nopin])), [
    ["Alliance Dance Company", "2529 Rue Ontario E · 3 plans", false],
    ["Las Piernas", "2019 Rue Moreau · 1 plan", false],
    ["Studio 2790", "2790 Rue Hochelaga · 1 plan", false],
    ["Le Mystère", "Not found on the map", true],
  ]);
});

test("the card of a saved place: name, address, the plans there, Directions and Remove place", () => {
  const c = plain(model().card("mtl-alliance"));
  assert.deepEqual(c, {
    id: "mtl-alliance", icon: "💃", name: "Alliance Dance Company", addr: "2529 Rue Ontario E, Montréal",
    plans: [["Fri 9:00 PM", "Lambada workshop"], ["Fri 10:00 PM", "Social"], ["Sun 1:00 PM", "Lambada, Zouk workshops + Practica"]],
    dir: "https://www.google.com/maps/dir/?api=1&destination=45.5341%2C-73.5523", remove: true,
  });
  assert.deepEqual(plain(model().card("x1")).plans, [], "no plans: the card says No plans here yet");
});
test("the card of a plain plan dot: from the plan, not a saved place, and no Remove", () => {
  const dot = model().pins.find((p) => p.plan);
  const c = plain(model().card(dot.id));
  assert.equal(c.icon, "🔵");
  assert.equal(c.addr, "1255 Rue Jeanne-Mance, Montréal · from the plan, not a saved place");
  assert.deepEqual(c.plans, [["Fri 5:00 PM", "Check in: Montreal stay"]]);
  assert.equal(c.remove, false);
  assert.equal(model().card("nothing"), null);
});
test("a plan row with a place opens that place's card; a plan with no place opens nothing", () => {
  const m = model(), rows = m.days.flatMap((d) => d.plans);
  assert.equal(m.card(rows.find((p) => p.name === "Social").at).name, "Alliance Dance Company");
  assert.equal(rows.find((p) => p.name === "Dinner with everyone?").at, "");
});

/* ---- + Add place: one box, a name or an address (d32) */
test("Add place sends the words as the name, and the address the server looks up near the trip", () => {
  assert.deepEqual(plain(C.placeAdd("Schwartz's Deli", MTL, T)), { name: "Schwartz's Deli", address: "Schwartz's Deli, Montreal", category: "place", trip: MTL, savedBy: "Junyan" });
  assert.deepEqual(plain(C.placeAdd("  3895 Boul. Saint-Laurent, Montréal ", MTL, T)).address, "3895 Boul. Saint-Laurent, Montréal", "an address with a comma goes as it is");
  assert.equal(C.placeAdd("   ", MTL, T), null, "nothing typed: nothing saved");
});
test("Add place: found says Saved and the name; not found is still saved, with no pin", () => {
  assert.equal(C.placeToast({ name: "Schwartz's Deli", lat: 45.5163, lng: -73.5776 }), "Saved Schwartz's Deli");
  assert.equal(C.placeToast({ name: "Le Mystère", lat: null, lng: null }), "Saved, but no pin: we could not find it. Add the street to place it.");
});
test("a new place shows 📍 and joins the list", () => {
  const m = model([ALLIANCE, { id: "n1", name: "Schwartz's Deli", address: "Schwartz's Deli, Montreal", lat: 45.5163, lng: -73.5776, category: "place" }]);
  assert.deepEqual(plain(m.places.map((p) => [p.name, p.emoji])), [["Alliance Dance Company", "💃"], ["Schwartz's Deli", "📍"]]);
});

/* ---- Remove place: the same route's delete */
test("Remove place sends the delete for that place only", () => {
  assert.deepEqual(plain(C.placeRemove(ALLIANCE)), { op: "del", id: "mtl-alliance" });
  assert.equal(C.placeToast(ALLIANCE, "removed"), "Removed Alliance Dance Company");
});
test("after a remove the place leaves the list, its pin goes, and its plans fall back to a plain plan address", () => {
  const m = model([PIERNAS, STUDIO]);
  assert.deepEqual(m.places.map((p) => p.name), ["Las Piernas", "Studio 2790"]);
  assert.equal(m.days[1].plans.find((p) => p.name === "Social").where, "📍 Lambada workshop", "a plain dot takes the name of the first plan there");
  assert.ok(m.lookups.includes("Alliance Dance Company, 2529 Rue Ontario E, Montréal"), "and is looked up for a dot");
});

/* ---- d36: Montreal Birthday starts with the four Montreal places from Day Quest's seed */
test("Montreal Birthday with no saved places starts with the four Montreal places, once", () => {
  const s = plain(C.tripSeed("2026 Montreal Birthday", [], false, T));
  assert.deepEqual(s.map((p) => [p.id, p.name, p.category]), [
    ["mtl-alliance", "Alliance Dance Company", "dance"], ["mtl-piernas", "Las Piernas", "dance"],
    ["mtl-studio", "Studio 2790", "dance"], ["mtl-royal", "Mount Royal lookout", "hike"],
  ]);
  assert.ok(s.every((p) => p.trip === "2026 Montreal Birthday" && p.lat != null && !("seed" in p)));
  assert.deepEqual(plain(C.tripSeed(MTL, [ALLIANCE], false, T)), [], "he has places already");
  assert.deepEqual(plain(C.tripSeed(MTL, [], true, T)), [], "seeded once already (he removed them all)");
  assert.deepEqual(plain(C.tripSeed("2027 🇧🇷 Brazil Carnaval", [], false, T)), [], "only Montreal Birthday");
});

/* ---- the trip's head */
test("the trip's head: its flag, its full and short name, its dates and who", () => {
  assert.deepEqual(plain(C.tripHead({ name: MTL, start: "2026-11-12", end: "2026-11-17" }, T)),
    { icon: "🇨🇦", title: MTL, short: "Montreal Birthday", dates: "Nov 12 to Nov 17", who: "You + Caney" });
  assert.deepEqual(plain(C.tripHead({ name: "2027 Lisbon", start: "2027-01-03", end: "2027-01-03" }, T)),
    { icon: "🧳", title: "2027 Lisbon", short: "Lisbon", dates: "Jan 3", who: "" });
});

/* ---- the phone: Map is a tab on the trip (d11) */
test("on a phone the trip has tabs, and Map is one of them", () => {
  assert.deepEqual(plain(C.TRIP_TABS), ["Itinerary", "Map"]);
});

/* ---- review fix: Day Quest's drawMap skips a saved place with no pin, so a plan there is a plain dot of its own */
test("a plan never sits on a saved place that has no pin; it gets a plain dot instead", () => {
  const LOST = { id: "pl-lost", name: "Le Mystère", address: "Le Mystère, Montréal", lat: null, lng: null, category: "place", trip: MTL };
  const items = [plan("p9", "Late show", "2026-11-14T22:00:00-05:00", "", { fields: { Address: { type: "rich_text", value: "Le Mystère, Montréal" } } })];
  const m = C.tripMap({ items, places: [LOST], spots: { "le mystère, montréal": { lat: 45.5, lng: -73.6 } }, T });
  assert.equal(m.days[0].plans[0].at, "plan:le mystère, montréal");
  assert.equal(m.places[0].sub, "Not found on the map", "the place row counts no plans");
  assert.deepEqual(m.pins.map((p) => [p.id, p.plan]), [["plan:le mystère, montréal", true]]);
});
