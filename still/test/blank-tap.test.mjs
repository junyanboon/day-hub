// node --test still/test/*.test.mjs   (Junyan, 2026-10-22: "Drop the your move and instead when I click on blank space
// give me options on things i can add there along with the add to today.")
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(new URL("../quest-agenda.js", import.meta.url), "utf8"), ctx);
const A = ctx.QuestAgenda;
const html = fs.readFileSync(new URL("../quest.html", import.meta.url), "utf8");
const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 22, h, m));
const iso = d => new Date(d).toISOString();
const fn = name => { const i = html.indexOf(`function ${name}(`); assert.ok(i > 0, `quest.html lost ${name}`); return html.slice(i, html.indexOf("\n  }\n", i)); };

const free = (s, e, game = true) => ({ free:true, s, e, t:"Your move", kind:"open", blocks:[{ s, e, kind:"open", key:"o" + +s, game }] });
const busy = (s, e, t = "Lunch") => ({ free:false, s, e, t, kind:"fuel", blocks:[{ s, e, t, kind:"fuel", key:"b" + +s, game:true }] });

test("the calendar draws no Your move blocks: free stretches stay empty calendar", () => {
  const stops = [busy(at(12), at(13)), free(at(13), at(17)), busy(at(17), at(18), "Dance"), free(at(18), at(18, 10))];
  const drawn = A.calItems(stops, +at(0), +at(23, 59));
  assert.deepEqual(drawn.map(x => x.st.t), ["Lunch", "Dance"]);
  assert.deepEqual(drawn.map(x => x.i), [0, 2], "each keeps its index into the stops, so a tap opens the right one");
  // the column is clipped to the days shown
  assert.deepEqual(A.calItems(stops, +at(12, 30), +at(17, 30)).map(x => [x.s, x.e]), [[+at(12, 30), +at(13)], [+at(17), +at(17, 30)]]);
  // the Plan your day stretch keeps open space of 15 minutes or more, so its tap still fills it (d2)
  assert.deepEqual(A.calItems(stops, +at(0), +at(23, 59), true).map(x => x.i), [0, 1, 2]);
});

test("quest.html draws only what calItems keeps and no longer opens a Your move sheet", () => {
  const cal = fn("calendarHTML");
  assert.match(cal, /AGD\(\)\.calItems\(stops, a0, z0, !!win\)/, "free time is kept only in the Plan your day stretch");
  assert.doesNotMatch(html, /function openMove\(/);
  // the top card still names free time Your move (only the calendar drawing went)
  assert.match(html, /cur\.kind === "open" \? "Your move"/);
});

test("a blank tap in today's free time gives the form at the tapped time plus that stretch's picks", () => {
  const stops = [busy(at(12), at(13)), free(at(13), at(17)), busy(at(17), at(18), "Dance")];
  const r = A.blankTap(at(14, 47), stops, at(11), true);
  assert.equal(iso(r.from), iso(at(14, 50)), "rounded up to 5 minutes, like Add to today");
  assert.equal(r.stretch, stops[1]);
  // the picks land from where he tapped, inside the stretch
  assert.equal(iso(A.pickSpan(r.from, r.stretch.e, at(11), 30).s), iso(at(14, 50)));
  // a tap earlier today in a stretch still running starts at now
  const r2 = A.blankTap(at(13, 5), stops, at(14, 2), true);
  assert.equal(iso(r2.from), iso(at(14, 5))); assert.equal(r2.stretch, stops[1]);
});

test("a blank tap outside free time, at the very end of a stretch, or on another day gives the form only", () => {
  const stops = [busy(at(12), at(13)), free(at(13), at(17)), busy(at(17), at(18), "Dance"), free(at(20), at(22), false)];
  // beside a block, in the empty part of its row
  let r = A.blankTap(at(12, 20), stops, at(11), true);
  assert.equal(r.stretch, null); assert.equal(iso(r.from), iso(at(12, 20)));
  // under 5 minutes left in the stretch
  r = A.blankTap(at(16, 57), stops, at(11), true);
  assert.equal(r.stretch, null);
  // a free stretch that is over
  r = A.blankTap(at(13, 30), stops, at(17, 30), true);
  assert.equal(r.stretch, null); assert.equal(iso(r.from), iso(at(17, 30)));
  // another day (its free time is not today's plan)
  r = A.blankTap(at(21), stops, at(11), false);
  assert.equal(r.stretch, null); assert.equal(iso(r.from), iso(at(21)));
  // a day that is over: nothing to add there
  assert.equal(A.blankTap(at(9), stops, at(11), false), null);
});

test("quest.html: a blank tap opens one sheet, the form first, then the picks under Or pick one, no Something else", () => {
  const sp = fn("openSpace");
  assert.match(sp, /AGD\(\)\.blankTap\(/);
  assert.match(sp, /addForm\(/);
  assert.match(sp, /movePicks\(/);
  assert.ok(sp.indexOf("addForm(") < sp.indexOf("movePicks("), "the form comes first");
  const picks = fn("movePicks");
  assert.match(picks, /Or pick one/);
  assert.doesNotMatch(picks, /Something else|mvOther/);
  assert.match(picks, /Plan the whole day/);
  assert.match(picks, /mvPull/);
  assert.match(picks, /pickMove\(/, "a pick still places at once with Undo");
  // the column's blank space is wired to it, and a block press is not a blank tap
  assert.match(html, /closest\("\.cal-ev, \.cal-hit"\)\) return;[^\n]*\n[^\n]*openSpace/);
});
