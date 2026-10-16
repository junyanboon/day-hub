// node --test still/test/*.test.mjs   (reschedule a gym session, and the "I'm ill" switch; Junyan 2026-10-16:
// "If I click on a gym card I want it to give me the option to reschedule with different days/times I can reschedule
// to. This way I can stick to it. The other option is if I'm ill. If I'm ill I can't work out.")
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = { Intl, Date }; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-gym.js", import.meta.url)), "utf8"), ctx);
const G = ctx.QuestGym;
const J = x => JSON.parse(JSON.stringify(x));
const MAD = "Europe/Madrid", TOR = "America/Toronto";
const hm = s => { const [h, m] = s.split(":").map(Number); return h + m / 60; };
const ev = (ymd, a, b, t, tz = TOR) => { const s = G.at(ymd, hm(a), tz); let e = G.at(ymd, hm(b), tz); if (e <= s) e += 86400000; return { t, s, e }; };
const dayOf = (d, cal, mode = "home", tz = TOR, extra) => G.dayInfo(d, tz, mode, cal[d] || [], cal[G.addDays(d, -1)] || [], extra);
const range = (from, n) => Array.from({ length:n }, (_, i) => G.addDays(from, i));
const HOME = "2026-10-26";   // an empty home week in Toronto, Mon Oct 26 to Sun Nov 1
const homeWeek = (cal = {}, extra = {}) => range(HOME, 7).map(d => dayOf(d, cal, "home", TOR, extra[d]));

test("the Oct 25 Jack Woods Day 2 he moved by hand (Joint Plans) counts as one of the two Jack Woods, so no third goes in that week", () => {
  // the week of Oct 19 as it is now: the Oct 20 hotel gym moved to Sun Oct 25 2:00 PM Toronto and renamed (d15)
  const cal = {
    "2026-10-19": [ev("2026-10-19", "11:00", "12:00", "Hotel gym", MAD), ev("2026-10-19", "18:00", "19:00", "Early dinner", MAD)],
    "2026-10-20": [ev("2026-10-20", "12:00", "13:00", "Check out — Madrid Marriott Hotel Princesa Plaza", MAD)],
    "2026-10-22": [ev("2026-10-22", "15:00", "16:00", "Check in — AC Hotel Madrid Airport", MAD)],
    "2026-10-23": [ev("2026-10-23", "12:00", "21:00", "IB367 — Madrid (MAD) → Toronto (YYZ)", MAD)],
    "2026-10-25": [ev("2026-10-25", "14:00", "15:00", "Gym · Jack Woods Day 2"), ev("2026-10-25", "18:00", "19:00", "Dinner")],
  };
  const tz = d => d >= "2026-10-24" ? TOR : MAD;
  const days = range("2026-10-19", 7).map(d => dayOf(d, cal, d >= "2026-10-24" ? "home" : "travel", tz(d)));
  const sessions = Object.values(cal).flat().filter(x => G.isGymTitle(x.t));
  const r = G.planWeek({ week:"2026-10-19", days, sessions, logs:[], placed:{}, now:G.at("2026-10-16", 15.75, MAD), today:"2026-10-16" });
  assert.equal(r.mode, "travel");
  assert.ok(!r.place.some(p => p.kind !== "ms"), J(r.place).map(p => p.t).join());
  assert.equal(r.by.jw, 2);
  assert.ok(!r.place.some(p => p.ymd === "2026-10-25"), "one session a day");
});

