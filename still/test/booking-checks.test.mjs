// node --test still/test/*.test.mjs   (Junyan, 2026-10-20: "I'm getting all of these weird errors can we fix it".
// Step 2 of the morning planner, "Does today work?", raised 7 overlaps between the Europcar Madrid car rental, a
// 51 hour booking, and every block it spans, and offered "End Europcar Madrid car rental at 3:00 PM" and "Drop
// Senda Maeso". A booking (over 12 hours by the calendar's own times, or all-day) is not a block of his time: no
// check may count it, end it, cut it or drop it. And d40: only Joint Plans events (and blocks added in Quest)
// can clash; his other calendars never do.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require("../quest-agenda.js");
require("../quest-morning.js");
const A = globalThis.QuestAgenda, M = globalThis.QuestMorning;
const here = fileURLToPath(new URL("../", import.meta.url));

const JOINT = A.JOINT, JUNYAN = A.JUNYAN;
const fmtT = (d) => new Date(d).toLocaleTimeString("en-US", { timeZone: "Europe/Madrid", hour: "numeric", minute: "2-digit" });
const hour = (d) => { const p = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", hour: "numeric", minute: "numeric", hourCycle: "h23" })
  .formatToParts(new Date(d)).reduce((o, x) => (o[x.type] = x.value, o), {}); return (+p.hour % 24) + p.minute / 60; };
const KIND = [[/wind.?down|sleep/i, "rest"], [/yoga|kriya/i, "practice"], [/breakfast|lunch|dinner|groceries|cook/i, "fuel"],
  [/check.?in|check.?out|pick up|drive/i, "travel"]];
// what MO_CTX.data() hands the planner for one plan block (quest.html), with the plan's own times as cs/ce
function item(b, i, ed) {
  const kind = b.type === "break" ? "break" : b.type === "focus" ? "open" : (KIND.find(([re]) => re.test(b.t)) || [, "fixed"])[1];
  const s = new Date(ed ? ed.s : b.s), e = new Date(ed ? ed.e : b.e);
  return { key: "k" + i, name: b.t, s, e, kind, open: kind === "open", brk: kind === "break", meal: kind === "fuel", sleep: false,
    sadhana: kind === "practice", strength: false, flight: false, extra: !!b.extra, taskId: null, basic: null,
    calId: b.calId || "", cal: b.cal || "", type: b.type, cs: b.s, ce: b.e, allDay: !!b.allDay,
    cost: 10 * Math.max(0, (e - s) / 3600000), badge: "" };
}
// Tuesday 20 October 2026, Madrid, as still-api /plan served it that morning (titles and times exact)
const J = { cal: "Joint Plans", calId: JOINT, type: "fixed" };
const DAY = [
  { t: "Yoga", s: "2026-10-20T08:30:00+02:00", e: "2026-10-20T09:30:00+02:00", ...J },
  { t: "M Club breakfast", s: "2026-10-20T09:30:00+02:00", e: "2026-10-20T10:30:00+02:00", ...J },
  { t: "Open space", s: "2026-10-20T10:30:00+02:00", e: "2026-10-20T11:20:00+02:00", cal: "Junyan", type: "focus" },
  { t: "Rest", s: "2026-10-20T11:20:00+02:00", e: "2026-10-20T11:30:00+02:00", cal: "", type: "break" },
  { t: "Open space", s: "2026-10-20T11:30:00+02:00", e: "2026-10-20T12:20:00+02:00", cal: "Junyan", type: "focus" },
  { t: "Check out — Madrid Marriott Hotel Princesa Plaza", s: "2026-10-20T12:30:00+02:00", e: "2026-10-20T13:00:00+02:00", ...J },
  { t: "Pick up — Europcar Madrid car rental", s: "2026-10-20T13:00:00+02:00", e: "2026-10-20T14:00:00+02:00", ...J },
  { t: "Europcar Madrid car rental [2026.10.20]", s: "2026-10-20T13:00:00+02:00", e: "2026-10-22T16:00:00+02:00", ...J },
  { t: "Drive up to La Pedriza", s: "2026-10-20T14:00:00+02:00", e: "2026-10-20T15:00:00+02:00", ...J },
  { t: "Senda Maeso — short out-and-back from apartment", s: "2026-10-20T15:00:00+02:00", e: "2026-10-20T17:45:00+02:00", ...J },
  { t: "Groceries at DIA — after the Maeso walk", s: "2026-10-20T17:45:00+02:00", e: "2026-10-20T18:30:00+02:00", ...J },
  { t: "Check in — ESTUDIO MAESO con sofá cama", s: "2026-10-20T18:30:00+02:00", e: "2026-10-20T19:30:00+02:00", ...J },
  { t: "Cook dinner + early night", s: "2026-10-20T19:30:00+02:00", e: "2026-10-20T20:45:00+02:00", ...J },
  { t: "Wind down", s: "2026-10-20T21:45:00+02:00", e: "2026-10-20T22:30:00+02:00", cal: "Junyan", calId: JUNYAN, type: "fixed" },
];
function ctx(blocks, now, opt = {}) {
  const plan = { ok: {}, tasks: {}, lead: {} };
  const D = { now: new Date(now), today: "2026-10-20", body: opt.body ?? 80, plan, practiced: true, recovery: [], tasks: [], practices: [],
    items: blocks.map((b, i) => item(b, i, (opt.edits || {})[i])) };
  return { data: () => D, fmtT, hour, save() {}, log() {}, at: () => new Date(now), add() {}, move() {}, setTime() {}, drop() {}, rename() {} };
}
function run(blocks, now, opt) {
  const C = ctx(blocks, now, opt);
  M.count(C);   // binds the planner to this day, as opening it does
  return M._t.checks(C.data());
}
const words = (cs) => cs.flatMap((c) => [c.text, c.why, ...c.fixes.map((f) => f[0])]).join(" | ");

