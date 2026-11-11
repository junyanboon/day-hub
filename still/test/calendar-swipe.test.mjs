// node --test still/test/calendar-swipe.test.mjs
// Junyan, 2026-11-11: "when I swipe on my calendar ... the phone version specifically it changes days when I'm in
// the day view very easily". The strip was one native scroller in both directions with x snapping, so an up/down
// scroll that drifted sideways snapped to the next day. A finger now changes days only through these rules.
import test from "node:test";
import assert from "node:assert/strict";
import "../calendar-core.js";
const C = globalThis.CalCore;
const PHONE = 390 - 46;   // the strip's width on his iPhone, less the hour gutter

test("the direction is decided in the first 10 px, and only once there", () => {
  assert.equal(C.swipeLock(6, 3), null);
  assert.equal(C.swipeLock(0, 9), null);
  assert.equal(C.swipeLock(10, 4), "x");
  assert.equal(C.swipeLock(-4, 10), "y");
  assert.equal(C.swipeLock(9, 10), "y", "a dead diagonal is a scroll");
  assert.equal(C.swipeLock(10, 10), "y", "equal is a scroll, never a day change");
});

test("an up/down scroll that drifts about 40 px sideways never changes the day", () => {
  assert.equal(C.swipeLock(3, 12), "y");
  assert.equal(C.swipeCommit({ dx: 40, dy: 300, vx: 0.2 }, PHONE), 0);
  assert.equal(C.swipeCommit({ dx: -40, dy: -220, vx: -0.9 }, PHONE), 0, "even a fast one");
});

test("a sideways move must be at least twice the up/down move", () => {
  assert.equal(C.swipeCommit({ dx: -120, dy: 70, vx: -0.3 }, PHONE), 0);
  assert.equal(C.swipeCommit({ dx: -120, dy: 59, vx: -0.3 }, PHONE), 1);
});

test("a clear sideways swipe changes the day: left goes to later days, right to earlier", () => {
  assert.equal(C.swipeCommit({ dx: -150, dy: 12, vx: -0.3 }, PHONE), 1);
  assert.equal(C.swipeCommit({ dx: 150, dy: -12, vx: 0.3 }, PHONE), -1);
});

test("a short slow nudge stays on the day", () => {
  assert.equal(C.swipeCommit({ dx: -50, dy: 4, vx: -0.15 }, PHONE), 0);
  assert.equal(C.swipeCommit({ dx: -68, dy: 0, vx: -0.1 }, PHONE), 0);
});

test("the distance needed is a fifth of the width, kept between 70 and 110 px", () => {
  assert.equal(C.swipeCommit({ dx: -69, dy: 0 }, 200), 0);
  assert.equal(C.swipeCommit({ dx: -70, dy: 0 }, 200), 1);
  assert.equal(C.swipeCommit({ dx: -105, dy: 0 }, 1400), 0, "a wide screen still caps at 110");
  assert.equal(C.swipeCommit({ dx: -110, dy: 0 }, 1400), 1);
});

test("a fast deliberate flick changes the day with less travel, a twitch does not", () => {
  assert.equal(C.swipeCommit({ dx: -45, dy: 6, vx: -0.8 }, PHONE), 1);
  assert.equal(C.swipeCommit({ dx: -20, dy: 2, vx: -1.2 }, PHONE), 0, "under 30 px is a twitch");
  assert.equal(C.swipeCommit({ dx: -45, dy: 6, vx: 0.8 }, PHONE), 0, "the finger came back: no change");
});
