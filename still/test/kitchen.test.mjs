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
  // grey is never on the list, and the catalogue has a food for every core recipe part, so nothing is added (d59)
  assert.equal(K.shopList({}, "home", T0, T0 + 7 * D, DISHES).count, 0);
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

test("d32: no Looks right on a shelf; a grey item's first tap means Plenty, and the Not checked filter finds the grey ones", () => {
  assert.equal(K.looksRight, undefined);
  assert.ok(!/Looks right|data-kok/.test(html), "no Looks right button on the page");
  let k = K.tap({}, "h:spinach", at(0));
  assert.equal(lv(k, "Spinach"), 3);
  const grey = K.items(k, "home").filter((x) => K.shows(x, "new", T0, T0 + 7 * D));
  assert.equal(grey.length, K.SEED.length - 1);
  assert.equal(grey.some((x) => x.name === "Spinach"), false);
});

test("d34: the catalogue lands in the right food groups (ordered, whole-word rules)", () => {
  const want = { "Chickpeas": "Legumes and grains", "Peas": "Vegetables", "Coconut yogurt": "Drinks and ferments",
    "Macadamia milk": "Drinks and ferments", "Macadamias": "Nuts and seeds", "Brazil nuts": "Nuts and seeds",
    "Seeded bread": "Legumes and grains", "Ground flax": "Nuts and seeds", "Pumpkin seeds": "Nuts and seeds",
    "Red peppers": "Vegetables", "Ginger": "Vegetables", "Ginger tea": "Drinks and ferments", "Olive oil": "Oils, vinegars and sweet",
    "Olives": "Vegetables", "Apple cider vinegar": "Oils, vinegars and sweet", "Apples": "Fruit", "Frozen berries": "Fruit",
    "Cherries": "Fruit", "Parsley": "Herbs", "Cocoa": "Spices", "Sea salt": "Spices", "Honey": "Oils, vinegars and sweet",
    "Tahini": "Oils, vinegars and sweet", "Sauerkraut": "Drinks and ferments", "Electrolytes": "Drinks and ferments",
    "Pomegranate juice": "Drinks and ferments", "Basmati rice": "Legumes and grains", "Oats": "Legumes and grains" };
  const home = K.items({}, "home");
  for (const [name, g] of Object.entries(want)) assert.equal(home.find((x) => x.name === name).group, g, name);
  assert.ok(home.every((x) => x.group !== "Other"), "every catalogue item has a real group: " + home.filter((x) => x.group === "Other").map((x) => x.name));
  assert.equal(K.guessGroup("Black pepper"), "Spices");
  assert.equal(K.guessGroup("Peanut butter"), "Nuts and seeds");
  assert.equal(K.guessGroup("Eggs"), "Other");
  assert.equal(K.guessGroup("Rice vinegar"), "Oils, vinegars and sweet");
  assert.equal(K.guessGroup("Oat milk"), "Drinks and ferments");
  assert.deepEqual(J(K.GROUP_NAMES), ["Vegetables", "Fruit", "Herbs", "Legumes and grains", "Nuts and seeds", "Spices",
    "Oils, vinegars and sweet", "Drinks and ferments", "Other"]);
});

test("d34: inside a shelf, groups in order and each alphabetical, so a tap never moves a tile", () => {
  let k = {};
  const order = (kk) => K.grouped(K.items(kk, "home").filter((x) => x.shelf === "fridge")).flatMap((g) => g.list.map((x) => x.name));
  const before = order(k);
  for (const n of ["Spinach", "Kale", "Avocados"]) k = K.tap(K.tap(k, id(k, n), at(0)), id(k, n), at(30));
  assert.deepEqual(J(order(k)), J(before));
  const g = K.grouped(K.items(k, "home").filter((x) => x.shelf === "fridge"));
  assert.deepEqual(J(g.map((x) => x.group)), ["Vegetables", "Fruit", "Herbs", "Nuts and seeds", "Drinks and ferments"]);
  const veg = g[0].list.map((x) => x.name);
  assert.deepEqual(J(veg), J([...veg].sort((a, b) => a.localeCompare(b))));
});

