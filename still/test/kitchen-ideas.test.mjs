// node --test still/test/*.test.mjs   (tonight's ideas from the kitchen: Junyan 2026-10-21, d41)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-kitchen.js", "../quest-merge.js", "../quest-ideas.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const K = ctx.QuestKitchen, QM = ctx.QuestMeals, QI = ctx.QuestIdeas;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));
const T0 = Date.parse("2026-10-21T16:00:00Z"), H = 3600000, D = 86400000;
const at = (h) => new Date(T0 + h * H).toISOString();
const DAY = "2026-10-21", SINCE = T0 - 8 * H;   // the day began 8 hours before T0
const opt = (o = {}) => ({ day: DAY, since: SINCE, now: T0, ...o });
const ids = (r) => r.list.map((d) => d.id);
// a kitchen: amounts for some items, levels for others
function stock(list, h = -30) {
  let k = {};
  for (const [id, v] of list) k = typeof v === "number" ? K.setLevel(k, id, v, at(h), "buy") : K.setAmount(k, id, v, at(h));
  return k;
}
const SHIITAKE_NIGHT = [["h:quinoa", "500 g"], ["h:broccoli", "500 g"], ["h:shiitake", "200 g"], ["h:red-peppers", "3"], ["h:ginger", 3],
  ["h:tahini", 3], ["h:limes", "4"], ["h:olive-oil", 3], ["h:hemp-seeds", "250 g"]];

test("d41: the pool keeps his food rules: for 2, no garlic or onion, plants only, a time and steps, unique ids", () => {
  const pool = QI.POOL;
  assert.ok(pool.length >= 12, "enough recipes to choose from");
  assert.equal(new Set(pool.map((d) => d.id)).size, pool.length);
  for (const d of pool) {
    assert.ok(d.name && d.icon && d.time && d.how && d.base, d.id);
    assert.ok(d.items.length >= 6, d.id);
    for (const [n, a] of d.items) { assert.ok(!QI.banned(n), `${d.id}: ${n}`); assert.ok(a, `${d.id}: ${n} has an amount`); }
    assert.ok(!/garlic|onion|leek|shallot|chive/i.test(d.how), d.id);
    assert.ok(!/[—–]/.test(d.name + d.how), "no dashes");
  }
  // the three from before are in it with the same ids and the same ingredients (a meal ticked on them still reads)
  for (const d of QM.IDEAS) assert.deepEqual(J(QI.byId(d.id).items), J(d.items));
  for (const n of ["Garlic", "Red onion", "Leeks", "Chicken thighs", "Greek yogurt", "Eggs"]) assert.ok(QI.banned(n), n);
  for (const n of ["Coconut yogurt", "Macadamia milk", "Shiitake mushrooms", "Spring greens", "Peanut butter", "Oat milk", "Cream of tartar"]) assert.ok(!QI.banned(n), n);
  for (const n of ["Milk", "Whole milk", "Butter", "Kefir"]) assert.ok(QI.banned(n), n);
});

test("d41: every main ingredient is a food the kitchen catalogue knows, so what an idea uses is what a tick takes off", () => {
  const seed = new Set(K.SEED.map(([, , n]) => K.keyOf(n)));
  for (const d of QI.POOL) for (const [n] of d.items) assert.ok(seed.has(K.keyOf(n)), `${d.id}: ${n}`);
});

test("d41: the kitchen decides: shiitake, broccoli and quinoa at home make the shiitake bowl the first idea, all in", () => {
  const k = stock(SHIITAKE_NIGHT);
  const r = QI.pick(k, "home", opt());
  assert.equal(r.list.length, 3);
  assert.equal(r.list[0].id, "r6");
  const st = QI.status(k, "home", r.list[0]);
  assert.equal(st.text, "All in your kitchen");
  assert.deepEqual(J(st.buy), []);
  // what it shows is what is there, never a made-up number: amounts for amount items, "how many?" for the rest
  const row = (n) => st.rows.find((x) => x.name === n);
  assert.equal(row("Broccoli").word, "have 500 g");
  assert.equal(row("Fresh ginger, grated").word, "how many?");
  assert.equal(row("Lime").word, "have 4");
});

test("d41: no two of the three share a base while others are left, and the same day gives the same three", () => {
  const k = stock(SHIITAKE_NIGHT);
  const a = QI.pick(k, "home", opt()), b = QI.pick(J(k), "home", opt());
  assert.deepEqual(ids(a), ids(b), "the same on both devices");
  const bases = a.list.map((d) => d.base);
  assert.equal(new Set(bases).size, 3, bases.join());
});

