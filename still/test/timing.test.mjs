// node --test still/test/*.test.mjs   (?timing=1: when each load step happened, on screen and in the console, d102)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-timing.js", import.meta.url)), "utf8"), ctx);
const QT = ctx.QuestTiming;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");

const clock = () => { let t = 0; return { now: () => t, set: v => { t = v; } }; };

test("off unless ?timing=1: no marks, no log, fetch left as it was", () => {
  const logs = [], c = clock(), f = async () => ({ ok: true, status: 200 });
  const T = QT.create({ search: "?api=x", now: c.now, log: s => logs.push(s) });
  assert.equal(T.on, false);
  T.mark("page start");
  assert.equal(T.wrapFetch(f), f);
  assert.deepEqual([...T.lines()], []);
  assert.deepEqual(logs, []);
});

test("on: each mark is ms since page start, on screen and in the console", () => {
  const logs = [], c = clock();
  const T = QT.create({ search: "?timing=1", now: c.now, log: s => logs.push(s) });
  assert.equal(T.on, true);
  c.set(12.4); T.mark("page start");
  c.set(40); T.mark("saved day skipped", "no saved day on this device");
  assert.deepEqual([...T.lines()], ["+12 ms  page start", "+40 ms  saved day skipped: no saved day on this device"]);
  assert.deepEqual(logs, ["[timing] +12 ms  page start", "[timing] +40 ms  saved day skipped: no saved day on this device"]);
});

test("each fetch gets a start and an end line, named for plan, edits, tasks, game state and Oura", async () => {
  const c = clock(), T = QT.create({ search: "?timing=1", now: c.now, log: () => {} });
  const f = T.wrapFetch(async (url) => { c.set(c.now() + 300); if (/sleep/.test(url)) throw new Error("Failed to fetch"); return { ok: true, status: 200 }; });
  await f("https://x/plan?date=2026-11-03");
  await f("https://x/ops?d=Tue%20Nov%2003%202026");
  await f("https://x/tasks");
  await f("https://x/quest/state", { method: "POST" });
  await f("https://x/readiness");
  await assert.rejects(f("https://x/sleep"));
  assert.deepEqual([...T.lines()], [
    "+0 ms  plan 2026-11-03 start", "+300 ms  plan 2026-11-03 end 200 (300 ms)",
    "+300 ms  edits start", "+600 ms  edits end 200 (300 ms)",
    "+600 ms  tasks start", "+900 ms  tasks end 200 (300 ms)",
    "+900 ms  game state POST start", "+1200 ms  game state POST end 200 (300 ms)",
    "+1200 ms  Oura readiness start", "+1500 ms  Oura readiness end 200 (300 ms)",
    "+1500 ms  Oura sleep start", "+1800 ms  Oura sleep failed: Failed to fetch (300 ms)",
  ]);
});

test("quest.html marks the steps: page start, saved day drawn or skipped with why, fresh calendar drawn", () => {
  assert.match(html, /<script src="quest-timing\.js\?v=\w+"><\/script>/);
  assert.ok(html.indexOf("quest-timing.js") < html.indexOf("quest-core.js") || !html.includes("quest-core.js"), "loads before the page scripts");
  for (const s of ['QT.mark("page start"', 'QT.mark("saved day drawn"', 'QT.mark("saved day skipped"', 'QT.mark("fresh calendar drawn"'])
    assert.ok(html.includes(s), "missing " + s);
  assert.ok(html.includes("QT.wrapFetch(window.fetch"), "fetches are timed");
});
