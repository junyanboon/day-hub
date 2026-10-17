// node --test still/test/*.test.mjs   (Junyan 2026-10-17, d15 and d16: the gym log asks "How do you feel now?" at
// Finish and save and that answer is what pays; "don't give any points for logging it"; wiped out also costs 1 prana.
// Research: life-wiki answers/2026-10-17-strength-training-prana-and-body.md)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const read = f => fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8");
const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-levels.js", "../quest-gymlog.js"]) vm.runInNewContext(read(f), ctx);
const GL = ctx.QuestGymLog, html = read("../quest.html");
const plain = x => JSON.parse(JSON.stringify(x));

test("each answer's points at level 1 (x1.5 on gains)", () => {
  assert.deepEqual(plain(GL.feelPoints("energised", 1.5)), { b:3, p:0 });
  assert.deepEqual(plain(GL.feelPoints("good", 1.5)), { b:2, p:0 });
  assert.deepEqual(plain(GL.feelPoints("beat", 1.5)), { b:0, p:0 });
  assert.deepEqual(plain(GL.feelPoints("wiped", 1.5)), { b:-3, p:-1 });
});

test("the multiplier touches gains only", () => {
  assert.deepEqual(plain(GL.feelPoints("energised", 1)), { b:2, p:0 });
  assert.deepEqual(plain(GL.feelPoints("good", 1)), { b:1, p:0 });
  for (const m of [0.6, 1, 1.5]) assert.deepEqual(plain(GL.feelPoints("wiped", m)), { b:-3, p:-1 }, "losses at x" + m);
  assert.equal(GL.feelPoints("nope", 1.5), null);
});

test("Good is marked as the goal with a plain hint", () => {
  const goal = GL.FEEL.filter(f => f.goal);
  assert.equal(goal.length, 1);
  assert.equal(goal[0].id, "good");
  const h = GL.feelHTML(s => s, null, 1.5);
  assert.match(h, /How do you feel now\?/);
  assert.match(h, /Aim for this most sessions/);
  assert.equal((h.match(/data-feel="/g) || []).length, 4);
  assert.match(GL.feelHTML(s => s, "good", 1.5), /data-feel="good"[^>]*aria-pressed="true"/);
});

test("pays once per gym block, only with a move logged and an answer", () => {
  const key = GL.feelKey("blk1", "2026-10-17");
  assert.equal(key, "gym:blk1");
  assert.equal(GL.feelKey(null, "2026-10-17"), "gym:2026-10-17");
  assert.deepEqual(plain(GL.feelPay({}, key, "good", 2, 1.5)), { b:2, p:0 });
  assert.equal(GL.feelPay({}, key, "good", 0, 1.5), null, "no moves logged: no points");
  assert.equal(GL.feelPay({}, key, null, 3, 1.5), null, "no answer: no points");
  const mealq = { [key]: GL.feelRecord("good", { b:2, p:0 }, "2026-10-17T20:00:00Z") };
  assert.equal(GL.feelPay(mealq, key, "energised", 3, 1.5), null, "a second save of the same block pays nothing");
  assert.deepEqual(plain(GL.feelPay(mealq, GL.feelKey("blk2", "2026-10-17"), "beat", 1, 1.5)), { b:0, p:0 }, "another block still asks");
  assert.equal(mealq[key].kind, "gym");
  assert.equal(mealq[key].feel, "good");
});

test("wipedCount reads only gym answers", () => {
  assert.equal(GL.wipedCount({ "gym:a":{ kind:"gym", feel:"wiped" }, "gym:b":{ kind:"gym", feel:"good" }, "id:x":{ feel:"wiped" } }), 1);
  assert.equal(GL.wipedCount(undefined), 0);
});

test("the answer is keyed by the calendar event and cleared for another block", () => {
  assert.match(html, /const gymFeelKey = \(\) => [^\n]*gk\(blk\)/);
  assert.match(html, /!== \(block \? block\.key : null\)\) GYM\.feel = null/);
});

test("wiped out twice in 7 days suggests going lighter", () => {
  const days = { "Mon Oct 12 2026":{ wiped:1, sleep:82 }, "Sat Oct 17 2026":{ wiped:1, sleep:80 } };
  assert.match(GL.wipedReason(days, "Sat Oct 17 2026"), /lighter session, Upa Yoga or rest/);
  assert.equal(GL.wipedReason({ "Fri Oct 09 2026":{ wiped:1 }, "Sat Oct 17 2026":{ wiped:1, sleep:80 } }, "Sat Oct 17 2026"), null, "8 days apart");
  assert.equal(GL.wipedReason({ "Sat Oct 17 2026":{ wiped:1, sleep:80 } }, "Sat Oct 17 2026"), null, "once on good sleep");
});

test("wiped out once after sleep under 70 suggests going lighter", () => {
  assert.match(GL.wipedReason({ "Fri Oct 16 2026":{ wiped:1, sleep:64 } }, "Sat Oct 17 2026"), /Upa Yoga or rest/);
  assert.match(GL.wipedReason({ "Sat Oct 17 2026":{ wiped:1, sleep:64 } }, "Sat Oct 17 2026"), /Upa Yoga or rest/);
  assert.equal(GL.wipedReason({ "Mon Oct 12 2026":{ wiped:1, sleep:64 } }, "Sat Oct 17 2026"), null, "an old one fades");
  assert.equal(GL.wipedReason({ "Sat Oct 17 2026":{ wiped:0, sleep:50 } }, "Sat Oct 17 2026"), null);
});

test("the page wires it: pays at save from the answer, no points for logging, recovery reads it", () => {
  const save = html.match(/async function saveGym\(\)\{[\s\S]*?\n  \}\n/);
  assert.ok(save, "saveGym");
  assert.match(save[0], /GL\.feelPay\(/);
  assert.match(save[0], /How do you feel now/, "a save with moves and no answer asks first");
  assert.ok(!/Workout logged/.test(save[0]), "logging a workout earns nothing by itself");
  assert.match(html, /function recoveryReasons\(\)\{[\s\S]{0,900}GL\.wipedReason\(/);
  assert.match(html, /GL\.feelHTML\(/);
  assert.match(html, /quest-gymlog\.js\?v=20261017a/);
});
