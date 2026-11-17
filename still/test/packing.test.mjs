// node --test still/test/packing.test.mjs
// The calendar's Packing page (slice 01, Junyan 2026-11-13, "22 yes"): its rules, behind CalCore.packing, with the
// storage passed in. The trip rules are Day Quest's own (quest-trips.js), loaded the way trips.test.mjs loads them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import "../calendar-core.js";

const C = globalThis.CalCore;
const file = (p) => fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(file("../quest-trips.js"), ctx);
const T = ctx.QuestTrips;
const SEED = JSON.parse(file("../packing-seed.json"));   // the 94 items read from his Notion Packing List

/** A browser store kept in memory: get gives a string or null, set(k, null) forgets. */
function mem() {
  const m = new Map();
  return { m, get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { if (v == null) m.delete(k); else m.set(k, String(v)); } };
}
const TODAY = "2026-11-13";
const TRIPS = [
  { name: "2026 🇨🇦 Montreal Birthday", start: "2026-11-12", end: "2026-11-17" },
  { name: "2027 🇧🇷 Brazil Carnaval", start: "2027-01-03", end: "2027-02-07" },
  { name: "2026 🇪🇬 Egypt", start: "2026-09-25", end: "2026-10-23" },
  { name: "2026 Tremblant/Massif", start: "2026-02-06", end: "2026-02-22" },
  { name: "2025 ⛷️ Japan Ski Trip", start: "2025-03-02", end: "2025-03-03" },
  { name: "2024 🇨🇦 Toronto Staycation", start: "2024-12-21", end: "2024-12-21" },
  { name: "2024 🇨🇦 Toronto Zouk Marathon", start: "", end: "" },
  { name: "Toronto", start: "2026-11-01", end: "2026-11-02" },
];
const MTL = "t:2026 montreal birthday", BRAZIL = "t:2027 brazil carnaval", EGYPT = "t:2026 egypt";
/** A page that has loaded the Notion copy, with no trips seen yet. */
function fresh(store = mem()) { const p = C.packing({ store, trips: T }); p.seed(SEED); return p; }
/** The same, after his trips arrived. */
function open(store = mem(), trips = TRIPS, today = TODAY) { const p = fresh(store); p.sync(trips, today); return p; }

test("first load: the 94 Notion items become My lists, three bags and when pills, with no ticks", () => {
  const p = C.packing({ store: mem(), trips: T });
  assert.equal(p.ready(), false);
  p.seed(SEED);
  assert.equal(p.ready(), true);
  assert.deepEqual(p.picker({ today: TODAY }).mine.map((m) => [m.id, m.icon, m.name, m.total]),
    [["all", "🌍", "All items", 94], ["brazil", "🌴", "Brazil", 72], ["road", "🚗", "Road Trip", 37], ["ski", "⛷️", "Skiing", 36]]);
  const b = p.board("all", {});
  assert.deepEqual(b.bags.map((x) => [x.id, x.icon, x.name, x.total, x.done]),
    [["away", "🧳", "Away Carry-on", 14, 0], ["nomatic", "🎒", "Nomatic Travel Pack", 15, 0], ["sling", "👝", "Sling / On my Person", 14, 0]]);
  assert.equal(b.top.total, 51, "Packed, Winter, Other, Caney Backpack and Phone have no bag yet");
  assert.deepEqual(b.chips.map((c) => [c.id, c.label, c.n]),
    [["any", "Everything", 94], ["week", "Week before", 19], ["day", "Day before", 4], ["leave", "On leaving", 14], ["none", "No time yet", 57]]);
  const oura = b.bags[2].rows.find((r) => r.name === "Oura Ring");
  assert.deepEqual({ icon: oura.icon, qty: oura.qty, when: oura.when, pill: oura.pill, done: oura.done },
    { icon: "💍", qty: "1", when: "leave", pill: "On leaving", done: false });
  const pad = b.top.rows.find((r) => r.name === "Writing Pad");
  assert.deepEqual({ icon: pad.icon, pill: pad.pill }, { icon: "", pill: "When?" }, "an item with no emoji and no time");
});

