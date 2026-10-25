// node --test still/test/*.test.mjs
// Junyan, 2026-10-25: d70 ("70 yes", freshness dates, no levels), d71 ("71 yes", dinner ideas use the old food first).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-kitchen.js", "../quest-merge.js", "../quest-ideas.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const K = ctx.QuestKitchen;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const NOW = Date.parse("2026-10-25T16:00:00Z"), D = 86400000;
const walnut = (k) => K.item(k, "h:walnuts");

test("d70: no bought date, no age and no words added", () => {
  const k = {};
  assert.equal(K.age(walnut(k), NOW), null);
  assert.equal(K.useUp(k, "home", NOW).length, 0);
  assert.equal(K.tileLine(walnut(k), NOW, NOW + 7 * D), K.ASK);
});

test("d70: nuts bought 2 months ago are fine, 10 weeks use soon, 6 months getting old", () => {
  let k = K.bought({}, "h:walnuts", 2, NOW);
  assert.equal(K.age(walnut(k), NOW).word, "ok");
  assert.equal(K.boughtAgo(walnut(k), NOW), 2);
  k = K.bought({}, "h:walnuts", 2.5, NOW);
  assert.equal(K.age(walnut(k), NOW).word, "soon");
  assert.match(K.tileLine(walnut(k), NOW, NOW + 7 * D), /use soon$/);
  k = K.bought({}, "h:walnuts", 6, NOW);
  assert.equal(K.age(walnut(k), NOW).word, "old");
  assert.match(K.tileLine(walnut(k), NOW, NOW + 7 * D), /getting old$/);
  assert.equal(K.boughtAgo(walnut(k), NOW), 6);
});

test("d70: lentils keep a year, the freezer about 4 months", () => {
  const k = K.bought(K.bought({}, "h:black-lentils", 6, NOW), "h:peas", 6, NOW);
  assert.equal(K.age(K.item(k, "h:black-lentils"), NOW).word, "ok");
  assert.equal(K.age(K.item(k, "h:peas"), NOW).word, "old");
});

test("d70: Use it up lists the oldest long-life food first, no fresh food, at most 5", () => {
  let k = {};
  for (const [id, m] of [["h:walnuts", 6], ["h:almonds", 3], ["h:chia-seeds", 1], ["h:broccoli", 1], ["h:hemp-seeds", 4], ["h:brazil-nuts", 5], ["h:pumpkin-seeds", 5], ["h:macadamias", 4]])
    k = K.bought(k, id, m, NOW);
  const up = K.useUp(k, "home", NOW);
  assert.equal(up.length, 5);
  assert.equal(up[0].it.id, "h:walnuts");
  assert.ok(!up.some((x) => x.it.id === "h:broccoli" || x.it.id === "h:chia-seeds"));
});

test("d71: dinner ideas count use-soon and old items as use first", () => {
  const src = fs.readFileSync(fileURLToPath(new URL("../quest-ideas.js", import.meta.url)), "utf8");
  assert.match(src, /useUp\(K0, k, t0, 99\)/);
});

test("d70: the item page asks when it was bought, the sheet shows Use it up", () => {
  assert.match(html, /data-kib="\$\{m\}"/);
  assert.match(html, /<b>Use it up:<\/b>/);
  assert.doesNotMatch(K.tileLine(walnut(K.bought({}, "h:walnuts", 6, NOW)), NOW, NOW), /plenty|\bhalf\b|\blow\b|\bout\b/i);
});
