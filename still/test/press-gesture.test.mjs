// node --test still/test/*.test.mjs   (calendar block gestures, Junyan 2026-10-20: "it's too easy to shift bookings while
// scrolling across the calendar" and "anything smaller than 30 minutes seems impossible to move ... almost impossible to open")
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(new URL("../quest-agenda.js", import.meta.url), "utf8"), ctx);
const A = ctx.QuestAgenda;
const html = fs.readFileSync(new URL("../quest.html", import.meta.url), "utf8");
const finger = { touch:true, x0:100, y0:200, t0:0 }, mouse = { touch:false, x0:100, y0:200, t0:0 };
const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 20, h, m));

test("a finger that moves before the hold is a scroll, never a move", () => {
  assert.equal(A.pressStep(finger, { type:"move", x:100, y:215, t:120 }), "scroll");
  assert.equal(A.pressStep(finger, { type:"move", x:112, y:200, t:300 }), "scroll");
  assert.equal(A.pressStep(finger, { type:"up", x:100, y:240, t:200 }), "scroll");
});

test("a finger held still about 400 ms picks the block up; a small wobble is still a hold", () => {
  assert.equal(A.GESTURE.LONG_MS, 400);
  assert.equal(A.pressStep(finger, { type:"move", x:104, y:205, t:200 }), "wait");
  assert.equal(A.pressStep(finger, { type:"timer", x:103, y:204, t:400 }), "pickup");
  assert.equal(A.pressStep(finger, { type:"timer", x:103, y:204, t:150 }), "wait");
});

test("a quick tap opens the block, a finger or a mouse", () => {
  assert.equal(A.pressStep(finger, { type:"up", x:101, y:202, t:140 }), "tap");
  assert.equal(A.pressStep(mouse, { type:"up", x:101, y:201, t:90 }), "tap");
});

test("a mouse drags after a small move, and a long still press is still a click", () => {
  assert.equal(A.pressStep(mouse, { type:"move", x:100, y:203, t:50 }), "wait");
  assert.equal(A.pressStep(mouse, { type:"move", x:100, y:208, t:60 }), "pickup");
  assert.equal(A.pressStep(mouse, { type:"timer", x:100, y:200, t:900 }), "wait");
  assert.equal(A.pressStep(mouse, { type:"up", x:100, y:200, t:900 }), "tap");
});

test("a short block gets a 44 px tap area centred on it; a tall one needs none", () => {
  assert.deepEqual({ ...A.hitBox(100, 18) }, { top:87, h:44 });
  assert.equal(A.hitBox(100, 44), null);
  assert.equal(A.hitBox(100, 80), null);
});

test("blocks under 30 minutes have no stretch edges; longer ones keep a middle bigger than the edges", () => {
  assert.equal(A.edgeHandles(at(9), at(9, 15), 18).on, false);
  assert.equal(A.edgeHandles(at(9), at(9, 29), 24).on, false);
  const half = A.edgeHandles(at(9), at(9, 30), 25);
  assert.equal(half.on, true);
  assert.ok(half.zone * 2 < 25 / 1.5, `zone ${half.zone}`);
  assert.equal(A.edgeHandles(at(9), at(11), 106).zone, 14);
});

test("the page wires it: edges wait for the hold, never block a scroll, and only long blocks draw them", () => {
  const css = html.match(/\.cal-h \{[^}]*\}/)[0];
  assert.doesNotMatch(css, /touch-action:\s*none/);
  assert.match(css, /touch-action:\s*pan-y/);
  assert.doesNotMatch(html, /if \(hd\) \{ e\.preventDefault\(\); begin\(\); \}/);
  assert.match(html, /\}, AGD\(\)\.GESTURE\.LONG_MS\);/);
  assert.match(html, /AGD\(\)\.pressStep\(/);
  assert.match(html, /AGD\(\)\.edgeHandles\(/);
  assert.match(html, /AGD\(\)\.hitBox\(/);
  assert.match(html, /closest\("\.cal-ev, \.cal-hit"\)/);
});
