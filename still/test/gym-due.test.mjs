// node --test still/test/*.test.mjs   (Gym log green rings, 2026-10-19: "add green circles around the exercises that I
// haven't done yet in the last 5 days". Today counts as one of the 5 game days; a move with no history is due.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-levels.js", "../quest-gymlog.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const L = ctx.QuestLevels, GL = ctx.QuestGymLog;
const J = x => JSON.parse(JSON.stringify(x));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" })[c]);
const levels = L.seedLevels({}, "2026-10-19").levels;
const ALL = ["NC", "OAC", "SLS", "PPU", "HSPU", "FLR", "m:Bridge", "m:Pike", "m:Butterfly", "m:Front Split", "m:Pancake", "m:Handstand", "m:V-sit"];
const sess = (day, entries) => ({ day, date:day, program:"Jack Woods", entries });
const str = (code) => ({ code, name:GL.MOVE[code], kind:"strength" });
const mob = (name) => ({ name, kind:"mobility", setsDone:1, note:"mobility" });

test("with no history at all, every strength move and mobility chip is due", () => {
  const g = GL.newSession(L, "Jack Woods", levels);
  assert.deepEqual(J(GL.dueKeys(L, g, [], "2026-10-19")), ALL);
  assert.deepEqual(J(GL.dueKeys(L, g, undefined, "2026-10-19")), ALL);
});

test("the 5 days count today: done 4 days ago is not due, done 5 days ago is due", () => {
  const g = GL.newSession(L, "Jack Woods", levels);
  const due = GL.dueKeys(L, g, [sess("2026-10-15", [str("NC"), mob("Pike")]), sess("2026-10-14", [str("OAC"), mob("Bridge")])], "2026-10-19");
  assert.ok(!due.includes("NC"), "Oct 15 is inside Oct 15 to 19");
  assert.ok(!due.includes("m:Pike"));
  assert.ok(due.includes("OAC"), "Oct 14 is outside the 5 days");
  assert.ok(due.includes("m:Bridge"));
  assert.equal(GL.DUE_DAYS, 5);
});

test("done today counts, a later-dated save counts, and the window crosses a month end", () => {
  const g = GL.newSession(L, "Jack Woods", levels);
  const due = GL.dueKeys(L, g, [sess("2026-11-02", [str("SLS")]), sess("2026-10-29", [str("PPU")]), sess("2026-10-28", [str("FLR")]), sess("2026-11-03", [str("HSPU")])], "2026-11-02");
  assert.ok(!due.includes("SLS"));
  assert.ok(!due.includes("PPU"), "Oct 29 is 4 days before Nov 2");
  assert.ok(due.includes("FLR"), "Oct 28 is 5 days before Nov 2");
  assert.ok(!due.includes("HSPU"));
});

test("a session read by its game day (day) wins over its calendar date; old sessions without day use date", () => {
  const g = GL.newSession(L, "Jack Woods", levels);
  const due = GL.dueKeys(L, g, [{ date:"2026-10-15", day:"2026-10-14", entries:[str("NC")] }, { date:"2026-10-16", entries:[{ name:"One-Arm Chin", kind:"strength" }] }], "2026-10-19");
  assert.ok(due.includes("NC"));
  assert.ok(!due.includes("OAC"), "an entry with only the move's name still counts");
});

test("the ring goes as soon as he logs the move in today's session, before saving", () => {
  const g = GL.newSession(L, "Jack Woods", levels);
  g.e.NC.effort = "solid"; g.e["m:Pancake"].done = true;
  const due = GL.dueKeys(L, g, [], "2026-10-19");
  assert.ok(!due.includes("NC"));
  assert.ok(!due.includes("m:Pancake"));
  assert.ok(due.includes("OAC"));
});

test("due rows carry the ring class; done and recent rows do not", () => {
  const g = GL.newSession(L, "Jack Woods", levels);
  const h = GL.movesHTML(L, esc, g, null, null, ["NC", "FLR"]);
  assert.match(h, /class="gmove due" id="gm-NC"/);
  assert.match(h, /class="gmove due" id="gm-FLR"/);
  assert.match(h, /class="gmove" id="gm-OAC"/);
  assert.equal((GL.movesHTML(L, esc, g, null, null).match(/ due"/g) || []).length, 0, "no list, no rings");
});

test("Matthew I. Smith sessions have no rings (only Jack Woods moves and chips)", () => {
  const g = GL.newSession(L, "Matthew I. Smith · Phase 1", levels);
  assert.deepEqual(J(GL.dueKeys(L, g, [], "2026-10-19")), []);
});

test("the page wires the rings: rows and chips read dueKeys by game day, and a typed number clears the ring in place", () => {
  const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
  assert.match(html, /const gymDue = \(\) => GL\.dueKeys\(LV, GYM, [^\n]*gameYmd\(\)\)/);
  assert.match(html, /GL\.movesHTML\(LV, esc, GYM, gymRow, gymTesting, due\)/);
  assert.match(html, /due\.includes\("m:" \+ m\) \? " due" : ""/);
  assert.match(html, /row\.classList\.toggle\("due", gymDue\(\)\.includes\(c\)\)/);
  assert.match(html, /\.gmoves \.gmove\.due \{[^}]*box-shadow/);
  assert.match(html, /A green ring means you haven't done it in the last \$\{GL\.DUE_DAYS\} days\./, "plain words, no dashes");
});
