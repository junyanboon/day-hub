// node --test still/test/*.test.mjs
// Junyan, 2026-10-21: "Nothing should say plenty" (the levels retired from what he sees, replacing d46), d76 ("Bread 1
// piece" reads Bread · 1; lemons, fior di latte, mozzarella and burrata are counted by the piece), d74 and d75 (the dish
// card ends with the search box, the kitchen list only once he types, no helper text), and no Got everything or Clear.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-kitchen.js", "../quest-merge.js", "../quest-ideas.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const K = ctx.QuestKitchen, QI = ctx.QuestIdeas;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const T0 = Date.parse("2026-10-21T16:00:00Z"), H = 3600000, D = 24 * H;
const at = (h) => new Date(T0 + h * H).toISOString();
const J = (x) => JSON.parse(JSON.stringify(x));
const LEVEL_WORD = /plenty|\bhalf\b|not checked|\blow\b(?! by)|\bout\b/i;

test("d76: a count with a word for what he counts at the end: the word goes, the count stays", () => {
  for (const [typed, name, amt] of [["Bread 1 piece", "Bread", "1 piece"], ["Seeded bread 2 slices", "Seeded bread", "2 pieces"],
    ["Chickpeas 2 cans", "Chickpeas", "2 pieces"], ["Fior di latte 2 balls", "Fior di latte", "2 pieces"], ["Tomato paste 1 jar", "Tomato paste", "1 piece"],
    ["Sourdough 1 loaf", "Sourdough", "1 piece"], ["Olive oil 1 bottle", "Olive oil", "1 piece"], ["Tofu 3 packs", "Tofu", "3 pieces"], ["Pizza bases 2 pcs", "Pizza bases", "2 pieces"]])
    assert.deepEqual(J(K.splitName(typed)), { name, amt }, typed);
  // a name that only ends in such a word, with no number before it, stays whole
  for (const typed of ["Mozzarella balls", "Energy balls", "Bread slices", "Coconut pieces", "Chickpeas in cans", "Bread 1.5 slices"])
    assert.deepEqual(J(K.splitName(typed)), { name: typed, amt: "" }, typed);
  // the earlier splits are unchanged
  assert.deepEqual(J(K.splitName("400g navy beans")), { name: "Navy beans", amt: "400 g" });
  assert.deepEqual(J(K.splitName("Bananas 4")), { name: "Bananas", amt: "4" });
  assert.deepEqual(J(K.splitName("Omega 3")), { name: "Omega 3", amt: "" });
});

test("d76: Bread 1 piece added, renamed, or already stored reads Bread · 1, a count (never 1 g)", () => {
  let r = K.add({}, "home", "pantry", "Bread 1 piece", at(0));
  let it = K.item(r.K, r.id);
  assert.deepEqual(J([it.name, it.q, it.u, K.tileLine(it, T0, T0 + 7 * D)]), ["Bread", 1, "", "1"]);
  assert.equal(K.isPiece(it), true, "it gets - and +");
  r = K.add({}, "home", "pantry", "Chickpeas 2 cans", at(0));
  it = K.item(r.K, r.id);
  assert.deepEqual(J([it.name, it.q, it.u]), ["Chickpeas", 2, ""]);
  // the item he already has: stored whole as the name, no amount, no number (added before this build)
  const old = { items: { u9: { id: "u9", k: "home", shelf: "pantry", name: "Bread 1 piece", amt: "", lv: 3, at: at(-5) } } };
  it = K.item(old, "u9");
  assert.deepEqual(J([it.name, it.q, it.u, K.tileLine(it, T0, T0 + 7 * D)]), ["Bread", 1, "", "1"]);
  assert.deepEqual(J(K.items(old, "home").find((x) => x.id === "u9").name), "Bread", "read the same in the list, no write");
  // rename in Edit
  const a = K.add({}, "home", "pantry", "Bread", at(0));
  it = K.item(K.rename(a.K, a.id, "Bread 3 slices", at(1)), a.id);
  assert.deepEqual(J([it.name, it.q, it.u]), ["Bread", 3, ""]);
});

test("d76: lemons, fior di latte, mozzarella and burrata are counted by the piece; shredded mozzarella is weighed", () => {
  for (const n of ["Lemons", "Lemon", "Fior di latte", "Mozzarella", "Mozzarella balls", "Burrata", "Burratas"]) assert.equal(K.unitFor(n), "", n);
  for (const n of ["Shredded mozzarella", "Grated mozzarella", "Lemon juice"]) assert.notEqual(K.unitFor(n), "", n);
  const r = K.add({}, "home", "fridge", "Fior di latte 2", at(0)), it = K.item(r.K, r.id);
  assert.deepEqual(J([it.name, it.q, it.u, it.em]), ["Fior di latte", 2, "", "🧀"]);
  // his Lemons with no number: "how many?", and its page has - and +
  const lem = K.item(K.tap({}, "h:lemons", at(0)), "h:lemons");
  assert.equal(K.tileLine(lem, T0, T0 + 7 * D), "how many?");
  assert.equal(K.isPiece(lem), true);
  assert.equal(K.stepCount("", "Lemons", 1), "1");
});