test("his real trips: coming up soonest first with the one he is on first, past newest first, Toronto left out", () => {
  const k = open().picker({ today: TODAY });
  assert.deepEqual(k.counts, { up: 2, past: 5, mine: 4 });
  assert.deepEqual(k.up.map((c) => [c.id, c.icon, c.name, c.dates, c.label, c.now]), [
    [MTL, "🇨🇦", "Montreal Birthday", "Nov 12 to 17", "Now", true],
    [BRAZIL, "🇧🇷", "Brazil Carnaval", "Jan 3 to Feb 7, 2027", "51 days away", false]]);
  assert.deepEqual(k.past.map((c) => [c.id, c.icon, c.name, c.dates, c.label, c.now]), [
    [EGYPT, "🇪🇬", "Egypt", "Sep 25 to Oct 23", "", false],
    ["t:2026 tremblant massif", "🧳", "Tremblant/Massif", "Feb 6 to 22", "", false],
    ["t:2025 japan ski trip", "⛷️", "Japan Ski Trip", "Mar 2 to 3, 2025", "", false],
    ["t:2024 toronto zouk marathon", "🇨🇦", "Toronto Zouk Marathon", "2024", "", false],
    ["t:2024 toronto staycation", "🇨🇦", "Toronto Staycation", "Dec 21, 2024", "", false]]);
});

test("first load: the trip he is on starts from the Road Trip list; every other trip has no list", () => {
  const p = open(), k = p.picker({ today: TODAY });
  assert.deepEqual(k.up.map((c) => [c.name, c.has, c.done, c.total]), [["Montreal Birthday", true, 0, 37], ["Brazil Carnaval", false, 0, 0]]);
  assert.ok(k.past.every((c) => !c.has));
  assert.deepEqual(p.head(MTL, TODAY), { title: "Montreal Birthday", sub: "Nov 12 to 17 · Now · started from your Road Trip list", has: true, kind: "trip" });
  assert.deepEqual(p.head(BRAZIL, TODAY), { title: "Brazil Carnaval", sub: "Jan 3 to Feb 7, 2027 · 51 days away", has: false, kind: "trip" });
  assert.deepEqual(p.head(EGYPT, TODAY), { title: "Egypt", sub: "Sep 25 to Oct 23", has: false, kind: "trip" });
  assert.deepEqual(p.head("road", TODAY), { title: "Road Trip list", sub: "New trips can start from this list.", has: true, kind: "mine" });
  assert.deepEqual(p.head("all", TODAY), { title: "All items", sub: "Everything you pack with.", has: true, kind: "all" });
  assert.equal(p.board(MTL, {}).chips[0].n, 37);
});

test("first load happens once: a later trip he is on does not get a list by itself", () => {
  const store = mem();
  open(store);
  const later = C.packing({ store, trips: T });
  later.sync(TRIPS, "2027-01-10");   // now on Brazil Carnaval
  assert.deepEqual(later.picker({ today: "2027-01-10" }).up.map((c) => [c.name, c.label, c.has]), [["Brazil Carnaval", "Now", false]]);
});

test("first load waits for both: trips that arrive before the Notion copy still give the trip he is on its list", () => {
  const p = C.packing({ store: mem(), trips: T });
  p.sync(TRIPS, TODAY);
  p.seed(SEED, TODAY);
  assert.equal(p.picker({ today: TODAY }).up[0].total, 37);
});

test("the page opens on the trip he is on, else the next one coming up, else All items", () => {
  assert.deepEqual(open().picker({ today: TODAY }).open, { list: MTL, tab: "up" });
  assert.deepEqual(open(mem(), TRIPS, "2026-12-01").picker({ today: "2026-12-01" }).open, { list: BRAZIL, tab: "up" });
  assert.deepEqual(open(mem(), TRIPS, "2027-03-01").picker({ today: "2027-03-01" }).open, { list: "all", tab: "mine" });
  assert.deepEqual(fresh().picker({ today: TODAY }).open, { list: "all", tab: "mine" }, "no trips seen yet");
});

test("Past shows the newest 8 and a Show all card; all of them when asked or when the picked trip is further back", () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ name: `20${10 + i} Trip ${i}`, start: `20${10 + i}-05-01`, end: `20${10 + i}-05-09` }));
  const p = open(mem(), many);
  let k = p.picker({ today: TODAY });
  assert.deepEqual([k.past.length, k.more, k.counts.past], [8, true, 11]);
  assert.deepEqual([k.past[0].name, k.past[7].name], ["Trip 10", "Trip 3"]);
  k = p.picker({ today: TODAY, allPast: true });
  assert.deepEqual([k.past.length, k.more, k.counts.past], [11, false, 11]);
  k = p.picker({ today: TODAY, picked: "t:2011 trip 1" });
  assert.deepEqual([k.past.length, k.more], [11, false]);
  k = p.picker({ today: TODAY, picked: "t:2020 trip 10" });
  assert.deepEqual([k.past.length, k.more], [8, true]);
  assert.equal(open(mem(), many.slice(0, 8)).picker({ today: TODAY }).more, false, "eight fit");
});

