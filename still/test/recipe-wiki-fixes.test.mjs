// node --test still/test/*.test.mjs   (Junyan, 2026-10-22: three fixes to the recipe cards from the recipe wiki)
// d89: a step's wiki link ("[[techniques/soft-broccoli]]") shows as a tappable "soft broccoli" that opens the technique's
//      "how" steps; a technique the data does not have shows just the readable name. Never [[ ]] text.
// d90: an ingredient ending "(optional)" shows greyed with an "optional" label, the suffix off its name, and never counts
//      as missing (no missing count, no "to buy", no missing styling). #86's "no ticking food the kitchen does not have" holds.
// d91: the recipe agent's latest run (recipe-wiki/runs/<date>-<n>.json) comes in with the pull; a recipe the run adapted
//      shows the run's kitchen version, else the plain recipe.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-kitchen.js", "../quest-ideas.js", "../quest-recipe-data.js", "../quest-recipes.js"])
  vm.runInNewContext(fs.readFileSync(here(f), "utf8"), ctx);
const K = ctx.QuestKitchen, QM = ctx.QuestMeals, QI = ctx.QuestIdeas, QR = ctx.QuestRecipes;
const html = fs.readFileSync(here("../quest.html"), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));
const R = (id, o = {}) => ({ id, name: id, icon: "🍲", time: "20 min", meal: "dinner", tags: [], items: [["Rice", "100 g"]], steps: ["Cook it."], ...o });
const TECH = [{ id: "soft-broccoli", name: "Soft broccoli", how: "1. Cut small florets.\n2. Steam 8 minutes ([[techniques/blended-soup]]),\n   longer for big ones.\n" }];

test("d89: a step's technique link is a readable name with the technique's how steps; no [[ ]] left", () => {
  const data = { recipes: [], techniques: TECH };
  const parts = J(QR.stepParts("Simmer until soft. [[techniques/soft-broccoli]]", data));
  assert.deepEqual(parts, [{ text: "Simmer until soft. " }, { name: "soft broccoli", tech: { id: "soft-broccoli", name: "Soft broccoli", how: ["Cut small florets.", "Steam 8 minutes (blended soup), longer for big ones."] } }]);
  // a technique the data does not have: just the readable name
  assert.deepEqual(J(QR.stepParts("Blend smooth. [[techniques/blended-soup]]", data)), [{ text: "Blend smooth. " }, { name: "blended soup", tech: null }]);
  assert.equal(QR.stepText("Blend. [[techniques/blended-soup]] then [[soft-broccoli]]", data), "Blend. blended soup then soft broccoli");
  assert.deepEqual(J(QR.stepParts("No links here.", data)), [{ text: "No links here." }]);
});

