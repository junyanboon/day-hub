// node --test still/test/*.test.mjs   (practice values, Junyan 2026-10-19, d25 and d26)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-basics.js", "../quest-meals.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const B = ctx.QuestBasics, M = ctx.QuestMeals;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");

const WANT = { angam:50, yogasana:50, shambhavi:40, surya:40, kriya:20, bhuta:16, upa:10, nadi:8, lamp:3, neem:3 };   // yoga doubled 2026-10-22

test("each practice in a block checklist pays exactly its listed value, with no level multiplier", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(B.PRACTICE_PAY)), WANT);
  for (const [id, v] of Object.entries(WANT)) {
    assert.equal(B.practicePay(id, 0, 1), v, id);       // first tick
    assert.equal(B.practicePay(id, 1, 1), 0, id);       // past the daily limit: nothing
  }
  assert.equal(B.practicePay("lamp", 1, 2), 3);         // the lamp's second tick (Wind-down) pays the same
  assert.equal(B.practicePay("water", 0, 12), null);    // not a practice: the page's own rule
});

test("quest.html's habit list carries the same values, and habitGain uses practicePay", () => {
  for (const [id, v] of Object.entries(WANT)) {
    const m = new RegExp(`\\["${id}", "[^"]*", (\\d+(?:\\.\\d+)?),`).exec(html);
    assert.ok(m, id); assert.equal(+m[1], v, id);
  }
  assert.match(html, /practicePay\(id, n, h\[3\]\)/);
});

test("yoga pays a lot more (2026-10-22): Shambhavi and one long practice take prana to about 90", () => {
  assert.equal(B.practicePay("shambhavi", 0, 1) + B.practicePay("angam", 0, 1), 90);
  assert.equal(B.practicePay("lamp", 0, 2) + B.practicePay("neem", 0, 1), 6);   // the lamp and neem stay as they were
});
