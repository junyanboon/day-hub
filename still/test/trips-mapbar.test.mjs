// Trip map toolbar must not clip or overlap at desktop widths (Junyan 2026-11-02: "Top left corner needs fixing")
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const src = fs.readFileSync(fileURLToPath(new URL("../quest-trips.js", import.meta.url)), "utf8");

test("map toolbar wraps instead of squeezing buttons", () => {
  assert.match(src, /#tripView \.mapbar\{[^}]*flex-wrap:wrap/);
  assert.match(src, /#tripView \.mapbar \.btn\{[^}]*flex:none/);
});
test("import button uses a short label, full text as tooltip", () => {
  assert.match(src, /id="tvImport" title="Import a Google list[^"]*">⬆ Import list<\/button>/);
});
test("map pane clips its own overflow so no label spills outside", () => {
  assert.match(src, /#tripView \.right\{[^}]*overflow:hidden/);
  assert.match(src, /#tripView \.mapwrap\{[^}]*overflow:hidden/);
});
