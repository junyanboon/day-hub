// node --test still/test/*.test.mjs   (every ?v= script quest.html loads has a stamp newer than its last change)
// 2026-10-19: PR 44 changed quest-merge.js (bodyOf, trimLog) but kept ?v=20261019z, so the service worker kept
// serving the cached copy without them and the page threw on load ("Loading your day..." with empty cards).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import vm from "node:vm";

const dir = fileURLToPath(new URL("..", import.meta.url));
const git = (...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" }).trim();
const shallow = (() => { try { return git("rev-parse", "--is-shallow-repository") === "true"; } catch { return true; } })();
// commit time of the last commit touching path, optionally the last that added/removed str in it
const last = (path, str) => +(git("log", "-1", "--format=%ct", ...(str ? ["-S", str] : []), "--", path) || 0);

test("a script changed after its ?v= stamp was set gets a new stamp", { skip: shallow && "shallow clone" }, () => {
  const html = fs.readFileSync(dir + "quest.html", "utf8");
  const stale = [];
  for (const [, file, v] of html.matchAll(/<script src="([\w.-]+\.js)\?v=(\w+)"/g)) {
    const tag = `${file}?v=${v}`;
    if (last(file) > last("quest.html", tag)) stale.push(tag);
  }
  assert.deepEqual(stale, []);
});

test("the page still loads when a cached quest-merge.js lacks bodyOf and trimLog", () => {
  const html = fs.readFileSync(dir + "quest.html", "utf8");
  const ctx = { QuestMerge: { mergeQuest: (a) => a, same: () => true } };
  const trim = html.match(/G\.day\.log = (QuestMerge[^;]*);/)[1];
  assert.doesNotThrow(() => vm.runInNewContext(`(${trim})`, { ...ctx, G: { day: { log: [] } } }));
  const body = html.match(/const bd = ([^;]*);/)[1];
  assert.doesNotThrow(() => vm.runInNewContext(`(${body})`, { ...ctx, d: { log: [] } }));
});
