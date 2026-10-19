// node --test still/test/*.test.mjs   (Junyan, 2026-10-19, d32 to d36: "let's drop all the check in stuff. When I click
// on the block it should just automatically go to the set list only. If I haven't clicked on the block then there can be
// a symbol to indicate for me to click on it." A block with no tiles yet opens a short note: "let's just do them one at
// a time as they come up." Right now loses its check-ins, the auto tiles and the note (d35). The Last night box shows
// under Body on the dashboard too.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const html = fs.readFileSync(here + "quest.html", "utf8");
const dash = fs.readFileSync(here + "quest-dash.js", "utf8");
const ctx = {}; ctx.globalThis = ctx;
for (const f of ["quest-basics.js", "quest-merge.js"]) vm.runInNewContext(fs.readFileSync(here + f, "utf8"), ctx);
const B = ctx.QuestBasics, M = ctx.QuestMerge;
const J = x => JSON.parse(JSON.stringify(x));
const fn = name => { const i = html.indexOf(`function ${name}(`); assert.ok(i > 0, `quest.html lost ${name}`); return html.slice(i, html.indexOf("\n  }\n", i)); };

test("a block that has its own list and has started shows the tap symbol until he opens it", () => {
  assert.equal(B.unopened({}, "k1", true, true), true);
  assert.equal(B.unopened({}, "k1", true, false), false, "not started yet: no symbol");
  assert.equal(B.unopened({}, "k1", false, true), false, "no tiles yet: no symbol (d33 d36)");
  assert.equal(B.unopened({ opened:{ k1:"2026-10-19T15:00:00.000Z" } }, "k1", true, true), false, "opened: the symbol goes");
  assert.equal(B.unopened({ opened:{ k2:"x" } }, "k1", true, true), true, "another block's open does not count");
  assert.equal(B.unopened({ work:{ k1:{ tick:{ 0:true } } } }, "k1", true, true), false, "a ticked tile means it was opened");
  assert.equal(B.unopened({ work:{ k1:{ tick:{ 0:false }, paid:{} } } }, "k1", true, true), true, "an empty list is still unopened");
  assert.equal(B.unopened({ mealq:{ k1:{ sel:["fruit"] } } }, "k1", true, true), false, "a meal with tiles tapped was opened");
  assert.equal(B.unopened(null, "k1", true, true), true);
});

test("opening a block on one device clears the symbol on the other: opened merges from both", () => {
  const o = { xp:1, ts:1, day:{ date:"2026-10-19", opened:{ a:"2026-10-19T14:00:00.000Z" } } };
  const n = { xp:1, ts:2, day:{ date:"2026-10-19", opened:{ b:"2026-10-19T15:00:00.000Z" } } };
  assert.deepEqual(J(M.mergeQuest(o, n).day.opened), { a:"2026-10-19T14:00:00.000Z", b:"2026-10-19T15:00:00.000Z" });
});

