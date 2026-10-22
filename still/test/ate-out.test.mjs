// node --test still/test/*.test.mjs   (Junyan, 2026-10-22, d13: "I ate out for dinner, how will I note this", "eating
// out really hurts me even if I try to eat healthy"). Ate out is a meal choice that takes prana and body, has the tap
// buttons for what helped and what hurt, and is counted per week.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const html = fs.readFileSync(here + "quest.html", "utf8");
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(here + "quest-meals.js", "utf8"), ctx);
const M = ctx.QuestMeals;
const J = x => JSON.parse(JSON.stringify(x));

test("Ate out takes prana and body, never grows with the level, and a second tap gives it back", () => {
  assert.equal(M.value("outp", { mult: 3 }), -4);
  assert.equal(M.meterOf("outp"), "p");
  assert.equal(M.meterOf("outb"), "b");
  assert.deepEqual(J(M.score({ outp: true, outb: true }, {})), { p: -4, b: -4 });
  let r = M.handTap(null, "outp", {}).rec; r = M.handTap(r, "outb", {}).rec;
  assert.deepEqual([r.p, r.b], [-4, -4]);
  r = M.handTap(r, "outb", {}).rec;
  assert.equal(r.b, 0);
});

test("a day's tally counts a meal out, also as a drain", () => {
  assert.deepEqual(J(M.tally({ dinner: { sel: ["outp", "outb", "fveg"] }, lunch: { sel: ["coffee"] } })), { foods: 1, drains: 2, out: 1 });
});

test("the week's count runs Monday to today", () => {
  // 2026-10-22 is a Thursday: the week began Monday 2026-10-19
  const days = [{ day: "2026-10-18", out: 2 }, { day: "2026-10-19", out: 1 }, { day: "2026-10-21" }, { day: "2026-10-22", out: 1 }];
  assert.equal(M.outWeek(days, "2026-10-22"), 2);
  assert.equal(M.outWeek(days, "2026-10-19"), 1);
});

test("the meal sheet: Ate out beside Something else, its own card with the place and the help and hurt buttons", () => {
  const sheet = html.slice(html.indexOf("function openMeal(b){"), html.indexOf("The meal sheet's kitchen parts"));
  assert.ok(sheet.includes('const OUT = { id:"out", name:"Ate out", icon:"🍴", items:[] };'));
  assert.ok(sheet.includes("${pickCard(MEAL, cur === MEAL.id)}${pickCard(OUT, cur === OUT.id)}"));
  assert.ok(sheet.includes('lb("What helped"') && sheet.includes('lb("What hurt"'));
  assert.ok(sheet.includes("data-mplace") && sheet.includes("r.place = v"));
  assert.ok(sheet.includes("QM.OUT_IDS.forEach"), "the cost goes on with the pick and off when the meal changes");
  assert.ok(html.includes("out:t.out") && html.includes("function outThisWeek()"), "the day history keeps meals out");
});
