// node --test still/test   (Day Quest short names, 2026-10-14)
// Junyan: "Why does it say 'See notes' in the calendar? It should say Tour."
// The Joint Plans event is titled "Tour - See notes"; the name rule dropped "Tour - " and kept the pointer.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const here = new URL("..", import.meta.url).pathname;
function core(file = process.env.QUEST_CORE || here + "quest-core.js") {
  const ctx = {}; ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(file, "utf8"), ctx);
  return ctx.QuestCore;
}
// quest.html keeps its own copy of shortName; pull it out and run it the same way
function pageShortName() {
  const html = fs.readFileSync(here + "quest.html", "utf8");
  const SHORT = /\n  const SHORT = \[[\s\S]*?\n  \];\n/.exec(html)[0];
  const VAGUE = /\n  const VAGUE = .*\n/.exec(html)?.[0] || "";
  const fn = /\n  function shortName\(b\)\{[\s\S]*?\n  \}\n/.exec(html)[0];
  const ctx = {}; vm.runInNewContext(SHORT + VAGUE + fn + "\nthis.shortName = shortName;", ctx);
  return ctx.shortName;
}

const CASES = [
  ["Tour - See notes", "Tour"],
  ["Tour - Activities (See notes)", "Tour"],
  ["Tour - Safari Day", "Safari Day"],
  ["Trip: details", "Trip"],
  ["Shali Fortress - see notes", "Shali Fortress"],
  ["Sunset", "Sunset"],
  ["Open space", "Your move"],
];

for (const [name, get] of [["quest-core.js", () => core().shortName], ["quest.html", pageShortName]]) {
  test(`${name}: a tour whose name points at the notes reads Tour`, () => {
    const shortName = get();
    for (const [t, want] of CASES) assert.equal(shortName({ t }), want, t);
  });
}
