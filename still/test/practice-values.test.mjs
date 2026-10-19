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

const WANT = { angam:25, yogasana:25, shambhavi:20, surya:20, kriya:10, bhuta:8, upa:5, nadi:4, lamp:3, neem:3 };

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

test("a realistic strong day with pranic food lands at about 71 prana", () => {
  const ticks = ["shambhavi", "angam", "bhuta", "lamp", "neem"];   // Shambhavi, one long practice, Bhuta Shuddhi, lamp, neem
  const practice = ticks.reduce((s, id) => s + B.practicePay(id, 0, 2), 0);
  assert.equal(practice, 59);
  // pranic food across the day's meals, at level 1 (x1.5): fresh fruit, fresh vegetables, ate with attention, stopped before full
  const food = ["fruit", "fveg", "attn", "light"].reduce((s, id) => s + M.value(id, { mult:1.5 }), 0);
  assert.equal(food, 12);
  assert.ok(Math.abs(practice + food - 71) <= 2, String(practice + food));
});
