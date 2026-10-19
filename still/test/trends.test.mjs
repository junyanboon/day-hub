// node --test still/test/*.test.mjs   (Junyan, 2026-10-19: body starts at readiness, d1; the Last night box, d2 and d5;
// the day-end screen shows how today went with trends and the one thing to beat tomorrow)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const html = fs.readFileSync(here + "quest.html", "utf8");
const ctx = {}; ctx.globalThis = ctx;
for (const f of ["quest-meals.js", "quest-trends.js"]) vm.runInNewContext(fs.readFileSync(here + f, "utf8"), ctx);
const T = ctx.QuestTrends;
const J = x => JSON.parse(JSON.stringify(x));

const NIGHTS = [
  { day: "2026-10-11", rhr: 60, hrv: 30, score: 60 },   // 8 nights back: outside the 7-day average
  ...[12, 13, 14, 15, 16, 17, 18].map(d => ({ day: `2026-10-${d}`, rhr: 52, hrv: 40, score: 75 })),
  { day: "2026-10-19", rhr: 49, hrv: 36, score: 84 },
];

test("Last night: each number beside its 7-day average, green when it moved the right way", () => {
  const [rhr, hrv, sc] = J(T.ouraRows(NIGHTS, "2026-10-19"));
  assert.deepEqual([rhr.label, rhr.last, rhr.avg, rhr.arrow, rhr.good], ["Resting heart rate", 49, 52, "↓", true]);   // lower is better
  assert.deepEqual([hrv.label, hrv.last, hrv.avg, hrv.arrow, hrv.good], ["HRV average", 36, 40, "↓", false]);
  assert.deepEqual([sc.label, sc.last, sc.avg, sc.arrow, sc.good], ["Sleep score", 84, 75, "↑", true]);
  assert.deepEqual([rhr.best, hrv.best, sc.best], [49, 40, 84]);   // best of the week and last night
});

test("no night for today yet: last is empty, the average still shows, no arrow", () => {
  const [rhr] = J(T.ouraRows(NIGHTS.slice(0, -1), "2026-10-19"));
  assert.equal(rhr.last, null); assert.equal(rhr.avg, 52); assert.equal(rhr.arrow, "");
  assert.deepEqual(J(T.ouraRows([], "2026-10-19")).map(r => r.avg), [null, null, null]);
});

const HIST = [
  { day: "2026-10-16", prana: 60, body: 70, pf: 3, dr: 0 },
  { day: "2026-10-17", prana: 80, body: 72, pf: 2, dr: 1 },
  { day: "2026-10-18", prana: 55, body: 68, pf: 4, dr: 0 },
];

test("a day row: today, yesterday, the 7-day average and the best day", () => {
  const r = J(T.dayRow("prana", "Prana", HIST, { day: "2026-10-19", prana: 70 }));
  assert.deepEqual([r.today, r.yesterday, r.avg, r.arrow, r.good], [70, 55, 65, "↑", true]);
  assert.deepEqual(r.best, { day: "2026-10-17", v: 80, isToday: false });
  const d = J(T.dayRow("dr", "Drains", HIST, { day: "2026-10-19", dr: 0 }, "down"));
  assert.equal(d.best.isToday, true); assert.equal(d.arrow, "=");   // 0 against a week of 0.3: level
});

const rows = (today) => ["prana", "body", "pf", "dr"].map(k => T.dayRow(k, k, HIST, { day: "2026-10-19", ...today }, k === "dr" ? "down" : "up"));

test("no history yet, or nothing eaten: no best day is claimed", () => {
  assert.equal(T.dayRow("pf", "Pranic foods", [], { day: "2026-10-19", pf: 2 }).best, null);
  assert.equal(T.dayRow("pf", "Pranic foods", [{ day: "2026-10-18", pf: 0 }], { day: "2026-10-19", pf: 0 }).best, null);
});

const OK_NIGHT = [{ k: "rhr", last: 52, avg: 52, good: null }, { k: "hrv", last: 40, avg: 40, good: null }, { k: "score", last: 75, avg: 75, good: null }];
const FULL = { today: 8, aim: 8 };

test("d65: tomorrow's one thing is the weakest area, and drains are named", () => {
  const line = T.beatLine({ rows: rows({ prana: 70, body: 70, pf: 3, dr: 2 }), oura: OK_NIGHT, water: FULL, drainNames: ["Onion or garlic", "Coffee or tea"], seed: 0 });
  assert.equal(line, "Drains today: onion or garlic and coffee or tea. Skip the onion or garlic tomorrow to win the day back.");
});

