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
  assert.match(html, /\.\.\.waterStamp\(\)(, \.\.\.gutStamp\(\))? \}/);
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
  const T = (...a) => J(W.tail(...a)).map(x => (x.blk ? "[" + x.t + "]" : x.t));
  assert.deepEqual(T("Domestics", 10, 2), ["[Domestics]"]);
  assert.deepEqual(T("Domestics", 17, 2), ["[Domestics]", "thirsty?"]);
  assert.deepEqual(T("", 10, 2), []);                // no block: nothing added
  assert.deepEqual(T(null, 20, 2), ["thirsty?"]);   // no block after 4 PM: thirsty? is not the shrinking part
  assert.deepEqual(T("Work", 2, 0), ["[Work]", "thirsty?"]);   // the game day runs to 4 AM
  assert.deepEqual(T("Dinner", 18, 8), []);          // the aim is met: the line says so and stays short
  const fn = html.slice(html.indexOf("function waterHTML()"), html.indexOf("function waterStamp()"));
  assert.match(fn, /nm = b \? shortName\(b\) : ""/);
  assert.match(fn, /W\.tail\(nm, hourNow\(\), s\.total\)/);
  assert.match(fn, /title="\$\{esc\(W\.button\(nm, hourNow\(\)\)\)\}"/);
  assert.match(fn, /<small class="wq-sub">/);
  assert.match(fn, /x\.blk \? ' class="wq-blk"' : ""\}>&nbsp;· \$\{esc\(x\.t\)\}<\/span>/);   // a plain space would collapse at the flex item's edge
  // one line on a phone: the line never wraps, only the block name shrinks, with an ellipsis
  assert.match(html, /\.wq \.sq-t \{ min-width:0; \}/);
  assert.match(html, /\.wq-sub span \{ flex:none; \}/);
  assert.match(html, /\.wq-sub \{[^}]*white-space:nowrap[^}]*\}/);
  assert.match(html, /\.wq-blk \{[^}]*min-width:0[^}]*text-overflow:ellipsis[^}]*\}/);
});

// ---- through the day (Junyan, 2026-10-20, d16): supplements, fermented food and xylitol on the water card ----
test("three through-the-day buttons: aims, hints and a green done", () => {
  assert.deepEqual(J(W.DAY3.map(r => [r[0], r[2], r[3], r[4]])), [["supps", "Supps", 1, ""], ["ferment", "Ferment", 1, ""], ["xylitol", "Xylitol", 6, "g"]]);
  assert.equal(W.itemLine(W.DAY3[0], 0), "0/1");
  assert.equal(W.hintLine(W.DAY3[1]), "100 g yogurt, kefir or kraut");
  assert.equal(W.itemLine(W.DAY3[2], 3), "3/6 g");
  assert.equal(W.itemLine(W.DAY3[2], 6), "✓"); assert.equal(W.itemLine(W.DAY3[0], 2), "✓");
  assert.doesNotMatch(W.DAY3.flat().join(" "), /[–—]/);
});

test("a through-the-day tap is saved beside the glasses but never counts as water, and an undo marks it off", () => {
  let g = W.add({}, { id:"a", at:"2026-10-20T13:00:00Z", hour:9, d:1 });
  g = W.addItem(g, { id:"s1", kind:"supps", at:"2026-10-20T14:00:00Z", hour:10, d:2, c:1 });
  g = W.addItem(g, { id:"x1", kind:"xylitol", at:"2026-10-20T14:05:00Z", hour:10, d:1, c:1 });
  assert.deepEqual(J(W.summary(g)), { total:1, before4:1, ml:250 });
  assert.equal(W.pay(g, 1, 1), 0);   // the water cap counts glasses only
  assert.deepEqual(J(W.entries(g, "supps").map(x => x.id)), ["s1"]);
  const u = W.undo(g, "x1");
  assert.equal(u.x1.off, true); assert.equal(W.entries(u, "xylitol").length, 0);
  assert.deepEqual(J(W.byBlock(u)), { none:1 });
});

