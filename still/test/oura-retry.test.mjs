// node --test still/test/*.test.mjs   (Oura readiness retried until it arrives, and wins over a "N h" tap, d58)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-oura.js", "../quest-merge.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const O = ctx.QuestOura, M = ctx.QuestMerge;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const seed = html.slice(html.indexOf("async function seedFromOura"), html.indexOf("/* ---------- Last night"));

test("asks again until today's readiness is in, at most every 10 minutes", () => {
  const t = Date.parse("2026-10-19T14:00:00Z");
  assert.equal(O.shouldAsk({ ouraTried:true, slept:true }, 0, t), true);   // an earlier try or a tap no longer stops it
  assert.equal(O.shouldAsk({}, t - 60000, t), false);
  assert.equal(O.shouldAsk({}, t - O.RETRY_MS, t), true);
  assert.equal(O.shouldAsk({ ouraReady:true }, 0, t), false);
  assert.equal(O.shouldAsk(null, 0, t), false);
});

test("readiness after a tap keeps the blocks already taken today", () => {
  const log = [
    { msg:"Work block", xp:-12, m:"b" },
    { msg:"Walk", xp:5, m:"b" },
    { msg:"Slept 7 h", xp:10, m:"b" },                 // an old tap line, no sl flag
    { msg:"Slept 7 h", xp:10, m:"b", sl:1 },
    { msg:"Meditation", xp:8 },                        // prana, not body
  ];
  assert.equal(O.dayChanges(log), -7);
  assert.equal(O.bodyFrom(82, log), 75);
  assert.equal(O.bodyFrom(3, log), 0);
  assert.equal(O.bodyFrom(99, [{ msg:"Walk", xp:9, m:"b" }]), 100);
  assert.equal(O.isSleepLine({ msg:"Readiness 80 (Oura)" }), true);
  assert.equal(O.isSleepLine({ msg:"Slept 74 (Oura)" }), true);
});

test("the page marks tried only after a score, and readiness is not blocked by slept", () => {
  assert.doesNotMatch(seed, /if \(!G\.day \|\| G\.day\.ouraTried \|\| G\.day\.slept\) return/);
  assert.ok(seed.indexOf("ouraTried = true") > seed.indexOf("if (ready != null)"));
  assert.match(seed, /QO\.bodyFrom\(ready, G\.day\.log\)/);
  assert.match(html, /<script src="quest-oura\.js/);
});

test("ouraReady sticks across devices", () => {
  const d = { date:"Mon Oct 19 2026", log:[] };
  assert.equal(M.mergeQuest({ xp:0, ts:2, day:{ ...d, ouraReady:true } }, { xp:0, ts:1, day:{ ...d } }).day.ouraReady, true);
  assert.equal(M.mergeQuest({ xp:0, ts:2, day:{ ...d } }, { xp:0, ts:1, day:{ ...d, ouraReady:true } }).day.ouraReady, true);
});