test("d65: not always drains: a low water day or a weak HRV wins over one small drain", () => {
  const water = T.beatLine({ rows: rows({ prana: 70, body: 70, pf: 3, dr: 1 }), oura: OK_NIGHT, water: { today: 2, aim: 8 }, drainNames: ["Coffee or tea"], seed: 0 });
  assert.match(water, /water|Water/);
  const hrv = [OK_NIGHT[0], { k: "hrv", last: 28, avg: 40, good: false }, OK_NIGHT[2]];
  assert.match(T.beatLine({ rows: rows({ prana: 70, body: 70, pf: 3, dr: 0 }), oura: hrv, water: FULL, seed: 0 }), /^HRV 28/);
  assert.match(T.beatLine({ rows: rows({ prana: 70, body: 70, pf: 3, dr: 0 }), oura: OK_NIGHT, water: FULL, bedLate: true, seed: 0 }), /after 11|past 11/);
  assert.match(T.beatLine({ rows: rows({ prana: 40, body: 70, pf: 3, dr: 0 }), oura: OK_NIGHT, water: FULL, seed: 0 }), /^Prana ended at 40, your week averages 65\./);
  const rhr = [{ k: "rhr", last: 60, avg: 52, good: false }, OK_NIGHT[1], OK_NIGHT[2]];
  assert.match(T.beatLine({ rows: rows({ prana: 70, body: 70, pf: 3, dr: 0 }), oura: rhr, water: FULL, seed: 0 }), /^Resting heart rate 60/);
});

test("d65: the wording changes from day to day, and close areas take turns", () => {
  const t = (seed) => T.beatLine({ rows: rows({ prana: 70, body: 70, pf: 3, dr: 0 }), oura: OK_NIGHT, water: { today: 4, aim: 8 }, seed });
  assert.notEqual(t(0), t(1));
  const two = (seed) => T.beatLine({ rows: rows({ prana: 70, body: 70, pf: 3, dr: 0 }), oura: OK_NIGHT, water: { today: 4, aim: 8 }, bedLate: true, seed });
  const seen = new Set([0, 1, 2, 3].map(two).map(l => /water|Water/.test(l) ? "water" : "sleep"));
  assert.deepEqual([...seen].sort(), ["sleep", "water"]);
});

test("d65: nothing weak: the best-day line", () => {
  assert.match(T.beatLine({ rows: rows({ prana: 90, body: 70, pf: 3, dr: 0 }), oura: OK_NIGHT, water: FULL }), /best day lately/);
});

test("d66: one kind line about what improved most against his week", () => {
  const good = [OK_NIGHT[0], { k: "hrv", last: 52, avg: 40, good: true }, OK_NIGHT[2]];
  assert.equal(T.encourage({ rows: rows({ prana: 66, body: 70, pf: 3, dr: 0 }), oura: good }), "HRV 52, up on your week's 40. Your system is calmer.");
  assert.match(T.encourage({ rows: [], oura: OK_NIGHT }), /looked at it honestly/);
  const body = [{ k: "body", today: 73, avg: 34.6, good: true }];
  assert.equal(T.encourage({ rows: body }), "Body ended at 73, above your week's 35. You looked after yourself today.");
});

test("d63: names of drains and pranic foods, short and once each", () => {
  const ctxM = ctx.QuestMeals;
  assert.deepEqual(J(T.namesOf(["neg", "coffee", "neg", "x", "heavy"], ctxM.DRAINS)), ["Onion or garlic", "Coffee or tea", "Heavy meal"]);
  assert.deepEqual(J(T.namesOf(["fveg", "pos", "heavy"], ctxM.PRANA_FOODS)), ["Fresh vegetables", "Pranic food"]);
});

