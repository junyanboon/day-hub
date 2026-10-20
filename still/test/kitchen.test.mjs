// node --test still/test/*.test.mjs   (the kitchen tracker, Junyan 2026-10-20, d21, d25 to d31)
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
const T0 = Date.parse("2026-10-20T16:00:00Z"), H = 3600000, D = 86400000;
const at = (h) => new Date(T0 + h * H).toISOString();
const DISHES = QM.DISHES.concat(QM.IDEAS);
const lv = (k, name, kit = "home") => (K.items(k, kit).find((x) => x.name === name) || {}).lv;
const id = (k, name, kit = "home") => K.items(k, kit).find((x) => x.name === name).id;

test("Home starts from the catalogue, every item grey (not checked); the travel fridge starts empty", () => {
  const home = K.items({}, "home");
  assert.equal(home.length, K.SEED.length);
  assert.ok(home.every((x) => x.lv == null));
  assert.deepEqual(J([...new Set(home.map((x) => x.shelf))]), ["fridge", "freezer", "pantry"]);
  assert.equal(K.items({}, "travel").length, 0);
  const c = K.counts({}, "home", T0, T0 + 7 * D);
  assert.deepEqual(J(c), { total: K.SEED.length, unchecked: K.SEED.length, low: 0, soon: 0 });
  assert.equal(K.shopList({}, "home", T0, T0 + 7 * D, DISHES).count, 0);   // grey is never on the list
});

test("one tap steps down: grey to Plenty, then Half, Low, Out, and back to Plenty", () => {
  let k = {};
  const b = id(k, "Broccoli"), seq = [];
  for (let i = 0; i < 5; i++) { k = K.tap(k, b, at(i * 24)); seq.push(lv(k, "Broccoli")); }
  assert.deepEqual(seq, [3, 2, 1, 0, 3]);
  assert.deepEqual(J(K.LEVELS), ["Out", "Low", "Half", "Plenty"]);
});

test("two quick taps are one answer, so the pace is not learned from minutes", () => {
  let k = K.tap({}, "h:spinach", at(0));
  k = K.tap(k, "h:spinach", at(0.05));   // "Plenty, no, Half"
  const it = K.item(k, "h:spinach");
  assert.equal(it.lv, 2);
  assert.equal(it.hist.length, 1);
  assert.equal(K.pace(it), 3);   // still the fresh default
});

test("Looks right turns a shelf's grey items to Plenty, keeps the rest, and marks the shelf checked", () => {
  let k = K.tap({}, "h:broccoli", at(0)); k = K.tap(k, "h:broccoli", at(1));   // Half
  k = K.looksRight(k, "home", "fridge", at(2));
  assert.equal(lv(k, "Broccoli"), 2);
  assert.equal(lv(k, "Spinach"), 3);
  assert.equal(lv(k, "Cumin"), null);   // another shelf
  assert.equal(K.shelfAt(k, "home", "fridge"), at(2));
  assert.equal(K.item(k, "h:broccoli").seen, at(2));
});

test("run-low: fresh food defaults fast, pantry slow, and the estimate learns his own pace", () => {
  let k = K.setLevel({}, "h:spinach", 3, at(0), "buy");
  let it = K.item(k, "h:spinach");
  assert.equal(K.pace(it), 3);
  assert.equal(K.lowAt(it, T0), T0 + 2 * 3 * D);   // Plenty to Low is two steps
  k = K.setLevel(k, "h:cumin", 3, at(0), "buy");
  assert.equal(K.pace(K.item(k, "h:cumin")), 15);
  assert.equal(K.pace(K.item(K.setLevel(k, "h:apples", 3, at(0), "buy"), "h:apples")), 15);   // apples keep a month
  // he goes through spinach in a day: Plenty, then Low 24 hours later
  k = K.setLevel(k, "h:spinach", 1, at(24), "tap");
  it = K.item(k, "h:spinach");
  assert.equal(K.pace(it), (3 + 0.5) / 2);   // the default and one cycle of 0.5 days a step
  // next cycle learns more
  k = K.setLevel(k, "h:spinach", 3, at(48), "buy");
  k = K.setLevel(k, "h:spinach", 1, at(72), "tap");
  assert.equal(K.pace(K.item(k, "h:spinach")), (3 + 0.5 + 0.5) / 3);
  k = K.setLevel(k, "h:spinach", 3, at(96), "buy");
  assert.equal(K.lowAt(K.item(k, "h:spinach"), T0), T0 + 96 * H + 2 * (4 / 3) * D);
  assert.equal(K.lowAt(K.item(k, "h:spinach"), T0), K.lowAt(K.item(k, "h:spinach"), T0 + 5 * D));
  assert.equal(K.lowAt(K.item({}, "h:spinach"), T0), null);   // not checked: no estimate
});