test("a trip with no list asks what it starts from, with a best guess from its name or icon", () => {
  const p = open(), c = p.choices(BRAZIL, TODAY);
  assert.equal(c.title, "Start the Brazil Carnaval list");
  assert.equal(c.sub, "Pick what it starts from. You can add or leave out items after.");
  assert.deepEqual(c.lists.map((o) => [o.id, o.icon, o.name, o.count, o.best]), [
    ["brazil", "🌴", "Brazil list", "72 items", true], ["road", "🚗", "Road Trip list", "37 items", false],
    ["ski", "⛷️", "Skiing list", "36 items", false], ["all", "🌍", "All items", "94 items", false]]);
  assert.deepEqual(c.trips.map((o) => [o.id, o.icon, o.name, o.count]), [[MTL, "🇨🇦", "Montreal Birthday", "37 items"]], "every other trip that has a list");
  assert.equal(c.keep, false);
  const best = (list) => p.choices(list, TODAY).lists.filter((o) => o.best).map((o) => o.id);
  assert.deepEqual(best("t:2025 japan ski trip"), ["ski"], "a ski icon");
  assert.deepEqual(best("t:2026 tremblant massif"), ["ski"], "a ski place");
  assert.deepEqual(best(EGYPT), [], "no guess");
});

test("starting a list copies its source as it is at that moment and says where it came from", () => {
  const p = open();
  p.start(BRAZIL, "brazil");
  assert.equal(p.board(BRAZIL, {}).chips[0].n, 72);
  assert.equal(p.head(BRAZIL, TODAY).sub, "Jan 3 to Feb 7, 2027 · 51 days away · started from your Brazil list");
  p.start(EGYPT, BRAZIL);
  assert.equal(p.board(EGYPT, {}).chips[0].n, 72);
  assert.equal(p.head(EGYPT, TODAY).sub, "Sep 25 to Oct 23 · started from Brazil Carnaval");
  p.start(EGYPT, "empty");
  assert.equal(p.board(EGYPT, {}).chips[0].n, 0);
  assert.equal(p.head(EGYPT, TODAY).sub, "Sep 25 to Oct 23 · started from an empty list");
  p.start(EGYPT, "all");
  assert.equal(p.board(EGYPT, {}).chips[0].n, 94);
  assert.equal(p.head(EGYPT, TODAY).sub, "Sep 25 to Oct 23 · started from all your items");
  assert.deepEqual(p.picker({ today: TODAY }).past[0].total, 94);
});

test("Start over offers the same choices, says what it swaps, and has no best guess", () => {
  const c = open().choices(MTL, TODAY);
  assert.equal(c.title, "Start the Montreal Birthday list over");
  assert.equal(c.sub, "This swaps its 37 items and clears its ticks.");
  assert.equal(c.keep, true);
  assert.deepEqual(c.lists.map((o) => o.best), [false, false, false, false]);
  assert.deepEqual(c.trips, [], "it is the only trip with a list");
});

const ids = (rows) => rows.map((r) => r.id);

test("leaving an item out of a trip changes that trip only, and the other way round; a click brings it back in its bag", () => {
  const p = open();
  p.start(BRAZIL, "brazil");
  const id = p.board(BRAZIL, {}).bags[0].rows[0].id;
  p.move(BRAZIL, id, "out");
  assert.equal(p.board(BRAZIL, {}).chips[0].n, 71);
  assert.equal(p.board("brazil", {}).chips[0].n, 72, "the Brazil list is not the trip's list");
  assert.equal(p.board(MTL, {}).chips[0].n, 37);
  const out = p.board(BRAZIL, {}).out;
  assert.equal(out.length, 23);
  assert.ok(ids(out).includes(id));
  const other = p.board("brazil", {}).bags[1].rows[0].id;
  p.move("brazil", other, "out");
  assert.equal(p.board("brazil", {}).chips[0].n, 71);
  assert.ok(ids(p.board(BRAZIL, {}).bags[1].rows).includes(other), "still on the trip");
  p.bring(BRAZIL, id);
  assert.ok(ids(p.board(BRAZIL, {}).bags[0].rows).includes(id));
  assert.deepEqual(p.board("all", {}).out, [], "All items has nothing left out");
  p.move("all", id, "out");
  assert.equal(p.board("all", {}).chips[0].n, 94);
});

