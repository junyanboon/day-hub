// node --test still/test/*.test.mjs   (Gym log by levels, Junyan 2026-10-16: d16 level, how the hardest set went,
// optional reps, no reps/lbs grid; d17 weight box only on SLS from L4 and NC L7; d18 Test button; d19/d20 body weight in lbs)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-levels.js", import.meta.url)), "utf8"), ctx);
const L = ctx.QuestLevels;
const J = x => JSON.parse(JSON.stringify(x));   // objects from the vm context are not deepEqual to ours
const CODES = ["OAC", "SLS", "NC", "PPU", "HSPU", "FLR"];

test("every move has seven levels, each with a short plain name", () => {
  for (const c of CODES) {
    assert.equal(L.LEVELS[c].length, 7, c);
    for (const n of L.LEVELS[c]) { assert.ok(n && n.length <= 40, `${c}: ${n}`); assert.doesNotMatch(n, /[–—]/); }
  }
});

test("the next-level line for every move and level, and Top level at L7", () => {
  for (const c of CODES) for (let n = 1; n <= 7; n++) {
    const t = L.nextText(c, n);
    if (n === 7) assert.equal(t, "Top level");
    else assert.equal(t, `Next: L${n + 1} · ${L.LEVELS[c][n]}`);
  }
  assert.equal(L.levelText("NC", 3), "L3 · Hands help near the bottom");
  assert.equal(L.nextText("NC", 3), "Next: L4 · Partial range, no hands");
  assert.equal(L.nextText("OAC", 4), "Next: L5 · Partial one-arm negative");
  assert.equal(L.nextText("SLS", 5), "Next: L6 · 30 kg");
  assert.equal(L.nextText("FLR", 2), "Next: L3 · Tuck front lever row");
});

test("the weight box shows only on SLS from L4 and NC at L7, in kg", () => {
  for (const c of CODES) for (let n = 1; n <= 7; n++) {
    const want = (c === "SLS" && n >= 4) || (c === "NC" && n === 7);
    assert.equal(!!L.weightBox(c, n), want, `${c} L${n}`);
    if (want) assert.equal(L.weightBox(c, n).unit, "kg");
  }
});

test("a passed test raises the level by one, never past L7; not yet keeps it", () => {
  let x = L.startMove("NC", 3);
  assert.equal(x.level, 3); assert.equal(x.trained, 3);
  x = L.recordTest(x, true);
  assert.equal(x.level, 4); assert.equal(x.trained, 3, "the level trained stays what he did today");
  assert.deepEqual(J(x.tests), [{ level: 4, pass: true }]);
  assert.equal(L.nextText("NC", x.level), "Next: L5 · Full negative, no hands");
  x = L.recordTest(x, false);
  assert.equal(x.level, 4);
  assert.deepEqual(J(x.tests), [{ level: 4, pass: true }, { level: 5, pass: false }]);
  let easy = L.startMove("OAC", 4); easy.trained = 3;
  easy = L.recordTest(easy, true);
  assert.equal(easy.level, 5); assert.equal(easy.trained, 3, "an easier progression he chose stays");
  // the next session opens at the new level
  assert.equal(L.startMove("NC", x.level).trained, 4);
  let top = L.startMove("SLS", 7);
  assert.equal(L.testLevel(top), null, "no test at the top level");
  top = L.recordTest(top, true);
  assert.equal(top.level, 7);
  assert.equal(top.tests.length, 0);
});