test("use first: fresh food expected to turn within 2 days; no shelf life text anywhere", () => {
  let k = K.setLevel({}, "h:spinach", 3, at(0), "buy");   // spinach keeps 4 days
  k = K.setLevel(k, "h:carrots", 3, at(0), "buy");
  assert.deepEqual(J(K.useFirst(k, "home", T0).map((x) => x.it.name)), []);
  assert.deepEqual(J(K.useFirst(k, "home", T0 + 2.5 * D).map((x) => x.it.name)), ["Spinach"]);
  assert.ok(!/stays fresh|recipe ideas will start/i.test(fs.readFileSync(fileURLToPath(new URL("../quest-kitchen.js", import.meta.url)), "utf8") + html));
});

test("ingredient names match kitchen items (d21: Black lentils, dry is Black lentils)", () => {
  const pairs = { "Black lentils, dry": "Black lentils", "Shiitake mushrooms": "Shiitake", "Fresh ginger, grated": "Ginger",
    Lime: "Limes", "Ground cumin": "Cumin", "Extra virgin olive oil": "Olive oil", "Macadamia nuts, ground": "Macadamias",
    "Ground flaxseed": "Ground flax", "Cocoa powder": "Cocoa", "Green or brown lentils, dry": "Green lentils",
    "Baby spinach": "Spinach", "Fresh parsley": "Parsley", "Almonds, soaked": "Almonds", "Chickpeas, cooked": "Chickpeas",
    Carrot: "Carrots", "Quinoa, dry": "Quinoa", "White beans, cooked": "White beans", "Cherry tomatoes": "Tomatoes",
    Blueberries: "Blueberries", Cherries: "Cherries", "Brazil nuts": "Brazil nuts", Lemon: "Lemons" };
  for (const [ing, name] of Object.entries(pairs)) assert.equal((K.match({}, "home", ing) || {}).name, name, ing);
  assert.equal(K.match({}, "home", "Sunflower lecithin"), null);
  assert.equal(K.match({}, "home", "Broccoli").name, "Broccoli");   // not Frozen broccoli
});

test("a dinner tick steps the item down one level; the untick puts it back", () => {
  let k = K.setLevel({}, "h:broccoli", 3, at(0), "buy");
  let r = K.dinner(k, "home", "m1|sv|Broccoli", "Broccoli", true, at(30));
  assert.equal(lv(r.K, "Broccoli"), 2); assert.equal(r.id, "h:broccoli");
  assert.equal(lv(K.dinner(r.K, "home", "m1|sv|Broccoli", "Broccoli", true, at(31)).K, "Broccoli"), 2);   // once per tick
  r = K.dinner(r.K, "home", "m1|sv|Broccoli", "Broccoli", false, at(32));
  assert.equal(lv(r.K, "Broccoli"), 3);
  assert.equal(K.pace(K.item(r.K, "h:broccoli")), 3);   // the take-back teaches nothing
  // the same tick again counts again
  r = K.dinner(r.K, "home", "m1|sv|Broccoli", "Broccoli", true, at(33));
  assert.equal(lv(r.K, "Broccoli"), 2);
  // a level he set by hand since the tick stands
  k = K.setLevel(r.K, "h:broccoli", 0, at(34), "tap");
  assert.equal(lv(K.dinner(k, "home", "m1|sv|Broccoli", "Broccoli", false, at(35)).K, "Broccoli"), 0);
  // grey items are left alone, and the travel fridge is its own kitchen
  assert.equal(K.dinner({}, "home", "m1|sv|Hemp seeds", "Hemp seeds", true, at(1)).id, null);
  assert.equal(K.dinner(K.setLevel({}, "h:broccoli", 3, at(0), "buy"), "travel", "m2|sv|Broccoli", "Broccoli", true, at(1)).id, null);
  // a dinner teaches the pace too: Plenty on day 0, Half after a dinner on day 2
  k = K.setLevel({}, "h:quinoa", 3, at(0), "buy");
  k = K.dinner(k, "home", "x", "Quinoa, dry", true, at(48)).K;
  assert.equal(K.pace(K.item(k, "h:quinoa")), (15 + 2) / 2);
});