test("d41: food to use first and running-low food lift an idea", () => {
  // spinach and kale, equally covered: the spinach turns tomorrow, so the spinach idea wins
  const base = [["h:chickpeas", "800 g"], ["h:white-beans", "800 g"], ["h:tomatoes", "6"], ["h:carrots", "6"], ["h:courgette", "3"], ["h:parsley", 3],
    ["h:pumpkin-seeds", "200 g"], ["h:lemons", "3"], ["h:limes", "3"], ["h:basmati-rice", "1 kg"], ["h:ginger", 3], ["h:coconut-yogurt", "400 g"]];
  const kale = stock(base.concat([["h:kale", "300 g"]]), -30);
  // the spinach was bought 3 days ago (its shelf life is 4): Use first today
  const sp = K.setAmount(K.setLevel(kale, "h:spinach", 3, at(-72), "buy"), "h:spinach", "300 g", at(-72));
  // the same kitchen with the spinach bought today: the kale idea can win
  const fresh = K.setAmount(K.setLevel(kale, "h:spinach", 3, at(-1), "buy"), "h:spinach", "300 g", at(-1));
  assert.ok(!K.useFirst(fresh, "home", T0).length);
  assert.ok(K.useFirst(sp, "home", T0).some((x) => x.it.id === "h:spinach"));
  const top = QI.pick(sp, "home", opt()).list[0];
  assert.ok(top.items.some(([n]) => K.keyOf(n) === "spinach"), top.name);
});

test("d41: short or missing food is said: only what is there, and a To buy list; staples never decide or nag", () => {
  const k = stock([["h:broccoli", "100 g"], ["h:quinoa", "500 g"], ["h:shiitake", "0 g"], ["h:red-peppers", 0]]);
  const st = QI.status(k, "home", QI.byId("r6"));
  const row = (n) => st.rows.find((x) => x.name === n);
  assert.equal(row("Broccoli").st, "short"); assert.equal(row("Broccoli").word, "only 100 g");
  assert.equal(row("Shiitake mushrooms").st, "out");
  assert.equal(row("Shiitake mushrooms").word, "none left");
  // an old Out with no number is not known since the levels were retired (2026-10-21): it asks how many
  assert.equal(row("Red peppers").st, "unchecked"); assert.equal(row("Red peppers").word, "how many?");
  assert.ok(st.buy.includes("Broccoli") && st.buy.includes("Shiitake mushrooms"));
  assert.ok(st.check.includes("Red peppers"));
  assert.ok(!st.buy.includes("Tahini") && !st.check.includes("Tahini"), "a staple not checked is not nagged");
  // a staple the kitchen says is Out is to buy
  assert.ok(QI.status(stock([["h:tahini", "0 g"]]), "home", QI.byId("r6")).buy.includes("Tahini"));
});

test("d41: too little in the kitchen: the note says so and the closest ideas still show with what to buy", () => {
  const none = QI.pick({}, "home", opt());
  assert.equal(none.list.length, 3);
  assert.match(none.note, /Nothing in the kitchen has a number yet/);
  for (const d of none.list) for (const r of QI.status({}, "home", d).rows) assert.ok(!/\d/.test(r.word), "no made-up amount: " + r.word);
  const thin = QI.pick(stock([["h:apples", "2"]]), "home", opt());
  assert.match(thin.note, /Not much in the kitchen for dinner/);
  assert.equal(thin.ready, 0);
  const travel = QI.pick({}, "travel", opt());
  assert.match(travel.note, /travel fridge/);
  // ready means every main ingredient had in full: the shiitake bowl only, so the note names the other two
  const one = QI.pick(stock(SHIITAKE_NIGHT), "home", opt());
  assert.equal(one.ready, 1);
  assert.match(one.note, /Only one of these can be made from what you have/);
  // broccoli short for every idea that uses it: none is all in, and the note does not say "can be made"
  const short = QI.pick(stock(SHIITAKE_NIGHT.map(([id, v]) => [id, id === "h:broccoli" ? "50 g" : v])), "home", opt());
  if (short.ready === 0) assert.match(short.note, /None of these is all in the kitchen|Not much/);
  // a full kitchen has no note
  assert.equal(QI.pick(stock(SHIITAKE_NIGHT), "home", opt()).note.includes("Not much"), false);
});

test("d41: the travel fridge is its own kitchen: home food does not count on a trip day", () => {
  const home = stock(SHIITAKE_NIGHT);
  assert.equal(QI.status(home, "travel", QI.byId("r6")).have, 0);
  let t = K.add({}, "travel", "cool", "Broccoli", at(-2), null, "400 g").K;
  t = K.add(t, "travel", "dry", "Quinoa", at(-2), null, "300 g").K;
  const st = QI.status(t, "travel", QI.byId("r6"));
  assert.equal(st.rows.find((x) => x.name === "Broccoli").word, "have 400 g");
});

