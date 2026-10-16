// node --test still/test/*.test.mjs   (the plan's basics, Junyan 2026-10-16, d1 d2 d3 d5 d6 d7)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(new URL("../quest-basics.js", import.meta.url), "utf8"), ctx);
const B = ctx.QuestBasics;
const at = (h, m = 0, d = 16) => new Date(Date.UTC(2026, 9, d, h, m));   // Oct d, h:m UTC
const iso = d => new Date(d).toISOString();
const gap = (a, b) => ({ s:a, e:b, min:(b - a) / 60000 });

test("travelling when a hotel check-in or check-out, or a flight, is within 2 days; else home", () => {
  assert.equal(B.guessMode([{ t:"Hotel check-out", day:"2026-10-16" }], "2026-10-16").mode, "travel");
  assert.equal(B.guessMode([{ t:"Check-in Steigenberger", day:"2026-10-18" }], "2026-10-16").mode, "travel");
  assert.equal(B.guessMode([{ t:"Flight MS 985 to Toronto", day:"2026-10-17" }], "2026-10-16").mode, "travel");
  assert.equal(B.guessMode([{ t:"AC123", day:"2026-10-15" }], "2026-10-16").mode, "travel");
  // too far, or nothing travel-like
  assert.equal(B.guessMode([{ t:"Flight to Madrid", day:"2026-10-19" }], "2026-10-16").mode, "home");
  assert.equal(B.guessMode([{ t:"Gym", day:"2026-10-16" }, { t:"Zouk social", day:"2026-10-17" }], "2026-10-16").mode, "home");
  assert.equal(B.guessMode([], "2026-10-16").mode, "home");
  // "check in with" someone is not a hotel
  assert.equal(B.guessMode([{ t:"Check in with Ela", day:"2026-10-16" }], "2026-10-16").mode, "home");
  assert.equal(B.guessMode([{ t:"Weekly check-in", day:"2026-10-16" }, { t:"NVC check-in", day:"2026-10-16" }], "2026-10-16").mode, "home");
  assert.equal(B.guessMode([{ t:"Check out by 12:00 — ibis Styles", day:"2026-10-16" }], "2026-10-16").mode, "travel");
  assert.match(B.guessMode([{ t:"Hotel check-out", day:"2026-10-16" }], "2026-10-16").why, /check-out/i);
});

test("Domestics: 60 min with today's Plus One on weekdays at home, 30 at the weekend, 25 travelling", () => {
  const plus = { 1:/vacuum/i, 2:/iron/i, 3:/kitchen/i, 4:/bathroom/i, 5:/bedroom/i };
  for (let wd = 1; wd <= 5; wd++) {
    const d = B.domestics("home", wd);
    assert.equal(d.min, 60);
    assert.match(d.steps[d.steps.length - 1].t, plus[wd]);
    assert.ok(d.steps.some(x => /dish/i.test(x.t)) && d.steps.some(x => /sweep/i.test(x.t)));
  }
  for (const wd of [0, 6]) {
    const d = B.domestics("home", wd);
    assert.equal(d.min, 30);
    assert.ok(!d.steps.some(x => /plus one/i.test(x.t)));
    assert.equal(d.steps.length, 4);
  }
  for (const wd of [0, 3, 6]) {
    const d = B.domestics("travel", wd);
    assert.equal(d.min, 25);
    assert.ok(d.steps.some(x => /tidy/i.test(x.t)) && !d.steps.some(x => /dish|sweep/i.test(x.t)));
  }
  // Dr Ellie AM is in every Domestics and ticks the mouthAm habit
  for (const m of ["home", "travel"]) assert.ok(B.domestics(m, 2).steps.some(x => x.h === "mouthAm"));
});

test("Wind-down is 45 min at home (8 steps) and 35 travelling (no kitchen), with the PM habits tied in", () => {
  const h = B.windDown("home"), tr = B.windDown("travel");
  assert.equal(h.min, 45); assert.equal(h.steps.length, 8);
  assert.equal(tr.min, 35); assert.equal(tr.steps.length, 7);
  assert.ok(h.steps.some(x => /kitchen/i.test(x.t)) && !tr.steps.some(x => /kitchen/i.test(x.t)));
  assert.ok(h.steps.some(x => x.h === "mouth") && h.steps.some(x => x.h === "lamp") && h.steps.some(x => x.wind));
});

test("the Wind-down ends at bedtime", () => {
  const bed = at(20, 30);   // 10:30 PM in Madrid (UTC+2)
  let r = B.placeBasics({ now:at(6), gaps:[], bed, busy:[], mode:"home", wd:5, morning:false });
  let w = r.place.find(x => x.id === "winddown");
  assert.equal(iso(w.e), iso(bed)); assert.equal(iso(w.s), iso(at(19, 45)));
  r = B.placeBasics({ now:at(6), gaps:[], bed, busy:[], mode:"travel", wd:5, morning:false });
  w = r.place.find(x => x.id === "winddown");
  assert.equal(iso(w.e), iso(bed)); assert.equal(iso(w.s), iso(at(19, 55)));
  // a dinner running into it: still ends at bed, starts when dinner ends, and says so
  r = B.placeBasics({ now:at(6), gaps:[], bed, busy:[[+at(18), +at(20)]], mode:"home", wd:5, morning:false });
  w = r.place.find(x => x.id === "winddown");
  assert.equal(iso(w.s), iso(at(20))); assert.equal(iso(w.e), iso(bed));
  assert.ok(r.notes.some(n => n.id === "winddown" && /30 min/.test(n.t)));
  // no bed on the plan, or bed already past: no Wind-down
  assert.ok(!B.placeBasics({ now:at(6), gaps:[], bed:null, busy:[], mode:"home", wd:5, morning:false }).place.length);
  // already placed: not again
  assert.ok(!B.placeBasics({ now:at(6), gaps:[], bed, busy:[], mode:"home", wd:5, morning:false, have:{ winddown:true } }).place.length);
});