test("dragging puts an item in a bag or back in To place, the same on every trip; To place keeps newest first", () => {
  const p = open(), id = p.board(MTL, {}).top.rows[2].id;
  p.move(MTL, id, "nomatic");
  assert.ok(ids(p.board(MTL, {}).bags[1].rows).includes(id));
  assert.ok(ids(p.board("all", {}).bags[1].rows).includes(id), "a bag is one per item");
  assert.ok(!ids(p.board(MTL, {}).top.rows).includes(id));
  p.move(MTL, id, "top");
  assert.equal(p.board(MTL, {}).top.rows[0].id, id);
  const left = p.board(MTL, {}).out[0].id;
  p.move(MTL, left, "sling");
  assert.ok(ids(p.board(MTL, {}).bags[2].rows).includes(left), "dragged from the side panel onto a bag: on the trip, in that bag");
  assert.equal(p.board(MTL, {}).chips[0].n, 38);
});

const names = (rows) => rows.map((r) => r.name);
const idOf = (p, list, name) => { const b = p.board(list, {}); return b.top.rows.concat(...b.bags.map((x) => x.rows)).find((r) => r.name === name).id; };

test("inside a bag items sit in packing order: Week before, Day before, On leaving, then no time yet", () => {
  assert.deepEqual(names(open().board("all", {}).bags[0].rows), ["Packed Shoes", "Money Belt", "Bathing suit", "Pants / Shorts", "Shirts", "Socks",
    "Underwear", "Elephant Sheet", "Supplements", "Flatten water bottle", "Food", "Shelf-stable backup snacks", "Waterproof Phone Case", "Exercise Equipment"]);
});

test("the when pill: picking a time saves at once, moves the item in its bag, and is the same on every trip", () => {
  const p = open(), id = idOf(p, "all", "Exercise Equipment");
  p.setWhen(id, "leave");
  const away = p.board("all", {}).bags[0].rows;
  assert.deepEqual(names(away).slice(-3), ["Shelf-stable backup snacks", "Exercise Equipment", "Waterproof Phone Case"]);
  assert.deepEqual([away[12].when, away[12].pill], ["leave", "On leaving"]);
  assert.deepEqual(p.board("all", {}).chips.map((c) => c.n), [94, 19, 4, 15, 56]);
  assert.equal(p.board("brazil", {}).bags[0].rows.find((r) => r.id === id).pill, "On leaving");
  p.setWhen(id, "sometime");
  assert.equal(p.board("all", {}).bags[0].rows[12].when, "leave", "only the four times");
  p.setWhen(id, "none");
  assert.equal(p.board("all", {}).bags[0].rows.find((r) => r.id === id).pill, "When?");
});

test("one click on a Bags pill moves it on: Week before, Day before, On leaving, When?, then round again, the same on every trip (d30)", () => {
  const p = open(), id = idOf(p, "all", "Exercise Equipment");
  p.setWhen(id, "week");
  const pill = (list) => p.board(list, {}).bags.flatMap((b) => b.rows).find((r) => r.id === id);
  const seen = [];
  for (let i = 0; i < 4; i++) { p.cycleWhen(id); seen.push([pill("all").when, pill("all").pill]); }
  assert.deepEqual(seen, [["day", "Day before"], ["leave", "On leaving"], ["none", "When?"], ["week", "Week before"]]);
  p.cycleWhen(id);
  assert.equal(pill("brazil").pill, "Day before", "one when per item, on every trip");
  p.cycleWhen("no-such-item");
});