test("reschedule: real free slots in the same week, late afternoon first, home Mon/Wed/Fri 7:30 PM first, never a day with another session", () => {
  const sun = G.at("2026-10-26", 9, TOR);   // Mon Oct 26, 9 AM
  const days = range("2026-10-26", 7).map(d => dayOf(d, {}));
  const r = G.moveOptions({ kind:"jw1", s:G.at("2026-10-26", 19.5, TOR), e:G.at("2026-10-26", 20.5, TOR), days, week:HOME,
    gymDays:["2026-10-28", "2026-10-30"], modes:{ [HOME]:"home" }, now:sun });
  assert.equal(r.note, "");
  assert.deepEqual(J(r.options.map(o => o.label)),
    ["Mon Oct 26 · 5:00 PM", "Tue Oct 27 · 5:00 PM", "Thu Oct 29 · 5:00 PM", "Sat Oct 31 · 5:00 PM", "Sun Nov 1 · 5:00 PM"]);
  assert.ok(r.options.every(o => o.same && o.e - o.s === 60 * 60000));
  // Matthew I. Smith on a home Monday is not pinned to 7:30 PM
  const ms = G.moveOptions({ kind:"ms", s:G.at("2026-10-27", 17, TOR), e:G.at("2026-10-27", 17.75, TOR), days, week:HOME, gymDays:[], modes:{ [HOME]:"home" }, now:sun });
  assert.equal(ms.options[0].label, "Mon Oct 26 · 5:00 PM");
  assert.ok(!ms.options.some(o => o.label === "Tue Oct 27 · 5:00 PM"), "not its own slot");
  assert.ok(ms.options.length <= 6);
});

test("reschedule follows the placement rules: no move or flight day, no strength on a go-easy or ill day, not near a meal or bed", () => {
  const cal = {
    "2026-10-27": [ev("2026-10-27", "11:00", "12:00", "Check out — Hotel X")],
    "2026-10-28": [ev("2026-10-28", "08:00", "10:30", "Train to Ottawa")],
    "2026-10-29": [ev("2026-10-29", "09:00", "17:30", "Workshop"), ev("2026-10-29", "17:30", "18:15", "Dinner")],
  };
  const days = range("2026-10-26", 7).map(d => dayOf(d, cal));
  const r = G.moveOptions({ kind:"jw2", s:G.at("2026-10-26", 19.5, TOR), e:G.at("2026-10-26", 20.5, TOR), days, week:HOME, gymDays:[],
    ill:["2026-10-30"], modes:{ [HOME]:"home" }, now:G.at("2026-10-26", 9, TOR) });
  const ymds = r.options.map(o => o.ymd);
  for (const bad of ["2026-10-27", "2026-10-28", "2026-10-30"]) assert.ok(!ymds.includes(bad), bad);
  const thu = r.options.find(o => o.ymd === "2026-10-29");
  assert.ok(!thu || thu.s >= G.at("2026-10-29", 19.25, TOR), "an hour after dinner");
  assert.ok(r.options.every(o => o.e <= G.at(o.ymd, 20.5, TOR)), "2 hours before bed");
  // Matthew I. Smith is fine on the go-easy day
  const ms = G.moveOptions({ kind:"ms", s:G.at("2026-10-26", 17, TOR), e:G.at("2026-10-26", 17.75, TOR), days, week:HOME, gymDays:[], modes:{}, now:G.at("2026-10-26", 9, TOR) });
  assert.ok(ms.options.some(o => o.ymd === "2026-10-28"));
});

test("reschedule says so when the only free slots are next week", () => {
  const cal = {};
  for (const d of range("2026-10-26", 7)) cal[d] = [ev(d, "09:00", "21:00", "Festival")];
  const days = range("2026-10-29", 7).map(d => dayOf(d, cal));
  const r = G.moveOptions({ kind:"jw1", s:G.at("2026-10-30", 19.5, TOR), e:G.at("2026-10-30", 20.5, TOR), days, week:HOME, gymDays:[], modes:{}, now:G.at("2026-10-29", 8, TOR) });
  assert.ok(r.options.length >= 1 && r.options.every(o => !o.same && o.later));
  assert.match(r.note, /next week/);
  // a session next week whose only free times are earlier, in this week: not called "next week"
  const early = G.moveOptions({ kind:"jw1", s:G.at("2026-11-04", 19.5, TOR), e:G.at("2026-11-04", 20.5, TOR), days:range("2026-11-01", 3).map(d => dayOf(d, {})).slice(0, 1),
    week:"2026-11-02", gymDays:[], modes:{}, now:G.at("2026-11-01", 8, TOR) });
  assert.ok(early.options.length && early.options.every(o => !o.same && !o.later));
  assert.doesNotMatch(early.note, /next week/);
  const none = G.moveOptions({ kind:"jw1", s:G.at("2026-10-30", 19.5, TOR), e:G.at("2026-10-30", 20.5, TOR), days:days.slice(0, 3), week:HOME, gymDays:[], modes:{}, now:G.at("2026-10-29", 8, TOR) });
  assert.equal(none.options.length, 0);
  assert.match(none.note, /No free/);
});

