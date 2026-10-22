#!/usr/bin/env node
/* Copy his recipe book (the recipe wiki) into Day Quest (d79, 2026-10-21).
   Runs the wiki's own export (tools/export.mjs) into a temp file, never into the wiki folder, then writes
   still/quest-recipe-data.js (window.QuestRecipeData = <the export>) and gives its ?v= stamp in still/quest.html a new
   value, so phones load the new recipes instead of the saved copy.
   Usage:  node scripts/pull-recipes.mjs [path to recipe-wiki]
   Default wiki path: ../recipe-wiki next to day-hub (RECIPE_WIKI overrides). Then run the tests, commit, open a PR.
   2026-10-22 (d91): it also brings in the recipe agent's latest run (runs/<date>-<n>.json, the newest date, then the
   highest run number) as data.run = { day, file, ideas }, so a recipe the agent adapted to his kitchen shows that version. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "..");
const wiki = path.resolve(process.argv[2] || process.env.RECIPE_WIKI || path.join(repo, "..", "recipe-wiki"));
const exporter = path.join(wiki, "tools", "export.mjs");
if (!fs.existsSync(exporter)) { console.error(`No recipe wiki export at ${exporter}`); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dq-recipes-")), out = path.join(tmp, "recipes.json");
execFileSync(process.execPath, [exporter, out], { cwd: wiki, stdio: "inherit" });
const data = JSON.parse(fs.readFileSync(out, "utf8"));
fs.rmSync(tmp, { recursive: true, force: true });
if (!Array.isArray(data.recipes) || !data.recipes.length) { console.error("The export has no recipes; nothing written."); process.exit(1); }

// the latest run of tonight's ideas, read only (d91)
const runsDir = path.join(wiki, "runs");
const runs = (fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : [])
  .map((f) => ({ f, m: f.match(/^(\d{4}-\d{2}-\d{2})-(\d+)\.json$/) })).filter((x) => x.m)
  .sort((a, b) => (a.m[1] < b.m[1] ? -1 : a.m[1] > b.m[1] ? 1 : +a.m[2] - +b.m[2]));
for (const { f, m } of runs.reverse()) {
  let run;
  try { run = JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8")); } catch { console.error(`Skipped ${f}: not valid JSON.`); continue; }
  if (!Array.isArray(run.ideas) || !run.ideas.length) { console.error(`Skipped ${f}: no ideas.`); continue; }
  data.run = { day: typeof run.day === "string" ? run.day : m[1], file: f, ideas: run.ideas };
  break;
}

const file = path.join(repo, "still", "quest-recipe-data.js");
const body = `/* His recipe book, copied from the recipe wiki by scripts/pull-recipes.mjs on ${data.updated || "?"}. Do not edit by
   hand: change the wiki and run the script again. Read by quest-recipes.js. */\n` +
  `(typeof window !== "undefined" ? window : globalThis).QuestRecipeData = ${JSON.stringify(data, null, 1)};\n`;
const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
if (old === body) { console.log("Recipes unchanged."); process.exit(0); }
fs.writeFileSync(file, body);

// a new ?v= stamp, so the service worker fetches the new copy (still/test/version-stamps.test.mjs checks this)
const html = path.join(repo, "still", "quest.html"), page = fs.readFileSync(html, "utf8");
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 12);
const next = page.replace(/(<script src="quest-recipe-data\.js\?v=)\w+(")/, `$1${stamp}$2`);
if (next === page) console.error("quest.html has no quest-recipe-data.js script tag; add it by hand.");
else fs.writeFileSync(html, next);
console.log(`Wrote ${path.relative(repo, file)}: ${data.recipes.length} recipes${data.run ? `, run ${data.run.file} (${data.run.ideas.length} ideas)` : ", no run"} (stamp ${stamp}).`);