test("ticks are kept per trip: ticking on Montreal Birthday ticks it nowhere else, and My lists have no ticks", () => {
  const p = open();
  p.start(BRAZIL, "road");
  const socks = idOf(p, MTL, "Socks"), before = names(p.board(MTL, {}).bags[0].rows);
  p.tick(MTL, socks, true);
  const b = p.board(MTL, {}), away = b.bags[0];
  assert.equal(b.ticks, true);
  assert.deepEqual([away.total, away.done, away.count], [10, 1, "1 of 10"]);
  assert.equal(away.rows.find((r) => r.id === socks).done, true);
  assert.deepEqual(names(away.rows), before, "a packed item stays where it is");
  const there = p.board(BRAZIL, {}).bags[0];
  assert.deepEqual([there.done, there.count, there.rows.find((r) => r.id === socks).done], [0, "0 of 10", false]);
  assert.deepEqual(p.picker({ today: TODAY }).up.map((c) => [c.name, c.done, c.total, c.packed]),
    [["Montreal Birthday", 1, 37, "1 of 37 packed"], ["Brazil Carnaval", 0, 37, "0 of 37 packed"]]);
  assert.equal(p.picker({ today: TODAY }).past[0].packed, "No list yet");
  p.tick("road", socks, true);
  const road = p.board("road", {});
  assert.deepEqual([road.ticks, road.bags[0].count, road.bags[0].done, road.bags[0].rows.find((r) => r.id === socks).done], [false, "10", 0, false]);
  p.tick(MTL, socks, false);
  assert.equal(p.board(MTL, {}).bags[0].done, 0);
});

test("the filter shows only those items in every list; Hide packed hides ticked ones; the counts stay whole", () => {
  const p = open();
  assert.deepEqual(p.board(MTL, {}).chips.map((c) => c.n), [37, 12, 1, 13, 11]);
  assert.deepEqual([p.board(MTL, {}).top.total, ...p.board(MTL, {}).bags.map((x) => x.total)], [13, 10, 6, 8]);
  let b = p.board(MTL, { when: "day" });
  assert.deepEqual(names(b.bags[0].rows), ["Food"]);
  assert.deepEqual([b.bags[0].total, b.bags[0].count, b.top.total], [10, "0 of 10", 13]);
  assert.deepEqual(b.chips.map((c) => c.n), [37, 12, 1, 13, 11]);
  assert.deepEqual([b.top.rows.length, b.top.hint, b.bags[1].rows.length, b.bags[1].hint], [0, "Nothing here for this filter.", 0, "Nothing here for this filter."]);
  b = p.board(MTL, { when: "leave" });
  assert.deepEqual(names(b.top.rows), ["Combination Lock", "Bhuta Shuddhi"]);
  assert.equal(b.top.hint, "");
  p.tick(MTL, idOf(p, MTL, "Food"), true);
  b = p.board(MTL, { hide: true });
  assert.deepEqual([b.bags[0].rows.length, b.bags[0].total, b.bags[0].done, names(b.bags[0].rows).includes("Food")], [9, 10, 1, false]);
  assert.equal(p.board(MTL, { when: "day", hide: true }).bags[0].hint, "Nothing here for this filter.");
  for (const r of p.board(MTL, {}).bags[0].rows) p.tick(MTL, r.id, true);
  assert.equal(p.board(MTL, { hide: true }).bags[0].hint, "All packed.");
  assert.equal(p.board("road", { hide: true }).bags[0].rows.length, 10, "My lists have nothing to hide");
  p.start(EGYPT, "empty");
  b = p.board(EGYPT, {});
  assert.deepEqual([b.top.hint, b.bags[0].hint], ["Nothing waiting. Everything has a bag.", "Drag items here."]);
});

test("the add box: one line adds an item at the top of To place; x3 at the end is the count", () => {
  const p = open();
  const id = p.add(MTL, "Trail mix x3");
  const top = p.board(MTL, {}).top;
  assert.deepEqual([top.total, top.rows[0].id, top.rows[0].name, top.rows[0].qty, top.rows[0].icon, top.rows[0].pill], [14, id, "Trail mix", "3", "", "When?"]);
  const two = p.add(MTL, "  Passport copy ");
  assert.deepEqual(names(p.board(MTL, {}).top.rows).slice(0, 2), ["Passport copy", "Trail mix"], "newest first");
  assert.equal(p.board(MTL, {}).top.rows[0].qty, "1");
  assert.notEqual(two, id);
  assert.equal(p.add(MTL, "   "), null, "an empty line adds nothing");
  assert.equal(p.board(MTL, {}).top.total, 15);
  const q = (text) => { const id2 = p.add("all", text), r = p.board("all", {}).top.rows.find((x) => x.id === id2); return [r.icon, r.name, r.qty]; };
  assert.deepEqual(q("Gum ×12"), ["", "Gum", "12"]);
  assert.deepEqual(q("Gel x 2"), ["", "Gel", "2"]);
  assert.deepEqual(q("Xbox"), ["", "Xbox", "1"]);
  assert.deepEqual(q("🥜 Peanuts x2"), ["🥜", "Peanuts", "2"], "an emoji in front is its icon, as on the Notion items");
  assert.equal(p.add(BRAZIL, "Sunscreen"), null, "a trip with no list has no board to add to");
  assert.equal(p.board("all", {}).chips[0].n, 100);
});

