#!/usr/bin/env node
/* Copy his recipe book (recipe-wiki/library/, all of Paprika, d8) into Day Quest (2026-10-22, d9).
   Runs the wiki's tools/export-library.mjs into a temp file, writes still/quest-library.json and gives V in
   still/quest-library.js a new value, so phones fetch the new book instead of the saved copy.
   Usage:  node scripts/pull-library.mjs [path to recipe-wiki]   (default ../recipe-wiki; RECIPE_WIKI overrides)
   Then run the tests, commit, open a PR. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "..");
const wiki = path.resolve(process.argv[2] || process.env.RECIPE_WIKI || path.join(repo, "..", "recipe-wiki"));
const exporter = path.join(wiki, "tools", "export-library.mjs");
if (!fs.existsSync(exporter)) { console.error(`No library export at ${exporter}`); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dq-library-")), out = path.join(tmp, "library.json");
execFileSync(process.execPath, [exporter, out], { cwd: wiki, stdio: "inherit" });
const data = JSON.parse(fs.readFileSync(out, "utf8"));
fs.rmSync(tmp, { recursive: true, force: true });
if (!Array.isArray(data.recipes) || !data.recipes.length) { console.error("The export has no recipes; nothing written."); process.exit(1); }

const file = path.join(repo, "still", "quest-library.json"), body = JSON.stringify(data) + "\n";
const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
if (old.replace(/"updated":"[^"]*"/, "") === body.replace(/"updated":"[^"]*"/, "")) { console.log("Recipe book unchanged."); process.exit(0); }
fs.writeFileSync(file, body);

const js = path.join(repo, "still", "quest-library.js"), src = fs.readFileSync(js, "utf8");
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 12);
fs.writeFileSync(js, src.replace(/const V = "\w+";/, `const V = "${stamp}";`));
console.log(`Wrote still/quest-library.json: ${data.recipes.length} recipes, ${Math.round(body.length / 1024)} KB (V ${stamp}). Bump quest-library.js?v= in quest.html.`);