test("tapping a block opens its list: basics, gym, meal, outdoor (barefoot), a prep list; else the not set up note", () => {
  const so = fn("openStop");
  assert.match(so, /markOpened\(b\)/, "opening counts as opened");
  assert.match(so, /blockList\(b\)/);
  const bl = fn("blockList");
  for (const want of [/b\.basic/, /isGym\(b\)/, /isMeal\(b\)/, /basicId\(b\)/, /outdoorBlock\(b\.t\)/, /INSIGHTS\[gk\(b\)\]/]) assert.match(bl, want);
  assert.ok(bl.indexOf("isGym(b)") < bl.indexOf("basicId(b)") && bl.indexOf("isMeal(b)") < bl.indexOf("basicId(b)"), "gym and meal win over a checklist name");
  assert.ok(!/openActQuiz|mealq/.test(so), "the barefoot reopen code is gone");
  assert.ok(!/openEdit\(b\)/.test(so), "a block never opens straight to the edit box");
  const nt = fn("openNoTiles");
  assert.match(nt, /Tiles for this block aren't set up yet\./);
  assert.ok(nt.indexOf("set up yet") < nt.indexOf("Change time or name"), "the note sits above Change time or name");
  assert.ok(bl.indexOf("INSIGHTS[gk(b)]") < bl.indexOf("outdoorBlock("), "a hike with a prep list keeps it");
  const od = fn("openOutdoor"), bt = fn("barefootTile"), bb = fn("bindBarefootTile");
  assert.match(od, /\$\{barefootTile\(b\)\}/); assert.match(od, /bindBarefootTile\(b, openOutdoor\)/); assert.match(od, /Change time or name/);
  assert.match(bt, /outdoorBlock\(b\.t\)/); assert.match(bt, /barefootStep\(\)/); assert.match(bb, /tapStep\(bn, b, "outdoor"/);
  assert.ok(!/G\.day\.work = /.test(bt), "drawing it writes nothing");
  const wk = fn("openWork");
  assert.match(wk, /\$\{barefootTile\(b\)\}/, "an outdoor block's prep list carries the barefoot tile too");
  assert.match(wk, /bindBarefootTile\(b, openWork\)/);
});

test("the calendar draws the tap symbol from unopened, only on today's blocks, and the click marks the block opened", () => {
  const cal = fn("calendarHTML");
  assert.match(cal, /const fb = [^\n]*st\.blocks\.find\(b => b\.kind !== "open" && b\.kind !== "break"\)/, "the dot reads the block a tap opens");
  assert.match(cal, /QB\(\)\.unopened\(G\.day, gk\(fb\), !!blockList\(fb\), [^)]*\)/);
  assert.match(cal, /cal-tap/);
  assert.match(html, /\.cal-tap \{/);
  assert.match(html, /n\.onclick = e => \{[^]{0,900}markOpened\(b\); return openGym\(b\);[^]{0,40}openStop\(b\);/, "the gym shortcut marks it too");
});

test("the check-ins are gone: no How was X?, no Check tag, no activity quiz", () => {
  for (const gone of ["openActQuiz", "actRatable", "unratedActivity", "AQ_PRANA", "AQ_BODY", "aqScore", "data-actq", "cal-ask", "Check ›", "barefootHTML", "bindBarefoot("])
    assert.ok(!html.includes(gone), gone);
  assert.ok(!/How was \$\{/.test(html));
});

test("Right now keeps only what is for now: no How are you, really?, no auto tiles, no ticked-inside note (d35)", () => {
  const s = fn("suggestHTML");
  assert.ok(!/How are you, really\?/.test(s));
  assert.ok(!/nvDue\(\)/.test(s));
  assert.ok(!/TILES|habitTile/.test(s), "Last meal 3 hr and Asleep by 11 tiles are off the card");
  assert.ok(!/ticked inside their block/.test(html));
  // the auto items still count and pay in the background and stay on the day's end screen
  assert.match(html, /\["early", "[^"]+", 5, 1, "🍽️", "Last meal 3 hr", "auto", "Evening"\]/);
  assert.match(html, /\["bedtime", "[^"]+", 5, 1, "🌙", "Asleep by 11", "auto", "Evening"\]/);
  assert.match(s, /How am I\?/, "his own check-in button stays");
  const night = fn("openNight");
  assert.match(night, /\(G\.day\.earn \|\| \{\}\)\.early \? "✓ Last meal 3 hr before bed/, "tonight's last meal shows on the day's end screen");
  assert.match(night, /habitN\("bedtime"\) \? `✓ Asleep by 11 last night/, "and last night's sleep time");
  assert.match(night, /done\.unshift\(\.\.\.auto\)/);
});

test("gym keeps How do you feel now? in its own list, and it still pays (d34)", () => {
  const g = fn("drawGym");
  assert.match(g, /GL\.feelHTML\(/);
  assert.match(html, /the answer to "How do you feel now\?" is what pays/);
});

test("the Last night box is not clipped by the Prana and Body card on the dashboard", () => {
  assert.match(dash, /body\.dash \.w-being > #being \{[^}]*display:flex[^}]*flex-direction:column/);
  assert.match(dash, /body\.dash \.w-being \.bg-stage \{[^}]*flex:1[^}]*min-height:0/);
  assert.match(dash, /body\.dash \.w-being \.bg-night \{[^}]*flex:none/);
  assert.ok(!/body\.dash \.w-being \.bg-stage \{[^}]*height:100%/.test(dash), "a full-height stage pushed the box out of sight");
});