test("an item added on a trip is on that trip and in All items only; on one of My lists, on that list; on All items, there only", () => {
  const p = open();
  p.start(BRAZIL, "brazil");
  const onIt = (list, id) => ids(p.board(list, {}).top.rows).includes(id);
  const a = p.add(MTL, "Trail mix");
  assert.deepEqual([MTL, "all", "road", "brazil", BRAZIL].map((l) => onIt(l, a)), [true, true, false, false, false]);
  const b = p.add("ski", "Hand warmers");
  assert.deepEqual(["ski", "all", "road", MTL].map((l) => onIt(l, b)), [true, true, false, false]);
  const c = p.add("all", "Umbrella");
  assert.deepEqual(["all", "ski", "road", "brazil", MTL, BRAZIL].map((l) => onIt(l, c)), [true, false, false, false, false, false]);
  assert.equal(p.board("all", {}).chips[0].n, 97);
});

test("renaming: the same x3 rule for the count, an empty name keeps the old one", () => {
  const p = open(), id = idOf(p, MTL, "Socks");
  const row = () => { const r = p.board(MTL, {}).bags[0].rows.find((x) => x.id === id); return [r.icon, r.name, r.qty]; };
  assert.deepEqual(row(), ["🧦", "Socks", "6"]);
  assert.equal(p.board(MTL, {}).bags[0].rows.find((x) => x.id === id).edit, "Socks x6", "what the rename box opens with");
  p.rename(id, "Wool socks x8");
  assert.deepEqual(row(), ["🧦", "Wool socks", "8"]);
  assert.equal(p.board("all", {}).bags[0].rows.find((x) => x.id === id).name, "Wool socks", "one name everywhere");
  p.rename(id, "Wool socks");
  assert.deepEqual(row(), ["🧦", "Wool socks", "1"]);
  assert.equal(p.board(MTL, {}).bags[0].rows.find((x) => x.id === id).edit, "Wool socks");
  p.rename(id, "   ");
  assert.deepEqual(row(), ["🧦", "Wool socks", "1"]);
  p.rename(id, "🧶 Wool socks x2");
  assert.deepEqual(row(), ["🧶", "Wool socks", "2"]);
});

test("deleting on All items removes the item for good, from every trip and list", () => {
  const p = open(), id = idOf(p, MTL, "Socks");
  p.tick(MTL, id, true);
  p.remove(id);
  assert.equal(p.board("all", {}).chips[0].n, 93);
  assert.deepEqual([p.board(MTL, {}).chips[0].n, p.board(MTL, {}).bags[0].done, p.board("road", {}).chips[0].n, p.board("brazil", {}).chips[0].n], [36, 0, 36, 71]);
  assert.ok(!ids(p.board(MTL, {}).out).includes(id), "not left out either: gone");
  assert.equal(p.picker({ today: TODAY }).up[0].packed, "0 of 36 packed");
});

test("Start fresh unticks the whole trip and nothing else; Start over clears its ticks too", () => {
  const p = open();
  p.start(BRAZIL, "road");
  for (const r of p.board(MTL, {}).bags[0].rows) { p.tick(MTL, r.id, true); p.tick(BRAZIL, r.id, true); }
  assert.equal(p.picker({ today: TODAY }).up[0].packed, "10 of 37 packed");
  p.untickAll(MTL);
  assert.deepEqual(p.picker({ today: TODAY }).up.map((c) => c.packed), ["0 of 37 packed", "10 of 37 packed"]);
  assert.equal(p.board(MTL, {}).chips[0].n, 37, "the items stay");
  p.start(BRAZIL, "ski");
  assert.equal(p.picker({ today: TODAY }).up[1].packed, "0 of 36 packed");
});