test("d34: each item keeps its own group; adding takes the picked group, else the guess; shelf guess from the group", () => {
  let k = K.place({}, "h:ginger", null, "Spices", at(1));
  assert.equal(K.item(k, "h:ginger").group, "Spices");
  assert.equal(K.item(k, "h:ginger").shelf, "fridge");
  k = K.tap(k, "h:ginger", at(2));   // a level change keeps the group he gave it
  k = K.rename(k, "h:ginger", "Fresh ginger root", at(3));
  assert.equal(K.item(k, "h:ginger").group, "Spices");
  let r = K.add(k, "home", "pantry", "Miso paste", at(4));
  assert.equal(K.item(r.K, r.id).group, "Drinks and ferments");
  r = K.add(r.K, "home", "fridge", "Miso paste 2", at(5), "Other");
  assert.equal(K.item(r.K, r.id).group, "Other");
  r = K.add(r.K, "home", "fridge", "Eggs", at(5), "Not a group");
  assert.equal(K.item(r.K, r.id).group, "Other");
  // a deleted item added back keeps the group he gave it when no group is picked
  let d = K.place(r.K, "h:kale", null, "Herbs", at(6)); d = K.remove(d, "h:kale", at(7));
  assert.equal(K.item(K.add(d, "home", "fridge", "Kale", at(8)).K, "h:kale").group, "Herbs");
  assert.equal(K.guessShelf("home", "Herbs"), "fridge");
  assert.equal(K.guessShelf("home", "Spices"), "pantry");
  assert.equal(K.guessShelf("travel", "Fruit"), "cool");
  assert.equal(K.guessShelf("travel", "Legumes and grains"), "dry");
});

test("d34: a drag (place) moves an item's group and, across shelves, its shelf; the same spot or a bad value changes nothing", () => {
  const k0 = K.tap({}, "h:rocket", at(0));
  let k = K.place(k0, "h:rocket", "fridge", "Herbs", at(1));
  assert.deepEqual(J([K.item(k, "h:rocket").shelf, K.item(k, "h:rocket").group, K.item(k, "h:rocket").lv]), ["fridge", "Herbs", 3]);
  k = K.place(k, "h:rocket", "pantry", "Spices", at(2));
  assert.deepEqual(J([K.item(k, "h:rocket").shelf, K.item(k, "h:rocket").group]), ["pantry", "Spices"]);
  assert.equal(K.place(k, "h:rocket", "pantry", "Spices", at(3)), k);
  assert.equal(K.place(k, "h:rocket", "cool", "Herbs", at(3)), k);    // the travel fridge's shelf, not this kitchen's
  assert.equal(K.place(k, "h:rocket", "fridge", "Snacks", at(3)), k);
  // undo is a place back to where it was
  k = K.place(k, "h:rocket", "fridge", "Herbs", at(4));
  assert.deepEqual(J([K.item(k, "h:rocket").shelf, K.item(k, "h:rocket").group]), ["fridge", "Herbs"]);
});

test("d34: a stored group survives the merge both ways and is not lost to a newer device's other change", () => {
  const phone = K.place({}, "h:ginger", "pantry", "Spices", at(5));
  const mac = K.tap({}, "h:spinach", at(4));
  for (const m of [M.mergeKitchen(phone, mac), M.mergeKitchen(mac, phone), M.mergeQuest({ xp: 1, ts: 1, kitchen: phone }, { xp: 1, ts: 2, kitchen: mac }).kitchen]) {
    assert.deepEqual(J([K.item(m, "h:ginger").group, K.item(m, "h:ginger").shelf, K.item(m, "h:spinach").lv]), ["Spices", "pantry", 3]);
  }
  // a later change to the same item on a device that already had the group keeps it
  const later = K.tap(phone, "h:ginger", at(6));
  assert.equal(K.item(M.mergeKitchen(phone, later), "h:ginger").group, "Spices");
});