test("two devices: through-the-day taps from both are kept and an undo sticks (the glasses merge, no server change)", () => {
  const o = { xp:1, ts:1, day:{ date:"2026-10-20", glasses:{ s1:{ at:"t1", kind:"supps", hour:9, d:2, c:1, off:true } } } };
  const n = { xp:1, ts:2, day:{ date:"2026-10-20", glasses:{ s1:{ at:"t1", kind:"supps", hour:9, d:2, c:1 }, x1:{ at:"t2", kind:"xylitol", hour:9, d:1, c:1 } } } };
  const m = M.mergeQuest(o, n).day.glasses;
  assert.equal(m.s1.off, true); assert.equal(m.x1.kind, "xylitol");
});

test("the water card has the row; each tap pays its habit's value within its limit, and undo counts it off", () => {
  const fn = html.slice(html.indexOf("function waterHTML()"), html.indexOf("function waterStamp()"));
  assert.match(fn, /\$\{dayItemsHTML\(\)\}/);
  const add = html.slice(html.indexOf("function addDayItem("), html.indexOf("function undoDayItem("));
  assert.match(add, /const fx = window\.QuestFx, g = habitGain\(id\);\s*if \(!g\) \{ if \(fx && el\) fx\.nope\(el\); return; \}/);   // past the limit: no pay
  assert.match(add, /G\.day\.habits\[id\] = \(G\.day\.habits\[id\] \|\| 0\) \+ 1;/);
  assert.match(add, /addHabit\(id, g, h\[5\]/);
  assert.match(add, /calToast\(`\$\{row\[2\]\} logged\.`, 6000, \(\) => undoDayItem\(rid\)\)/);
  const undo = html.slice(html.indexOf("function undoDayItem("), html.indexOf("function undoDayItem(") + 800);
  assert.match(undo, /QW\(\)\.undo\(G\.day\.glasses, rid\)/);
  assert.match(undo, /G\.day\.voided/);
  assert.match(undo, /addHabit\(x\.kind, -\(x\.d \|\| 0\)/);
  assert.match(html, /querySelectorAll\("\[data-day\]"\)\.forEach\(bn => bn\.onclick = \(\) => addDayItem\(bn\.dataset\.day, bn\)\)/);
});

test("supps, ferment and xylitol keep their values and limits; the cap pays nothing past it (xylitol 10, aim 6)", () => {
  const row = id => html.match(new RegExp(`\\["${id}", "[^"]*", ([\\d.]+), (\\d+), "[^"]*", "[^"]*", "(\\w+)"`)).slice(1);
  assert.deepEqual(row("supps"), ["1", "1", "card"]);
  assert.deepEqual(row("ferment"), ["2", "1", "card"]);
  assert.deepEqual(row("xylitol"), ["0.6", "10", "card"]);
  // habitGain's rule, run on its own: full value at level 1 (x1.5), then nothing at the limit
  const src = html.slice(html.indexOf("function habitGain(id){"), html.indexOf("  /* The old timed rule"));
  const HABITS = [["supps", "", 1, 1, "", "", "card"], ["ferment", "", 2, 1, "", "", "card"], ["xylitol", "", 0.6, 10, "", "", "card"]];
  const run = (id, n) => vm.runInNewContext(`(${src.replace("function habitGain(id){", "function(id){")})(id)`,
    { id, HABITS, habitN: () => n, DIM: [1, .7, .5, .35, .25, .2], gainMult: () => 1.5, window: {}, Math });
  assert.equal(run("supps", 0), 2); assert.equal(run("supps", 1), 0);
  assert.equal(run("ferment", 0), 3); assert.equal(run("ferment", 1), 0);
  assert.equal(run("xylitol", 0), 1); assert.equal(run("xylitol", 9), 1); assert.equal(run("xylitol", 10), 0);
});
