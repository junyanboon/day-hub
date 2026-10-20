// node --test still/test/*.test.mjs   (the kitchen "fill in" picker and the shop line, Junyan 2026-10-20, d35 to d37:
// "35 yes also I bought groceries today so what happens in that case? 36 no, 37 yes")
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-kitchen.js", "../quest-merge.js", "../quest-meals.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const K = ctx.QuestKitchen, M = ctx.QuestMerge, QM = ctx.QuestMeals;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));
const T0 = Date.parse("2026-10-20T16:00:00Z"), H = 3600000, D = 86400000;   // 6 PM in Madrid
const at = (h) => new Date(T0 + h * H).toISOString();
const DISHES = QM.DISHES.concat(QM.IDEAS);
const TZ = "Europe/Madrid";
const byName = (k, name, kit) => K.items(k, kit).find((x) => x.name === name);

test("d35 bring: the travel picker lists Home items and a short travel starter list, each on its travel shelf", () => {
  const rows = K.pickList({}, "travel", "bring", T0, T0 + 2 * D, DISHES);
  const names = rows.map((r) => r.name);
  assert.ok(names.includes("Broccoli") && names.includes("Oats"), "Home items are offered");
  assert.ok(K.TRAVEL_STARTER.length >= 8 && K.TRAVEL_STARTER.length <= 20, "a short starter list");
  for (const [, , n] of K.TRAVEL_STARTER) assert.ok(names.some((x) => K.keyOf(x) === K.keyOf(n)), `${n} is offered`);
  assert.equal(new Set(rows.map((r) => K.keyOf(r.name))).size, rows.length, "each food once");
  assert.equal(byNameRow(rows, "Broccoli").shelf, "cool");   // Home fridge -> Cool box
  assert.equal(byNameRow(rows, "Peas").shelf, "cool");       // freezer -> Cool box
  assert.equal(byNameRow(rows, "Oats").shelf, "dry");        // pantry -> Dry bag
  assert.ok(rows.every((r) => !r.top), "nothing pinned on top when bringing");
});
function byNameRow(rows, n) { return rows.find((r) => r.name === n); }

test("d35 + d36: Add N items brings the ticked ones at Plenty, and Home's levels do not change", () => {
  let k = K.tap({}, "h:oats", at(-48));          // Home: oats at Plenty
  k = K.tap(k, "h:oats", at(-24));                // then Half
  const homeBefore = J(K.items(k, "home"));
  const rows = K.pickList(k, "travel", "bring", T0, T0 + 2 * D, DISHES);
  const pick = ["Oats", "Broccoli", "Bananas"].map((n) => rows.find((r) => K.keyOf(r.name) === K.keyOf(n)));
  const r = K.fill(k, "travel", pick, at(0), "bring");
  assert.equal(r.n, 3);
  const tr = K.items(r.K, "travel");
  assert.equal(tr.length, 3);
  assert.ok(tr.every((x) => x.lv === 3), "all at Plenty");
  assert.equal(byName(r.K, "Oats", "travel").shelf, "dry");
  assert.equal(byName(r.K, "Broccoli", "travel").shelf, "cool");
  assert.equal(byName(r.K, "Broccoli", "travel").em, "🥦", "keeps Home's icon");
  assert.deepEqual(J(K.items(r.K, "home")), homeBefore, "d36: Home is untouched");
});

test("d35 buy: the list items come first, then everything in the kitchen (grey and Out too); travel adds the Home catalogue", () => {
  let k = {};
  for (const n of ["spinach", "oats", "tahini"]) k = K.tap(k, "h:" + n, at(-200));
  for (let i = 0; i < 3; i++) k = K.tap(k, "h:tahini", at(-100 + i));   // tahini down to Out
  const rows = K.pickList(k, "home", "buy", T0, T0 + 7 * D, DISHES);
  const top = rows.filter((r) => r.top).map((r) => r.name);
  assert.ok(top.includes("Tahini") && top.includes("Spinach"), "what is on the shopping list comes first: " + top.join(", "));
  assert.ok(rows.findIndex((r) => !r.top) > rows.findLastIndex((r) => r.top), "list rows before the rest");
  assert.ok(rows.some((r) => r.name === "Broccoli" && !r.top), "grey items are offered");
  assert.equal(rows.length, K.items(k, "home").length, "every home item once");
  assert.ok(rows.every((r) => r.item), "home buy rows point at the item they will fill");
  // travel: its own items first, plus the Home catalogue for anything it does not have
  let t = K.fill({}, "travel", [{ name: "Hummus", group: "Legumes and grains", shelf: "cool" }], at(-50), "bring").K;
  const tr = K.pickList(t, "travel", "buy", T0, T0 + 2 * D, DISHES);
  assert.ok(tr.some((r) => r.name === "Hummus" && r.item), "the travel item");
  assert.ok(tr.some((r) => r.name === "Broccoli" && !r.item && r.shelf === "cool"), "the Home catalogue, on its travel shelf");
});