test("the shopping list: low and out, plus what runs low before the next Groceries block, by shelf, with amounts", () => {
  let k = {};
  k = K.setLevel(k, "h:broccoli", 0, at(0), "tap");
  k = K.setLevel(k, "h:chickpeas", 1, at(0), "tap");
  k = K.setLevel(k, "h:spinach", 2, at(0), "tap");   // Half: low in 3 days
  k = K.setLevel(k, "h:cumin", 3, at(0), "tap");     // Plenty, slow: weeks
  const shop = K.nextShop([{ t: "Groceries", s: at(4 * 24) }, { t: "Dinner", s: at(5) }], T0, "home");
  assert.equal(shop.at, T0 + 4 * D);
  const L = K.shopList(k, "home", T0, shop.at, DISHES);
  assert.deepEqual(J(L.groups.map((g) => [g.shelf.id, g.list.map((r) => [r.it.name, r.why])])),
    [["fridge", [["Broccoli", "out"], ["Spinach", "soon"]]], ["pantry", [["Chickpeas", "low"]]]]);
  assert.equal(L.dinners, 4);
  const br = L.groups[0].list[0];
  assert.equal(br.amt, "2 kg");   // Super Veggie's 500 g, four dinners
  assert.deepEqual(J(br.uses.map((u) => u.dish)), ["Super Veggie", "Quinoa, broccoli and white beans"]);
  assert.equal(L.groups[1].list[0].amt, "1.6 kg");
  // no Groceries block in sight: a week at home, 2 days on a trip
  assert.equal(K.nextShop([], T0, "home").at, T0 + 7 * D);
  assert.equal(K.nextShop([{ t: "Groceries", s: at(-1) }], T0, "travel").at, T0 + 2 * D);
  // a shop coming up in the next 12 hours (or on now) is the one this list is for: it plans to the shop after it
  const two = K.nextShop([{ t: "Groceries", s: at(3) }, { t: "Groceries", s: at(50) }], T0, "home");
  assert.deepEqual(J([two.at, two.soon.s]), [T0 + 50 * H, at(3)]);
  const now = K.nextShop([{ t: "Groceries", s: at(-0.5), e: at(0.5) }], T0, "home");
  assert.deepEqual(J([now.at, now.block, now.soon.s]), [T0 + 7 * D, null, at(-0.5)]);
  // spoons are not scaled
  assert.equal(K.amountFor("Cumin", DISHES, 3).amt, null);
  assert.equal(K.amountFor("Cumin", DISHES, 3).uses.length, 3);
});

test("tick while shopping, then Mark ticked items as plenty", () => {
  let k = K.setLevel({}, "h:broccoli", 0, at(0), "tap");
  k = K.setLevel(k, "h:limes", 1, at(0), "tap");
  k = K.tick(k, "h:broccoli", at(1));
  assert.equal(K.shopList(k, "home", T0, T0 + 7 * D, DISHES).groups[0].list.find((r) => r.it.name === "Broccoli").on, true);
  const r = K.buyTicked(k, "home", at(2));
  assert.equal(r.n, 1);
  assert.equal(lv(r.K, "Broccoli"), 3);
  assert.equal(lv(r.K, "Limes"), 1);
  assert.equal(K.item(r.K, "h:broccoli").fresh, at(2));
  assert.equal(r.K.shop["h:broccoli"].on, false);
});

