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

// a tiny day run through the page's own bookkeeping (quest-basics.js tapDay and habitCount); gain is the page's
// habitGain rule for a once-a-day habit: its value until it counts as done
function day(){
  const D = { habits:{}, voided:{}, work:{}, log:[] };
  D.gain = h => B.habitCount(D, h) >= 1 ? 0 : VAL[h] || 0;
  D.tap = (key, kind, i, st, at) => {
    const t = B.tapDay(D, key, kind, i, st, 9, D.gain, at);
    // the page writes the pay or take-back line with its key (tapStep)
    if (t.pay) D.log.unshift({ at, msg:`${t.pay.h} (${key})`, xp:t.pay.d, k:t.pay.k });
    if (t.back) D.log.unshift({ at, msg:`${t.back.h} (${key}, taken back)`, xp:-t.back.d, k:t.back.k });
    return { ...t.r, pay:t.pay && { h:t.pay.h, d:t.pay.d, kind:t.pay.kind }, back:t.back };
  };
  D.prana = () => D.log.reduce((n, e) => n + e.xp, 0);
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
  assert.deepEqual(J(r2.back), { h:"shambhavi", d:20, kind:"yoga", k:"back:y:0:2026-10-19T13:00:00.000Z" });
  assert.equal(D.prana(), 0, "the 20 came back off");
  assert.equal(D.work.y.tick[0], undefined); assert.equal(D.work.y.paid[0], undefined);
  assert.equal(D.gain("shambhavi"), 20, "counted as not done again");
  // ticked again: pays again, and the count stays honest (2 ticks, 1 taken back)
  const r3 = D.tap("y", "yoga", 0, SH, "2026-10-19T13:06:00.000Z");
  assert.equal(r3.pay.d, 20);
  assert.equal(B.habitCount(D, "shambhavi"), 1, "2 ticks, 1 taken back");
  assert.deepEqual(J(D.habits), {}, "checklist ticks never touch the merged-by-max counter");
  assert.equal(D.gain("shambhavi"), 0);
  assert.equal(D.prana(), 20);
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
  // a paid record from an older page has no tick time: its take-back is keyed by the untick time, never an empty one
  assert.equal(B.backKey("blk1", 0, { h:"lamp", d:3 }, "2026-10-19T14:00:00.000Z"), "back:blk1:0:u2026-10-19T14:00:00.000Z");
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
    "Garden", "Forest bathing", "Desert tour", "Sandboarding", "Picnic in the park", "Hiking", "Beach day", "Trail run"]) assert.ok(B.outdoorBlock(t), t);
  for (const t of ["Gym", "Walkthrough with Ela", "Call with Maggie", "Dinner", "Shopping", "Work", "", "Call with Hillary",
    "Madison Square Garden", "Parks Canada meeting", "Trailer pickup", "Walker invoice", "Chill", "Desert Island Discs"]) assert.ok(!B.outdoorBlock(t), t);
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

test("two devices: a take-back on one and a tick in another block on the other never reopen the habit", () => {
  // review of d28: the Mac ticks then unticks Shambhavi in Yoga, the phone ticks it in Sadhana. Counters merged by max
  // gave habits 1 and voided 1, so it read as not done and could pay a third time.
  const mac = day(), phone = day();
  mac.tap("yoga", "yoga", 0, SH, "2026-10-19T13:00:00.000Z");
  mac.tap("yoga", "yoga", 0, SH, "2026-10-19T13:01:00.000Z");
  phone.tap("sadh", "sadhana", 2, SH, "2026-10-19T13:02:00.000Z");
  const wrap = (D, ts) => ({ xp:1, ts, day:{ date:"2026-10-19", prana:0, habits:D.habits, voided:D.voided, work:D.work, log:D.log } });
  for (const [a, b] of [[mac, phone], [phone, mac]]) {
    const m = M.mergeQuest(wrap(a, 1), wrap(b, 2)).day;
    assert.equal(B.habitCount(m, "shambhavi"), 1, "done once: the phone's tick");
    assert.deepEqual(J(B.owedBacks(m.work, m.log)), [], "nothing owed");
    const D = Object.assign(day(), J(m));
    assert.equal(D.tap("other", "yoga", 4, SH, "2026-10-19T13:10:00.000Z").why, "full", "it cannot pay again");
  }
});

test("a stale untick: the Mac unticks a tick the phone already took back and paid again; the second pay comes back", () => {
  // the phone ticks (t1), unticks, ticks again (t3); the Mac only saw t1 and unticks at t4. The Mac's take-back
  // names t1, which the phone took back already, so the merge keeps one; the step ends unticked (the Mac's change is
  // later) and the t3 pay is owed back. Before the fix the tile showed unticked and prana kept the +20.
  const t1 = "2026-10-19T13:00:00.000Z";
  const phone = day(); phone.tap("y", "yoga", 0, SH, t1);
  const mac = Object.assign(day(), J({ habits:phone.habits, voided:phone.voided, work:phone.work, log:phone.log }));
  phone.tap("y", "yoga", 0, SH, "2026-10-19T13:01:00.000Z");
  phone.tap("y", "yoga", 0, SH, "2026-10-19T13:03:00.000Z");
  assert.equal(mac.tap("y", "yoga", 0, SH, "2026-10-19T13:04:00.000Z").back.k, "back:y:0:" + t1);
  const wrap = (D, ts) => ({ xp:1, ts, day:{ date:"2026-10-19", prana:D.prana(), habits:D.habits, voided:D.voided, work:D.work, log:D.log } });
  const m = M.mergeQuest(wrap(phone, 1), wrap(mac, 2)).day;
  assert.equal(m.work.y.tick[0], undefined, "unticked: the Mac's change is the later one");
  const owed = B.owedBacks(m.work, m.log);
  assert.deepEqual(J(owed), [{ k:"back:y:0:2026-10-19T13:03:00.000Z", xp:-20, msg:"shambhavi (y)" }]);
  // the page writes it (settleTicks); then prana nets to 0 and nothing more is owed, on either device
  const log = [{ at:"2026-10-19T13:05:00.000Z", msg:"x", xp:-20, k:owed[0].k }, ...m.log];
  assert.equal(log.reduce((n, e) => n + e.xp, 0), 0);
  assert.deepEqual(J(B.owedBacks(m.work, log)), []);
  assert.equal(B.habitCount(m, "shambhavi"), 0, "and it can be ticked again");
});