test("the quiz levels are his levels until a real one is saved, and never overwrite real ones", () => {
  const a = L.seedLevels({}, "2026-10-16");
  assert.equal(a.changed, true);
  assert.deepEqual(J(Object.fromEntries(CODES.map(c => [c, a.levels[c].level]))), { OAC: 4, SLS: 5, NC: 3, PPU: 3, HSPU: 3, FLR: 2 });
  assert.equal(a.levels.NC.from, "quiz");
  // a second time: nothing changes
  const b = L.seedLevels(a.levels, "2026-10-17");
  assert.equal(b.changed, false);
  // levels he already saved stay; only the missing ones are filled
  const c = L.seedLevels({ NC: { level: 5, at: "2026-10-12" }, OAC: { level: 6, at: "2026-10-12" } }, "2026-10-16");
  assert.equal(c.changed, true);
  assert.equal(c.levels.NC.level, 5); assert.equal(c.levels.NC.at, "2026-10-12");
  assert.equal(c.levels.OAC.level, 6);
  assert.equal(c.levels.SLS.level, 5); assert.equal(c.levels.FLR.level, 2);
  // a move missing later gets its quiz level again
  const d = { ...J(a.levels) }; delete d.FLR;
  const d2 = L.seedLevels(d, "2026-11-01"); assert.equal(d2.changed, true); assert.equal(d2.levels.FLR.level, 2);
  // nothing passed in is changed in place
  const e = {}; L.seedLevels(e, "2026-10-16"); assert.deepEqual(e, {});
});

test("an old reps/lbs entry is moved to the new shape without losing a number", () => {
  const old = { code: "SLS", name: "Single-Leg Squat", kind: "strength", level: 5, levelName: "20 kg",
    reps: ["8", "6", "5", "4"], lbs: ["", "", "44", "44"] };
  const m = L.migrateEntry(old);
  assert.equal(m.trained, 5); assert.equal(m.level, 5);
  assert.equal(m.reps, 5, "the best working set");
  assert.equal(m.kg, 20, "44 lbs on a weighted level is 20 kg");
  assert.equal(m.effort, null);
  assert.deepEqual(J(m.legacy), { reps: ["8", "6", "5", "4"], lbs: ["", "", "44", "44"] });
  // new-shape entries and mobility pass through untouched
  const nw = { code: "NC", level: 3, trained: 3, effort: "full", reps: 4 };
  assert.deepEqual(J(L.migrateEntry(nw)), nw);
  const mob = { name: "Pike", kind: "mobility", setsDone: 1 };
  assert.deepEqual(J(L.migrateEntry(mob)), mob);
  // only warm-ups filled in: the best of what is there
  assert.equal(L.migrateEntry({ code: "OAC", level: 4, reps: ["6", "", "", ""], lbs: ["", "", "", ""] }).reps, 6);
  assert.equal(L.migrateEntry({ code: "OAC", level: 4, reps: ["", "", "", ""], lbs: ["", "", "", ""] }).reps, null);
  // a session keeps its date and program, so the weekly gym count still sees it
  const s = L.migrateSession({ date: "2026-10-12", program: "Jack Woods · Day 1", entries: [old, mob] });
  assert.equal(s.date, "2026-10-12"); assert.equal(s.program, "Jack Woods · Day 1");
  assert.equal(s.entries[0].reps, 5); assert.equal(s.entries[1].name, "Pike");
});

test("an old phone draft opens in the new box with its level and best set", () => {
  const draft = { program: "Jack Woods · Day 1", at: "2026-10-16T10:00:00Z",
    e: { NC: { level: 3, start: null, reps: ["5", "5", "4", "3"], lbs: ["", "", "", ""] }, "m:Pike": { done: true } } };
  const d = L.migrateDraft(draft, { NC: { level: 3, from: "quiz" } });
  assert.equal(d.e.NC.level, 3); assert.equal(d.e.NC.trained, 3); assert.equal(d.e.NC.reps, "4");
  assert.equal(d.e.NC.effort, ""); assert.deepEqual(J(d.e.NC.tests), []);
  assert.deepEqual(J(d.e["m:Pike"]), { done: true });
  assert.deepEqual(J(L.migrateDraft(d, {})), J(d), "a new draft at his levels is left alone");
  const odd = L.migrateDraft({ program: "x", e: { NC: { start: 3, level: "<b>", trained: 99, effort: "full", reps: "", kg: "" } } }, {});
  assert.equal(odd.e.NC.level, 3); assert.equal(odd.e.NC.trained, 7); assert.deepEqual(J(odd.e.NC.tests), []);
  const sent = L.toEntry("NC", "Nordic Hamstring Curl", d.e.NC);
  assert.equal(sent.reps, 4);
  assert.deepEqual(J(sent.legacy.reps), ["5", "5", "4", "3"], "the old four sets are saved with it");
});

