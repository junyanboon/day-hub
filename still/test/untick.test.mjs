// node --test still/test/*.test.mjs   (unticking a checklist tile takes back what it paid, Junyan 2026-10-19, d28;
// the barefoot walk in the check-in after an outdoor block, d27)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-basics.js", "../quest-merge.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const B = ctx.QuestBasics, M = ctx.QuestMerge;
const J = x => JSON.parse(JSON.stringify(x));
const VAL = { shambhavi:20, lamp:3, barefoot:5 };
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");

// a tiny day: habits only go up, voided counts the take-backs, gain reads habits - voided (the page's habitGain)
function day(){
  const D = { habits:{}, voided:{}, work:{} };
  D.gain = h => ((D.habits[h] || 0) - (D.voided[h] || 0)) >= 1 ? 0 : VAL[h] || 0;
  D.tap = (key, kind, i, st, at) => {
    const W = (D.work[key] = D.work[key] || { tick:{}, paid:{} });
    const r = B.tickStep(W, D.work, kind, i, st, 9, D.gain);
    B.applyTick(W, i, r, at);
    if (r.pay) D.habits[r.pay.h] = (D.habits[r.pay.h] || 0) + 1;
    if (r.back) D.voided[r.back.h] = (D.voided[r.back.h] || 0) + 1;
    return r;
  };
  return D;
}
const SH = { t:"Shambhavi", h:"shambhavi" };

test("unticking a paid tile takes back exactly what that tick paid", () => {
  const D = day();
  const r1 = D.tap("y", "yoga", 0, SH, "2026-10-19T13:00:00.000Z");
  assert.deepEqual(J(r1.pay), { h:"shambhavi", d:20, kind:"yoga" });
  assert.equal(D.work.y.paid[0].at, "2026-10-19T13:00:00.000Z");
  const r2 = D.tap("y", "yoga", 0, SH, "2026-10-19T13:05:00.000Z");
  assert.equal(r2.on, false);
  assert.deepEqual(J(r2.back), { h:"shambhavi", d:20, kind:"yoga", at:"2026-10-19T13:00:00.000Z" });
  assert.equal(D.work.y.tick[0], undefined); assert.equal(D.work.y.paid[0], undefined);
  assert.equal(D.gain("shambhavi"), 20, "counted as not done again");
  // ticked again: pays again, and the count stays honest (2 ticks, 1 taken back)
  const r3 = D.tap("y", "yoga", 0, SH, "2026-10-19T13:06:00.000Z");
  assert.equal(r3.pay.d, 20);
  assert.deepEqual([D.habits.shambhavi, D.voided.shambhavi], [2, 1]);
  assert.equal(D.gain("shambhavi"), 0);
});

test("unticking a tile that paid nothing takes nothing back", () => {
  const D = day();
  D.habits.shambhavi = 1;   // already done today in another way
  const r1 = D.tap("y", "yoga", 0, SH, "2026-10-19T13:00:00.000Z");
  assert.equal(r1.pay, null); assert.equal(r1.why, "full");
  const r2 = D.tap("y", "yoga", 0, SH, "2026-10-19T13:01:00.000Z");
  assert.equal(r2.back, null);
  assert.equal(D.voided.shambhavi, undefined);
  // a step with no habit: nothing either way
  const W = { tick:{ 3:true }, paid:{} };
  assert.equal(B.tickStep(W, { W }, "winddown", 3, { t:"Quiet until bed" }, 22, () => 5).back, null);
});

test("the lamp taken back in the Wind-down can be paid again there; Morning Yoga's lamp is untouched", () => {
  const D = day(); D.gain = h => VAL[h] || 0;   // the lamp's limit is 2 a day
  const L = { t:"Light the lamp", h:"lamp" };
  D.tap("y", "yoga", 9, L, "2026-10-19T12:00:00.000Z");
  D.tap("w", "winddown", 5, L, "2026-10-20T02:00:00.000Z");
  const back = D.tap("w", "winddown", 5, L, "2026-10-20T02:01:00.000Z").back;
  assert.equal(back.d, 3);
  assert.ok(D.work.y.paid[9], "the yoga lamp still counts");
  assert.equal(D.tap("w", "winddown", 5, L, "2026-10-20T02:02:00.000Z").pay.d, 3, "the wind-down lamp pays again");
  assert.deepEqual(J(B.paidOf(D.work.w, () => "p")), { p:3, b:0 });
});