test("the same step ticked on two devices pays once after the merge", () => {
  const a = day(), b = day();
  a.tap("y", "yoga", 0, SH, "2026-10-19T13:00:00.000Z");
  b.tap("y", "yoga", 0, SH, "2026-10-19T13:02:00.000Z");
  const wrap = (D, ts) => ({ xp:1, ts, day:{ date:"2026-10-19", prana:D.prana(), habits:D.habits, voided:D.voided, work:D.work, log:D.log } });
  const m = M.mergeQuest(wrap(a, 1), wrap(b, 2)).day;
  assert.equal(B.habitCount(m, "shambhavi"), 1);
  assert.deepEqual(J(B.owedBacks(m.work, m.log)).map(o => [o.k, o.xp]), [["back:y:0:2026-10-19T13:00:00.000Z", -20]]);
});

test("a paid record from an older page (no tick time) is taken back through voided, as it was counted in habits", () => {
  const D = day();
  D.habits.lamp = 1; D.work.w = { tick:{ 5:true }, paid:{ 5:{ h:"lamp", d:3, kind:"winddown" } } };
  assert.equal(B.habitCount(D, "lamp"), 1);
  const r = D.tap("w", "winddown", 5, { t:"Light the lamp", h:"lamp" }, "2026-10-20T02:00:00.000Z");
  assert.equal(r.back.k, "back:w:5:u2026-10-20T02:00:00.000Z");
  assert.equal(D.voided.lamp, 1);
  assert.equal(B.habitCount(D, "lamp"), 0);
});

test("quest.html: the tile tap runs tapDay, counts read habitCount, owed take-backs settle after each pull", () => {
  const i = html.indexOf("function tapStep("), h = html.slice(i, i + 2400);
  assert.match(html, /root\.querySelectorAll\("\[data-bstep\]"\)[^]{0,200}tapStep\(b, blk, basicId\(blk\)/);
  assert.match(h, /QB\(\)\.tapDay\(G\.day, gk\(blk\)/);
  assert.match(h, /k:t\.pay\.k/); assert.match(h, /k:t\.back\.k/);
  assert.match(h, /fx\.back\(/, "the take-back animation");
  assert.ok(!/G\.day\.habits/.test(h), "checklist ticks leave the counter alone");
  assert.match(html, /const habitN = id => window\.QuestBasics\.habitCount\(G\.day, id\)/);
  assert.match(html, /function habitGain\(id\)\{[^]{0,300}const n = habitN\(id\)/);
  assert.match(html, /undoTimedPay\(\);\n\s*settleTicks\(\);/);
  assert.ok(!/\(G\.day\.habits \|\| \{\}\)\[h\] > 0/.test(html), "done-today checks read the live count");
  assert.ok(!/unticking takes nothing back/.test(html));
  // the barefoot walk is the outdoor block's own list, opened straight from the block (d32; the check-in is gone)
  const a = html.indexOf("function barefootTile(");
  let q = html.slice(a, html.indexOf("function openOutdoor("));
  assert.ok(a > 0);
  assert.ok(!/G\.day\.work = /.test(q), "drawing it writes nothing");
  assert.match(q, /tapStep\(bn, b, "outdoor"/, "and the same tap, pay and take-back");
  q = html.slice(html.indexOf("function openOutdoor("), html.indexOf("function openOutdoor(") + 600);
  assert.match(q, /id="oEdit">Change time or name</, "and the block can still be changed from there");
  const so = html.slice(html.indexOf("function blockList("), html.indexOf("function blockList(") + 900);
  assert.match(so, /QB\(\)\.outdoorBlock\(b\.t\)\) return "outdoor"/, "a walk or hike opens its barefoot tile");
  const mq = html.indexOf("function openMeal"), m = html.slice(mq, mq + 12000);   // longer since the dish checklists (2026-10-20)
  assert.match(m, /fx\.back\(/, "meal tiles use the same take-back animation");
  assert.match(html, /\[data-tick\][^]{0,300}\(W\.t = W\.t \|\| \{\}\)\[i\] = now\(\)\.toISOString\(\)/, "prep lists stamp their steps too");
  for (const f of ["quest-merge", "quest-fx", "quest-basics"]) assert.match(html, new RegExp(`${f}\\.js\\?v=2026(1019[x-z]|1020a|1020k\\d|1021d48)`), f);
});