test("d67: the 3 that mattered most, sadhana and health first; yoga only with a practice ticked", () => {
  const items = [
    { name: "✓ Lunch", rank: 2, mins: 60 }, { name: "✓ Yoga", rank: 0, mins: 60, yoga: true, practiced: false },
    { name: "✓ Gym", rank: 1, mins: 90 }, { name: "✓ Shambhavi", rank: 0, mins: 30, yoga: true, practiced: true },
    { name: "✓ Walk", rank: 1, mins: 30 }, { name: "✓ Email", rank: 2, mins: 120 },
  ];
  assert.deepEqual(J(T.topDone(items)), ["✓ Shambhavi", "✓ Gym", "✓ Walk"]);
  // the page puts meals and rest blocks last even though they count as health kinds
  assert.match(html, /rank:isSadhana\(b\) \? 0 : isMeal\(b\) \|\| b\.kind === "rest" \? 3 : isHealth\(b\) \? 1 : 2/);
});

test("d68: 2026-10-19's old Body is left out of the average and the best unless it came from the log", () => {
  assert.equal(T.bodyOk("2026-10-19", { body: 95 }), false);
  assert.equal(T.bodyOk("2026-10-19", { body: 40, bk: 1 }), true);
  assert.equal(T.bodyOk("2026-10-18", { body: 70 }), true);
  const hist = [{ day: "2026-10-18", body: 60 }, { day: "2026-10-19", body: null }];
  const r = J(T.dayRow("body", "Body", hist, { day: "2026-10-20", body: 62 }));
  assert.equal(r.avg, 60); assert.equal(r.best.isToday, true);
});

test("d68: the page stamps Body from its logged lines and the trends read past Body through bodyOk", () => {
  assert.match(html, /body:bd \?\? G\.day\.body, \.\.\.\(bd != null \? \{ bk:1 \}/);
  assert.match(html, /body:TR\.bodyOk\(day, v\) \? v\.body : null/);
});

test("Day's end: Keep a memory and Your life in prana are gone, the tiles say what they count", () => {
  const night = fs.readFileSync(here + "quest-night.js", "utf8");
  for (const w of ["<h3>Keep a memory", "<h3>Your life in prana", "No prana tonight", "data-keep", "lifeGrid", "recentBars", "ntBirth"]) assert.ok(!night.includes(w), w);
  for (const w of ["keepCandidates", "onKeep", "onUnkeep", '"fires lit"', '"actions"]']) assert.ok(!html.includes(w), w);
  assert.match(html, /"health blocks done"\], \[`\$\{hDone\}`, "habits ticked"\]/);
  assert.ok(/t\.cheer/.test(night), "the encouragement line is drawn");
});

test("beat tomorrow speaks kindly: no punishment words, no em or en dashes", () => {
  const src = fs.readFileSync(here + "quest-trends.js", "utf8");
  assert.ok(!/[–—]/.test(src));
  for (const w of ["failed", "bad day", "penalty", "punish", "lazy", "should have"]) assert.ok(!src.toLowerCase().includes(w), w);
});

test("body starts at the Oura readiness score, then the sleep score, then the old fallback", () => {
  const i = html.indexOf("async function seedFromOura"), f = html.slice(i, i + 1400);
  assert.ok(i > 0);
  const r = f.indexOf('"/readiness"'), s = f.indexOf('"/sleep"');
  assert.ok(r > 0 && s > r, "readiness is asked first, sleep second");
  assert.ok(/Readiness \$\{/.test(f), "the log says readiness set the body");
});

test("Last night is its own card right under Prana and Body, one row of three, and the night screen gets trends", () => {
  assert.match(html, /<div id="being"><\/div>\n  <div class="bg-night" id="bgNight" hidden><\/div>/);
  assert.ok(!/<div class="bg-night"[^>]*><\/div>`/.test(html), "no longer drawn inside the Prana and Body stage");
  assert.match(html, /<div class="bn-row">/);
  assert.match(html, /\.bn-row \{[^}]*repeat\(3/);
  assert.ok(!/\.bg-night \{[^}]*margin:[^;]*50%/.test(html), "no left gap under Prana");
  assert.ok(/API \+ "\/lastnight"/.test(html));
  assert.ok(/<script src="quest-trends\.js\?v=\w+"><\/script>/.test(html));
  const night = fs.readFileSync(here + "quest-night.js", "utf8");
  assert.ok(/d\.today\.trends/.test(night), "quest-night.js draws today's trends");
  assert.ok(/beat/.test(night));
});

test("the service worker saves the new Oura answers for offline like /sleep", () => {
  const sw = fs.readFileSync(here + "sw.js", "utf8");
  assert.ok(/readiness\|lastnight|lastnight\|readiness/.test(sw.match(/DATA_PATHS = [^\n]+/)[0]));
});
