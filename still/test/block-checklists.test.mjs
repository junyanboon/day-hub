// node --test still/test/*.test.mjs   (actions live inside calendar blocks, Junyan 2026-10-19, d6 d9 d11)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-basics.js", import.meta.url)), "utf8"), ctx);
const B = ctx.QuestBasics;
const J = x => JSON.parse(JSON.stringify(x));
const VAL = { shambhavi:18, surya:10, angam:8, yogasana:8, upa:5, bhuta:6, kriya:8, nadi:3, neem:3, lamp:2, supps:1, mouthAm:2, mouth:2, shower:2, copper:3 };
const gain = h => VAL[h] || 0;

test("a calendar block's title picks its checklist", () => {
  const cases = { "Morning Yoga":"yoga", "Sadhana: Shambhavi, Angamardana":"yoga", "Shambhavi":"yoga", "Isha Kriya":"yoga", "Upa Yoga":"yoga",
    "Domestics":"domestics", "Domestic chores":"domestics", "Grooming":"groom", "Shower":"groom", "Morning shower":"groom",
    "Wind down":"winddown", "Wind-down":"winddown", "Gym":null, "Dinner":null, "Yoga Nidra":null, "NSDR":null, "Zouk social":null };
  for (const [t, want] of Object.entries(cases)) assert.equal(B.blockBasic(t), want, t);
  assert.equal(B.blockBasic("Morning practice", "practice"), "yoga");
});

test("Morning Yoga lists the ten practices and the supplements, each paying its own habit", () => {
  const y = B.basic("yoga", "home", 1);
  assert.equal(y.habit, null);
  assert.deepEqual(J(y.steps.map(x => x.h)), ["shambhavi", "surya", "angam", "yogasana", "upa", "bhuta", "kriya", "nadi", "neem", "lamp", "supps"]);
  assert.deepEqual(J(B.basic("yoga", "travel", 1).steps), J(y.steps));   // the same list when travelling
});

test("grooming and Domestics: Dr Ellie and the shower fill body; the copper pot only at home", () => {
  const home = B.basic("groom", "home", 1).steps, away = B.basic("groom", "travel", 1).steps;
  assert.ok(home.some(x => x.h === "copper") && !away.some(x => x.h === "copper"));
  assert.ok(away.some(x => x.h === "shower") && away.some(x => x.h === "mouthAm"));
  for (const wd of [0, 1, 6]) assert.ok(B.domestics("home", wd).steps.some(x => x.h === "copper"), "home " + wd);
  assert.ok(!B.domestics("travel", 2).steps.some(x => x.h === "copper"));
  assert.ok(B.domestics("travel", 2).steps.some(x => x.h === "shower"));
  // Done no longer pays anything: the steps do
  for (const id of ["domestics", "winddown", "groom", "yoga"]) assert.equal(B.basic(id, "home", 2).habit, null, id);
});

test("Dr Ellie is the AM routine before 2 PM and the PM one after", () => {
  const dr = B.basic("groom", "home", 1).steps.find(x => x.h === "mouthAm");
  assert.equal(B.stepAt(dr, 9).h, "mouthAm");
  assert.equal(B.stepAt(dr, 13).h, "mouthAm");
  assert.equal(B.stepAt(dr, 14).h, "mouth");
  assert.match(B.stepAt(dr, 20).t, /PM/);
  assert.equal(B.stepAt(dr, 1).h, "mouth");   // 1 AM is still the night routine (the game day runs to 4 AM)
  assert.equal(B.stepAt(dr, 5).h, "mouthAm");
  const lamp = { t:"Lamp", h:"lamp" };
  assert.equal(B.stepAt(lamp, 21).h, "lamp");
});