test("nothing says plenty: every item with no number says how many?, whatever level is stored", () => {
  let k = {};
  for (const [id, lv] of [["h:quinoa", 3], ["h:oats", 2], ["h:limes", 3], ["h:spinach", 2]]) k = K.setLevel(k, id, lv, at(-30), "buy");
  const shop = T0 + 7 * D;
  for (const x of K.items(k, "home")) {
    const line = K.tileLine(x, T0, shop, "America/Toronto");
    assert.ok(!LEVEL_WORD.test(line), `${x.name}: ${line}`);
    assert.equal(line, "how many?", x.name);
  }
  assert.equal(K.ASK, "how many?");
  // words he typed with no number stay beside it
  const w = K.setAmount(K.add({}, "home", "pantry", "Honey", at(0)).K, "h:honey", "a jar", at(1));
  assert.equal(K.tileLine(K.item(w, "h:honey"), T0, shop), "how many? · a jar");
  // an amount at 0
  const z = K.setAmount({}, "h:oats", "0 g", at(0));
  assert.equal(K.tileLine(K.item(z, "h:oats"), T0, shop), "none left · buy");
});

test("the shopping list: an item with no number is not known (no guess), except one left at Out or Low, until it gets a number", () => {
  let k = {};
  k = K.setLevel(k, "h:spinach", 2, at(-30 * 24), "tap");    // Half long ago: the old guess said it ran low
  k = K.setLevel(k, "h:quinoa", 3, at(-30 * 24), "tap");
  k = K.setLevel(k, "h:cumin", 0, at(-1), "tap");             // left at Out
  k = K.setLevel(k, "h:honey", 1, at(-1), "tap");             // left at Low
  const shop = T0 + 7 * D;
  const on = (kk) => K.shopList(kk, "home", T0, shop, []).groups.flatMap((g) => g.list).map((r) => r.it.name).sort();
  assert.deepEqual(J(on(k)), ["Cumin", "Honey"]);
  assert.deepEqual(J(K.counts(k, "home", T0, shop)), { total: K.SEED.length, unchecked: K.SEED.length, low: 2, soon: 0 });
  // a number: off the list when there is enough, on it by its own amount rule otherwise
  k = K.setAmount(k, "h:cumin", "100 g", at(0));
  assert.deepEqual(J(on(k)), ["Honey"]);
  // bought with no number: off the list too
  k = K.restock(k, "h:honey", null, at(0), "buy");
  assert.deepEqual(J(on(k)), []);
  // stored levels are left as they are (nothing rewritten)
  assert.equal(K.item(k, "h:spinach").lv, 2);
  assert.equal(k.items["h:spinach"].lv, 2);
});

test("the dish ideas and part rows say how many? for food with no number, never a level word", () => {
  let k = {};
  for (const [id, v] of [["h:shiitake", 3], ["h:broccoli", 2], ["h:quinoa", 0], ["h:ginger", 1]]) k = K.setLevel(k, id, v, at(-30), "buy");
  const st = QI.status(k, "home", QI.byId("r6"));
  for (const r of st.rows) assert.ok(!LEVEL_WORD.test(r.word), `${r.name}: ${r.word}`);
  assert.ok(!LEVEL_WORD.test(st.text), st.text);
  const sv = ctx.QuestMeals.DISHES.find((d) => d.slots);
  for (const p of QI.slotRows(k, "home", sv, [])) for (const r of p.rows) assert.ok(!LEVEL_WORD.test(r.word), `${r.name}: ${r.word}`);
});

test("on the page: no level key, no tap-to-step hint, no level words, tiles open the item page", () => {
  assert.ok(!/kt-key|● Plenty|Not checked|step it down|steps it down|goes back to Plenty|marks it Plenty/.test(html), "the key and the old hints are gone");
  assert.ok(!/\bKLV\b/.test(html), "the level words table is gone from the page");
  const sheet = html.slice(html.indexOf("function openKitchen("), html.indexOf("function kitDinner("));
  for (const w of [">Plenty<", ">Half<", ">Low<", ">Out<", '"Plenty"', '"Half"']) assert.ok(!sheet.includes(w), w);
  assert.match(sheet, /\["new", "No number yet"/);
  assert.match(sheet, /class="ki L\$\{n \? x\.lv : "q"\}/, "the meter fills only for an item with a number");
  assert.match(html, /\.ki\.Lq \.st \{[^}]*color:var\(--ink-soft\)/, "how many? in a soft colour");
  assert.ok(/const kitHaveWord = x => [^\n]*QK\(\)\.ASK/.test(html), "lists say how many?");
});

test("d74, d75 and no Got everything or Clear: the dish card ends with the search box; results only once he types", () => {
  const c0 = html.indexOf("const dishCard = (d, fit) =>"), card = html.slice(c0, html.indexOf("openSheet(", c0));
  assert.ok(card.length > 1000, "found the dish card");
  assert.ok(!/>Got everything<|data-dall|data-dnone|>Clear</.test(card));
  const xr = html.slice(html.indexOf("const xResults = (d, text) =>"), html.indexOf("const extrasBlock = d =>"));
  assert.match(xr, /if \(!QK\(\) \|\| !t\) return "";/, "nothing listed until he types");
  const xb = html.slice(html.indexOf("const xSearch = (d, aria) =>"), html.indexOf("const slotCard = d =>"));
  assert.match(xb, /<div data-xres="\$\{esc\(d\.id\)\}"><\/div>/, "the results start empty");
  assert.ok(!/mq-how/.test(xb + xr), "no helper text in the panel");
  // the points stay on the card header
  assert.match(card, /<span class="mq-dp">/);
  const bind = html.slice(html.indexOf("function openMeal(b)"), html.indexOf("The meal sheet's kitchen parts"));
  assert.ok(!/dropAllExtras|\[data-dall\]|\[data-dnone\]|\[data-xadd\]/.test(bind), "their handlers are gone");
});