test("Caney goes right after breakfast, Domestics right after Caney", () => {
  const r = B.placeBasics({ now:at(5), gaps:[gap(at(7), at(11))], breakfastEnd:at(7), bed:null, busy:[], mode:"home", wd:1 });
  const c = r.place.find(x => x.id === "caney"), d = r.place.find(x => x.id === "domestics");
  assert.equal(iso(c.s), iso(at(7))); assert.equal(iso(c.e), iso(at(7, 10)));
  assert.equal(iso(d.s), iso(at(7, 10))); assert.equal(iso(d.e), iso(at(8, 10)));
  assert.equal(r.notes.length, 0);
});

test("no breakfast: the first free gap of 25 min or more after waking", () => {
  const r = B.placeBasics({ now:at(5), wake:at(5), gaps:[gap(at(5), at(5, 20)), gap(at(6), at(8))], bed:null, busy:[], mode:"travel", wd:3 });
  const c = r.place.find(x => x.id === "caney"), d = r.place.find(x => x.id === "domestics");
  assert.equal(iso(c.s), iso(at(6))); assert.equal(iso(d.s), iso(at(6, 10))); assert.equal(iso(d.e), iso(at(6, 35)));
});

test("a short gap after breakfast: Domestics takes the first gap that fits, else shrinks and says so", () => {
  // breakfast ends 8:30 and only 45 min are free before something fixed; the next gap opens at 10:00
  let r = B.placeBasics({ now:at(5), gaps:[gap(at(8, 30), at(9, 15)), gap(at(10), at(12))], breakfastEnd:at(8, 30), latest:at(11), bed:null, busy:[], mode:"home", wd:2 });
  let d = r.place.find(x => x.id === "domestics");
  assert.equal(iso(d.s), iso(at(10))); assert.equal(d.min, 60);
  // nothing that fits before the cut-off: shrink to the biggest room after Caney
  r = B.placeBasics({ now:at(5), gaps:[gap(at(8, 30), at(9, 15))], breakfastEnd:at(8, 30), latest:at(11), bed:null, busy:[], mode:"home", wd:2 });
  d = r.place.find(x => x.id === "domestics");
  assert.equal(iso(d.s), iso(at(8, 40))); assert.equal(d.min, 35); assert.equal(iso(d.e), iso(at(9, 15)));
  assert.ok(r.notes.some(n => n.id === "domestics" && /35 min/.test(n.t)));
});

test("a basic he dropped or already has is not put back", () => {
  const r = B.placeBasics({ now:at(5), gaps:[gap(at(7), at(11))], breakfastEnd:at(7), bed:null, busy:[], mode:"home", wd:1, have:{ caney:true } });
  assert.deepEqual([...r.place.map(x => x.id)], ["domestics"]);
  assert.equal(iso(r.place[0].s), iso(at(7)));
});

test("Fill it only offers what fits the slot, and always Rest", () => {
  const list = B.fitList(20, {
    basics:[{ id:"caney", t:"Go over the day with Caney", min:10 }, { id:"domestics", t:"Domestics", min:60 }],
    practices:[{ id:"kriya", t:"Isha Kriya", min:12 }, { id:"angam", t:"Angamardana", min:30 }],
    tasks:[{ id:"T1", t:"Pay the bill", min:15 }, { id:"T2", t:"Write the report", min:90 }] });
  assert.deepEqual([...list.map(x => x.t)], ["Go over the day with Caney", "Isha Kriya", "Pay the bill", "Rest"]);
  assert.ok(list.every(x => x.min <= 20));
  assert.equal(list.find(x => x.kind === "rest").min, 20);
  assert.equal(B.fitList(90, { basics:[], practices:[], tasks:[] }).find(x => x.kind === "rest").min, 30);
});

test("type to add: a trailing number is minutes, 15 when there is none", () => {
  assert.deepEqual({ ...B.parseQuick("shower 15") }, { t:"Shower", min:15 });
  assert.deepEqual({ ...B.parseQuick("call mum 20") }, { t:"Call mum", min:20 });
  assert.deepEqual({ ...B.parseQuick("  stretch  ") }, { t:"Stretch", min:15 });
  assert.deepEqual({ ...B.parseQuick("laundry 45 min") }, { t:"Laundry", min:45 });
  assert.equal(B.parseQuick("   "), null);
  assert.equal(B.parseQuick("20"), null);
});
