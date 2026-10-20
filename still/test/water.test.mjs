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

test("the drop is the button: one compact row, no big +1 glass button, undo kept on the toast", () => {
  const fn = html.slice(html.indexOf("function waterHTML()"), html.indexOf("function waterStamp()"));
  assert.match(fn, /<button type="button" class="wq-drop" data-glass aria-label="Add one glass"/);
  assert.doesNotMatch(html, /wq-btn/);
  assert.match(html, /\.wq-drop \{[^}]*width:48px; height:48px; border-radius:50%/);
  const add = html.slice(html.indexOf("function addGlass("), html.indexOf("function undoGlass("));
  assert.match(add, /addHabit\("water", d, `Water, one 250 ml glass\$\{where\}`/);   // same pay, names the block
  assert.match(add, /blk:b \? gk\(b\) : "none"/);
  assert.match(add, /calToast\(`1 glass of water logged\$\{where\}\.`, 6000, \(\) => undoGlass\(id\)\)/);
  assert.match(add, /waterCheer\(focused\)/);
  assert.match(html, /prefers-reduced-motion: reduce\) \{ \.wq-drop\.hit \{ animation:none; \} \.wq-drop\.hit::after, \.wq-plus \{ display:none; \} \}/);
  assert.match(html, /querySelectorAll\("\[data-glass\]"\)\.forEach\(bn => bn\.onclick = \(\) => addGlass\(bn\)\)/);
});

test("the small line names the block a glass counts toward, and reads thirsty? after 4 PM (d76)", () => {
  assert.deepEqual(J(W.tail("Domestics", 10)), ["Domestics"]);
  assert.deepEqual(J(W.tail("Domestics", 17)), ["Domestics", "thirsty?"]);
  assert.deepEqual(J(W.tail("", 10)), []);                // no block: nothing added
  assert.deepEqual(J(W.tail(null, 20)), ["thirsty?"]);
  assert.deepEqual(J(W.tail("Work", 2)), ["Work", "thirsty?"]);   // the game day runs to 4 AM
  const fn = html.slice(html.indexOf("function waterHTML()"), html.indexOf("function waterStamp()"));
  assert.match(fn, /W\.tail\(b \? shortName\(b\) : "", hourNow\(\)\)/);
  assert.match(fn, /<small class="wq-sub">/);
  assert.match(fn, /">&nbsp;· \$\{esc\(t\)\}<\/span>/);   // a plain space would collapse at the flex item's edge
  // one line on a phone: the line never wraps, and a long block name ends in an ellipsis
  assert.match(html, /\.wq-sub \{[^}]*white-space:nowrap[^}]*\}/);
  assert.match(html, /\.wq \.sq-t \{ min-width:0; \}/);
  assert.match(html, /\.wq-sub span \{ flex:none; \}/);   // the count text never shrinks; only the block does
  assert.doesNotMatch(html, /\.wq-s \{/);
  assert.match(html, /\.wq-blk \{[^}]*text-overflow:ellipsis[^}]*\}/);
});