test("the take-back line has a key, so two devices taking back the same tick count it once", () => {
  const p = { h:"shambhavi", d:20, kind:"yoga", at:"2026-10-19T13:00:00.000Z" };
  assert.equal(B.backKey("blk1", 0, p), "back:blk1:0:2026-10-19T13:00:00.000Z");
  const pay = { at:"2026-10-19T13:00:00.000Z", msg:"Shambhavi Mahamudra (Yoga)", xp:20 };
  const backA = { at:"2026-10-19T13:05:00.000Z", msg:"Shambhavi Mahamudra (Yoga, taken back)", xp:-20, k:B.backKey("blk1", 0, p) };
  const backB = { at:"2026-10-19T13:06:00.000Z", msg:"Shambhavi Mahamudra (Yoga, taken back)", xp:-20, k:B.backKey("blk1", 0, p) };
  const o = { xp:1, ts:1, day:{ date:"2026-10-19", prana:0, log:[backA, pay], habits:{ shambhavi:1 }, voided:{ shambhavi:1 } } };
  const n = { xp:1, ts:2, day:{ date:"2026-10-19", prana:0, log:[backB, pay], habits:{ shambhavi:1 }, voided:{ shambhavi:1 } } };
  const m = M.mergeQuest(o, n).day;
  assert.equal(m.prana, 0, "taken back once, not twice");
  assert.equal(m.log.filter(e => e.k).length, 1);
});

test("two devices: a take-back is never undone by the other device's newer copy", () => {
  // the phone ticked Shambhavi, the Mac pulled it; then the phone unticked it, and the Mac (not pulled yet)
  // saved a tick on another step later
  const t1 = "2026-10-19T13:00:00.000Z", t2 = "2026-10-19T13:05:00.000Z", t3 = "2026-10-19T13:07:00.000Z";
  const paid0 = { h:"shambhavi", d:20, kind:"yoga", at:t1 };
  const phone = { xp:1, ts:200, day:{ date:"2026-10-19", habits:{ shambhavi:1 }, voided:{ shambhavi:1 },
    work:{ y:{ tick:{}, paid:{}, t:{ 0:t2 } } } } };
  const mac = { xp:1, ts:300, day:{ date:"2026-10-19", habits:{ shambhavi:1, lamp:1 },
    work:{ y:{ tick:{ 0:true, 9:true }, paid:{ 0:paid0, 9:{ h:"lamp", d:3, kind:"yoga", at:t3 } }, t:{ 0:t1, 9:t3 } } } } };
  for (const [a, b] of [[phone, mac], [mac, phone]]) {
    const d = M.mergeQuest(a, b).day;
    assert.equal(d.voided.shambhavi, 1, "voided keeps the higher count");
    assert.equal(d.habits.shambhavi, 1);
    assert.equal(d.work.y.tick[0], undefined, "Shambhavi stays unticked");
    assert.equal(d.work.y.paid[0], undefined);
    assert.equal(d.work.y.tick[9], true, "the Mac's lamp tick is kept");
    assert.equal(d.work.y.paid[9].d, 3);
    assert.equal(d.work.y.t[0], t2);
  }
  // and a re-tick on the Mac after the phone's untick wins over the untick
  const mac2 = J(mac); mac2.day.habits.shambhavi = 2; mac2.day.voided = { shambhavi:1 };
  mac2.day.work.y.paid[0] = { ...paid0, at:"2026-10-19T13:09:00.000Z" }; mac2.day.work.y.t[0] = "2026-10-19T13:09:00.000Z";
  const d2 = M.mergeQuest(phone, mac2).day;
  assert.equal(d2.work.y.tick[0], true);
  assert.deepEqual([d2.habits.shambhavi, d2.voided.shambhavi], [2, 1]);
});

