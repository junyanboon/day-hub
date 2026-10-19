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

test("beat tomorrow: more drains than yesterday comes first and names the drain", () => {
  const line = T.beatLine({ rows: rows({ prana: 70, body: 70, pf: 3, dr: 2 }), topDrain: "Coffee or tea" });
  assert.equal(line, "2 drains today vs 0 yesterday. Skip the coffee or tea tomorrow to win the day back.");
});

test("beat tomorrow: prana under the week, then fewer pranic foods, then body", () => {
  assert.match(T.beatLine({ rows: rows({ prana: 40, body: 70, pf: 3, dr: 0 }) }), /^Prana ended at 40, your week averages 65\./);
  assert.match(T.beatLine({ rows: rows({ prana: 70, body: 70, pf: 1, dr: 0 }) }), /^1 pranic food today, your week averages 3\./);
  assert.match(T.beatLine({ rows: rows({ prana: 70, body: 50, pf: 3, dr: 0 }) }), /^Body ended at 50/);
  assert.match(T.beatLine({ rows: rows({ prana: 90, body: 70, pf: 3, dr: 0 }) }), /best day lately/);
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

test("the Last night box sits under Body in the Prana and Body widget, and the night screen gets trends", () => {
  assert.ok(/<div class="bg-night" id="bgNight" hidden><\/div>/.test(html));
  assert.ok(html.indexOf('id="bgNight"') > html.indexOf('<div class="bg-k">Body</div>'));
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
