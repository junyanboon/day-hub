// node --test still/test/*.test.mjs   (Junyan, 2026-10-21, d87: meals are cooked for two, "it's divided by our weight
// differential. Caney weighs 100 lbs and me 145 so we divide the food accordingly")
// The gram and count food tiles count HIS share of what the meal logged (145 / 245, about 59%, by default). The kitchen
// still loses the whole amount. "Just me" on a meal makes his share the whole. The two weights are one synced setting,
// and a meal keeps the share it was first scored with, so changing them never moves what a past meal paid.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-food-score.js", "../quest-merge.js"]) vm.runInNewContext(fs.readFileSync(here(f), "utf8"), ctx);
const FS = ctx.QuestFoodScore, M = ctx.QuestMerge;
const J = (x) => JSON.parse(JSON.stringify(x));
const html = fs.readFileSync(here("../quest.html"), "utf8");
const sheet = html.slice(html.indexOf("function openMeal(b)"), html.indexOf("The meal sheet's kitchen parts"));
const SH = 145 / 245;

test("his share: 145 / (145 + 100) by default, the weights he set, the share a meal was scored with, 1 for Just me", () => {
  assert.ok(Math.abs(FS.shareOf(null) - SH) < 0.001);
  assert.ok(Math.abs(FS.shareOf({}, { me: 145, other: 100 }) - SH) < 0.001);
  assert.equal(FS.shareOf({}, { me: 150, other: 150 }), 0.5);
  assert.equal(FS.shareOf({ solo: true }, { me: 150, other: 150 }), 1, "Just me");
  assert.equal(FS.shareOf({ sh: 0.5 }, { me: 145, other: 100 }), 0.5, "the meal keeps the share it was first scored with");
  assert.equal(FS.shareOf({ sh: 0.5, solo: true }), 1);
  // weights that make no sense fall back to the defaults
  for (const w of [{ me: 0, other: 100 }, { me: "x", other: 100 }, { me: 145, other: -1 }, { me: 145 }, { me: 5000, other: 100 }])
    assert.ok(Math.abs(FS.shareOf({}, w) - SH) < 0.001, JSON.stringify(w));
  assert.ok(Math.abs(FS.shareOf({ sh: 7 }) - SH) < 0.001, "a broken stored share is not used");
  assert.deepEqual(J(FS.weightsOf(null)), { me: 145, other: 100 });
  assert.deepEqual(J(FS.weightsOf({ me: "150", other: 95, at: "x" })), { me: 150, other: 95 });
});

test("a shared Super Veggie: 350 g broccoli and cauliflower counts 207 g veg for him, not the 250 g tile", () => {
  const foods = [{ n: "Broccoli", q: 200, u: "g" }, { n: "Cauliflower", q: 150, u: "g" }];
  const shared = FS.earn(foods, { share: SH });
  assert.equal(shared.got.veg, 207.1);
  assert.ok(!shared.ids.includes("veg"));
  assert.ok(shared.ids.includes("fveg"), "fresh veg still counts: his share is above zero");
  assert.ok(FS.earn(foods, { share: 1 }).ids.includes("veg"), "Just me: the whole 350 g");
  assert.ok(FS.earn(foods).ids.includes("veg"), "no share given: the whole amount (as before)");
  assert.deepEqual(J(foods), [{ n: "Broccoli", q: 200, u: "g" }, { n: "Cauliflower", q: 150, u: "g" }], "the logged foods are not changed (the kitchen loses the whole amount)");
});

test("every amount tile uses his share: lentils, berries, olive oil, nuts, flax, greens, protein, and counts by the piece", () => {
  const on = (foods, share, o = {}) => J(FS.earn(foods, { share, ...o }).ids);
  const cases = [
    ["legumes", [{ n: "Cooked lentils", q: 200, u: "g" }], [{ n: "Cooked lentils", q: 300, u: "g" }]],
    ["berries", [{ n: "Blueberries", q: 120, u: "g" }], [{ n: "Blueberries", q: 200, u: "g" }]],
    ["evoo", [{ n: "Extra virgin olive oil", amt: "1.5 tbsp" }], [{ n: "Extra virgin olive oil", amt: "2 tbsp" }]],
    ["nuts", [{ n: "Walnuts", q: 40, u: "g" }], [{ n: "Walnuts", q: 60, u: "g" }]],
    ["seeds", [{ n: "Ground flaxseed", amt: "1 tbsp" }], [{ n: "Ground flaxseed", amt: "2 tbsp" }]],
    ["greens", [{ n: "Baby spinach", q: 60, u: "g" }], [{ n: "Baby spinach", q: 90, u: "g" }]],
    ["veg", [{ n: "Red pepper", q: 2, u: "" }], [{ n: "Red pepper", q: 3, u: "" }]],   // a piece is 150 g: 300 g shared is 178 g
  ];
  for (const [id, few, enough] of cases) {
    assert.ok(on(few, 1).includes(id), `${id}: the whole amount earns it`);
    assert.ok(!on(few, SH).includes(id), `${id}: his share of the same does not`);
    assert.ok(on(enough, SH).includes(id), `${id}: a bigger pot does`);
  }
  const am = [{ n: "Tofu", q: 300, u: "g" }];   // 39 g protein in the pot, 23 g his
  assert.ok(on(am, 1, { morning: true }).includes("protein"));
  assert.ok(!on(am, SH, { morning: true }).includes("protein"));
});

