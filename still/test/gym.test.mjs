// node --test still/test/*.test.mjs   (weekly gym placed by itself, Junyan 2026-10-16; rules d109, d245)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = { Intl, Date }; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-gym.js", import.meta.url)), "utf8"), ctx);
const G = ctx.QuestGym;
const J = x => JSON.parse(JSON.stringify(x));   // arrays from the vm context are not deepEqual to ours
const MAD = "Europe/Madrid", TOR = "America/Toronto";
const hm = s => { const [h, m] = s.split(":").map(Number); return h + m / 60; };
const ev = (ymd, a, b, t, tz = MAD) => { const s = G.at(ymd, hm(a), tz); let e = G.at(ymd, hm(b), tz); if (e <= s) e += 86400000; return { t, s, e }; };
const local = (ms, tz = MAD) => new Intl.DateTimeFormat("en-GB", { timeZone:tz, weekday:"short", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).format(new Date(ms));
const week = (mon, byDay, modes, tzs, extra = {}) => Array.from({ length:7 }, (_, i) => {
  const d = G.addDays(mon, i), p = G.addDays(mon, i - 1);
  return G.dayInfo(d, (tzs || {})[d] || MAD, (modes || {})[d] || "travel", byDay[d] || [], byDay[p] || [], extra[d]);
});

// his calendar as /plan read it on 2026-10-16, local times (Madrid, then home on Oct 23)
const CAL = {
  "2026-10-15": [ev("2026-10-15", "07:45", "12:00", "Bus ride to Matrouh"), ev("2026-10-15", "23:25", "04:25", "IB1904 — Cairo (CAI) → Madrid (MAD)")],
  "2026-10-16": [ev("2026-10-16", "04:45", "05:45", "Check in — ibis Styles Madrid Airport Valdebebas"), ev("2026-10-16", "06:00", "10:00", "Sleep"),
    ev("2026-10-16", "11:30", "12:00", "Check out by 12:00 — ibis Styles Madrid Airport Valdebebas"), ev("2026-10-16", "13:00", "13:30", "Check in — Madrid Marriott Hotel Princesa Plaza"),
    ev("2026-10-16", "16:00", "16:45", "Caney nap · Junyan work"), ev("2026-10-16", "17:30", "18:30", "M Club light dinner"), ev("2026-10-16", "20:00", "22:00", "William & Irene's \"Latin Social\"?")],
  "2026-10-17": [ev("2026-10-17", "09:45", "10:30", "M Club breakfast"), ev("2026-10-17", "11:00", "12:00", "Hotel gym"), ev("2026-10-17", "12:30", "15:30", "Madrid novelty slot"),
    ev("2026-10-17", "16:00", "18:30", "Rest + M Club dinner"), ev("2026-10-17", "21:30", "00:00", "Zouk Social?")],
  "2026-10-18": [ev("2026-10-18", "09:45", "10:30", "M Club breakfast"), ev("2026-10-18", "12:00", "15:30", "Provisional · Madrid novelty slot"), ev("2026-10-18", "14:30", "15:30", "Lunch at Punto Vegano"),
    ev("2026-10-18", "16:00", "16:30", "Completed: rental-car insurance printed and kept"), ev("2026-10-18", "16:00", "18:00", "Free rest / wander"), ev("2026-10-18", "18:00", "19:00", "Dinner"), ev("2026-10-18", "19:30", "20:30", "Hotel gym")],
  "2026-10-19": [ev("2026-10-19", "09:45", "10:30", "M Club breakfast"), ev("2026-10-19", "11:00", "12:00", "Hotel gym"), ev("2026-10-19", "12:30", "13:30", "Lunch"),
    ev("2026-10-19", "15:00", "17:30", "Rest"), ev("2026-10-19", "18:00", "19:00", "Early dinner"), ev("2026-10-19", "20:00", "21:00", "Samba class")],
  "2026-10-20": [ev("2026-10-20", "09:00", "09:45", "M Club breakfast"), ev("2026-10-20", "10:00", "11:00", "Hotel gym"), ev("2026-10-20", "12:00", "13:00", "Check out — Madrid Marriott Hotel Princesa Plaza"),
    ev("2026-10-20", "15:00", "16:00", "Drive up to La Pedriza"), ev("2026-10-20", "18:00", "19:00", "Check in — ESTUDIO MAESO con sofá cama"), ev("2026-10-20", "19:00", "20:00", "Cook dinner + early night")],
  "2026-10-21": [ev("2026-10-21", "07:30", "08:15", "Breakfast + trail food"), ev("2026-10-21", "09:45", "17:30", "Hike El Yelmo"), ev("2026-10-21", "18:30", "20:00", "Recovery dinner + stretch")],
  "2026-10-22": [ev("2026-10-22", "07:45", "08:30", "Breakfast"), ev("2026-10-22", "12:00", "12:30", "Check in · IB367"), ev("2026-10-22", "13:00", "14:00", "Check out — ESTUDIO MAESO con sofá cama"),
    ev("2026-10-22", "15:00", "16:00", "Check in — AC Hotel Madrid Airport"), ev("2026-10-22", "18:30", "19:30", "AC Lounge dinner")],
  "2026-10-23": [ev("2026-10-23", "08:00", "08:30", "Hotel shuttle to MAD"), ev("2026-10-23", "12:00", "21:00", "IB367 — Madrid (MAD) → Toronto (YYZ)")],
  "2026-10-25": [ev("2026-10-25", "10:00", "10:30", "Run Payroll", TOR), ev("2026-10-25", "18:00", "19:00", "Dinner", TOR)],
};
const TZS = { "2026-10-24":TOR, "2026-10-25":TOR };
const NOW = G.at("2026-10-16", 15.75, MAD);   // Fri Oct 16, 3:45 PM in Madrid
const sessionsOf = (mon, cal = CAL) => Array.from({ length:7 }, (_, i) => cal[G.addDays(mon, i)] || []).flat().filter(x => G.isGymTitle(x.t));

test("which session a title or a logged program is: any Jack Woods (old Day 1 and Day 2 too) is one kind", () => {
  assert.equal(G.sessionOf("Jack Woods · Day 1"), "jw");
  assert.equal(G.sessionOf("Gym · Jack Woods Day 2"), "jw");
  assert.equal(G.sessionOf("Gym · Jack Woods"), "jw");
  assert.equal(G.sessionOf("Jack Woods"), "jw");
  assert.equal(G.sessionOf("Hotel gym"), "jw");
  assert.equal(G.sessionOf("Gym · Matthew I. Smith"), "ms");
  assert.equal(G.sessionOf("Matthew I. Smith"), "ms");
  assert.ok(G.isGymTitle("Hotel gym") && !G.isGymTitle("Recovery dinner + stretch"));
});

test("check-in, check-out and flight days are kept free; the day after a move or a long trip is a go-easy day", () => {
  const [, , , , d16, d17, d18] = week("2026-10-12", CAL);
  assert.match(d16.blocked, /check in|check out/i);
  assert.match(d16.easy.join(), /waking somewhere new/);   // landed on the IB1904 overnight
  assert.equal(d17.blocked, "");                            // "Hotel gym" is not a hotel move
  assert.match(d17.easy.join(), /waking somewhere new/);
  assert.deepEqual([d18.blocked, d18.easy.length], ["", 0]);
  const w2 = week("2026-10-19", CAL, {}, TZS);
  assert.match(w2[1].blocked, /check out/i);               // Oct 20: changes hotels
  assert.match(w2[1].easy.join(), /travel day \(Drive up/);
  assert.match(w2[3].blocked, /IB367|check/i);              // Oct 22
  assert.match(w2[4].blocked, /IB367/);                     // Oct 23 flight
  assert.match(w2[5].easy.join(), /waking somewhere new/);  // Oct 24, first morning home
  assert.equal(w2[6].easy.length, 0);
  assert.match(G.dayInfo("2026-10-16", MAD, "travel", [], [], 64).easy.join(), /sleep score 64/);
  assert.equal(G.dayInfo("2026-10-16", MAD, "home", [ev("2026-10-16", "10:00", "10:30", "Check in with Ela")], []).blocked, "");
});

test("a week is a home week when he is home 4 of its 7 days", () => {
  const d = n => Array.from({ length:7 }, (_, i) => ({ mode: i < n ? "home" : "travel" }));
  assert.equal(G.weekMode(d(4)), "home");
  assert.equal(G.weekMode(d(3)), "travel");
});

test("this travel week: the two hotel gyms count as the two Jack Woods sessions, and Matthew I. Smith goes in a free evening", () => {
  const days = week("2026-10-12", CAL);
  const r = G.planWeek({ week:"2026-10-12", days, sessions:sessionsOf("2026-10-12"), logs:[], placed:{}, now:NOW, today:"2026-10-16" });
  assert.equal(r.mode, "travel");
  assert.equal(r.place.length, 1);
  const p = r.place[0];
  assert.equal(p.kind, "ms"); assert.equal(p.t, "Gym · Matthew I. Smith"); assert.equal(p.color, "3"); assert.equal(p.e - p.s, 45 * 60000);
  assert.ok(["2026-10-17", "2026-10-18"].includes(p.ymd), p.ymd);   // never today: today has the hotel moves
  const d = days.find(x => x.ymd === p.ymd);
  assert.ok(!d.busy.some(([a, b]) => a < p.e && b > p.s), "on top of something");
  assert.ok(!d.meals.some(([, me]) => p.s >= me && p.s < me + 3600000), "within an hour after a meal");
  assert.ok(p.e <= d.bed - 2 * 3600000, "within 2 hours of bed");
  assert.equal(r.line, "Gym: 3 of 3 placed this week");
});

test("next week: two Jack Woods are on the calendar; Matthew I. Smith goes on the day furthest from them, never a move or flight day", () => {
  const days = week("2026-10-19", CAL, {}, TZS);
  const r = G.planWeek({ week:"2026-10-19", days, sessions:sessionsOf("2026-10-19"), logs:[], placed:{}, now:NOW, today:"2026-10-16" });
  assert.equal(r.mode, "travel");
  assert.equal(r.place.length, 1);
  const p = r.place[0];
  assert.equal(p.kind, "ms");
  assert.equal(p.ymd, "2026-10-25");
  assert.equal(local(p.s, TOR), "Sun 25, 17:00");   // late afternoon first
  assert.equal(r.line, "Gym: 3 of 3 placed this week");
});

test("re-running places nothing new: a placed session he moved, deleted or dropped stays as he left it", () => {
  const days = week("2026-10-19", CAL, {}, TZS);
  const first = G.planWeek({ week:"2026-10-19", days, sessions:sessionsOf("2026-10-19"), logs:[], placed:{}, now:NOW, today:"2026-10-16" });
  const placed = Object.fromEntries(first.place.map(p => [p.key, true]));
  // it is on the calendar now, moved to Saturday
  const moved = { ...CAL, "2026-10-24": [ev("2026-10-24", "10:00", "10:45", "Gym · Matthew I. Smith", TOR)] };
  const again = G.planWeek({ week:"2026-10-19", days, sessions:sessionsOf("2026-10-19", moved), logs:[], placed, now:NOW, today:"2026-10-16" });
  assert.equal(again.place.length, 0); assert.equal(again.line, "Gym: 3 of 3 placed this week");
  // he deleted it
  const gone = G.planWeek({ week:"2026-10-19", days, sessions:sessionsOf("2026-10-19"), logs:[], placed, now:NOW, today:"2026-10-16" });
  assert.equal(gone.place.length, 0);
  assert.equal(gone.skipped[0].key, "2026-10-19:ms#1");
  assert.equal(gone.line, "Gym: 2 of 3 placed this week");
});

test("a week whose answer flips from travel to home does not bring back a deleted Matthew I. Smith", () => {
  const days = week("2026-10-19", CAL, {}, TZS);
  const first = G.planWeek({ week:"2026-10-19", days, sessions:sessionsOf("2026-10-19"), logs:[], placed:{}, now:NOW, today:"2026-10-16" });
  const placed = Object.fromEntries(first.place.map(p => [p.key, true]));
  const home = days.map(d => ({ ...d, mode:"home" }));
  const again = G.planWeek({ week:"2026-10-19", days:home, sessions:sessionsOf("2026-10-19"), logs:[], placed, now:NOW, today:"2026-10-16" });
  assert.equal(again.mode, "home");
  assert.ok(!again.place.some(p => p.kind === "ms"));
  assert.deepEqual(J(first.by), { jw:2, ms:1 });
});

test("finished workouts count, and a logged day's gym block is not counted twice", () => {
  const days = week("2026-10-19", CAL, {}, TZS);
  const now = G.at("2026-10-20", 20, MAD);
  const r = G.planWeek({ week:"2026-10-19", days, sessions:sessionsOf("2026-10-19"), placed:{}, now, today:"2026-10-20",
    logs:[{ date:"2026-10-19", program:"Jack Woods · Day 1" }, { date:"2026-10-20", program:"Jack Woods · Day 2" }] });
  assert.deepEqual(J(r.place.map(p => p.kind)), ["ms"]);
  assert.equal(r.have, 3);
});

// an empty home week in Toronto, Mon Oct 26 to Sun Nov 1
const HOME = "2026-10-26";
const homeDays = (cal = {}, extra = {}) => week(HOME, cal, Object.fromEntries(Array.from({ length:7 }, (_, i) => [G.addDays(HOME, i), "home"])),
  Object.fromEntries(Array.from({ length:7 }, (_, i) => [G.addDays(HOME, i), TOR])), extra);
const SUN = G.at("2026-10-25", 21, TOR);

test("a home week: Jack Woods Mon, Wed, Fri 7:30 PM, each titled Gym · Jack Woods, Matthew I. Smith on a day without gym", () => {
  const r = G.planWeek({ week:HOME, days:homeDays(), sessions:[], logs:[], placed:{}, now:SUN, today:"2026-10-25" });
  assert.equal(r.mode, "home");
  const jw = r.place.filter(p => p.kind !== "ms");
  assert.deepEqual(J(jw.map(p => local(p.s, TOR))), ["Mon 26, 19:30", "Wed 28, 19:30", "Fri 30, 19:30"]);
  assert.deepEqual(J(jw.map(p => p.t)), ["Gym · Jack Woods", "Gym · Jack Woods", "Gym · Jack Woods"]);
  const ms = r.place.find(p => p.kind === "ms");
  assert.ok(ms && !["2026-10-26", "2026-10-28", "2026-10-30"].includes(ms.ymd));
  const h = new Date(ms.s).toLocaleString("en-US", { timeZone:TOR, hour:"numeric", hourCycle:"h23" });
  assert.ok(+h >= 14 && +h <= 19, `late afternoon, got ${h}`);
  assert.equal(r.line, "Gym: 4 of 4 placed this week");
});

test("no strength on a go-easy day (a long trip, a sleep score under 70); Matthew I. Smith may go there", () => {
  const cal = { "2026-10-28": [ev("2026-10-28", "09:00", "11:00", "Train to Ottawa", TOR)] };
  const r = G.planWeek({ week:HOME, days:homeDays(cal), sessions:[], logs:[], placed:{}, now:SUN, today:"2026-10-25" });
  const jw = r.place.filter(p => p.kind !== "ms");
  assert.equal(jw.length, 3);
  assert.ok(!jw.some(p => p.ymd === "2026-10-28"));
  assert.equal(jw[0].t, "Gym · Jack Woods");
  assert.equal(new Set(r.place.map(p => p.ymd)).size, r.place.length, "one session a day");
  const tired = G.planWeek({ week:HOME, days:homeDays({}, { "2026-10-26":55 }), sessions:[], logs:[], placed:{}, now:SUN, today:"2026-10-25" });
  assert.ok(!tired.place.some(p => p.kind !== "ms" && p.ymd === "2026-10-26"));
});

test("nothing starts within an hour after a meal or ends within 2 hours of bed; no room means it is skipped, not squeezed", () => {
  const busy = {};
  for (let i = 0; i < 7; i++) { const d = G.addDays(HOME, i); busy[d] = [ev(d, "09:00", "18:30", "Workshop", TOR), ev(d, "18:30", "19:15", "Dinner", TOR)]; }
  const r = G.planWeek({ week:HOME, days:homeDays(busy), sessions:[], logs:[], placed:{}, now:SUN, today:"2026-10-25" });
  // after dinner ends 19:15 the first start is 20:15, which would end past 20:30 (bed 22:30 less 2 hours)
  assert.equal(r.place.length, 0);
  assert.equal(r.skipped.length, 4);
  assert.equal(r.line, "Gym: 0 of 4 placed this week");
});

test("today is planned only from half an hour from now; earlier days of the week are not", () => {
  const r = G.planWeek({ week:HOME, days:homeDays(), sessions:[], logs:[], placed:{}, now:G.at("2026-10-28", 19.25, TOR), today:"2026-10-28" });
  assert.ok(r.place.every(p => p.ymd >= "2026-10-28"));
  assert.ok(!r.place.some(p => p.ymd === "2026-10-28" && p.s < G.at("2026-10-28", 19.75, TOR)));
});

test("any Jack Woods session counts toward the week: old Day 1 / Day 2 events, saved sessions and the new title alike", () => {
  const cal = {
    "2026-10-26": [ev("2026-10-26", "19:30", "20:30", "Gym · Jack Woods Day 1", TOR)],
    "2026-10-27": [ev("2026-10-27", "19:30", "20:30", "Gym · Jack Woods Day 1", TOR)],   // two "Day 1" in a row still count twice
    "2026-10-29": [ev("2026-10-29", "17:00", "18:00", "Gym · Jack Woods", TOR)],
  };
  const sessions = Object.values(cal).flat();
  const r = G.planWeek({ week:HOME, days:homeDays(cal), sessions, logs:[], placed:{}, now:SUN, today:"2026-10-25" });
  assert.equal(r.by.jw, 3);
  assert.ok(!r.place.some(p => p.kind === "jw"), "no fourth Jack Woods");
  assert.equal(r.place.filter(p => p.kind === "ms").length, 1);
  // a saved "Jack Woods · Day 2" session and a saved flexible "Jack Woods" one count as well
  const now = G.at("2026-10-29", 21, TOR);
  const logs = [{ date:"2026-10-26", program:"Jack Woods · Day 2" }, { date:"2026-10-27", program:"Jack Woods" }];
  const r2 = G.planWeek({ week:HOME, days:homeDays(cal), sessions, logs, placed:{}, now, today:"2026-10-29" });
  assert.equal(r2.by.jw, 3); assert.equal(r2.have >= 3, true);
  // a travel week needs two
  const tr = G.planWeek({ week:HOME, days:week(HOME, {}, {}, Object.fromEntries(Array.from({ length:7 }, (_, i) => [G.addDays(HOME, i), TOR]))), sessions:[], logs:[], placed:{}, now:SUN, today:"2026-10-25" });
  assert.equal(tr.mode, "travel");
  assert.deepEqual(J(tr.slots), ["jw#1", "jw#2", "ms#1"]);
  assert.equal(tr.place.filter(p => p.kind === "jw").length, 2);
  assert.ok(tr.place.every(p => p.t === "Gym · Jack Woods" || p.t === "Gym · Matthew I. Smith"));
});
