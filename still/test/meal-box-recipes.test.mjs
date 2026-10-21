// node --test still/test/*.test.mjs   (Junyan, 2026-10-21: "ended up making a dish so I could record what I ate for
// dinner.. but this seems to not make much sense", "the recommended dishes below were not useful at all. Instead maybe
// just recipe cards would be of help.. (food suggestions for travel?)", "the 5 ingredient limits doesn't make any sense")
// d78: a "What did you eat?" box at the top of the meal sheet; his own dish cards lose the count and the separate list.
// d79: recipe cards from his recipe book (the recipe wiki) replace tonight's ideas. d80: a deleted dish stays readable.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-kitchen.js", "../quest-merge.js", "../quest-ideas.js", "../quest-recipe-data.js", "../quest-recipes.js"])
  vm.runInNewContext(fs.readFileSync(here(f), "utf8"), ctx);
const K = ctx.QuestKitchen, QM = ctx.QuestMeals, QR = ctx.QuestRecipes;
const html = fs.readFileSync(here("../quest.html"), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));
const sheet = html.slice(html.indexOf("function openMeal(b)"), html.indexOf("The meal sheet's kitchen parts"));
const opt = { mult: 1, dish: 9, dim: [1, 0.7], dishLimit: 2 };
const R = (id, o = {}) => ({ id, name: id, icon: "🍲", time: "20 min", meal: "dinner", tags: [], items: [["Rice", "100 g"]], steps: ["Cook it."], ...o });

test("d79: the recipe book loads as dishes: rc- ids, items and steps, the Blueprint recipes left out", () => {
  const list = QR.list();
  assert.ok(list.length >= 5, `loaded ${list.length}`);
  assert.ok(list.every((d) => /^rc-[a-z0-9-]+$/.test(d.id) && d.id.length <= 40 && d.recipe && d.items.length && d.steps.length));
  assert.ok(!list.some((d) => d.tags.includes("blueprint")), "Super Veggie and Nutty Pudding are the Blueprint cards already");
  assert.ok(!list.some((d) => d.items.some(([n]) => /\b(onion|garlic|leek|shallot|chive)s?\b/i.test(n.replace(/\bno onion or garlic\b/i, "")))), "his food rules");
  // a synced id must pass the page's id check
  assert.ok(list.every((d) => /^[\w-]{1,40}$/.test(d.id)));
  assert.equal(QR.load(null).length, 0, "no data: no recipes (the page falls back to the ideas)");
  assert.equal(QR.load({ recipes: [R("Bad id!"), R("ok", { items: [] }), R("fine")] }).length, 1, "odd records are skipped");
});

test("d79: travel-friendly comes from the wiki's travel tag, else from the recipe (no oven, few ingredients, 30 min or less)", () => {
  assert.equal(QR.travelRule(), "tag", "the wiki tags travel recipes");
  const tagged = QR.list().filter((d) => QR.isTravel(d));
  assert.ok(tagged.length >= 1 && tagged.every((d) => d.tags.includes("travel")));
  const book = [R("a", { time: "45 min" }), R("b", { tags: ["oven"] }), R("c", { time: "25 min" }), R("d", { steps: ["Roast the peppers."] })].map((r) => QR.load({ recipes: [r] })[0]);
  assert.equal(QR.travelRule(book), "guess");
  assert.deepEqual(book.map((d) => QR.isTravel(d, "guess")), [false, false, true, false]);
  assert.equal(QR.minutes("10 min + 20 min soak"), 30);
  assert.equal(QR.minutes("1 h 15 min"), 75);
});

test("d79: the order: on a trip travel-friendly first, then this meal's recipes, else the book's own order", () => {
  const book = QR.load({ recipes: [R("oats", { meal: "breakfast" }), R("stew", { tags: ["travel"] }), R("dal"), R("bowl", { meal: "any" })] });
  const ids = (l) => l.map((d) => d.rid);
  assert.deepEqual(ids(QR.order(book, { trip: false, meal: "dinner" })), ["stew", "dal", "bowl", "oats"]);
  assert.deepEqual(ids(QR.order(book, { trip: true, meal: "breakfast" })), ["stew", "oats", "bowl", "dal"]);
  assert.deepEqual(ids(QR.order(book, {})), ["oats", "stew", "dal", "bowl"]);
  assert.equal(QR.mealOf("Dinner with Caney"), "dinner");
  assert.equal(QR.mealOf("Lunch"), "lunch");
  assert.equal(QR.mealOf("Meal 2"), null);
});