test("d89: every step in the pulled data has its techniques, and the card renders no [[ ]]", () => {
  const steps = QR.list().flatMap((d) => d.steps);
  const linked = steps.filter((s) => /\[\[/.test(s));
  assert.ok(linked.length >= 1, "the wiki links techniques in its steps");
  for (const s of linked) for (const p of QR.stepParts(s)) if (p.name) {
    assert.ok(p.tech && p.tech.how.length, `technique for ${p.name}`);
    assert.ok(!p.tech.how.some((h) => /\[\[|\]\]/.test(h)), `no [[ ]] inside ${p.name}'s how steps`);
  }
  // the card's steps go through the technique renderer, never the raw text
  const card = html.slice(html.indexOf("const recipeCard = "), html.indexOf("const choices = "));
  assert.match(card, /stepHTML\(x\)/);
  assert.doesNotMatch(card, /<li>\$\{esc\(x\)\}<\/li>/);
  const fn = html.match(/const stepHTML = [^\n]*\n/)[0];
  assert.match(fn, /<details class="mq-tq">/);
});

test("d90: an ingredient name ending (optional) loses the suffix and counts as optional", () => {
  const d = QR.load({ recipes: [R("o", { items: [["Oats", "90 g"], ["Pumpkin seeds (optional)", "2 tbsp"], ["Honey", "1 tsp (optional)"], ["Lemon (Optional)", ""]] })] })[0];
  assert.deepEqual(J(d.items.map((x) => x[0])), ["Oats", "Pumpkin seeds", "Honey", "Lemon"]);
  assert.deepEqual(J(d.items.map((x) => QR.optional(x[1]))), [false, true, true, true]);
  assert.deepEqual(J(d.items.map((x) => QR.amtText(x[1]))), ["90 g", "2 tbsp", "1 tsp", ""]);
  assert.deepEqual(J(QR.cookTicks(d)), ["Oats"]);
  assert.ok(!QR.list().some((r) => r.items.some(([n]) => /\(optional\)/i.test(n))), "no name in the book keeps the suffix");
});

test("d90: an optional ingredient is never missing: not in the kitchen it is not counted, not to buy", () => {
  const G = K.add({}, "travel", "dry", "Quinoa", new Date().toISOString(), null, "500 g").K;
  const d = QR.load({ recipes: [R("p", { items: [["Quinoa", "90 g"], ["Pumpkin seeds (optional)", "2 tbsp"], ["Honey", "1 tsp (optional)"]] })] })[0];
  const st = QI.status(G, "travel", d);
  assert.deepEqual(J(st.buy), [], "nothing to buy");
  assert.deepEqual(J(st.check), []);
  assert.equal(st.main, 1);
  assert.equal(st.text, "All in your kitchen");
  assert.equal(st.rows.length, 3, "every row still there for the card");
  // the dish's missing count leaves an unticked optional ingredient out
  const ds = QM.dishStatus({ dish: { [d.id]: ["Quinoa"] } }, d);
  assert.equal(ds.all, true);
  assert.deepEqual(J(ds.missing), []);
});

test("d90: the card greys an optional row with its label; a missing optional is not styled missing and still does not tick", () => {
  const card = html.slice(html.indexOf("const plainRows = "), html.indexOf("const choices = "));
  // uncooked list: the row carries the optional class and label
  assert.match(card, /<li\$\{op \? ` class="opt"` : ""\}>/);
  // cooked rows: not "none" styling when optional, but #86's nokit stays so it cannot be ticked without the kitchen having it
  assert.match(card, /nokit/);
  assert.match(card, /op \? " opt nokit" : " none nokit"/);
  assert.match(html, /\.mq-rcl li\.opt[^{]*\{[^}]*opacity/);
  assert.match(html, /if \(bn\.classList\.contains\("nokit"\) && !kitHaveIt\(bn, d, it\[0\]\)\) return;/);
});

const RUN = { day: "2026-10-21", file: "2026-10-21-1.json", ideas: [
  { id: "stew", icon: "🍝", name: "Stew with artichoke", time: "15 min", items: [["Artichoke Hearts", "50 g"], ["Rice", "100 g"]], steps: ["Kitchen step."], from: "stew" },
  { id: "new-soup", icon: "🥣", name: "New soup", time: "30 min", items: [["Lentils", "45 g"]], steps: ["Simmer."], from: "new" },
] };

test("d91: a recipe the run adapted shows the run's version; the others stay plain; tonight's ideas come first", () => {
  const book = QR.load({ recipes: [R("dal"), R("stew", { tags: ["travel"], swaps: { Rice: ["quinoa"] }, gut: "gentle" })], run: RUN });
  assert.deepEqual(J(book.map((d) => d.rid)), ["stew", "new-soup", "dal"]);
  const stew = book[0];
  assert.equal(stew.id, "rc-stew", "same id, so a meal ticked on it still reads");
  assert.equal(stew.name, "Stew with artichoke");
  assert.deepEqual(J(stew.items), [["Artichoke Hearts", "50 g"], ["Rice", "100 g"]]);
  assert.deepEqual(J(stew.steps), ["Kitchen step."]);
  assert.equal(stew.run, "2026-10-21");
  assert.deepEqual(J(stew.tags), ["travel"], "the plain recipe's tags, swaps and gut notes stay");
  assert.equal(stew.gut, "gentle");
  assert.equal(book[1].run, "2026-10-21");
  assert.equal(book[2].run, null);
  assert.equal(book[2].name, "dal");
  assert.match(QR.tagLine(stew), /^for your kitchen/);
  // no run, or a run with nothing usable: the plain recipe
  assert.equal(QR.load({ recipes: [R("stew")] })[0].name, "stew");
  assert.equal(QR.load({ recipes: [R("stew")], run: { day: "x", ideas: [{ from: "stew", items: [] , steps: [] }] } })[0].name, "stew");
});

test("d91: the pulled data has the latest run, and the cavatappi card shows its artichoke version", () => {
  const data = ctx.QuestRecipeData;
  assert.ok(data.run && /^\d{4}-\d{2}-\d{2}$/.test(data.run.day) && data.run.ideas.length, "a run is in the data");
  const cav = QR.byId("rc-cavatappi-soft-broccoli");
  const idea = data.run.ideas.find((i) => i.from === "cavatappi-soft-broccoli");
  assert.ok(idea, "the 2026-10-21 run adapted the cavatappi");
  assert.equal(cav.name, idea.name);
  assert.equal(cav.run, data.run.day);
});

test("d91: the pull picks the newest run file (by date, then run number) and carries it into the data", () => {
  const wiki = fs.mkdtempSync(path.join(os.tmpdir(), "dq-wiki-"));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dq-repo-"));
  try {
    fs.mkdirSync(path.join(wiki, "tools")); fs.mkdirSync(path.join(wiki, "runs"));
    fs.writeFileSync(path.join(wiki, "tools", "export.mjs"),
      `import fs from "node:fs"; fs.writeFileSync(process.argv[2], JSON.stringify({ updated: "2026-10-22", recipes: [{ id: "a", name: "A", items: [["Rice", "1"]], steps: ["x"] }], techniques: [] }));`);
    const run = (n, day) => fs.writeFileSync(path.join(wiki, "runs", n), JSON.stringify({ day, ideas: [{ id: "a", name: n, items: [["Rice", "1"]], steps: ["y"], from: "a" }] }));
    run("2026-10-21-2.json", "2026-10-21"); run("2026-10-21-10.json", "2026-10-21"); run("2026-10-20-1.json", "2026-10-20");
    fs.writeFileSync(path.join(wiki, "runs", "notes.json"), "{}");
    fs.mkdirSync(path.join(repo, "scripts")); fs.mkdirSync(path.join(repo, "still"));
    fs.copyFileSync(here("../../scripts/pull-recipes.mjs"), path.join(repo, "scripts", "pull-recipes.mjs"));
    fs.writeFileSync(path.join(repo, "still", "quest.html"), `<script src="quest-recipe-data.js?v=1"></script>`);
    execFileSync(process.execPath, [path.join(repo, "scripts", "pull-recipes.mjs"), wiki], { stdio: "pipe" });
    const c = {}; c.globalThis = c;
    vm.runInNewContext(fs.readFileSync(path.join(repo, "still", "quest-recipe-data.js"), "utf8"), c);
    assert.equal(c.QuestRecipeData.run.file, "2026-10-21-10.json");
    assert.equal(c.QuestRecipeData.run.day, "2026-10-21");
    assert.equal(c.QuestRecipeData.run.ideas[0].name, "2026-10-21-10.json");
  } finally { fs.rmSync(wiki, { recursive: true, force: true }); fs.rmSync(repo, { recursive: true, force: true }); }
});
