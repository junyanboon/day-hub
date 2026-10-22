// node --test still/test/*.test.mjs   (Junyan, 2026-10-22: "Between wind down and the 1st thing in the morning I want the
// Sleep with the amount in the same shape and colour and automatic adjustment that Your move used to have.")
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(new URL("../quest-agenda.js", import.meta.url), "utf8"), ctx);
const A = ctx.QuestAgenda;
const html = fs.readFileSync(new URL("../quest.html", import.meta.url), "utf8");
const fn = name => { const i = html.indexOf(`function ${name}(`); assert.ok(i > 0, `quest.html lost ${name}`); return html.slice(i, html.indexOf("\n  }\n", i)); };
// UTC stands in for his zone: Oct 22 evening, Oct 23 morning
const at = (d, h, m = 0) => new Date(Date.UTC(2026, 9, d, h, m));
const iso = d => new Date(d).toISOString();
const NIGHTS = [[+at(22, 0), +at(23, 0)], [+at(23, 0), +at(24, 0)]];
const blk = (s, e, t, extra = {}) => ({ free:false, s, e, t, kind:"fixed", blocks:[{ s, e, t, kind:"fixed", key:t + +s, ...extra }] });
const plan = () => [
  blk(at(22, 18), at(22, 19), "Dinner"),
  blk(at(22, 21, 45), at(22, 22, 30), "Wind down", { basic:"winddown" }),
  blk(at(23, 6, 45), at(23, 7, 30), "Morning yoga"),
  blk(at(23, 9), at(23, 10), "Breakfast"),
];

test("Sleep runs from the end of Wind down to the next morning's first block, with its length", () => {
  const sp = A.sleepSpans(plan(), NIGHTS);
  assert.equal(sp.length, 1);
  assert.equal(iso(sp[0].s), iso(at(22, 22, 30)));
  assert.equal(iso(sp[0].e), iso(at(23, 6, 45)));
  assert.equal(sp[0].min, 8 * 60 + 15);
  assert.equal(A.sleepText(sp[0].min), "8h 15m");
  assert.equal(A.sleepText(8 * 60), "8h");
  assert.equal(A.sleepText(45), "45m");
});

test("Sleep moves by itself when Wind down or the morning's first block moves", () => {
  const p = plan();
  p[1].s = at(22, 22, 15); p[1].e = at(22, 23);          // Wind down dragged later
  let sp = A.sleepSpans(p, NIGHTS);
  assert.equal(iso(sp[0].s), iso(at(22, 23))); assert.equal(sp[0].min, 7 * 60 + 45);
  p[2].s = at(23, 7, 30); p[2].e = at(23, 8, 15);        // yoga dragged later: Sleep grows
  sp = A.sleepSpans(p, NIGHTS);
  assert.equal(iso(sp[0].e), iso(at(23, 7, 30))); assert.equal(A.sleepText(sp[0].min), "8h 30m");
  p.splice(2, 1);                                        // yoga gone: breakfast is the first thing
  assert.equal(iso(A.sleepSpans(p, NIGHTS)[0].e), iso(at(23, 9)));
});

test("no next-morning block, no Sleep; no Wind down, the evening's last block starts it", () => {
  assert.equal(A.sleepSpans(plan().slice(0, 2), NIGHTS).length, 0, "nothing the next morning");
  const noWd = plan().filter(st => st.t !== "Wind down");
  noWd.push(blk(at(22, 20), at(22, 21, 30), "Call Mum"));
  const sp = A.sleepSpans(noWd, NIGHTS);
  assert.equal(iso(sp[0].s), iso(at(22, 21, 30)));
  // a later block after Wind down does not start it: Wind down does
  const late = plan(); late.push(blk(at(22, 22, 30), at(22, 23), "Read"));
  assert.equal(iso(A.sleepSpans(late, NIGHTS)[0].s), iso(at(22, 22, 30)));
});

test("free time, bookings and a Sleep block already on the calendar are handled", () => {
  const p = plan();
  p.push({ free:true, s:at(23, 1), e:at(23, 2), t:"Your move", kind:"open", blocks:[{ s:at(23, 1), e:at(23, 2), kind:"open" }] });
  p.push(blk(at(22, 15), at(24, 11), "Car rental"));     // a booking (over 12 hours) is not a block
  assert.equal(iso(A.sleepSpans(p, NIGHTS)[0].e), iso(at(23, 6, 45)));
  // a night that already has its own Sleep event shows that one, not a second
  const own = plan(); own.push(blk(at(22, 22, 45), at(23, 6, 30), "Sleep"));
  assert.equal(A.sleepSpans(own, NIGHTS).length, 0);
});

test("the calendar draws Sleep dashed like Your move, not tappable, and nothing else counts it", () => {
  const cal = fn("calendarHTML");
  assert.match(cal, /AGD\(\)\.sleepSpans\(/);
  assert.match(cal, /cal-ev free sleep/);
  assert.match(cal, /Sleep · \$\{/);
  assert.match(html, /\.cal-ev\.sleep \{[^}]*pointer-events:none/, "a tap there falls through to the blank tap (Add to today)");
  // computed only for drawing: no plan, planner or score code reads it
  assert.equal(html.split("sleepSpans(").length - 1, 1, "only calendarHTML works it out");
  // the column keeps it in the lanes even when it runs past 12 hours (isLong would drop it)
  const extra = [{ st:{ sleep:true }, i:-1, s:+at(22, 21), e:+at(23, 10) }];
  const drawn = A.calItems(plan(), +at(22, 0), +at(24, 0), false, extra);
  assert.ok(drawn.some(x => x.st.sleep));
});
