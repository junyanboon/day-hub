// node --test still/test/*.test.mjs   The calendar's hidden readout (Junyan, 2026-11-12, d18: "18 yes") costs nothing
// until it is opened, and every copy of the page names its build so a phone screenshot proves which copy ran.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("..", import.meta.url));
const html = fs.readFileSync(dir + "calendar.html", "utf8");

test("the page names its build", () => {
  assert.match(html, /const BUILD = "\d{4}-\d{2}-\d{2}[a-z]?[^"]*"/);
});

test("the readout script is not loaded with the page, only on demand", () => {
  assert.doesNotMatch(html, /<script src="calendar-readout\.js/);
  assert.match(html, /calendar-readout\.js\?v=\w+/);
  assert.ok(fs.existsSync(dir + "calendar-readout.js"));
});
