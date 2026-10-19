// node --test still/test/*.test.mjs   (water as its own card, Junyan 2026-10-19, d23 and d24)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-water.js", "../quest-merge.js", "../quest-basics.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const W = ctx.QuestWater, M = ctx.QuestMerge, B = ctx.QuestBasics;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const J = x => JSON.parse(JSON.stringify(x));

test("the aim is 8 glasses of 250 ml with a marker at 6 by 4 PM", () => {
  assert.equal(W.AIM, 8); assert.equal(W.ML, 250); assert.equal(W.BY4, 6); assert.equal(W.CUT, 16);
  assert.equal(W.markerPct(), 75);
  assert.equal(W.TEXT, undefined);
  assert.doesNotMatch(W.button("Work", 9) + W.button(null, 17), /[–—]/);
});

test("the button names the block he is in, and reads thirsty after 4 PM", () => {
  assert.equal(W.button("Work block", 10), "+1 glass · Work block");
  assert.equal(W.button(null, 10), "+1 glass");
  assert.equal(W.button("Dinner", 16), "+1 glass (thirsty)");
  assert.equal(W.button("Work", 23), "+1 glass (thirsty)");
  assert.equal(W.button("Work", 2), "+1 glass (thirsty)");   // the game day runs to 4 AM
});

test("each glass is saved against its block, or no block; undo takes it off", () => {
  let g = W.add({}, { id:"a", at:"2026-10-19T13:00:00Z", blk:"k1", name:"Work", hour:9, d:1 });
  g = W.add(g, { id:"b", at:"2026-10-19T19:00:00Z", hour:15, d:1 });
  g = W.add(g, { id:"c", at:"2026-10-19T22:00:00Z", blk:"k2", name:"Dinner", hour:18, d:1 });
  assert.equal(g.b.blk, "none");
  assert.deepEqual(J(W.summary(g)), { total:3, before4:2, ml:750 });
  const u = W.undo(g, "c");
  assert.equal(u.c.off, true);
  assert.deepEqual(J(W.summary(u)), { total:2, before4:2, ml:500 });
  assert.equal(W.active(u).length, 2);
  assert.deepEqual(J(W.byBlock(u)), { k1:1, none:1 });
});

test("a glass pays what water paid, up to the old daily limit", () => {
  const g = {}; for (let i = 0; i < 12; i++) g["x" + i] = { at:`2026-10-19T1${i % 10}:00:00Z`, hour:9, d:1 };
  assert.equal(W.pay({}, 1, 12), 1);
  assert.equal(W.pay(g, 1, 12), 0);
});

test("two devices: glasses from both are kept, and an undo on either sticks", () => {
  const o = { xp:1, ts:1, day:{ date:"2026-10-19", glasses:{ a:{ at:"t1", hour:9, d:1 }, b:{ at:"t2", hour:10, d:1, off:true } } } };
  const n = { xp:1, ts:2, day:{ date:"2026-10-19", glasses:{ b:{ at:"t2", hour:10, d:1 }, c:{ at:"t3", hour:11, d:1 } } } };
  const m = M.mergeQuest(o, n).day.glasses;
  assert.deepEqual(Object.keys(m).sort(), ["a", "b", "c"]);
  assert.equal(m.b.off, true);
});

test("the day-end screen shows water after the sleep score, and each day saves its totals", () => {
  const night = fs.readFileSync(fileURLToPath(new URL("../quest-night.js", import.meta.url)), "utf8");
  assert.match(night, /Last night<\/div>\$\{nights\.join\(""\)\}` : ""\}\$\{water\}/);
  assert.match(night, /before 4 PM/);
  assert.match(html, /\.\.\.waterStamp\(\) \}/);
  assert.match(html, /TR\.dayRow\("wt", "Water"/);
});

test("no water tile, no water in block checklists, and the card is on the page", () => {
  assert.doesNotMatch(html, /h\[0\] === "water" \|\| h\[6\] === "auto"/);
  for (const id of ["domestics", "winddown", "yoga", "groom"]) for (const mode of ["home", "travel"])
    assert.ok(!B.basic(id, mode, 1).steps.some(x => x.h === "water" || /\bwater\b/i.test(x.t) && !/copper/i.test(x.t)), id + mode);
  assert.match(html, /function waterHTML\(\)/);
  assert.doesNotMatch(html, /giveItem\("water"/);
});