test("a tick pays once; the lamp pays once in Morning Yoga and once in the Wind-down", () => {
  const steps = B.basic("yoga", "home", 1).steps, li = steps.findIndex(x => x.h === "lamp");
  const work = { y1:{ tick:{}, paid:{} }, y2:{ tick:{}, paid:{} }, w:{ tick:{}, paid:{} } };
  const r = B.tickStep(work.y1, work, "yoga", li, steps[li], 7, gain);
  assert.equal(r.on, true); assert.deepEqual(J(r.pay), { h:"lamp", d:2, kind:"yoga" });
  work.y1.tick[li] = true; work.y1.paid[li] = r.pay;
  // untick: nothing taken back, nothing paid
  const off = B.tickStep(work.y1, work, "yoga", li, steps[li], 7, gain);
  assert.equal(off.on, false); assert.equal(off.pay, null);
  delete work.y1.tick[li];
  // tick again in the same block: already paid
  assert.equal(B.tickStep(work.y1, work, "yoga", li, steps[li], 7, gain).pay, null);
  // a second yoga block the same day: the lamp was already paid for yoga
  assert.equal(B.tickStep(work.y2, work, "yoga", li, steps[li], 9, gain).why, "done");
  // the Wind-down pays the lamp once more
  const wsteps = B.windDown("home").steps, wl = wsteps.findIndex(x => x.h === "lamp");
  assert.deepEqual(J(B.tickStep(work.w, work, "winddown", wl, wsteps[wl], 22, gain).pay), { h:"lamp", d:2, kind:"winddown" });
  // a habit already full for the day pays nothing
  assert.equal(B.tickStep(work.y2, work, "yoga", 0, steps[0], 7, () => 0).why, "full");
  // a step with no habit pays nothing
  assert.equal(B.tickStep(work.w, work, "winddown", 0, wsteps[0], 22, gain).pay, null);
});

test("Dr Ellie ticked in the afternoon pays the PM routine", () => {
  const steps = B.basic("groom", "travel", 1).steps, i = steps.findIndex(x => x.h === "mouthAm");
  const W = { tick:{}, paid:{} };
  assert.equal(B.tickStep(W, { W }, "groom", i, steps[i], 16, gain).pay.h, "mouth");
  assert.equal(B.tickStep(W, { W }, "groom", i, steps[i], 8, gain).pay.h, "mouthAm");
});

test("what a block paid, by meter", () => {
  const meter = h => ["shower", "mouthAm", "mouth", "supps"].includes(h) ? "b" : "p";
  const W = { paid:{ 0:{ h:"shambhavi", d:27 }, 9:{ h:"lamp", d:3 }, 10:{ h:"supps", d:2 } } };
  assert.deepEqual(J(B.paidOf(W, meter)), { p:30, b:2 });
  assert.deepEqual(J(B.paidOf(null, meter)), { p:0, b:0 });
});

test("quest.html: no free-floating action tiles, no time pay, every action ticked in a block", () => {
  const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
  assert.ok(!/All prana actions|Prana actions · right now|data-all>/.test(html), "the All prana actions sheet is gone");
  assert.ok(!/PRACTICE_PER_MIN|payBlock\(/.test(html), "practice blocks no longer pay by time");
  assert.match(html, /const TILES = HABITS\.filter\(h => h\[0\] === "water" \|\| h\[6\] === "auto"\);/);
  // every habit but water and the automatic ones is ticked in a block or the meal quiz
  const rows = [...html.matchAll(/^\s*\["(\w+)", "[^"]*", [\d.]+, \d+, "[^"]*", "[^"]*", "(\w*)", "\w+"\],$/gm)].map(m => [m[1], m[2]]);
  assert.ok(rows.length > 25, "HABITS rows found");
  for (const [id, flag] of rows) if (id !== "water") assert.ok(["blk", "quiz", "auto"].includes(flag), `${id} has flag "${flag}"`);
  // and each "blk" habit (but barefoot, which waits on Junyan) is on some block's checklist
  const steps = new Set(["home", "travel"].flatMap(m => ["yoga", "groom", "domestics", "winddown"].flatMap(id => B.basic(id, m, 2).steps.flatMap(x => [x.h, x.pm && x.pm.h]))));
  for (const [id, flag] of rows) if (flag === "blk" && id !== "barefoot") assert.ok(steps.has(id), `${id} is on no checklist`);
});
