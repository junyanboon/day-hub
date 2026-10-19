// node --test still/test/*.test.mjs   (Body only moves through its logged lines, on every device, 2026-10-19)
// The 2026-10-19 live state had Body 82 -> 34 at 09:28, 33 -> 19 at 15:35 and 19 -> 31 at 18:00 with no m:"b" line:
// the merge kept the newer copy's own Body number, so a device that rolled the day from its own stale yesterday,
// or held an old copy, overwrote it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-merge.js", import.meta.url)), "utf8"), ctx);
const M = ctx.QuestMerge;
const plain = (x) => JSON.parse(JSON.stringify(x));

const slept = { at:"2026-10-19T09:01:51.142Z", msg:"Slept 82 (Oura)", xp:1, m:"b" };
const gym = { at:"2026-10-19T10:00:00.000Z", msg:"Gym used 7 (1 hr, 11:00 AM to 12:00 PM)", xp:-7, k:"id:gym", m:"b" };
const food = [
  { at:"2026-10-19T14:54:36.993Z", msg:"Breakfast: 150 g lentils", xp:5, m:"b" },
  { at:"2026-10-19T14:54:39.217Z", msg:"Breakfast: 30 g nuts", xp:3, m:"b" },
  { at:"2026-10-19T14:54:40.467Z", msg:"Breakfast: 100 g fermented food", xp:3, m:"b" },
];
const day = (body, log, extra = {}) => ({ date:"Mon Oct 19 2026", body, log, bl:[[log.length ? log[0].at : "2026-10-19T09:00:00Z", body]], ...extra });
const quest = (ts, d) => ({ xp:1, ts, day:d });

test("a device that rolled the day from its stale yesterday cannot drop Body (82 -> 34 at 09:28)", () => {
  const phone = quest(1, day(82, [slept], { slept:true }));
  const laptop = quest(2, day(34, []));   // rolled at 09:28 from its own 10-18 body, newer copy
  for (const [a, b] of [[phone, laptop], [laptop, phone]]) assert.equal(M.mergeQuest(a, b).day.body, 82);
});

test("a stale same-day copy cannot drop or lift Body (33 -> 19, then 19 -> 31)", () => {
  const full = [slept, gym, ...food].reverse();
  const fresh = quest(1, day(87, full, { slept:true }));   // its own number is off
  const stale = quest(2, day(19, [slept, gym].reverse()));     // an old copy, saved later
  const m = M.mergeQuest(fresh, stale).day;
  assert.equal(m.body, 86);
  assert.equal(m.bl[m.bl.length - 1][1], 86);   // the history shows where it went
  assert.equal(M.mergeQuest(stale, fresh).day.body, 86);
});

test("Body from today's log matches the logged lines of the 2026-10-19 state", () => {
  const log = [slept, gym,
    { at:"2026-10-19T10:15:00.000Z", msg:"Gym used 2", xp:-2, k:"id:gym2", m:"b" },
    { at:"2026-10-19T10:30:00.000Z", msg:"Domestics used 3", xp:-3, k:"id:dom", m:"b" },
    ...food,
    { at:"2026-10-19T19:30:00.000Z", msg:"Samba Class used 11", xp:-11, k:"id:samba", m:"b" },
    { at:"2026-10-19T19:15:00.000Z", msg:"Samba Class recounted, used 9 (was 11)", xp:2, k:"id:samba", re:"11>9", m:"b" },
    { at:"2026-10-19T12:00:00.000Z", msg:"Meditation", xp:8 },   // prana, not Body
  ];
  assert.equal(M.bodyOf({ log }), 82 - 7 - 2 - 3 + 11 - 11 + 2);
});

test("the sleep line sets the level; readiness wins; a tap reads its hours; an explicit to wins", () => {
  assert.equal(M.bodyOf({ log:[{ at:"1", msg:"Slept 7 h", xp:12, m:"b" }] }), 70);
  assert.equal(M.bodyOf({ log:[{ at:"2026-10-19T09:00:00Z", msg:"Slept 7 h", xp:12, m:"b", sl:1, to:70 },
    { at:"2026-10-19T10:00:00Z", msg:"Readiness 64 (Oura)", xp:-6, m:"b", sl:1, to:64 },
    { at:"2026-10-19T09:30:00Z", msg:"Walk", xp:5, m:"b" }] }), 69);
  assert.equal(M.bodyOf({ log:[{ at:"1", msg:"Water", xp:1, m:"b" }] }), null);   // no sleep line yet: the copies' numbers stand
});

test("Body stays between 0 and 100 at each step, as addEnergy does", () => {
  const log = [{ at:"2026-10-19T09:00:00Z", msg:"Slept 95 (Oura)", xp:0, m:"b" },
    { at:"2026-10-19T10:00:00Z", msg:"Breakfast", xp:20, m:"b" },
    { at:"2026-10-19T11:00:00Z", msg:"Gym", xp:-30, m:"b" }];
  assert.equal(M.bodyOf({ log }), 70);
});

test("Body lines are never trimmed off the log, so Body can always be worked out", () => {
  const log = [];
  for (let i = 0; i < 120; i++) log.push({ at:new Date(Date.parse("2026-10-19T20:00:00Z") - i * 60000).toISOString(), msg:"x" + i, xp:1, ...(i % 3 ? {} : { m:"b" }) });
  const t = plain(M.trimLog(log));
  assert.equal(t.filter((e) => e.m === "b").length, 40);
  assert.equal(t.filter((e) => e.m !== "b").length, 80 - 27);
  const m = M.mergeQuest(quest(1, day(50, log.slice(60))), quest(2, day(50, log.slice(0, 85)))).day;
  assert.equal(m.log.filter((e) => e.m === "b").length, 40);
});