test("blocks with no step times (an old page) merge whole, newest wins, as before", () => {
  const o = { xp:1, ts:1, day:{ date:"2026-10-19", work:{ a:{ tick:{ 0:true } }, b:{ goal:"x" } } } };
  const n = { xp:1, ts:2, day:{ date:"2026-10-19", work:{ a:{ tick:{ 1:true } } } } };
  const w = M.mergeQuest(o, n).day.work;
  assert.deepEqual(J(w), { a:{ tick:{ 1:true } }, b:{ goal:"x" } });
});

test("the barefoot walk: offered after walks, hikes and other outdoor blocks, not after a gym or a meeting", () => {
  for (const t of ["Walk", "Morning walk", "Walk to the beach", "Hike - Wadi Rum", "Trek to the falls", "Beach", "Park with Caney",
    "Garden", "Forest bathing", "Desert tour", "Sandboarding", "Picnic in the park"]) assert.ok(B.outdoorBlock(t), t);
  for (const t of ["Gym", "Walkthrough with Ela", "Call with Maggie", "Dinner", "Shopping", "Work", ""]) assert.ok(!B.outdoorBlock(t), t);
  const s = B.barefootStep();
  assert.deepEqual(J(s), { t:"Walk barefoot on natural ground: soil, grass or sand", h:"barefoot" });
  assert.ok(!/[–—]/.test(s.t), "no dashes in what he reads");
});

test("the barefoot walk pays its habit value once a day, into the same meter, and an untick takes it back", () => {
  const D = day(), s = B.barefootStep();
  assert.equal(D.tap("walk1", "outdoor", 0, s, "2026-10-19T15:00:00.000Z").pay.d, 5);
  assert.equal(D.tap("hike2", "outdoor", 0, s, "2026-10-19T18:00:00.000Z").pay, null, "once a day");
  assert.equal(D.tap("walk1", "outdoor", 0, s, "2026-10-19T15:01:00.000Z").back.d, 5);
  assert.equal(D.tap("walk1", "outdoor", 0, s, "2026-10-19T15:02:00.000Z").pay.d, 5);
  // quest.html: barefoot is still the Practice habit (prana meter) with its value and once-a-day limit
  assert.match(html, /\["barefoot", "[^"]+", 3, 1, "🦶", "Barefoot walk", "blk", "Practice"\],/);
});

test("quest.html: the checklist takes back on untick, voided travels, the check-in shows the barefoot tile", () => {
  const i = html.indexOf("function tapStep("), h = html.slice(i, i + 2400);
  assert.match(html, /root\.querySelectorAll\("\[data-bstep\]"\)[^]{0,200}tapStep\(b, blk, basicId\(blk\)/);
  assert.match(h, /QB\(\)\.applyTick\(W, i, r, at\)/);
  assert.match(h, /r\.back/);
  assert.match(h, /G\.day\.voided/);
  assert.match(h, /backKey\(/);
  assert.match(h, /fx\.back\(/, "the take-back animation");
  assert.ok(!/unticking takes nothing back/.test(html));
  const a = html.indexOf("function barefootHTML"), q = html.slice(a, a + 3200);
  assert.match(q, /outdoorBlock\(/);
  assert.match(q, /stepTile\(/, "the same habit tile as the checklists");
  assert.match(q, /tapStep\(bn, b, "outdoor"/, "and the same tap, pay and take-back");
  const aq = q.slice(q.indexOf("function openActQuiz"));
  assert.equal((aq.match(/\$\{barefootHTML\(b\)\}/g) || []).length, 2, "in the check-in and in its checked view");
  const mq = html.indexOf("function openMeal"), m = html.slice(mq, mq + 5200);
  assert.match(m, /fx\.back\(/, "meal tiles use the same take-back animation");
  assert.match(fs.readFileSync(fileURLToPath(new URL("../quest-fx.js", import.meta.url)), "utf8"), /function back\(/);
});
