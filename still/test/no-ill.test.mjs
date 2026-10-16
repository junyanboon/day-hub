// node --test still/test/*.test.mjs   (Junyan 2026-10-16 about the gym window: "drop the illness thing")
// The "I'm ill" feature is gone: no button, no "You're ill today" note, no daily "Still ill?" prompt, no "skipped, ill"
// counts. Skip (beside Close, with "Are you sure?") is how he takes a session off. His saved state can still hold an
// old ill answer (G.ill, kept by the shared merge file); the page never reads it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const html = fs.readFileSync(here + "quest.html", "utf8");

test("the page renders no ill control, note or prompt", () => {
  for (const s of ["I'm ill", "I'm better", "Still ill", "You're ill", "Yes, still ill", "gmv-ill", "data-gmvill", "illYes", "illNo",
    "Reschedule or ill", "skipped, ill", "nothing new placed", "ill today", "🤒"])
    assert.ok(!html.includes(s), `quest.html still has ${JSON.stringify(s)}`);
});

test("a saved ill flag is never read: no G.ill, no illToday, no ill go-easy reason, no daily ask", () => {
  for (const re of [/\bG\.ill\b/, /\billToday\b/, /\baskIll\b/, /\bsetIll\b/, /\billDays\b/, /\billStatus\b/, /quest-ill-asked/, /\["ill"\]/, /plan\.ill\b/])
    assert.ok(!re.test(html), `quest.html still has ${re}`);
});

test("the gym counts saved on the phone before this change are not shown again", () => {
  // today's saved copy says "ill, nothing new placed" and holds off the planner for 2 hours; new keys skip it
  for (const re of [/"quest-gym-wk"/, /"quest-gym-at"/, /excused/]) assert.ok(!re.test(html), `quest.html still has ${re}`);
});

test("Skip beside Close, with Are you sure?, stays", () => {
  for (const re of [/id="gSkip">Skip<\/button>` : ""}<button class="btn ghost small" id="gClose">Close/, /Are you sure\? /, /async function skipGym\(/,
    /<div class="glabel">Reschedule<\/div>/])
    assert.ok(re.test(html), `quest.html lost ${re}`);
});
