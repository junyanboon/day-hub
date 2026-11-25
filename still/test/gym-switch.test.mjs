// node --test still/test/*.test.mjs   (Junyan, 2026-11-25: "the gym auto-populates right now and I want that turned off")
// "Plan my gym sessions" is a switch in Day Quest's settings, OFF until he turns it on. Off: Day Quest places no gym
// block by itself (page load, after a move, opening the Plan screen). Blocks already on his calendar stay.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(here + "quest-gym.js", "utf8"), ctx);
const QG = ctx.QuestGym;
const html = fs.readFileSync(here + "quest.html", "utf8");

test("the planner is off unless his saved state says exactly gymAuto: true", () => {
  for (const g of [undefined, null, {}, { gymAuto:false }, { gymAuto:"true" }, { gymAuto:1 }, { gymAuto:null }, { xp:5, day:null }])
    assert.equal(QG.autoOn(g), false, JSON.stringify(g));
  assert.equal(QG.autoOn({ gymAuto:true }), true);
});

test("planGym stops at the switch before anything is read or written", () => {
  const i = html.indexOf("async function planGym(force){");
  assert.ok(i > 0);
  const body = html.slice(i, html.indexOf("gymBusy = true;", i));
  assert.match(body, /QG\(\)\.autoOn\(G\)/, "planGym does not ask the switch");
  assert.ok(body.indexOf("autoOn") < body.indexOf("store.get"), "the switch is read after the saved copy");
});

test("every automatic call goes through planGym (no other gym write path)", () => {
  // the only gym placement is the POST inside planGym; the calls are page load, after a move, and the Plan screen
  const calls = html.match(/planGym\((true|false)?\)/g) || [];
  assert.equal(calls.length, 3, calls.join(" "));
  const i = html.indexOf("async function planGym(force){"), end = html.indexOf("const gymLine", i);
  assert.ok(html.slice(i, end).includes("Placed by Day Quest"));
  assert.equal(html.split("Placed by Day Quest: this week's training").length - 1, 1);
});

test("settings carry a switch labelled exactly Plan my gym sessions, off unless gymAuto is true", () => {
  const i = html.indexOf("function openSettings(){"), seg = html.slice(i, html.indexOf('$("gear").onclick', i));
  assert.match(seg, /role="switch"/);
  assert.ok(seg.includes("<span>Plan my gym sessions</span>"), "label not found");
  assert.match(seg, /aria-checked="\$\{gymOn\}"/);
  assert.match(seg, /gymOn = QG\(\)\.autoOn\(G\)/);
});

test("turning it on or off is saved to his state (it follows him across devices)", () => {
  const i = html.indexOf("function openSettings(){"), seg = html.slice(i, html.indexOf('$("gear").onclick', i));
  assert.match(seg, /G\.gymAuto = /);
  assert.match(seg, /saveG\(\)/);
});

test("the switch only saves the choice: it places nothing and removes nothing", () => {
  const i = html.indexOf("function openSettings(){"), seg = html.slice(i, html.indexOf('$("gear").onclick', i));
  assert.ok(!/planGym/.test(seg), "settings must not run the planner");
  assert.ok(!/cal\/event|DELETE|method:\s*"DELETE"/.test(seg), "settings must not touch calendar events");
});
