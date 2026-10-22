// node --test still/test/*.test.mjs   (the recipe book, Junyan 2026-10-22, d8 to d10)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-library.js", import.meta.url)), "utf8"), ctx);
const L = ctx.QuestLibrary;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const data = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../quest-library.json", import.meta.url)), "utf8"));

test("the whole Paprika book is there, text only, with the onion and garlic ones marked", () => {
  const list = L.load(data);
  assert.equal(list.length, 401);
  assert.ok(list.every((r) => r.name && r.items.length >= 0));
  assert.ok(list.some((r) => r.swap.includes("garlic")));
  assert.doesNotMatch(JSON.stringify(data), /\.(jpe?g|png|heic)"/i);
  assert.ok(fs.statSync(fileURLToPath(new URL("../quest-library.json", import.meta.url))).size < 1.2e6);
});

test("search: every word in the name or an ingredient, name hits first; chips filter", () => {
  const list = L.load({ recipes: [
    { id: "a", n: "Tahini dressing", i: ["2 tbsp tahini"], r: 4 },
    { id: "b", n: "Green salad", i: ["1 tbsp tahini", "1 clove garlic"], x: ["garlic"] },
    { id: "c", n: "Mango pudding", g: ["desserts"] },
  ] });
  assert.deepEqual(L.search(list, "tahini", "all").map((r) => r.id), ["a", "b"]);
  assert.deepEqual(L.search(list, "", "ok").map((r) => r.id), ["a", "c"]);
  assert.deepEqual(L.search(list, "", "sweet").map((r) => r.id), ["c"]);
  assert.deepEqual(L.search(list, "", "fav").map((r) => r.id), ["a"]);
  assert.equal(L.sub(list[1]), "needs a swap");
  assert.match(L.swapLine(list[1]), /garlic/);
});

test("the page loads the book only when it opens, from a ?v= file", () => {
  assert.match(html, /quest-library\.js\?v=/);
  assert.doesNotMatch(html, /<script src="quest-library\.json/);
  assert.match(html, /fetch\(`quest-library\.json\?v=\$\{QL\(\)\.V\}`\)/);
  assert.equal((html.match(/data-rbook>/g) || []).length, 2);
});