test("a strength entry for the server: current level, level trained, the hardest set, weight only where it counts", () => {
  let x = L.startMove("SLS", 5); x.effort = "part"; x.reps = "6"; x.kg = "20";
  let e = L.toEntry("SLS", "Single-Leg Squat", x);
  assert.deepEqual(J(e), { code: "SLS", name: "Single-Leg Squat", kind: "strength", level: 5, levelName: "20 kg",
    trained: 5, trainedName: "20 kg", effort: "part", reps: 6, kg: 20, tests: [] });
  let n = L.startMove("NC", 3); n.kg = "10"; n.effort = "full";
  assert.equal(L.toEntry("NC", "Nordic Hamstring Curl", n).kg, null, "no weight below NC L7");
  assert.equal(L.toEntry("NC", "Nordic Hamstring Curl", L.startMove("NC", 3)), null, "nothing logged, nothing sent");
  n = L.recordTest(L.startMove("NC", 3), false);
  assert.ok(L.toEntry("NC", "Nordic Hamstring Curl", n), "a test attempt alone is worth saving");
  for (const bad of ["-5", "1e3", "0x10", "five", " "]) {
    const y = L.startMove("SLS", 5); y.effort = "full"; y.reps = bad; y.kg = bad;
    const e = L.toEntry("SLS", "Single-Leg Squat", y);
    assert.equal(e.reps, null, bad); assert.equal(e.kg, null, bad);
  }
});

test("body weight: lbs only, a sensible number, one reading a day, the last four as a trend", () => {
  assert.equal(L.parseLbs("172.4"), 172.4);
  assert.equal(L.parseLbs(" 173 "), 173);
  assert.equal(L.parseLbs(""), null);
  assert.equal(L.parseLbs("abc"), null);
  assert.equal(L.parseLbs("20"), null, "too light to be lbs");
  assert.equal(L.parseLbs("900"), null);
  const r = L.addReading([], "2026-10-01", 175, "2026-10-01T10:00:00Z");
  const r2 = L.addReading(L.addReading(L.addReading(r, "2026-10-05", 174.2, "t"), "2026-10-09", 173.6, "t"), "2026-10-12", 173, "t");
  const r3 = L.addReading(r2, "2026-10-16", 172.4, "t");
  const r4 = L.addReading(r3, "2026-10-16", 172.8, "t2");
  assert.equal(r4.length, 5, "the same day twice keeps one reading");
  assert.equal(r4[4].lbs, 172.8);
  const t = L.bodyTrend(r4);
  assert.deepEqual(J(t.recent.map(x => x.lbs)), [174.2, 173.6, 173, 172.8]);
  assert.equal(t.last.lbs, 172.8); assert.equal(t.last.date, "2026-10-16");
  assert.equal(t.change, -1.4);
  assert.match(L.trendText(t), /^172\.8 lbs · last 4: 174\.2, 173\.6, 173, 172\.8 \(down 1\.4\)$/);
  assert.equal(L.bodyTrend([]), null);
  assert.equal(L.trendText(L.bodyTrend([{ date: "2026-10-16", lbs: 172 }])), "172 lbs");
  // readings can also come from saved sessions (a server that has no list yet)
  const fromSessions = L.readingsFrom(null, [{ date: "2026-10-09", bodyWeightLbs: 173.6, entries: [] }, { date: "2026-10-12", entries: [] }]);
  assert.deepEqual(J(fromSessions), [{ date: "2026-10-09", lbs: 173.6 }]);
});