test("the shared booking rule: over 12 hours by the calendar's own times, or all-day", () => {
  assert.equal(A.isBooking({ s: new Date("2026-10-20T13:00:00+02:00"), e: new Date("2026-10-22T16:00:00+02:00") }), true);
  assert.equal(A.isBooking({ s: new Date("2026-10-20T08:00:00+02:00"), e: new Date("2026-10-20T20:00:00+02:00") }), false);
  assert.equal(A.isBooking({ s: new Date("2026-10-20T00:00:00+02:00"), e: new Date("2026-10-20T01:00:00+02:00"), allDay: true }), true);
  // shown clipped (an edit in today's plan, or a day-sized slice) but the calendar has it for 51 hours: still a booking
  assert.equal(A.isBooking({ s: new Date("2026-10-20T14:00:00+02:00"), e: new Date("2026-10-20T17:00:00+02:00"),
    cs: "2026-10-20T13:00:00+02:00", ce: "2026-10-22T16:00:00+02:00" }), true);
  assert.equal(A.isLong, A.isBooking);   // the day column uses the same rule
  assert.equal(A.inRoom({ ...item(DAY[7], 7), kind: "fixed" }), false);
});

test("Junyan's 20 October: no overlap is raised and nothing offers to end, cut or drop the rental", () => {
  const cs = run(DAY, "2026-10-20T10:00:00+02:00");
  assert.deepEqual(cs.filter((c) => c.id.startsWith("clash:")), []);
  assert.doesNotMatch(words(cs), /Europcar Madrid car rental \[/);
  assert.equal(M.count(ctx(DAY, "2026-10-20T10:00:00+02:00")) <= 1, true);
});

test("the rental's 51 hours are not counted as body spent, and the day does not run to Thursday", () => {
  const cs = run(DAY, "2026-10-20T10:00:00+02:00", { body: 60 });
  assert.equal(cs.some((c) => c.id === "body"), false, words(cs));
  assert.doesNotMatch(words(cs), /4:00 PM/);
});

test("the screenshot's fixture: rental 2 PM to Thursday 6 AM, walk 3 PM, groceries 5:45 PM, check in 6:30 PM", () => {
  const d = [
    { t: "Europcar Madrid car rental [2026.10.20]", s: "2026-10-20T14:00:00+02:00", e: "2026-10-22T06:00:00+02:00", ...J },
    { t: "Senda Maeso — short out-and-back from apartment", s: "2026-10-20T15:00:00+02:00", e: "2026-10-20T17:45:00+02:00", ...J },
    { t: "Groceries at DIA — after the Maeso walk", s: "2026-10-20T17:45:00+02:00", e: "2026-10-20T18:30:00+02:00", ...J },
    { t: "Check in — ESTUDIO MAESO con sofá cama", s: "2026-10-20T18:30:00+02:00", e: "2026-10-20T19:30:00+02:00", ...J },
  ];
  const cs = run(d, "2026-10-20T09:00:00+02:00");
  assert.deepEqual(cs.filter((c) => c.id.startsWith("clash:")), []);
  // even when the plan shows it as 2 PM to 5 PM (an edit), the calendar's 40 hours keep it a booking
  const cut = run(d, "2026-10-20T09:00:00+02:00", { edits: { 0: { s: "2026-10-20T14:00:00+02:00", e: "2026-10-20T17:00:00+02:00" } } });
  assert.deepEqual(cut.filter((c) => c.id.startsWith("clash:")), [], words(cut));
});

test("d40: only Joint Plans blocks (and Quest adds) clash; his other calendars never do", () => {
  const at = (h, m = 0) => `2026-10-20T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+02:00`;
  const jo = (t, s, e) => ({ t, s, e, ...J });
  const ju = (t, s, e) => ({ t, s, e, cal: "Junyan", calId: JUNYAN, type: "fixed" });
  const q = (t, s, e) => ({ t, s, e, cal: "you", type: "task", extra: true });
  const ids = (d) => run(d, at(8)).filter((c) => c.id.startsWith("clash:")).map((c) => c.text);
  assert.deepEqual(ids([ju("Call Ana", at(10), at(11)), ju("Admin", at(10, 30), at(11, 30))]), []);
  assert.deepEqual(ids([jo("Museum", at(10), at(12)), ju("Admin", at(11), at(13))]), []);
  assert.equal(ids([jo("Museum", at(10), at(12)), jo("Lunch out", at(11), at(13))]).length, 1);
  assert.equal(ids([jo("Museum", at(10), at(12)), q("Shower", at(11), at(11, 15))]).length, 1);
});

test("the page hands the planner each block's calendar, its calendar times and all-day flag", () => {
  const page = fs.readFileSync(here + "quest.html", "utf8");
  assert.match(page, /items: all\.map\(b => \(\{[^]*?calId:b\.calId[^]*?cs:b\.cs, ce:b\.ce[^]*?allDay:!!b\.allDay/);
  assert.match(page, /const isBooking = b => window\.QuestAgenda \? window\.QuestAgenda\.isBooking\(b\)/);
});