test("ill days: one tap marks today, the next days stay ill until he says he is better, and a better day ends it", () => {
  const map = { "2026-10-26":{ ill:true, at:"2026-10-26T14:00:00Z" } };
  assert.deepEqual(J(G.illDays(map, "2026-10-26", "2026-10-28")), ["2026-10-26", "2026-10-27", "2026-10-28"]);
  assert.deepEqual(J(G.illStatus(map, "2026-10-26")), { ill:true, ask:false, since:"2026-10-26" });
  assert.deepEqual(J(G.illStatus(map, "2026-10-28")), { ill:true, ask:true, since:"2026-10-26" });
  const better = { ...map, "2026-10-28":{ ill:false, at:"2026-10-28T12:00:00Z" } };
  assert.deepEqual(J(G.illDays(better, "2026-10-26", "2026-10-30")), ["2026-10-26", "2026-10-27"]);
  assert.deepEqual(J(G.illStatus(better, "2026-10-29")), { ill:false, ask:false, since:null });
  assert.deepEqual(J(G.illStatus({}, "2026-10-29")), { ill:false, ask:false, since:null });
  // an ill day is a day to go easy (d245)
  assert.match(G.dayInfo("2026-10-26", TOR, "home", [], [], null, true).easy.join(), /ill/);
});

test("while he is ill nothing new is placed, and the line says ill instead of a shortfall", () => {
  const r = G.planWeek({ week:HOME, days:homeWeek(), sessions:[], logs:[], placed:{}, now:G.at("2026-10-27", 9, TOR), today:"2026-10-27",
    ill:["2026-10-26", "2026-10-27"], illNow:true });
  assert.equal(r.place.length, 0);
  assert.match(r.line, /ill/);
  assert.doesNotMatch(r.line, /0 of 4 placed/);
});

test("d21: when he is better only the days left are planned, as they would be anyway; the ill day's session is skipped", () => {
  // ill Mon and Tue, nothing on the plan yet, better on Wed morning. A normal home week has Jack Woods Mon, Wed, Fri:
  // Monday's is skipped (the target drops to 3), Wed and Fri go in as usual, Matthew I. Smith where it always goes
  const r = G.planWeek({ week:HOME, days:homeWeek(), sessions:[], logs:[], placed:{}, now:G.at("2026-10-28", 9, TOR), today:"2026-10-28",
    ill:["2026-10-26", "2026-10-27"], illNow:false });
  assert.ok(r.place.every(p => p.ymd >= "2026-10-28"));
  assert.deepEqual(J(r.place.filter(p => p.kind === "jw").map(p => p.ymd)), ["2026-10-28", "2026-10-30"]);
  assert.equal(r.place.filter(p => p.kind === "ms").length, 1);
  assert.equal(r.excused, 1); assert.deepEqual(J(r.excusedBy), { jw:1, ms:0 });
  assert.equal(r.total, 3);
  assert.equal(r.line, "Gym: 3 of 3 placed this week · 1 skipped, ill");
  assert.ok(r.skipped.some(x => x.why === "skipped: ill that day"));
});

