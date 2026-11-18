// node --test still/test/*.test.mjs
// 2026-11-03: the Calendar heading (with "Open calendar app") sat half hidden under the sticky "TODAY" label.
// The heading wore class "cal-h", the same class as a block's drag handles (position:absolute, 9 px tall),
// so the heading took the handles' look. The heading keeps its own class.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");

test("the Calendar heading does not share a class with the drag handles", () => {
  const h2 = html.match(/<h2 class="([^"]*)"><span>Calendar<\/span>/);
  assert.ok(h2, "Calendar heading found");
  const handle = html.match(/<i class="(cal-[\w-]+) top" data-h="top">/)[1];
  assert.ok(!h2[1].split(/\s+/).includes(handle), `heading class "${h2[1]}" is the handle class "${handle}"`);
  assert.ok(html.includes("calAppBtn"), "Open calendar app button still there");
});
