// node --test still/test/*.test.mjs   (Gym Coach, 2026-11-09: "minute by minute I know what I'm doing")
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-levels.js", "../quest-gymcoach.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const L = ctx.QuestLevels, C = ctx.QuestGymCoach, g = C.guide("OAC");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" })[c]);

test("the clock walks the steps and stays on the last one", () => {
  assert.equal(C.stepAt(g, 0).i, 0);
  assert.equal(C.stepAt(g, 61).i, 1);
  assert.equal(C.stepAt(g, C.totalSec(g) + 500).i, g.steps.length - 1);
});
test("start, pause, resume and next move the clock", () => {
  let c = C.act(g, null, "start", 1000);
  assert.equal(C.elapsed(c, 31000), 30);
  c = C.act(g, c, "pause", 31000);
  assert.equal(C.elapsed(c, 99000), 30);
  c = C.act(g, c, "start", 99000);
  assert.equal(C.elapsed(c, 100000), 31);
  c = C.act(g, c, "next", 100000);
  assert.equal(C.stepAt(g, C.elapsed(c, 100000)).i, 1);
  c = C.act(g, c, "back", 100000);
  assert.equal(C.stepAt(g, C.elapsed(c, 100000)).i, 0);
});
test("the log step fills the Gym log row", () => {
  let x = L.startMove("OAC", 4);
  x = C.applyLog(x, "l", "4"); x = C.applyLog(x, "r", "3"); x = C.applyLog(x, "mile", "5"); x = C.applyLog(x, "eff", "full");
  assert.equal(x.reps, "7"); assert.equal(x.trained, 5); assert.equal(x.effort, "full");
  assert.ok(L.touched(x));
});
test("week status: done this week from a saved session or today's draft", () => {
  const s = [{ day:"2026-11-03", entries:[{ code:"OAC", reps:6, trained:4, effort:"full" }] }];
  assert.equal(C.weekStatus("OAC", s, null, "2026-11-09", L.touched).done, false);
  const w = C.weekStatus("OAC", s, null, "2026-11-08", L.touched);
  assert.equal(w.done, true); assert.equal(w.weeks.length, 6);
  const d = C.weekStatus("OAC", s, { ...L.startMove("OAC", 4), effort:"full" }, "2026-11-09", L.touched);
  assert.equal(d.doneOn, "2026-11-09");
});
test("every view renders", () => {
  const week = C.weekStatus("OAC", [], null, "2026-11-09", L.touched), x = L.startMove("OAC", 4);
  for (const v of ["week", "prep", "go"]) assert.match(C.html(esc, "OAC", v, { week, clock:{ started:1, skip:600 }, x, now:2, LV:L }), /Coach/);
  assert.match(C.html(esc, "OAC", "prep", { week }), /youtu\.be\/Q3dhtlOq8NE\?t=355/);
});
test("the four new moves have full guides whose milestones fit the log levels", () => {
  for (const c of ["NC", "HSPU", "PPU", "FLR"]) {
    const g = C.guide(c); assert.ok(g, c);
    assert.ok(g.steps.some(s => s.set) && g.steps.some(s => s.log), c);
    g.milestones.forEach(([n]) => assert.ok(n >= 1 && n <= 7, c));
    const week = C.weekStatus(c, [], null, "2026-11-09", L.touched);
    assert.match(C.html(esc, c, "go", { week, clock:{ started:1, skip:9999 }, x:L.startMove(c, 3), now:2, LV:L }), /Log it/);
    assert.match(C.html(esc, c, "prep", { week }), /youtu\.be/);
  }
});
