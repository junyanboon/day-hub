// node --test still/test/*.test.mjs   (Junyan, 2026-10-21: "I only need ingredients when I expand something like Super
// veggie.. Also what's important is me to capture the ingredients by MEAL not dishes. Super Veggie is my meal, Nutty
// pudding is my meal"; d86: the What did you eat? box is not useful)
// The meal sheet opens on "What's this meal?": compact choice cards, no ingredients. A tap makes it this meal (rec.m);
// it opens with its parts and the kitchen buttons; the other choices fold into Change meal, which puts back what the old
// dish took (asked once). No "full for today". Drains are small buttons; one Counted line says what scored.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const html = fs.readFileSync(here("../quest.html"), "utf8");
const sheet = html.slice(html.indexOf("function openMeal(b)"), html.indexOf("The meal sheet's kitchen parts"));

test("the choices: Blueprint, his dishes, recipes (or ideas), then Something else, as compact cards with no ingredients", () => {
  const pc = sheet.slice(sheet.indexOf("const pickCard ="), sheet.indexOf("const picker ="));
  assert.ok(pc.length > 100, "found the choice card");
  assert.ok(!/items|mq-ing|mq-rows/.test(pc), "no ingredients on a closed card");
  assert.ok(pc.includes('data-mpick="${esc(d.id)}"'));
  const ch = sheet.slice(sheet.indexOf("const choices ="), sheet.indexOf("const pickSub ="));
  const b = ch.indexOf("bpNow]"), o = ch.indexOf('"Your dishes"'), r = ch.indexOf("RL || IT.list");
  assert.ok(b > 0 && o > b && r > o, "Blueprint, his dishes, then recipes or ideas");
  assert.ok(sheet.includes("${pickCard(MEAL, cur === MEAL.id)}"), "Something else last");
  // no meal yet: only the choices; a meal: its card open, Change meal folds the choices
  assert.ok(sheet.includes('${mainId ? `<div class="mq-mhd">${lb("This meal", "mb", 0)}${soloBtn()}<button type="button" class="mq-mini mq-howbtn" data-mchange'), "Change meal sits on the heading");
  assert.ok(sheet.includes("data-mchange") && sheet.includes('${chg ? `<div class="mq-pick">${picker(mainId)}</div>` : ""}'));
});

test("a tap stores the pick; changing dish takes the old one off (ticks and added foods), asked once when anything was ticked", () => {
  const h = sheet.slice(sheet.indexOf('querySelectorAll("[data-mpick]")'), sheet.indexOf("$(\"mEdit\")"));
  assert.ok(h.length > 300, "found the handler");
  assert.ok(h.indexOf("confirm(") > 0 && h.indexOf("confirm(") < h.indexOf("dropExtraFrom("), "asked before anything moves");
  assert.ok(h.includes("if (busy.length && !confirm("), "asked only when something was on the old dish");
  assert.ok(h.includes('tickDish(d, "none", undefined, fx)'), "its ticks come off and the kitchen gets them back (kitDinner)");
  assert.ok(h.includes("QK().eat(G.kitchen, kitToday(), kPre + e.id, { id:e.id }, false, now())"), "old From your kitchen ticks are put back too");
  assert.ok(h.indexOf("QM.setPick(mealRec(), id)") > h.indexOf("dropExtraFrom("), "the pick is stored after the old dish is off");
  assert.ok(h.includes("syncFoods()"), "the food tiles follow");
});

test("the open meal ends with the kitchen buttons: a search field, the kitchen in use by food group, the amount or how many?", () => {
  const kp = sheet.slice(sheet.indexOf("const kitPanel = d =>"), sheet.indexOf("const extrasBlock = d =>"));
  assert.ok(kp.includes('<input type="search" class="mq-xs" data-xs="${esc(d.id)}"'));
  assert.ok(kp.includes("QK().mealList(G.kitchen, kitToday())"), "what the kitchen in use has");
  assert.ok(kp.includes("QK().hasQ(x) ? x.amt : QK().ASK"), "the amount, or how many?");
  assert.ok(sheet.includes("mealCard(id, id === mainId ? kitPanel("), "on the meal's own dish only");
  // typing narrows the buttons in place (a redraw would drop the keyboard)
  const xs = sheet.slice(sheet.indexOf('querySelectorAll("[data-xs]")'), sheet.indexOf('querySelectorAll("[data-xoff]")'));
  assert.ok(xs.includes("x.hidden = !!hit && !hit.has(x.dataset.xit)") && !xs.includes("redraw("));
  // a tap adds a row with a first amount (one of a piece food, a portion by weight), changeable
  assert.ok(sheet.includes("QK().firstTake(x.it)"));
});

test("no 'full for today': a capped Blueprint dish logs in full and says so softly inside the open card", () => {
  assert.ok(!/<small>full for today|>full for today</.test(sheet));
  assert.ok(sheet.includes("const capped = pay && !max && !pd;"));
  assert.ok(sheet.includes("No more points today"));
});

test("d83, d84: Counted line; drains as small buttons; the tiles are synced after a change, never on opening", () => {
  assert.ok(sheet.includes('"Counted"}: ${esc([...new Set(words)].join(", "))} · ${sign(tot)}`'));   // d87: "Counted (your 59%):" on a shared meal
  assert.ok(sheet.includes('<div class="mq-drs">${QM.DRAINS.map(drain).join("")}</div>'));
  const top = sheet.slice(0, sheet.indexOf("const sh = $(\"sheet\")"));
  assert.ok(!top.includes("syncFoods("), "opening a meal pays nothing new");
  for (const at of ["putRec(QM.addExtra(", "dropExtraFrom(d, bn.dataset.xn); syncFoods();", "const op = tickDish(d, how, amts, fx);\n      syncFoods();"])
    assert.ok(sheet.includes(at), at);
  assert.ok(html.includes("function mealFoods(k, rec){"), "every logged food: dish ticks, added foods, old kitchen ticks");
  assert.ok(!/[—–]/.test(sheet.slice(sheet.indexOf("const kitPanel"), sheet.indexOf("const slotCard"))), "no dashes in the new words");
});