test("add, rename, move and delete; a deleted catalogue item stays gone", () => {
  let r = K.add({}, "travel", "cool", "Hummus", at(0));
  assert.equal(lv(r.K, "Hummus", "travel"), 3);
  const again = K.add(K.setLevel(r.K, r.id, 1, at(1), "tap"), "travel", "dry", "hummus", at(2));
  assert.equal(again.id, r.id); assert.equal(K.items(again.K, "travel").length, 1); assert.equal(lv(again.K, "Hummus", "travel"), 3);
  let k = K.rename(again.K, r.id, "Beet hummus", at(3));
  k = K.move(k, r.id, "dry", at(4));
  assert.deepEqual(J([K.item(k, r.id).name, K.item(k, r.id).shelf]), ["Beet hummus", "dry"]);
  k = K.remove(k, "h:kale", at(5));
  assert.equal(K.items(k, "home").some((x) => x.name === "Kale"), false);
  k = K.add(k, "home", "fridge", "Kale", at(6)).K;
  assert.equal(lv(k, "Kale"), 3);
});

test("the travel fridge is in use on travel days or by his pick; a trip's end asks once and brings ticked items home", () => {
  assert.equal(K.active({}, "2026-10-20", "travel"), "travel");
  assert.equal(K.active({}, "2026-10-20", "home"), "home");
  let k = K.pick({}, "travel", "2026-10-20", at(0));
  assert.equal(K.active(k, "2026-10-20", "home"), "travel");
  assert.equal(K.active(k, "2026-10-21", "home"), "home");   // a pick lasts the day
  k = K.noteActive({}, "2026-10-20", "travel");
  assert.equal(K.noteActive(k, "2026-10-20", "travel"), null);
  k = K.add(k, "travel", "cool", "Spinach", at(0)).K;
  k = K.add(k, "travel", "dry", "Peanut butter", at(0)).K;
  k = K.add(k, "travel", "cool", "Yogurt", at(0)).K;
  k = K.setLevel(k, id(k, "Spinach", "travel"), 2, at(1), "tap");
  k = K.setLevel(K.setLevel(k, "h:spinach", 1, at(1), "tap"), "h:limes", 1, at(1), "tap");
  assert.equal(K.tripEnd(k, "2026-10-20", "home").ask, false);   // still the trip's day
  const end = K.tripEnd(k, "2026-10-21", "home");
  assert.equal(end.ask, true);
  assert.deepEqual(J(end.items.map((x) => x.name).sort()), ["Peanut butter", "Spinach", "Yogurt"]);
  const done = K.bringHome(k, [id(k, "Spinach", "travel"), id(k, "Peanut butter", "travel")], at(30));
  assert.equal(K.items(done, "travel").length, 0);
  assert.equal(lv(done, "Spinach"), 2);   // the higher level of the two
  const pb = K.items(done, "home").find((x) => x.name === "Peanut butter");
  assert.deepEqual(J([pb.shelf, pb.lv]), ["pantry", 3]);
  assert.equal(K.items(done, "home").some((x) => x.name === "Yogurt"), false);
  assert.equal(K.tripEnd(done, "2026-10-21", "home").ask, false);   // asked once
  assert.equal(K.tripEnd(done, "2026-10-25", "home").ask, false);
});