test("d35: an item already there is set to Plenty, its run-low clock restarts and its shopping tick clears", () => {
  let k = K.tap({}, "h:spinach", at(-96));
  k = K.tap(k, "h:spinach", at(-72));
  k = K.tap(k, "h:spinach", at(-48));            // Low
  k = K.tick(k, "h:spinach", at(-1));
  k = K.tap(k, "h:oats", at(-200));               // Plenty already, bought more
  const rows = K.pickList(k, "home", "buy", T0, T0 + 7 * D, DISHES);
  const r = K.fill(k, "home", rows.filter((x) => ["Spinach", "Oats"].includes(x.name)), at(0), "buy");
  const sp = K.item(r.K, "h:spinach"), oa = K.item(r.K, "h:oats");
  assert.equal(sp.lv, 3);
  assert.equal(Date.parse(sp.since), T0, "spinach clock restarts");
  assert.equal(Date.parse(sp.fresh), T0, "fresh again");
  assert.equal(oa.lv, 3);
  assert.equal(Date.parse(oa.since), T0, "oats was Plenty: its clock still restarts");
  assert.ok(K.lowAt(oa, T0) > T0 + 10 * D, "oats will not be low for a while");
  assert.equal(K.shopList(r.K, "home", T0, T0 + 7 * D, DISHES).groups.flatMap((g) => g.list).some((x) => x.on), false, "ticks cleared");
  assert.equal(K.items(r.K, "home").length, K.items(k, "home").length, "no second tile");
  // a rebuy at Plenty starts a new cycle, so the next drop is timed from it
  let p = K.tap(r.K, "h:oats", at(24 * 5));      // Half 5 days after the shop
  assert.ok(Math.abs(K.pace(K.item(p, "h:oats")) - (15 + 5) / 2) < 0.01, "pace learns 5 days from the rebuy, not 200 hours");
});

test("d35: something new (typed) lands at Plenty on the shelf it was given; a repeat name in the batch counts once", () => {
  const r = K.fill({}, "home", [{ name: "Miso", group: "Drinks and ferments", shelf: "fridge" }, { name: "miso" }], at(0), "buy");
  assert.equal(r.n, 1);
  const m = byName(r.K, "Miso", "home");
  assert.equal(m.lv, 3); assert.equal(m.shelf, "fridge"); assert.equal(m.group, "Drinks and ferments");
  // no shelf given: Fridge / Pantry at home by the group guess; Cool box / Dry bag in travel
  const r2 = K.fill({}, "travel", [{ name: "Cashews" }, { name: "Raspberries" }], at(0), "buy");
  assert.equal(byName(r2.K, "Cashews", "travel").shelf, "dry");
  assert.equal(byName(r2.K, "Raspberries", "travel").shelf, "cool");
  // a home catalogue item that was grey: keeps its own shelf
  const r3 = K.fill({}, "home", [{ name: "Peas" }], at(0), "buy");
  assert.equal(K.item(r3.K, "h:peas").shelf, "freezer");
  assert.equal(K.item(r3.K, "h:peas").lv, 3);
});

test("d35: one undo takes back the whole batch: new ones gone, old ones back to their level and tick, the pace untouched", () => {
  let k = K.tap({}, "h:spinach", at(-96));
  k = K.tap(k, "h:spinach", at(-48));            // Half
  k = K.tick(k, "h:spinach", at(-1));
  const before = J(k);
  const r = K.fill(k, "home", [{ name: "Spinach", item: "h:spinach" }, { name: "Broccoli", item: "h:broccoli" }, { name: "Miso" }], at(0), "buy");
  assert.equal(r.n, 3);
  const u = K.unfill(r.K, r.undo, at(0.01));
  assert.equal(K.item(u, "h:spinach").lv, 2);
  assert.equal(K.item(u, "h:spinach").since, K.item(before, "h:spinach").since);
  assert.equal(K.item(u, "h:broccoli").lv, null, "grey again");
  assert.equal(byName(u, "Miso", "home"), undefined, "the new one is gone");
  assert.equal(K.shopList(u, "home", T0, T0 + 7 * D, DISHES).groups.flatMap((g) => g.list).find((x) => x.it.id === "h:spinach").on, true, "tick back");
  assert.equal(K.pace(K.item(u, "h:spinach")), K.pace(K.item(before, "h:spinach")), "the undone shop teaches nothing");
  // the other device saw the shop before the undo: the merge keeps the undo (later) and the pace still ignores the shop
  const m = M.mergeKitchen(r.K, u);
  assert.equal(K.item(m, "h:spinach").lv, 2);
  assert.equal(K.pace(K.item(m, "h:spinach")), K.pace(K.item(before, "h:spinach")));
  assert.equal(byName(m, "Miso", "home"), undefined);
});

