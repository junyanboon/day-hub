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

test("Morning Yoga lists the ten practices (supplements moved to the meal quiz), each paying its own habit", () => {
  const y = B.basic("yoga", "home", 1);
  assert.equal(y.habit, null);
  assert.deepEqual(J(y.steps.map(x => x.h)), ["shambhavi", "surya", "angam", "yogasana", "upa", "bhuta", "kriya", "nadi", "neem", "lamp"]);
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

test("Dr Ellie in Domestics and Grooming is always the AM routine; PM lives only in the Wind-down (Junyan, 2026-10-19)", () => {
  const dr = B.basic("groom", "home", 1).steps.find(x => x.h === "mouthAm");
  for (const hr of [1, 5, 9, 13, 14, 16, 20, 23]) assert.equal(B.stepAt(dr, hr).h, "mouthAm", "groom at " + hr);
  const dd = B.basic("domestics", "travel", 1).steps.find(x => x.h === "mouthAm");
  for (const hr of [11, 14, 20]) { assert.equal(B.stepAt(dd, hr).h, "mouthAm"); assert.match(B.stepAt(dd, hr).t, /AM/); }
  for (const id of ["domestics", "groom"]) for (const m of ["home", "travel"]) for (const wd of [0, 1, 6])
    assert.ok(!B.basic(id, m, wd).steps.some(x => x.h === "mouth" || x.pm || /PM/.test(x.t)), `${id} ${m} ${wd} has no PM step`);
  assert.equal(B.windDown("home").steps.filter(x => x.h === "mouth").length, 1);
  assert.equal(B.windDown("travel").steps.filter(x => x.h === "mouth").length, 1);
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

test("Dr Ellie ticked in Domestics in the afternoon still pays the AM routine", () => {
  const steps = B.basic("domestics", "travel", 1).steps, i = steps.findIndex(x => x.h === "mouthAm");
  const W = { tick:{}, paid:{} };
  assert.equal(B.tickStep(W, { W }, "domestics", i, steps[i], 16, gain).pay.h, "mouthAm");
  assert.equal(B.tickStep(W, { W }, "domestics", i, steps[i], 8, gain).pay.h, "mouthAm");
});

test("today's Domestics that already paid Dr Ellie PM keeps showing it, and its untick takes back the PM pay", () => {
  const steps = B.basic("domestics", "travel", 1).steps, i = steps.findIndex(x => x.h === "mouthAm");
  const at = "2026-10-19T15:30:00.000Z", paid = { h:"mouth", d:2, kind:"domestics", at };
  // the tile reads what it paid
  assert.equal(B.stepShown(steps[i], paid).h, "mouth");
  assert.equal(B.stepShown(steps[i], null).h, "mouthAm");
  assert.equal(B.stepShown(steps[i], { h:"mouthAm", d:2 }).h, "mouthAm");
  const day = { work:{ dom:{ tick:{ [i]:true }, paid:{ [i]:paid } } } };
  const t = B.tapDay(day, "dom", "domestics", i, steps[i], 17, gain, "2026-10-19T17:00:00.000Z");
  assert.equal(t.r.on, false); assert.equal(t.back.h, "mouth"); assert.equal(t.back.d, 2);
  // ticked again: now it pays AM
  const t2 = B.tapDay(day, "dom", "domestics", i, steps[i], 17, gain, "2026-10-19T17:01:00.000Z");
  assert.equal(t2.pay.h, "mouthAm");
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
  assert.ok(!/const TILES = /.test(html), "no tiles on Right now at all (d35): the auto ones left too");
  // every habit but water (its own card) and the automatic ones is ticked in a block or the meal quiz
  const rows = [...html.matchAll(/^\s*\["(\w+)", "[^"]*", [\d.]+, \d+, "[^"]*", "[^"]*", "(\w*)", "\w+"\],$/gm)].map(m => [m[1], m[2]]);
  assert.ok(rows.length > 25, "HABITS rows found");
  for (const [id, flag] of rows) if (id !== "water") assert.ok(["blk", "quiz", "auto"].includes(flag), `${id} has flag "${flag}"`);
  // and each "blk" habit (but barefoot, which waits on Junyan) is on some block's checklist
  const steps = new Set(["home", "travel"].flatMap(m => ["yoga", "groom", "domestics", "winddown"].flatMap(id => B.basic(id, m, 2).steps.flatMap(x => [x.h, x.pm && x.pm.h]))));
  for (const [id, flag] of rows) if (flag === "blk" && id !== "barefoot") assert.ok(steps.has(id), `${id} is on no checklist`);
});

test("the old timed payments are recognised for the take-back, and nothing else is", () => {
  const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
  const src = html.match(/const TIMED_PAY = (\/.+\/);\n/)[1];
  const re = new Function(`return ${src}`)();
  for (const m of ["Shambhavi: 45 min", "Shambhavi, Angamardana, Surya Kriya: 60 min", "Isha Kriya: 12 min"]) assert.ok(re.test(m), m);
  for (const m of ["Surya Kriya (Yoga)", "Shambhavi Mahamudra (Yoga)", "Gym used 7 (1 hr, 8:00 PM to 9:00 PM)", "Shambhavi: done for today", "Samba Class: 60 min"]) assert.ok(!re.test(m), m);
  assert.match(html, /undoTimedPay\(\);/);
  assert.match(html, /k:"undo:" \+ e\.at/);   // one take-back per payment, whichever device writes it
});

test("undoTimedPay keeps voided at or under the habit's count", () => {
  const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
  const i = html.indexOf("function undoTimedPay"), body = html.slice(i, i + 900);
  assert.match(body, /if \(n > c\) G\.day\.voided\[id\] = c;/);
  assert.ok(body.indexOf("if (n > c)") < body.indexOf("if (!hits.length) return;"), "the cap runs even when nothing is left to take back");
});