test("merge: two devices changing different items both keep theirs; the later change wins one item; deletes stick", () => {
  const base = K.setLevel({}, "h:broccoli", 3, at(0), "buy");
  let a = K.setLevel(base, "h:broccoli", 2, at(5), "tap");           // phone
  a = K.remove(a, "h:kale", at(6));
  let b = K.setLevel(base, "h:spinach", 1, at(4), "tap");            // Mac
  b = K.setLevel(b, "h:broccoli", 1, at(3), "tap");                   // older than the phone's
  b = K.setLevel(b, "h:kale", 3, at(2), "tap");                       // before the phone deleted it
  b = K.tick(b, "h:spinach", at(4));
  const ga = { xp: 1, ts: 10, kitchen: a, day: null }, gb = { xp: 1, ts: 20, kitchen: b, day: null };
  for (const m of [M.mergeQuest(ga, gb).kitchen, M.mergeQuest(gb, ga).kitchen]) {
    assert.equal(lv(m, "Broccoli"), 2);
    assert.equal(lv(m, "Spinach"), 1);
    assert.equal(K.items(m, "home").some((x) => x.name === "Kale"), false);
    assert.equal(m.shop["h:spinach"].on, true);
    assert.equal(K.items(m, "home").length, K.SEED.length - 1);
  }
  // one side has no kitchen yet (an older page): the other's is kept whole
  assert.deepEqual(J(M.mergeQuest({ xp: 1, ts: 30, day: null }, gb).kitchen), J(b));
  // a dinner taken back on one device is not brought back by the other's copy of the tick
  let p = K.setLevel({}, "h:quinoa", 3, at(0), "buy");
  const ticked = K.dinner(p, "home", "k", "Quinoa", true, at(48)).K;
  const undone = K.dinner(ticked, "home", "k", "Quinoa", false, at(49)).K;
  const m = M.mergeKitchen(undone, ticked);
  assert.equal(lv(m, "Quinoa"), 3);
  assert.equal(K.pace(K.item(m, "h:quinoa")), 15);
  // the shelves keep the later check, the trip the later day
  const s = M.mergeKitchen({ shelves: { "home:fridge": at(1) }, trip: { last: "2026-10-20" } }, { shelves: { "home:fridge": at(0) }, trip: { last: "2026-10-19", done: "2026-10-19" } });
  assert.deepEqual(J([s.shelves["home:fridge"], s.trip.last, s.trip.done]), [at(1), "2026-10-20", "2026-10-19"]);
});

test("the page wires it: Groceries blocks open the kitchen, a Kitchen card, dinner ticks, no receipt button", () => {
  assert.ok(/<script src="quest-kitchen\.js\?v=\w+"><\/script>/.test(html), "script tag");
  assert.ok(html.includes('if (isGroceries(b)) return "kitchen";'), "Groceries route");
  assert.ok(html.includes("kitchenHTML()"), "Kitchen card");
  assert.ok(html.includes("QK().dinner("), "dinner ticks");
  assert.ok(html.includes("QK().NEED"), "needs line");
  assert.ok(!/📷|Fill from a receipt/i.test(html), "no receipt button (d29: later, no placeholder)");
  assert.ok(html.indexOf('if (isGroceries(b)) return "kitchen";') < html.indexOf('if (isMeal(b)) return "meal";'));
});

test("the day word reads in his zone", () => {
  const now = Date.parse("2026-10-20T10:00:00Z");   // a Tuesday
  assert.equal(K.dayWord(now + 2 * H, now, "Europe/Madrid"), "today");
  assert.equal(K.dayWord(now + D, now, "Europe/Madrid"), "tomorrow");
  assert.equal(K.dayWord(now + 3 * D, now, "Europe/Madrid"), "Fri");
  assert.equal(K.dayWord(now - D, now, "Europe/Madrid"), "today");
});

test("a bad level in synced state reads as not checked, never throws", () => {
  const k = { items: { "h:kale": { id: "h:kale", k: "home", shelf: "fridge", name: "Kale", lv: 7, at: at(0) }, x: { id: "x", k: "home", shelf: "fridge", lv: 2 } } };
  assert.equal(lv(k, "Kale"), null);
  assert.equal(K.item(k, "h:kale").lv, null);
  assert.equal(K.items(k, "home").length, K.SEED.length);   // a nameless item is skipped
});
