// node --test still/test/*.test.mjs   (Junyan, 2026-10-21, d88 = a): the "How to eat" tips leave the meal sheet.
// One tip shows on the meal itself, on the Right now card, while a meal block is on now and in the 10 minutes before it
// starts. It turns by date and by which meal of the day it is, one short line, nothing on past or future meals, no points.
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
const sheet = html.slice(html.indexOf("function openMeal(b)"), html.indexOf("A walk, hike or other outdoor block"));

test("each tip has a short line for the meal block", () => {
  assert.deepEqual(J(M.TIPS.map(t => t[2])), ["eat it fresh, within 1.5 h of cooking",
    "sit two minutes first, phone face down", "stop before full, feel light 30 min after"]);
  for (const t of M.TIPS) assert.ok(t[2].length <= 42, t[2]);
});

test("the tip turns: the three meals of a day get three different tips, and a meal's tip changes the next day", () => {
  const day = d => [0, 1, 2].map(n => M.tipFor(d, n)[2]);
  assert.equal(new Set(day("2026-10-21")).size, 3);
  for (let n = 0; n < 3; n++) assert.notEqual(M.tipFor("2026-10-21", n)[2], M.tipFor("2026-10-22", n)[2], "meal " + n);
  assert.equal(M.tipFor("2026-10-21", 2)[2], M.tipFor("2026-10-21", 2)[2], "the same meal keeps its tip all through");
  assert.deepEqual(J(M.tipFor("2026-10-21", 3)), J(M.tipFor("2026-10-21", 0)), "a fourth meal wraps round");
  assert.ok(M.tipFor("bad", 0), "never empty");
});

test("the tip shows only while the meal is on, and from 10 minutes before it starts", () => {
  const s = Date.UTC(2026, 9, 21, 23, 0), e = s + 3600000, min = 60000;
  assert.equal(M.TIP_LEAD, 10 * min);
  assert.equal(M.tipShows(s, e, new Date(s - 11 * min)), false, "too early");
  assert.equal(M.tipShows(s, e, new Date(s - 10 * min)), true, "10 minutes before");
  assert.equal(M.tipShows(s, e, new Date(s + 30 * min)), true, "on now");
  assert.equal(M.tipShows(s, e, new Date(e)), false, "over");
  assert.equal(M.tipShows(new Date(s), new Date(e), new Date(s)), true, "Date objects too");
});

test("the meal sheet has no How to eat box any more", () => {
  assert.ok(!sheet.includes("QM.TIPS") && !sheet.includes("How to eat") && !sheet.includes("mq-tips"));
  assert.ok(!/\.mq-tips\s*\{/.test(html), "its style left too");
});

test("the page draws the tip on the meal block on the Right now card, the between card and the Next line only", () => {
  const fn = html.slice(html.indexOf("function mealTip("), html.indexOf("// d78: a meal that ends less than 3 hr"));
  assert.ok(fn.includes("if (!b || !isMeal(b)"), "only meal blocks");
  assert.ok(fn.includes("QM.tipShows(b.s, b.e, t)"), "only while it is on, or 10 minutes before");
  assert.ok(fn.includes("QM.tipFor("), "turned by date and meal");
  assert.ok(!/addPrana|addBody|logHabit|xp/.test(fn), "no points");
  const main = html.slice(html.indexOf("// main card"), html.indexOf('put("main", html);'));
  assert.ok(main.includes("mealTip(cur, all, t)"), "the meal on now");
  assert.ok(main.includes("mealTip(nxt, all, t)"), "a meal about to start, between blocks");
  const nl = html.slice(html.indexOf('put("nextLine"'), html.indexOf('put("nextLine"') + 400);
  assert.ok(nl.includes("mealTip(nxt, all, t)") && nl.includes('isMeal(cur) ? "" : mealTip(nxt, all, t)'), "a meal about to start after another block");
  assert.match(html, /\.mealtip \{[^}]*white-space:nowrap[^}]*text-overflow:ellipsis/, "one line");
  const cal = html.slice(html.indexOf("function calendarHTML("), html.indexOf("function calDayLine("));
  assert.ok(!cal.includes("mealTip("), "nothing on calendar blocks, past or future");
});