test("d41: his own dish is an idea when every food in it is in the kitchen, never with garlic or onion", () => {
  let k = stock(SHIITAKE_NIGHT.concat([["h:white-beans", "800 g"]]));
  const mk = (kk, name, items) => K.saveDish(kk, { name, items }, at(-1));
  let r = mk(k, "Bean and shiitake toss", [["White beans", "300"], ["Shiitake", "100"], ["Broccoli", "150"]]); k = r.K; const good = r.id;
  r = mk(k, "Garlic beans", [["White beans", "300"], ["Garlic", "2"]]); k = r.K; const bad = r.id;
  r = mk(k, "Pasta night", [["Pasta", "200"], ["Broccoli", "150"], ["Shiitake", "50"]]); k = r.K; const missing = r.id;
  r = mk(k, "Beans", [["White beans", "300"]]); k = r.K; const small = r.id;
  r = mk(k, "Shiitake beans", [["White beans", "200"], ["Shiitake", "50"], ["Broccoli", "100"]]); k = r.K; const second = r.id;
  const all = QI.pick(k, "home", opt()).list;
  assert.ok(all.some((d) => (d.id === good || d.id === second) && d.own), ids({ list: all }).join());
  assert.ok(!all.some((d) => d.id === bad || d.id === missing || d.id === small), "garlic, a missing food, or one food is no dinner idea");
  assert.equal(all.filter((d) => d.own).length, 1, "at most one of his own among the three");
});

test("d41: today's ticks do not shuffle the ideas while he cooks; what each shows reads the kitchen now", () => {
  const k = stock(SHIITAKE_NIGHT);
  const before = QI.pick(k, "home", opt());
  // he ticks all the shiitake bowl's broccoli and shiitake at dinner (records stamped now, after the day began)
  let k2 = k;
  for (const [n, a] of QI.byId("r6").items) k2 = K.eat(k2, "home", `${DAY}|dinner|r6|${n}`, { name: n }, true, at(0), a).K;
  assert.deepEqual(ids(QI.pick(k2, "home", opt())), ids(before));
  const st = QI.status(k2, "home", QI.byId("r6"));
  assert.equal(st.rows.find((x) => x.name === "Broccoli").word, "only 200 g", "500 g less the 300 g ticked, under another 300 g");
  // the tick took exactly the idea's amount off the item it said it uses
  assert.equal(K.match(k2, "home", "Broccoli").left, 200);
  assert.equal(K.match(k2, "home", "Shiitake").left, 50);
});

test("d41: an idea from another day still reads on its meal, holds its slot, and pays like the ideas did", () => {
  const r7 = QM.dishOf("r7");
  assert.equal(r7 && r7.name, "Black lentils with soft cauliflower");
  assert.equal(QM.groupOf(r7), "idea");
  const o = { mult: 1.5, dish: 6, dim: [1, 0.7], dishLimit: 2 };
  const t = QM.tick(null, r7, r7.items[0][0], o);
  assert.ok(t.rec.v["dish:r7"][1] > 0);
  assert.equal(QM.slotsUsed({ m1: t.rec }, "m2", QM.dishOf("r1")), 1, "it holds one of the ideas' two slots");
});

test("d41: the page loads quest-ideas.js and the meal sheet shows today's three from the kitchen with what they use and need", () => {
  assert.match(html, /<script src="quest-kitchen\.js\?v=\w+"><\/script>\s*<script src="quest-ideas\.js\?v=\w+"><\/script>/);
  assert.match(html, /QI\(\)\.pick\(G\.kitchen, kitToday\(\)/);
  assert.match(html, /QI\(\)\.status\(G\.kitchen, kitToday\(\)/);
  assert.ok(html.includes("Tonight's ideas · for 2 people${kn ? ` · from ${esc(kn.icon)} ${esc(kn.name)}`"), "the heading names the kitchen");
  assert.match(html, /IT\.note \? `<p class="mq-serves mq-inote">/, "a short kitchen is said in words");
  assert.match(html, /<b>To buy:<\/b>/);
  // the shopping list's amounts follow today's ideas, and a dish by id finds any idea of the pool
  // d79: only while the recipe book has not loaded (the ideas are the fallback then)
  assert.match(html, /const kitDishes = kc => QM \? \(kc && QM\.dishesFor \? QM\.dishesFor\(kc\) : bpToday\(\)\)\.concat\(recipesOn\(\) \? \[\] : ideasToday\(\)\.list\.filter\(d => !d\.own\)\) : \[\]/);
  assert.match(html, /\|\| ideaById\(id\)\n/);
});