test("presence tiles count while his share is above zero; nothing counts at zero", () => {
  const foods = [{ n: "Apple", q: 1, u: "" }, { n: "Alfalfa sprouts", q: 10, u: "g" }, { n: "Honey", amt: "1 tsp" }, { n: "Garlic", amt: "1 clove" }];
  assert.deepEqual(on2(foods, SH), ["fruit", "sprouts", "honey", "neg"]);
  assert.deepEqual(on2(foods, 0), []);
  function on2(f, share) { return J(FS.earn(f, { share }).ids); }
});

test("the weights merge across devices: the later change wins, both ways", () => {
  const a = { share: { me: 145, other: 100, at: "2026-10-21T10:00:00Z" } }, b = { share: { me: 150, other: 98, at: "2026-10-21T11:00:00Z" } };
  assert.equal(M.mergeKitchen(a, b).share.me, 150);
  assert.equal(M.mergeKitchen(b, a).share.me, 150);
  assert.equal(M.mergeQuest({ xp: 1, ts: 2, kitchen: a }, { xp: 1, ts: 1, kitchen: b }).kitchen.share.me, 150, "an older copy's later change still wins");
  assert.equal(M.mergeKitchen({}, a).share.me, 145);
  assert.ok(!("share" in M.mergeKitchen({ items: {} }, { items: {} })), "no share field appears when neither copy has one");
});

test("the page: syncFoods scores with his share and stamps the meal's share once; the kitchen still takes the full amount", () => {
  const sf = sheet.slice(sheet.indexOf("function syncFoods(){"), sheet.indexOf("// the drains (d84)"));
  assert.ok(sf.length > 100, "found syncFoods");
  assert.ok(sf.includes("FSC().earn(foods, { morning, share:FSC().shareOf(cur, mealWeights()) })"), "scored with his share");
  assert.ok(sf.includes('typeof cur.sh !== "number"'), "a meal's share is stamped the first time it is scored");
  // the kitchen take is untouched: kitDinner and the extras still get the logged amounts
  assert.ok(sheet.includes("kitDinner(k, d, (cur && cur.dish && cur.dish[d.id]) || [], (r.rec.dish && r.rec.dish[d.id]) || [], amts);"));
});

test("the page: a Just me toggle by This meal, the Counted line names his share, the weights sit at the foot of the sheet", () => {
  assert.ok(/<div class="mq-mhd">\$\{lb\("This meal", "mb", 0\)\}\$\{soloBtn\(\)\}<button type="button" class="mq-mini mq-howbtn" data-mchange/.test(sheet), "Just me sits on the This meal heading");
  const sb = sheet.slice(sheet.indexOf("const soloBtn ="), sheet.indexOf("const soloBtn =") + 400);
  assert.ok(sb.includes("data-msolo") && sb.includes("aria-pressed") && sb.includes("Just me"));
  const h = sheet.slice(sheet.indexOf('sh.querySelector("[data-msolo]")'), sheet.indexOf('sh.querySelector("[data-msolo]")') + 700);
  assert.ok(h.includes("r.solo = true") && h.includes("delete r.solo"), "a tap toggles rec.solo");
  assert.ok(h.includes("putRec(") && h.indexOf("syncFoods()") > h.indexOf("putRec("), "stored, then the tiles re-scored");
  const c = sheet.slice(sheet.indexOf("const counted ="), sheet.indexOf("openSheet(`${winHead(b)}"));
  assert.ok(c.includes("Counted (your ${pct}%)"), "the share on the Counted line");
  assert.ok(sheet.includes("Shared meals: you") && sheet.includes('data-mwt="me"') && sheet.includes('data-mwt="other"'), "the weights at the foot");
  const w = sheet.slice(sheet.indexOf('querySelectorAll("[data-mwt]")'), sheet.indexOf('querySelectorAll("[data-mwt]")') + 900);
  assert.ok(w.includes("kitSave(") && w.includes("at:now().toISOString()"), "saved with the game, stamped for the merge");
  assert.ok(!w.includes("redraw(") && !w.includes("syncFoods("), "no redraw (it swallows the next tap) and no re-scoring of this meal");
});
