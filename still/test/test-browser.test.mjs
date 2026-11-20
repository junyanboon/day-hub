// Rule (Junyan, 2026-11-20, a16): day planner browser tests and scripts never open his installed Google Chrome.
// They use the test-only chrome-headless-shell through still/test/helpers/test-browser.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { findTestBrowser } from "./helpers/test-browser.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const HELPER = path.join(path.dirname(SELF), "helpers", "test-browser.mjs");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === ".claude") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(m?js|cjs|sh|py)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("no file in the repo launches the installed Chrome", () => {
  const bad = [];
  for (const f of walk(ROOT)) {
    if (f === SELF || f === HELPER) continue;
    const s = fs.readFileSync(f, "utf8");
    if (/channel\s*:\s*["']chrome/.test(s) || /\/Applications\/[^"'\n]*Google Chrome/.test(s)) bad.push(path.relative(ROOT, f));
  }
  assert.deepEqual(bad, []);
});

test("every file that launches a browser goes through the test-browser helper", () => {
  const bad = [];
  for (const f of walk(ROOT)) {
    if (f === SELF || f === HELPER) continue;
    const s = fs.readFileSync(f, "utf8");
    if (/chromium\.launch\(/.test(s)) bad.push(path.relative(ROOT, f));
  }
  assert.deepEqual(bad, []);
});

test("the helper refuses the installed Chrome, even when CHROME_BIN names it", () => {
  const fake = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  assert.equal(findTestBrowser({ env: { CHROME_BIN: fake }, cacheDir: "/nonexistent" }), null);
});

test("the helper never returns an /Applications path", () => {
  const got = findTestBrowser();
  if (got) assert.ok(!got.startsWith("/Applications/"), got);
});

test("the helper finds chrome-headless-shell in the cache and ignores a missing one", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-"));
  assert.equal(findTestBrowser({ env: {}, cacheDir: dir }), null);
  const bin = path.join(dir, "chrome-headless-shell", "mac_arm-1", "chrome-headless-shell-mac-arm64", "chrome-headless-shell");
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(bin, "");
  assert.equal(findTestBrowser({ env: {}, cacheDir: dir }), bin);
  fs.rmSync(dir, { recursive: true, force: true });
});
