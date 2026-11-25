// node --test still/test/commute-tidy-page.test.mjs
// The page wiring of the tidy Commute panel (Junyan, 2026-11-25, d40 "41 yes"): read from the source, so a rewrite cannot quietly bring back the
// banner, the big Check now button or the always-open step list. The clicks themselves are in e2e/calendar-commute-tidy.e2e.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html = fs.readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
const box = html.slice(html.indexOf("/* commute:start */"), html.indexOf("/* commute:end */"));

test("the old banner, the big Check now button and the Last checked line are gone", () => {
  assert.doesNotMatch(box, /cmchk|Checked just now|Last checked|>Check now<|"Check now"|out\.banner|out\.check\b|cmlast/);
  assert.doesNotMatch(html, /\.cmchk\{/);
});
test("one quiet line: Checked time, a link-style Check again that says Checking… while it runs; the sentence is only its title", () => {
  const f = box.slice(box.indexOf("function cmChecked("), box.indexOf("/** The words for a way with no directions"));
  assert.match(f, /class="cmlink" data-cm="check" \$\{d\.loading \? "disabled" : ""\}/);
  assert.match(f, /d\.loading \? "Checking…" : d\.error \? "Try again" : "Check again"/);
  assert.match(f, /title="\$\{esc\(note\)\}"/);
  assert.match(f, /const msg = d\.error \|\| d\.note;/);
  assert.match(f, /role="alert">\$\{esc\(msg\)\}/, "a failed or not-ok re-check shows its message under the line");
  assert.match(box, /const CM_AUTO_NOTE = "While this panel is open, it checks once in the hour before you leave\."/);
  assert.equal((box.match(/While this panel is open/g) || []).length, 1, "the sentence is not drawn as text anywhere");
});
test("the quiet line sits under the trip bar in the Leave by block, and also alone when a way has no directions", () => {
  assert.match(box, /out\.leave = `<div class="cmleave">\$\{cmTrip\(mode, v, leave, shift, over \? cmOver\(over, lead\) : cmChecked\(d, checkedAt, auto \? CM_AUTO_NOTE : "", lead\)\)\}\$\{over \? "" : cmEarly\(inp\)\}<\/div>`/);
  assert.match(box, /out\.leave = `<div class="cmleave">\$\{over \? cmOver\(over\) : cmChecked\(d, checkedAt, ""\)\}<\/div>`/);
  assert.match(box, /cmshift/, "the shift mark stays");
});
test("trip bar page: Leave by and Arrive on one row with the way's icon and minutes, a bar of travel then spare, and the early chips", () => {
  const trip = box.slice(box.indexOf("function cmTrip("), box.indexOf("/** Everything the directions answer adds"));
  assert.match(trip, /<span class="lbl">Leave by<\/span>[\s\S]*<span class="lbl">Arrive<\/span>/, "Leave by on the left, Arrive on the right");
  assert.match(trip, /class="cmmid"><i><\/i><span>\$\{ic\} \$\{v\.minutes\} min<\/span><i><\/i>/, "line, icon and minutes, line");
  assert.match(trip, /class="tr" style="flex:\$\{v\.minutes\} 1 0"/); assert.match(trip, /class="sp" style="flex:\$\{v\.spare\} 1 0">\$\{v\.spare\} min</);
  assert.match(trip, /v\.spare != null && v\.spare >= 0 \? `<i class="sp"/, "no green segment with no next plan or when late");
  assert.match(box, /class="chip k-commute" data-cm="early" data-v="\$\{n\}" aria-pressed="\$\{n === S\.cmEarly\}">\$\{n\} min</);
  assert.match(box, /Be there early by/); assert.match(box, /const cmEarly = \(inp\) => !inp\.arrive\.nextTitle \? ""/, "no chips with no next plan");
  assert.match(html, /\.cmtb\{display:flex;height:22px/, "the bar is 22px high"); assert.match(html, /\.cmtb \.sp\{min-width:/, "the green segment has a minimum width");
  assert.match(html, /\.cmtb \.sp\{[^}]*background:color-mix\(in srgb,var\(--emerald\) 55%,var\(--bar\)\)/, "green from the palette every look defines");
  assert.match(html, /\.cmlate\{color:var\(--red\)\}/);
  assert.doesNotMatch(box, /Nothing saved with this block yet/, "the empty notes line is gone");
});
test("the early pick is one device setting read like the others, used by every arrive-by, and asks the directions again", () => {
  assert.match(html, /cmEarly: CalCommute\.earlyMin\(store\.get\("cal-commute-early"\)\)/);
  assert.equal((html.match(/CalCommute\.arriveTarget\(/g) || []).length, 2, "every reader of the arrive-by time");
  assert.equal((html.match(/CalCommute\.arriveTarget\(ev, eventsFor\(cmDay\(ev\), cmDay\(ev\)\), S\.tz, S\.cmEarly\)/g) || []).length, 2, "both pass the pick");
  assert.match(box, /d\.cm === "early"\) \{[\s\S]*?store\.set\("cal-commute-early", String\(n\)\); cmPaint\(\); cmDirections\(ev\);/, "the same check path, no second way of asking");
});
test("folds are real buttons with aria-expanded; the way there starts closed, Heads up starts open, alert rows start closed", () => {
  assert.match(box, /const CM_FOLD = \{ key: "", way: false, heads: true, alerts: \{\} \}/);
  assert.match(box, /<button type="button" class="cmfh" data-cm="fold"[^`]*aria-expanded="\$\{open\}"/);
  assert.match(box, /<button type="button" class="cmatog" data-cm="alert"[^`]*aria-expanded="\$\{open\}"/);
  assert.match(box, /`Heads up · \$\{now\.length\}`/);
  assert.match(box, /cmFold\("cmWay", `The way there · /);
});
test("a repaint draws from CM_FOLD and a panel opening resets it; toggling edits the page in place", () => {
  assert.match(html, /cmFoldReset\(tab, ev\);/, "panel() resets the folds");
  const r = box.slice(box.indexOf("function cmFoldReset"), box.indexOf("const CM_AUTO_NOTE"));
  assert.match(r, /key === CM_FOLD\.key\) return/, "the same block drawn again keeps them");
  const t = box.slice(box.indexOf("function cmToggle"), box.indexOf("function cmAutoTick") > 0 ? box.indexOf("function cmAutoTick") : undefined);
  assert.doesNotMatch(t.slice(0, t.indexOf("\n}")), /box\.innerHTML|cmPaint\(\);\s*\n\s*t\.set/, "no repaint of the box for a plain tap");
  assert.match(t, /setAttribute\("aria-expanded"/);
});
test("the quicker row is outside the Heads up fold, so it is never hidden", () => {
  assert.match(box, /out\.quick = `<div class="cmquick">/);
  const heads = box.slice(box.indexOf("function cmHeadsUp"), box.indexOf("function cmChecked"));
  assert.doesNotMatch(heads, /cmquick/);
});
test("no Heads up block when nothing is on, nothing was cleared and no source is down", () => {
  assert.match(box, /if \(!now\.length && !down\.length && !\(g && g\.cleared\.length\)\) return "";/);
});
test("d37: the no-route words come from the pure rule, and the page remembers a To the lookup could not pin", () => {
  assert.match(box, /K\.noRouteText\(\{ err, to: K\.rowText\(t\)\.main, noPin: !!CM\.noPin\[cmPinKey\(t\)\] && !cmSpot\(t\) \}\)/);
  assert.match(box, /CM\.noPin\[tk\] = true; else delete CM\.noPin\[tk\]/);
  assert.match(box, /id="cmNoRoute">\$\{esc\(cmWayError\(ev, d, mode\)\)\}/, "escaped");
  assert.match(box, /Too far to walk \(\$\{way\.km\} km\)\./);
  assert.match(box, /Directions are off for the rest of the month\. They come back on the 1st\./);
});
test("d36: the block-over check is one rule, and the weather card reads the missing-hour rule", () => {
  assert.match(box, /CalCommute\.blockEnded\(ev\.e, Date\.now\(\)\)/);
  assert.doesNotMatch(box, /ev\.e > Date\.now\(\)/);
  assert.match(box, /K\.WX_TEXT\[K\.missingHour\(entry\.res, plan\.at\)\]/);
});
test("the page loads the new commute script (a new ?v= so a phone does not keep the old one)", () => {
  assert.match(html, /calendar-commute\.js\?v=11/);
});