test("d79: the card's tag line and Cook this: every ingredient but the optional ones", () => {
  const d = QR.load({ recipes: [R("p", { tags: ["gentle", "soft-fiber", "pranic", "travel", "one-pot", "legumes"], items: [["Oats", "90 g"], ["Honey", "1 tsp (optional)"], ["Banana", "1"]] })] })[0];
  assert.equal(QR.tagLine(d), "gentle · soft fibre · one pot");
  assert.deepEqual(J(QR.cookTicks(d)), ["Oats", "Banana"]);
  assert.equal(QR.amtText("1 tsp (optional)"), "1 tsp");
  assert.ok(QR.optional("1 tbsp (optional)") && !QR.optional("1 tbsp"));
  // an optional amount still takes off the kitchen the right way once he ticks it
  assert.equal(K.recipeIn("1 tbsp (optional)", "ml"), 15);
  assert.equal(K.recipeIn("½ tsp", "g"), 1.5);
});

test("d79: Cook this logs a recipe like a dish: one tick list, paid on the ideas' cap, an untick takes its share back", () => {
  const d = QM.dishOf(QR.list()[0].id);
  assert.ok(d && d.recipe, "a recipe id resolves, so a meal ticked on it reads on any day");
  assert.equal(QM.groupOf(d), "idea", "it holds an idea slot, never a Blueprint one");
  const ticks = QR.cookTicks(d);
  const r1 = QM.tick(null, d, ticks, opt);
  assert.deepEqual(J(r1.rec.dish[d.id]), J(ticks));
  const full = Math.round(9 * Math.min(ticks.length, d.items.length) / d.items.length);
  assert.equal(r1.rec.b, full);
  const r2 = QM.tick(r1.rec, d, ticks[0], opt);
  assert.ok(!r2.rec.dish[d.id].includes(ticks[0]) && r2.rec.b < r1.rec.b, "unticked what he did not have");
  const r3 = QM.tick(r2.rec, d, "none", opt);
  assert.equal(r3.rec.b, 0); assert.ok(!r3.rec.dish || !r3.rec.dish[d.id]);
  // the same slot rule as the ideas: a recipe on another meal holds one
  const mealq = { a: r1.rec };
  assert.equal(QM.slotsUsed(mealq, "b", QM.dishOf(QR.list()[1].id)), 1);
});

test("d79: a meal logged against an old idea still reads and keeps its points", () => {
  const r1 = QM.dishOf("r1");
  assert.ok(r1 && r1.items.length);
  const rec = QM.tick(null, r1, "all", opt).rec;
  assert.equal(QM.dishPaid(rec, r1), 9);
  assert.match(sheet, /\.map\(ideaById\)\.filter\(Boolean\)\);/, "an old idea with ticks joins the list under the recipes");
  assert.match(sheet, /\$\{RL\.map\(recipeCard\)\.join\(""\)\}\$\{ideas\.map\(d => dishCard\(d\)\)\.join\(""\)\}/);
});