test("d21: a session on a day he is ill is skipped, not moved or placed again, and the week's target drops by it", () => {
  // the planner had placed Mon, Wed, Fri and Matthew I. Smith on Sun; he was ill Wed. It is Thu now.
  const cal = { "2026-10-26": [ev("2026-10-26", "19:30", "20:30", "Gym · Jack Woods")], "2026-10-28": [ev("2026-10-28", "19:30", "20:30", "Gym · Jack Woods")],
    "2026-10-30": [ev("2026-10-30", "19:30", "20:30", "Gym · Jack Woods")], "2026-11-01": [ev("2026-11-01", "17:00", "17:45", "Gym · Matthew I. Smith")] };
  const sessions = Object.values(cal).flat();
  const placed = { "2026-10-26:jw#1":true, "2026-10-26:jw#2":true, "2026-10-26:jw#3":true, "2026-10-26:ms#1":true };
  const logs = [{ date:"2026-10-26", program:"Jack Woods" }];
  const now = G.at("2026-10-29", 9, TOR), base = { week:HOME, days:homeWeek(cal), logs, placed, now, today:"2026-10-29", ill:["2026-10-28"], illNow:false };
  // the Wed event is still on the calendar
  const r = G.planWeek({ ...base, sessions });
  assert.equal(r.place.length, 0, "nothing moved into Thu to Sun");
  assert.equal(r.total, 3); assert.equal(r.have, 3); assert.equal(r.excused, 1);
  assert.equal(r.line, "Gym: 3 of 3 placed this week · 1 skipped, ill");
  // Day Quest took it off Google Calendar on the ill day: the same answer
  const gone = sessions.filter(x => !(x.s === cal["2026-10-28"][0].s));
  const r2 = G.planWeek({ ...base, sessions:gone, illSkips:[{ t:"Gym · Jack Woods", s:cal["2026-10-28"][0].s }] });
  assert.equal(r2.place.length, 0); assert.equal(r2.total, 3); assert.equal(r2.line, "Gym: 3 of 3 placed this week · 1 skipped, ill");
  // gone with no record, but the planner knows it put that slot on Wednesday
  const r3 = G.planWeek({ ...base, sessions:gone, placedS:{ "2026-10-26:jw#3":cal["2026-10-28"][0].s } });
  assert.equal(r3.total, 3); assert.equal(r3.excused, 1);
  // the record and the slot time are the same session: counted once
  const r4 = G.planWeek({ ...base, sessions:gone, placedS:{ "2026-10-26:jw#3":cal["2026-10-28"][0].s }, illSkips:[{ t:"Gym · Jack Woods", s:cal["2026-10-28"][0].s }] });
  assert.equal(r4.excused, 1);
  // a Matthew I. Smith on an ill day lowers the Matthew I. Smith count, not Jack Woods
  const ms = G.planWeek({ ...base, ill:["2026-10-28", "2026-11-01"], illNow:false, now:G.at("2026-11-01", 20, TOR), today:"2026-11-01", sessions });
  assert.deepEqual(J(ms.excusedBy), { jw:1, ms:1 }); assert.equal(ms.total, 2);
});

test("a session he moved to another week is not put back in its old week", () => {
  const r = G.planWeek({ week:HOME, days:homeWeek(), sessions:[], logs:[], placed:{}, now:G.at("2026-10-25", 21, TOR), today:"2026-10-25", movedOut:["jw"] });
  assert.equal(r.place.length, 3);
  assert.deepEqual(J(r.place.map(p => p.kind === "ms" ? "ms" : "jw")).sort(), ["jw", "jw", "ms"]);
  assert.ok(r.skipped.some(s => /moved/.test(s.why)));
});

test("Matthew I. Smith may share a day with another gym session when no other day has room (the planner's own fallback)", () => {
  const days = range("2026-10-26", 7).map(d => dayOf(d, {}));
  const all = range("2026-10-26", 7);
  const ms = G.moveOptions({ kind:"ms", s:G.at("2026-10-27", 17, TOR), e:G.at("2026-10-27", 17.75, TOR), days, week:HOME, gymDays:all, modes:{}, now:G.at("2026-10-26", 9, TOR) });
  assert.ok(ms.options.length >= 4);
  assert.ok(ms.options.every(o => o.shared));
  assert.match(ms.note, /same day as another gym session/);
  const jw = G.moveOptions({ kind:"jw1", s:G.at("2026-10-27", 17, TOR), e:G.at("2026-10-27", 18, TOR), days, week:HOME, gymDays:all, modes:{}, now:G.at("2026-10-26", 9, TOR) });
  assert.equal(jw.options.length, 0, "strength stays one a day");
});