test("d34: tile status lines and the To buy filter", () => {
  let k = {};
  const shop = T0 + 7 * D;
  const st = (name) => K.status(K.item(k, id(k, name)), T0, shop, "Europe/Madrid");
  assert.equal(st("Spinach"), "Not checked");
  k = K.setLevel(k, "h:quinoa", 3, at(0), "buy");
  assert.equal(st("Quinoa"), "Plenty");
  k = K.setLevel(k, "h:oats", 2, at(0), "buy");
  assert.equal(st("Oats"), "Half");
  k = K.setLevel(k, "h:honey", 1, at(0), "tap"); k = K.setLevel(k, "h:cumin", 0, at(0), "tap");
  assert.equal(st("Honey"), "Low · buy"); assert.equal(st("Cumin"), "Out · buy");
  k = K.setLevel(k, "h:spinach", 2, at(0), "buy");   // fresh food at Half runs low in about 3 days
  assert.match(st("Spinach"), /^Low by (Fri|Thu)$/);
  const buy = K.items(k, "home").filter((x) => K.shows(x, "buy", T0, shop)).map((x) => x.name).sort();
  assert.deepEqual(J(buy), ["Cumin", "Honey", "Spinach"]);
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
  assert.deepEqual(J(L.groups.map((g) => [g.shelf.id, g.list.filter((r) => r.why !== "none").map((r) => [r.it.name, r.why])])),
    [["fridge", [["Broccoli", "out"], ["Spinach", "soon"]]], ["pantry", [["Chickpeas", "low"]]]]);
  assert.equal(L.dinners, 4);
  const br = L.groups[0].list[0];
  assert.equal(br.amt, "700 g");   // Super Veggie's 175 g (2026-10-21), four dinners; its amount comes before an idea's 400 g
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
  assert.ok(html.includes("QK().eat("), "dinner ticks (d44: they take amounts off)");
  assert.ok(html.includes("QK().NEED"), "needs line");
  assert.ok(!/📷|Fill from a receipt/i.test(html), "no receipt button (d29: later, no placeholder)");
  assert.ok(html.indexOf('if (isGroceries(b)) return "kitchen";') < html.indexOf('if (isMeal(b)) return "meal";'));
});

test("d34: the sheet shows fixed tiles in groups, three filters, an add picker and a hold-to-drag that respects reduced motion", () => {
  assert.ok(!/id="kLow"|Low or out<\/button>/.test(html), "the Low or out toggle is replaced");
  for (const f of ['["all", "All"', '["buy", "To buy"', '["new", "Not checked"', 'data-kf="${f}"']) assert.ok(html.includes(f), f);
  assert.ok(html.includes("QK().grouped("), "groups inside each shelf");
  assert.ok(html.includes('class="pips"'), "a 3-bar meter");
  assert.ok(/\.ki \{[^}]*height:\s*5\dpx/.test(html), "every tile has a fixed height");
  assert.ok(/\.ki \.nm \{[^}]*text-overflow:\s*ellipsis/.test(html), "the name stays on one line");
  assert.ok(html.includes('id="kPick"') && html.includes("QK().guessGroup(") && html.includes("QK().guessShelf("), "add picker with guesses");
  assert.ok(html.includes("QK().place("), "drag and Edit save with place");
  assert.ok(/KHOLD_MS\s*=\s*4\d\d/.test(html), "a long press of about 400 ms starts a drag");
  assert.ok(/prefers-reduced-motion: reduce\)[^\n]*\.ki/.test(html), "reduced motion");
  assert.ok(!/QuestFx\.pop\(el\)/.test(html.slice(html.indexOf("function openKitchen"), html.indexOf("function kitDinner"))), "no springy pop on a tile tap");
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