test("d78: What did you eat? is the first thing on the meal sheet, the same search box, ticked rows with took, Save as a dish", () => {
  const top = sheet.slice(sheet.indexOf("openSheet(`${winHead(b)}"));
  assert.ok(top.indexOf("${eatBox()}") > 0 && top.indexOf("${eatBox()}") < top.indexOf('<div class="mq-tips">'), "above the tips and every card");
  const box = sheet.slice(sheet.indexOf("const eatBox = () =>"), sheet.indexOf("const slotCard ="));
  assert.ok(box.includes("What did you eat?") && box.includes('xSearch(MEAL, "What did you eat?")'));
  assert.match(box, /xRow\(MEAL, x, ""\)/, "a ticked row with took, no 'added' word");
  assert.match(box, /data-msave>Save as a dish</);
  assert.ok(!/function kitMealCard\(|<b>Anything else from the kitchen<\/b>|data-ksave/.test(html), "the old card is gone");
  // the handlers treat the box as a dish of its own, keyed "meal"
  assert.match(sheet, /const xDish = id => id === MEAL\.id \? MEAL : dishById\(id\);/);
  for (const a of ["inp.dataset.xs", "bn.dataset.xoff", "inp.dataset.xq"]) assert.ok(sheet.includes(`xDish(${a})`), a);
  // Save as a dish takes both the box's foods and old From your kitchen ticks
  assert.match(sheet, /QK\(\)\.kitchenFoods\(G\.kitchen, kPre\)/);
  assert.match(sheet, /QM\.extrasOf\(mealRec\(\), MEAL\.id\)\.map\(x => \(\{ name:x\.n, amt:x\.q == null \? "" : QK\(\)\.fmtQ\(x\.q, x\.u\) \}\)\)/);
});

test("d78: a food in What did you eat? takes its amount off through a tick record, pays nothing, and an untick puts it back", () => {
  let k = K.setAmount({}, "h:red-peppers", "3", "2026-10-21T10:00:00Z");
  const id = "h:red-peppers", left = () => K.items(k, "home").find((x) => x.id === id).left, key = "2026-10-21|dinner|meal+|red peppers";
  const p = K.extraParse(k, "home", "red pepper 1");
  assert.equal(p.it && p.it.id, id, "typed text finds the kitchen item");
  k = K.eat(k, "home", key, { id, note: true }, true, "2026-10-21T23:00:00Z", p.q).K;
  assert.equal(left(), 2);
  const rec = QM.addExtra({ sel: ["fveg"], b: 0, p: 2 }, "meal", { n: "Red peppers", q: 1, u: "" });
  assert.deepEqual(J(QM.extrasOf(rec, "meal")), [{ n: "Red peppers", q: 1, u: "" }]);
  assert.equal(rec.b, 0); assert.equal(rec.p, 2);
  k = K.eat(k, "home", key, {}, false, "2026-10-21T23:05:00Z").K;
  assert.equal(left(), 3);
  assert.deepEqual(J(QM.extrasOf(QM.dropExtra(rec, "meal", "red peppers"), "meal")), []);
});

test("d78: his own dish card: no 'N of M ingredients · K added', added foods in the same list with Keep in the dish", () => {
  const card = sheet.slice(sheet.indexOf("const dishCard = (d, fit) =>"), sheet.indexOf("const recipeCard = d =>"));
  assert.match(card, /const sub = d\.own \? \(st\.n \|\| nx \? "On this meal" : "Tap to open"\)/);
  assert.ok(card.includes(": slot ? hint.charAt(0).toUpperCase()"), "a part dish keeps its parts count");
  const rows = sheet.slice(sheet.indexOf("const plainRows = (d, on, fit) =>"), sheet.indexOf("const recipeCard = d =>"));
  assert.match(rows, /xs\.map\(x => xRow\(d, x, "added this time"\)\)\.join\(""\) \+ `<\/div>`/, "inside the same mq-rows");
  assert.match(rows, /d\.own && !d\.del && xs\.length/);
  assert.match(rows, /data-xkeep="\$\{esc\(d\.id\)\}" data-xn="\$\{esc\(x\.n\)\}">Keep \$\{esc\(x\.n\)\} in the dish</);
  assert.ok(!/Also went in/.test(rows), "no separate heading on a plain dish");
  // Keep: the food joins the dish, the extra is put back and the ingredient tick takes the same amount off
  const keep = sheet.slice(sheet.indexOf('querySelectorAll("[data-xkeep]")'), sheet.indexOf('querySelectorAll("[data-rcook]")'));
  assert.ok(keep.indexOf("QK().saveDish(") < keep.indexOf("dropExtraFrom(d, x.n)") && keep.indexOf("dropExtraFrom(d, x.n)") < keep.indexOf("dishTap(bn, d.id, ing[0]"));
  let k = K.saveDish({}, { name: "Red pepper salad", items: [["Red peppers", "2"]] }, "2026-10-21T20:00:00Z");
  const d = K.ownDish(k.K, k.id);
  const k2 = K.saveDish(k.K, { id: d.id, name: d.name, icon: d.icon, items: d.items.concat([["Chickpeas", "200 g"]]), steps: d.steps }, "2026-10-21T21:00:00Z");
  assert.equal(k2.id, d.id);
  assert.deepEqual(J(K.ownDish(k2.K, d.id).items), [["Red peppers", "2"], ["Chickpeas", "200 g"]]);
});

test("d80: a deleted dish keeps tonight's meal readable, also when only added foods are on it", () => {
  assert.match(html, /Object\.keys\(\(rec && rec\.dish\) \|\| \{\}\)\.concat\(Object\.keys\(\(rec && rec\.xtra\) \|\| \{\}\)\)/);
  const r = K.saveDish({}, { name: "Red pepper salad", items: [["Red peppers", "2"], ["Lemon", "1"]] }, "2026-10-21T20:00:00Z");
  const gone = K.delDish(r.K, r.id, "2026-10-21T22:00:00Z");
  const d = K.ownDish(gone, r.id);
  assert.ok(d.del && d.items.length === 2, "the dish is still there to draw, marked deleted");
  const rec = QM.tick(null, d, "Red peppers", opt).rec;
  assert.deepEqual(J(rec.dish[d.id]), ["Red peppers"]);
  assert.equal(rec.b, 0, "his dishes pay nothing, deleted or not");
});

test("d79: the recipe card: shut shows time and tags; open shows ingredients, steps, swaps and Cook this; no 'you have N of M'", () => {
  const rc = sheet.slice(sheet.indexOf("const recipeCard = d =>"), sheet.indexOf("openSheet(`${winHead(b)}"));
  assert.ok(rc.length > 500, "found the recipe card");
  assert.match(rc, /const tv = trip && QR\(\)\.isTravel\(d, rule\), sub = \[d\.time, QR\(\)\.tagLine\(d\)\]/);
  assert.match(rc, /<p class="kt-gh">Steps<\/p><ol>/);
  assert.match(rc, /data-rcook="\$\{esc\(d\.id\)\}">Cook this</);
  assert.match(rc, /h\.st === "have" \|\| h\.st === "short"/, "only what the kitchen has, softly");
  assert.ok(!/you have|buy \$|To buy/.test(rc), "no scoring of what he has");
  assert.match(sheet, /dishTap\(bn, d\.id, QR\(\)\.cookTicks\(d\)\)/);
  // the old ideas only when the book did not load; the trip line says how travel-friendly is decided
  assert.match(sheet, /\$\{RL \? `<div class="mq-sub mq-subl"><span>Recipes · for 2 people<\/span>/);
  assert.ok(sheet.includes("On a trip: travel-friendly recipes first"));
  assert.ok(sheet.indexOf("Tonight's ideas · for 2 people") > sheet.indexOf("${RL ?"), "the ideas heading is the fallback branch");
  assert.ok(!/Not much in the travel fridge/.test(sheet));
});

test("d79: the page loads the recipe data before quest-recipes.js, both stamped; the pull script copies from the wiki's export", () => {
  assert.match(html, /<script src="quest-recipe-data\.js\?v=\w+"><\/script>\s*<script src="quest-recipes\.js\?v=\w+"><\/script>/);
  const sc = fs.readFileSync(here("../../scripts/pull-recipes.mjs"), "utf8");
  assert.ok(sc.includes('path.join(wiki, "tools", "export.mjs")') && sc.includes("[exporter, out]"), "runs the wiki's export into a temp file");
  assert.ok(sc.includes("quest-recipe-data.js") && sc.includes("QuestRecipeData"));
  assert.ok(!/[—–]/.test(sheet.slice(sheet.indexOf("const plainRows"), sheet.indexOf("openSheet(`${winHead(b)}"))), "no dashes in the new words");
});