// Later 2026-10-16, his screenshots: Nordic L1 and One-Arm Chin L1 although the server had his quiz levels.
// The phone kept a draft from the old log (level 1 by default, start null), and the migration kept that L1.
test("quiz levels show when no real level is saved, and a migrated or default L1 is ignored", () => {
  const server = L.seedLevels({}, "2026-10-16").levels;   // what live /quest/workout returns today
  const old = { program: "Jack Woods · Day 1", at: "2026-10-16T09:00:00Z",
    e: { NC: { level: 1, start: null, reps: ["", "", "", ""], lbs: ["", "", "", ""] }, OAC: { level: 1, start: null, reps: ["", "", "", ""], lbs: ["", "", "", ""] },
      SLS: { level: 1, start: null, reps: ["", "", "", ""], lbs: ["", "", "", ""] } } };
  const d = L.migrateDraft(old, server);
  assert.deepEqual([d.e.NC.level, d.e.NC.trained, d.e.OAC.level, d.e.OAC.trained, d.e.SLS.level], [3, 3, 4, 4, 5]);
  // the same draft after the PR 11 page had migrated it and saved it back (start 4, level 1, trained 1)
  const bad = { program: "Jack Woods · Day 1", e: { OAC: { start: 4, level: 1, trained: 1, effort: "", reps: "", kg: "", tests: [], legacy: { reps: ["", "", "", ""], lbs: ["", "", "", ""] } } } };
  const b = L.migrateDraft(bad, server);
  assert.deepEqual([b.e.OAC.start, b.e.OAC.level, b.e.OAC.trained], [4, 4, 4]);
  assert.equal(L.toEntry("OAC", "One-Arm Chin", b.e.OAC), null, "an untouched move is not logged");
  // a saved L1 that no Test set is not a real level; one a Test set is
  assert.equal(L.currentLevel({ NC: { level: 1, at: "2026-10-16" } }, "NC"), 3);
  assert.equal(L.seedLevels({ NC: { level: 1, at: "2026-10-16" }, _seed: { from: "quiz", at: "2026-10-16" } }, "2026-10-16").levels.NC.level, 3);
  assert.equal(L.currentLevel({ NC: { level: 4, at: "2026-10-20", from: "test" } }, "NC"), 4);
  assert.equal(L.currentLevel({}, "HSPU"), 3); assert.equal(L.currentLevel(undefined, "FLR"), 2);
  // a Test passed in the draft keeps its level; a level he trained on purpose stays
  let x = L.startMove("NC", 3); x = L.recordTest(x, true); x.trained = 2; x.effort = "help";
  const t = L.migrateDraft({ program: "Jack Woods", e: { NC: x } }, server);
  assert.deepEqual([t.e.NC.start, t.e.NC.level, t.e.NC.trained], [3, 4, 2]);
  // the live levels already seeded by the deployed server are left as they are (no write needed)
  assert.equal(L.seedLevels({ ...J(server), _seed: { from: "quiz", at: "2026-10-16" } }, "2026-10-17").levels.OAC.level, 4);
});

test("after a save only a passed Test moves a level, so an old page or draft cannot put a move back to L1", () => {
  const lv0 = L.seedLevels({}, "2026-10-16").levels;
  const lv = L.saveLevels(lv0, [{ code: "NC", level: 1, trained: 1, tests: [] }, { code: "OAC", level: 5, tests: [{ level: 5, pass: true }] },
    { code: "SLS", level: 6, tests: [{ level: 6, pass: false }] }, { name: "Pike", kind: "mobility" }], "2026-10-24");
  assert.equal(lv.NC.level, 3); assert.equal(lv.OAC.level, 5); assert.equal(lv.OAC.from, "test"); assert.equal(lv.SLS.level, 5);
  assert.equal(L.currentLevel(lv, "OAC"), 5);
  assert.equal(lv0.OAC.level, 4, "not changed in place");
});
