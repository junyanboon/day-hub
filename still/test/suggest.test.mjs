// node --test still/test/*.test.mjs   (planner suggestions for practice blocks, Junyan 2026-10-19, d13 d14)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-suggest.js", import.meta.url)), "utf8"), ctx);
const S = ctx.QuestSuggest;
const J = x => JSON.parse(JSON.stringify(x));
const TZ = "Europe/Madrid", DAY = "2026-10-20";
const T = (h, m = 0, tz = TZ, day = DAY) => S.at(day, h, m, tz);
const blk = (t, h1, m1, h2, m2, x = {}) => ({ t, s:T(h1, m1), e:T(h2, m2), free:false, meal:false, basic:null, ...x });
const hm = ms => new Intl.DateTimeFormat("en-GB", { timeZone:TZ, hour:"2-digit", minute:"2-digit" }).format(new Date(ms));
const show = list => J(list).map(x => `${x.id} ${hm(x.s)}-${hm(x.e)}`);

test("local wall-clock times follow the plan's zone", () => {
  assert.equal(new Date(S.at("2026-10-20", 6, 30, "Europe/Madrid")).toISOString(), "2026-10-20T04:30:00.000Z");
  assert.equal(new Date(S.at("2026-10-20", 6, 30, "America/Toronto")).toISOString(), "2026-10-20T10:30:00.000Z");
  // the day the clocks go back in Madrid (Oct 25): 6:30 AM is already winter time
  assert.equal(new Date(S.at("2026-10-25", 6, 30, "Europe/Madrid")).toISOString(), "2026-10-25T05:30:00.000Z");
});

test("an empty day gets all three: yoga after waking, Domestics after breakfast, wind down ending at bed", () => {
  const b = [blk("Breakfast", 8, 0, 8, 45, { meal:true }), blk("Lunch", 13, 0, 14, 0, { meal:true })];
  assert.deepEqual(show(S.suggest({ day:DAY, tz:TZ, now:T(0, 0), blocks:b })), ["yoga 06:30-07:15", "domestics 08:45-09:15", "winddown 21:45-22:30"]);
});

test("a day that already has the block gets no suggestion for it (title-matched or the plan's own)", () => {
  const b = [blk("Morning Yoga", 6, 30, 7, 30, { basic:"yoga" }), blk("Grooming", 9, 0, 9, 20, { basic:"groom" }), blk("Wind-down", 21, 45, 22, 30, { basic:"winddown" })];
  assert.deepEqual(J(S.suggest({ day:DAY, tz:TZ, now:T(0, 0), blocks:b })), []);
});

test("Morning Yoga fits between waking and the first meal, or not at all", () => {
  // busy until 7:00, breakfast at 7:40: 40 minutes of room
  const b = [blk("Call", 6, 0, 7, 0), blk("Breakfast", 7, 40, 8, 30, { meal:true })];
  assert.deepEqual(show(S.suggest({ day:DAY, tz:TZ, now:T(0, 0), blocks:b, skip:{ winddown:true, domestics:true } })), ["yoga 07:00-07:40"]);
  // breakfast at 6:50: no room for 30 minutes
  const c = [blk("Breakfast", 6, 50, 7, 30, { meal:true })];
  assert.deepEqual(show(S.suggest({ day:DAY, tz:TZ, now:T(0, 0), blocks:c, skip:{ winddown:true, domestics:true } })), []);
  // no meal: until 10 AM; Open space does not count as busy
  const d = [blk("Open space", 6, 0, 9, 0, { free:true })];
  assert.deepEqual(show(S.suggest({ day:DAY, tz:TZ, now:T(0, 0), blocks:d, skip:{ winddown:true, domestics:true } })), ["yoga 06:30-07:15"]);
});

test("wind down slides earlier when something runs late, and is dropped with under 30 minutes", () => {
  const b = [blk("Samba", 20, 0, 22, 10)];
  assert.deepEqual(show(S.suggest({ day:DAY, tz:TZ, now:T(0, 0), blocks:b, skip:{ yoga:true, domestics:true } })), []);
  const c = [blk("Samba", 20, 0, 21, 0), blk("Call", 22, 0, 22, 30)];
  assert.deepEqual(show(S.suggest({ day:DAY, tz:TZ, now:T(0, 0), blocks:c, skip:{ yoga:true, domestics:true } })), ["winddown 21:15-22:00"]);
});

test("today: nothing in the past, and a skipped one stays hidden", () => {
  const b = [blk("Breakfast", 8, 0, 8, 45, { meal:true })];
  // 7:52 AM: yoga's window is gone, Domestics starts after breakfast
  assert.deepEqual(show(S.suggest({ day:DAY, tz:TZ, now:T(7, 52), blocks:b })), ["domestics 08:45-09:15", "winddown 21:45-22:30"]);
  // 9:02 AM: Domestics starts at the next 5 minutes after now plus 5
  assert.deepEqual(show(S.suggest({ day:DAY, tz:TZ, now:T(9, 2), blocks:b, skip:{ winddown:true } })), ["domestics 09:10-09:40"]);
  assert.deepEqual(show(S.suggest({ day:DAY, tz:TZ, now:T(9, 2), blocks:b, skip:{ winddown:true, domestics:true } })), []);
});

test("a multi-day booking (a car rental) does not fill the evening", () => {
  const b = [{ t:"Europcar car rental", s:T(13, 0), e:T(16, 0) + 2 * 86400000, free:false, meal:false, basic:null }, blk("Cook dinner", 18, 0, 19, 0, { meal:true })];
  assert.deepEqual(show(S.suggest({ day:DAY, tz:TZ, now:T(0, 0), blocks:b, skip:{ yoga:true, domestics:true } })), ["winddown 21:45-22:30"]);
});