test("d35 seam: a later filler (a receipt) can pre-tick the same picker by names; unknown names become new rows", () => {
  const rows = K.pickList({}, "home", "buy", T0, T0 + 7 * D, DISHES);
  const p = K.preTick(rows, ["Broccoli", "baby spinach", "Miso paste"]);
  assert.deepEqual(J(p.on.map((id) => rows.find((r) => r.id === id).name).sort()), ["Broccoli", "Spinach"]);
  assert.deepEqual(J(p.extra.map((x) => x.name)), ["Miso paste"]);
  assert.match(fs.readFileSync(fileURLToPath(new URL("../quest-kitchen.js", import.meta.url)), "utf8"), /receipt[^\n]*\n[\s\S]{0,400}function preTick/, "the seam is named");
});

test("d37: the shop line says Shopping today during or after a Groceries block, and never 'no Groceries block' then", () => {
  const blk = { t: "Groceries", s: Date.parse("2026-10-20T12:30:00Z"), e: Date.parse("2026-10-20T13:00:00Z") };   // 2:30 to 3 PM Madrid
  const fmt = (x) => new Date(x).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  const during = Date.parse("2026-10-20T12:45:00Z"), after = Date.parse("2026-10-20T13:05:00Z");
  for (const t of [during, after]) {
    const w = K.shopWhen([blk], t, "travel", TZ, blk, fmt);
    assert.equal(w, "Shopping today · next shop not on the calendar yet");
    assert.ok(!/no Groceries block/i.test(K.shopUpto([blk], t, "travel", TZ, blk, fmt)), "the list hint agrees");
  }
  // opened from the card (no block) after the shop: still reads as shopped today
  assert.equal(K.shopWhen([blk], after, "travel", TZ, null, fmt), "Shopping today · next shop not on the calendar yet");
  // a later shop on the calendar
  const fri = { t: "Groceries", s: Date.parse("2026-10-23T08:00:00Z"), e: Date.parse("2026-10-23T08:30:00Z") };
  assert.equal(K.shopWhen([blk, fri], after, "travel", TZ, blk, fmt), "Shopping today · next shop Fri 10:00 AM");
  assert.match(K.shopUpto([blk, fri], after, "travel", TZ, blk, fmt), /before your next shop \(Fri 10:00 AM\)/);
  // no shop today and none ahead: plain words, no "no Groceries block"
  assert.equal(K.shopWhen([], after, "home", TZ, null, fmt), "next shop not on the calendar yet");
  assert.equal(K.shopUpto([], after, "home", TZ, null, fmt), "in the next 7 days (next shop not on the calendar yet)");
  // a Groceries block yesterday is not today's shop
  const yday = { t: "Groceries", s: blk.s - D, e: blk.e - D };
  assert.equal(K.shopWhen([yday], after, "home", TZ, yday, fmt), "next shop not on the calendar yet");
  // a shop later today: as before
  const later = { t: "Groceries", s: Date.parse("2026-10-20T17:00:00Z"), e: Date.parse("2026-10-20T17:30:00Z") };
  assert.equal(K.shopWhen([later], after, "home", TZ, later, fmt), "shopping today 7:00 PM");
  assert.ok(!/no Groceries block in the next few days/.test(html), "the old line is gone from the page");
});

test("d35: the page wires the picker: bring when the travel fridge is empty, buy after a Groceries block, buttons, one undo", () => {
  const sheet = html.slice(html.indexOf("function openKitchen"), html.indexOf("function kitShelves"));
  assert.match(sheet, /What did you bring\?/);
  assert.match(sheet, /What did you buy\?/);
  assert.match(sheet, /Add from Home/);
  assert.match(sheet, /QK\(\)\.fill\(/);
  assert.match(sheet, /undoToast\([^;]*QK\(\)\.unfill\(/);
  assert.match(sheet, /QK\(\)\.shopWhen\(/);
  assert.match(sheet, /QK\(\)\.preTick\(/);
});
