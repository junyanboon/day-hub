// node --test still/test/*.test.mjs   (Junyan 2026-11-01, d26: stop making Notion Day Plan pages)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

test("rollover.py never creates a Notion page", () => {
  const py = read("../../scripts/rollover.py");
  assert.doesNotMatch(py, /api\.notion\.com/);
  assert.doesNotMatch(py, /NOTION_DAYPLAN_DS|notion_create_day/);
  assert.match(py, /def update_hub/); // hub steps stay
});

test("rollover workflow does not need or pass a Notion token", () => {
  const yml = read("../../.github/workflows/rollover.yml");
  assert.doesNotMatch(yml, /NOTION/);
});