test("Find an item narrows what is left out, whatever the case", () => {
  const p = open();
  assert.equal(p.found(MTL, "").length, 57);
  const hit = p.found(MTL, " SKI ");
  assert.deepEqual(p.board(MTL, {}).out.filter((o) => hit.includes(o.id)).map((o) => o.name).sort(),
    ["Ski Gear", "Ski Goggles", "Ski Helmet", "Ski Helmet", "Ski Jacket", "Ski Mitts", "Ski Socks", "Skis, Boots, Poles & Straps"]);
  assert.deepEqual(p.found(MTL, "zzz"), []);
  assert.deepEqual(p.found("all", "ski"), [], "All items leaves nothing out");
});

test("everything is kept: a page opened later on the same browser sees the same lists, ticks and trips, with no network", () => {
  const store = mem(), p = open(store);
  p.start(BRAZIL, "brazil");
  const socks = idOf(p, MTL, "Socks");
  p.tick(MTL, socks, true);
  p.setWhen(socks, "day");
  p.move(MTL, socks, "sling");
  const added = p.add(MTL, "Trail mix x3");
  p.move(BRAZIL, idOf(p, BRAZIL, "Passport"), "out");
  const later = C.packing({ store, trips: T });   // no seed, no sync: the network is off
  assert.equal(later.ready(), true);
  assert.equal(later.seed(SEED), false, "the Notion copy is read once; after that the app owns its copy");
  const k = later.picker({ today: TODAY });
  assert.deepEqual(k.up.map((c) => [c.name, c.dates, c.label, c.packed]),
    [["Montreal Birthday", "Nov 12 to 17", "Now", "1 of 38 packed"], ["Brazil Carnaval", "Jan 3 to Feb 7, 2027", "51 days away", "0 of 71 packed"]]);
  assert.equal(k.counts.past, 5);
  const r = later.board(MTL, {}).bags[2].rows.find((x) => x.id === socks);
  assert.deepEqual([r.done, r.when], [true, "day"]);
  assert.deepEqual([later.board(MTL, {}).top.rows[0].id, later.board(MTL, {}).top.rows[0].qty], [added, "3"]);
  assert.notEqual(later.add(MTL, "Gum"), added, "a new item never reuses an id");
});

test("a list is saved under the trip's key: a respelled trip keeps it, and a trip that is no longer returned keeps it too", () => {
  const store = mem(), p = open(store);
  p.tick(MTL, idOf(p, MTL, "Socks"), true);
  p.sync(TRIPS.slice(1), TODAY);   // Montreal is not returned this time
  assert.deepEqual(p.picker({ today: TODAY }).up.map((c) => c.name), ["Brazil Carnaval"]);
  p.sync([{ name: "2026 🇨🇦 Montréal Birthday", start: "2026-11-12", end: "2026-11-17" }, ...TRIPS.slice(1)], TODAY);
  const c = C.packing({ store, trips: T }).picker({ today: TODAY }).up[0];
  assert.deepEqual([c.name, c.packed], ["Montréal Birthday", "1 of 37 packed"]);
});

test("a store that cannot be read or holds rubbish still gives a page that opens", () => {
  const bad = { get: () => "{not json", set: () => {} };
  const p = C.packing({ store: bad, trips: T });
  assert.equal(p.ready(), false);
  assert.deepEqual(p.picker({ today: TODAY }).counts, { up: 0, past: 0, mine: 4 });
  assert.deepEqual(p.board("all", {}).chips[0].n, 0);
  const thrower = { get: () => { throw new Error("blocked"); }, set: () => { throw new Error("full"); } };
  const q = C.packing({ store: thrower, trips: T });
  q.seed(SEED); q.sync(TRIPS, TODAY);
  assert.equal(q.picker({ today: TODAY }).up[0].packed, "0 of 37 packed", "it still works for this visit");
});

test("a My lists card says how many items in plain words: 1 item, 2 items", () => {
  const one = [{ ...SEED[0], types: ["Skiing"] }, { ...SEED[1], types: ["Travel"] }, { ...SEED[2], types: ["Travel"] }];
  const p = C.packing({ store: mem(), trips: T }); p.seed(one);
  assert.deepEqual(p.picker({ today: TODAY }).mine.map((m) => [m.id, m.size]),
    [["all", "3 items"], ["brazil", "0 items"], ["road", "2 items"], ["ski", "1 item"]]);
});

test("a trip started from a past trip's list says so, by that trip's name", () => {
  const p = open();
  p.start(EGYPT, "all");
  p.start(BRAZIL, EGYPT);
  assert.match(p.head(BRAZIL, TODAY).sub, /started from Egypt$/);
});
