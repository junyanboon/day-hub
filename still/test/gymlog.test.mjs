// node --test still/test/*.test.mjs   (Gym log, later 2026-10-16: flexible Jack Woods with all six moves, compact rows,
// one open at a time, and his quiz levels shown even when an old phone draft said L1)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-levels.js", "../quest-gymlog.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const L = ctx.QuestLevels, GL = ctx.QuestGymLog;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" })[c]);
const server = L.seedLevels({}, "2026-10-16").levels;
const rows = h => (h.match(/class="gmove[^"]*"/g) || []);

test("one flexible Jack Woods session holds all six moves; Matthew I. Smith stays its own program", () => {
  const s = GL.newSession(L, "Jack Woods", server, "", "2026-10-16T18:00:00Z");
  assert.deepEqual(Object.keys(s.e).filter(k => L.LEVELS[k]), ["NC", "OAC", "SLS", "PPU", "HSPU", "FLR"]);
  assert.ok(!Object.keys(GL.PROGRAMS).some(k => /Day [12]/.test(k)));
  assert.ok(Object.keys(GL.PROGRAMS).some(k => /^Matthew I\. Smith · Phase 1$/.test(k)));
  assert.equal(GL.programFor("Gym · Jack Woods Day 2", "2026-10-26"), "Jack Woods");
  assert.equal(GL.programFor("Hotel gym", "2026-10-17"), "Jack Woods");
  assert.equal(GL.programFor("Gym · Matthew I. Smith", "2026-11-30"), "Matthew I. Smith · Phase 2");
});

test("every move is one shut row by default: name, L3 → Next L4, no stepper; nothing is logged", () => {
  const s = GL.newSession(L, "Jack Woods", server);
  const h = GL.movesHTML(L, esc, s, null, null);
  assert.equal(rows(h).length, 6);
  assert.ok(rows(h).every(r => !/\bopen\b/.test(r)));
  assert.match(h, /Nordic Hamstring Curl<\/span>\s*<span class="glv">L3 → Next L4/);
  assert.match(h, /One-Arm Chin<\/span>\s*<span class="glv">L4 → Next L5/);
  assert.match(h, /Front Lever Rows<\/span>\s*<span class="glv">L2 → Next L3/);
  assert.doesNotMatch(h, /data-tr=|data-eff=|data-test=/, "no stepper, effort or Test while shut");
  assert.ok(Object.values(s.e).filter(x => x && x.start).every(x => L.toEntry("NC", "x", x) === null));
});

test("tapping a row opens only that one; tapping it again shuts it; a logged move gets its ✓ while shut", () => {
  const s = GL.newSession(L, "Jack Woods", server);
  let open = GL.toggle(null, "NC");
  let h = GL.movesHTML(L, esc, s, open, null);
  assert.equal(rows(h).filter(r => /\bopen\b/.test(r)).length, 1);
  assert.match(h, /id="gm-NC"[\s\S]*data-tr="NC"/);
  assert.doesNotMatch(h, /data-tr="OAC"/);
  open = GL.toggle(open, "OAC");
  h = GL.movesHTML(L, esc, s, open, null);
  assert.equal(rows(h).filter(r => /\bopen\b/.test(r)).length, 1);
  assert.match(h, /data-tr="OAC"/); assert.doesNotMatch(h, /data-tr="NC"/);
  assert.equal(GL.toggle(open, "OAC"), null);
  s.e.NC.effort = "full";
  h = GL.movesHTML(L, esc, s, null, null);
  assert.match(h, /class="gmove done" id="gm-NC"[\s\S]*?<span class="gok"[^>]*>✓<\/span>/);
  assert.doesNotMatch(h.split('id="gm-OAC"')[1].split('id="gm-SLS"')[0], />✓</);
  // the open row has the weight box only where it counts, and a Test button
  h = GL.movesHTML(L, esc, s, "SLS", null);
  assert.match(h, /data-kg="SLS"/); assert.match(h, /data-test="SLS">Test L6/);
});

test("his screenshot case: an old Day 1 draft with L1 opens as Jack Woods at his quiz levels, all six moves there", () => {
  const old = { program: "Jack Woods · Day 1", at: "2026-10-16T09:00:00Z", bw: "",
    e: { NC: { level: 1, start: null, reps: ["", "", "", ""], lbs: ["", "", "", ""] }, OAC: { level: 1, start: null, reps: ["", "", "", ""], lbs: ["", "", "", ""] },
      SLS: { level: 1, start: null, reps: ["", "", "", ""], lbs: ["", "", "", ""] }, "m:Pike": { done: true } } };
  const d = GL.fromDraft(L, old, server);
  assert.equal(d.program, "Jack Woods");
  assert.deepEqual(["NC", "OAC", "SLS", "PPU", "HSPU", "FLR"].map(c => d.e[c].level), [3, 4, 5, 3, 3, 2]);
  assert.equal(d.e["m:Pike"].done, true, "what he ticked stays");
  const h = GL.movesHTML(L, esc, d, null, null);
  assert.doesNotMatch(h, /L1 → Next L2/);
  assert.equal(GL.fromDraft(L, null, server), null);
  assert.equal(GL.fromDraft(L, { program: "Something else", e: {} }, server), null);
});
