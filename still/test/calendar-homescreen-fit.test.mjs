// node --test still/test/calendar-homescreen-fit.test.mjs
// The iPhone home screen app (Junyan, 2026-11-12, scope "(not the desktop just mobile"). His readout from Cal TEST
// (BUILD 2026-11-12c): standalone, inner 402x812, screen 402x874, safe t 62 b 34, the page drawn from the very top of
// the screen. So iOS lays the page out one top inset (62) shorter than the screen and the bottom 62pt shows nothing of
// ours: WebKit bug 301994 comment 12 has the same numbers.
// The fix stretches the page down by the measured gap, but only in a home screen app on a touch screen, and only when
// the gap is the known one (it equals the top inset). A Safari tab, a desktop and any other shortfall are left alone.
// Then: "also the space above the header section is really large ... if it' stoo cloes tot he top then it gets blurry
// as well", and the Notion Calendar screenshot. Two tops he picks between on the phone: "close" (header right under
// the clock strip) and "clear" (header below the system blur, which fades out near 100pt).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "../calendar-core.js";
const C = globalThis.CalCore;

const phone = { standalone: true, touch: true, innerWidth: 402, innerHeight: 812, screenWidth: 402, screenHeight: 874, safeTop: 62 };

test("his phone's home screen app: the page is stretched by the 62pt it is short", () => {
  assert.equal(C.homeFit(phone).gap, 62);
});

test("a Safari tab, a desktop, or a mouse: nothing changes", () => {
  assert.equal(C.homeFit({ ...phone, standalone: false }).gap, 0);
  assert.equal(C.homeFit({ ...phone, touch: false }).gap, 0);
  assert.equal(C.homeFit({ standalone: false, touch: false, innerWidth: 1440, innerHeight: 900, screenWidth: 1440, screenHeight: 900, safeTop: 0 }).gap, 0);
});

test("a home screen app that already fills the screen (an iOS where the bug is fixed): nothing changes", () => {
  assert.equal(C.homeFit({ ...phone, innerHeight: 874 }).gap, 0);
});

test("only the known shortfall: a gap that is not the top inset is left alone", () => {
  assert.equal(C.homeFit({ ...phone, innerHeight: 700 }).gap, 0, "a keyboard or something else shrank the window");
  assert.equal(C.homeFit({ ...phone, safeTop: 0 }).gap, 0, "no top inset reported");
  assert.equal(C.homeFit({ ...phone, innerHeight: 813 }).gap, 61, "a pixel of rounding is fine");
});

test("turned sideways the screen's long side is not the height (iOS keeps screen.width/height upright)", () => {
  assert.equal(C.homeFit({ ...phone, innerWidth: 874, innerHeight: 402, safeTop: 0 }).gap, 0);
});

test("his own switch: off never stretches, on stretches any gap up to the top inset plus a little", () => {
  assert.equal(C.homeFit({ ...phone, fill: "off" }).gap, 0);
  assert.equal(C.homeFit({ ...phone, safeTop: 0, fill: "on" }).gap, 62);
  assert.equal(C.homeFit({ ...phone, innerHeight: 600, fill: "on" }).gap, 0, "never more than a status bar's worth");
  assert.equal(C.homeFit({ ...phone, standalone: false, fill: "on" }).gap, 0, "never in a Safari tab");
});

test("the top: clear by default (d23 \"23 clear\"), close when he picks it, and only in the home screen app on touch", () => {
  assert.equal(C.homeFit(phone).top, "clear");
  assert.equal(C.homeFit({ ...phone, top: undefined }).top, "clear");
  assert.equal(C.homeFit({ ...phone, top: "close" }).top, "close");
  assert.equal(C.homeFit({ ...phone, top: "clear" }).top, "clear");
  assert.equal(C.homeFit({ ...phone, top: "nonsense" }).top, "clear");
  assert.equal(C.homeFit({ ...phone, standalone: false, top: "clear" }).top, null);
  assert.equal(C.homeFit({ ...phone, touch: false }).top, null);
});

test("the header gap is for a phone with a top inset only (reviewer, 2026-11-12): the iPhone keeps clear", () => {
  assert.equal(C.homeFit({ ...phone, innerHeight: 874 }).top, "clear", "402 x 874, inset 62");
});

test("no top inset (an Android installed app, a touch laptop): no header gap", () => {
  assert.equal(C.homeFit({ ...phone, safeTop: 0 }).top, null);
  assert.equal(C.homeFit({ standalone: true, touch: true, innerWidth: 412, innerHeight: 915, screenWidth: 412, screenHeight: 915, safeTop: 0 }).top, null);
  assert.equal(C.homeFit({ standalone: true, touch: true, innerWidth: 1280, innerHeight: 800, screenWidth: 1280, screenHeight: 800, safeTop: 0 }).top, null);
});

test("an iPad sized screen with a top inset: no header gap (short side over 600)", () => {
  assert.equal(C.homeFit({ standalone: true, touch: true, innerWidth: 820, innerHeight: 1180, screenWidth: 820, screenHeight: 1180, safeTop: 24 }).top, null);
  assert.equal(C.homeFit({ standalone: true, touch: true, innerWidth: 1180, innerHeight: 820, screenWidth: 820, screenHeight: 1180, safeTop: 24, top: "close" }).top, null);
});

test("the phone turned sideways (top inset 0): no header gap", () => {
  assert.equal(C.homeFit({ ...phone, innerWidth: 874, innerHeight: 402, safeTop: 0 }).top, null);
});

/* ---- 2026-11-12h: his phone after build 12g (Junyan, "24 what blank stripe", screenshot 5:32 PM Toronto) ----
   inner 402x874 docH 812 screen 402x874, safe t 62 b 34, fit auto gap 62, html h 874, 100svh 812, .drop 839..936.
   Once html is stretched, iOS 26 also grows the window (innerHeight 812 -> 874) and the fixed layer with it, so
   bottom-pinned boxes already reach the screen's bottom and moving them down by the whole gap pushed the + New task
   bar 62pt off the screen. Chrome does not grow the window. Two rules follow:
   - the gap is measured from documentElement.clientHeight (docH), which the stretch does not move (812 before and
     after), never from innerHeight, which it does;
   - the pinned shift is measured: screen height minus where a fixed bottom:0 box really ends, clamped 0..gap. */
const after = { ...phone, innerHeight: 874, docHeight: 812 };   // his phone with the stretch on

test("the gap comes from docH: a second measure after the stretch (innerHeight now 874) keeps gap 62", () => {
  assert.equal(C.homeFit({ ...phone, docHeight: 812 }).gap, 62, "before the stretch");
  assert.equal(C.homeFit(after).gap, 62, "after the stretch, his real numbers");
});

test("a home screen app that is truly full height (docH 874 too): gap 0, no stretch", () => {
  assert.equal(C.homeFit({ ...phone, innerHeight: 874, docHeight: 874 }).gap, 0);
});

test("homeFit hands back the screen height it measured against (the long side when upright)", () => {
  assert.equal(C.homeFit(after).screenH, 874);
});

test("the pinned shift on his phone: a fixed bottom:0 box already ends at 874, so shift 0", () => {
  assert.equal(C.homeShift({ gap: 62, screenH: 874, pinnedBottom: 874 }), 0);
});

test("the pinned shift where the window stays short (Chrome, older iOS): the box ends at 812, shift 62", () => {
  assert.equal(C.homeShift({ gap: 62, screenH: 874, pinnedBottom: 812 }), 62);
});

test("the pinned shift is clamped between 0 and the gap, and is 0 with no gap", () => {
  assert.equal(C.homeShift({ gap: 62, screenH: 874, pinnedBottom: 900 }), 0, "never moves up");
  assert.equal(C.homeShift({ gap: 62, screenH: 874, pinnedBottom: 700 }), 62, "never more than the gap");
  assert.equal(C.homeShift({ gap: 0, screenH: 874, pinnedBottom: 812 }), 0, "no stretch, no shift");
  assert.equal(C.homeShift({ gap: 62, screenH: 874, pinnedBottom: 843.6 }), 30, "rounded to whole px");
});

/* ---- the CSS: every new rule hangs off html.hs (home screen app, touch) or html.hsfill (the gap is on) ---- */
const html = fs.readFileSync(fileURLToPath(new URL("../calendar.html", import.meta.url)), "utf8");
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const rules = [...css.replace(/@media[^{]*\{/g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim().replace(/^\/\*[\s\S]*?\*\/\s*/g, ""), m[2].replace(/\s/g, "")]);
const ruleFor = (sel) => rules.find(([s]) => s.split(",").map((x) => x.trim()).includes(sel));

test("the stretch: the page grows by the gap; the bottom bars move down only by the measured shift (--hsshift)", () => {
  assert.match(ruleFor("html.hsfill")?.[1] || "", /height:calc\(100%\+var\(--hsgap/);
  assert.match(ruleFor("html.hsfill .drop")?.[1] || "", /bottom:calc\(-1\*var\(--hsshift/, "the + New task box sits just above the home bar");
  assert.match(ruleFor("html.hsfill .toast")?.[1] || "", /bottom:calc\(18px\+env\(safe-area-inset-bottom,0px\)-var\(--hsshift/);
  assert.match(ruleFor("html.hsfill .panel")?.[1] || "", /bottom:calc\(-1\*var\(--hsshift/);
  assert.match(ruleFor("html.hsfill .modal")?.[1] || "", /bottom:calc\(-1\*var\(--hsshift/);
  for (const sel of ["html.hsfill .drop", "html.hsfill .toast", "html.hsfill .panel", "html.hsfill .modal"]) assert.doesNotMatch(ruleFor(sel)?.[1] || "", /--hsgap/, `${sel} no longer moves by the whole gap`);
});

test("every fixed box pinned to the bottom has an html.hsfill rule that moves it by --hsshift (none left on --hsgap)", () => {
  const pinned = new Set();
  for (const [s, d] of rules) if (/(^|;)position:fixed/.test(d) && /(^|;)(bottom|inset):/.test(d) && !/^html\.hs/.test(s)) for (const x of s.split(",")) pinned.add(x.trim());
  for (const sel of [".drop", ".toast", ".panel", ".modal"]) assert.ok(pinned.has(sel), `${sel} is found as a bottom-pinned box`);
  for (const sel of pinned) assert.match(ruleFor(`html.hsfill ${sel}`)?.[1] || "", /bottom:calc\([^;]*var\(--hsshift/, `html.hsfill ${sel} moves by --hsshift`);
});

test("the top: the strip and the header start move together, close and clear", () => {
  for (const sel of ["html.hs body::before", "html.hs .app"]) assert.match(ruleFor(sel)?.[1] || "", /calc\(env\(safe-area-inset-top,0px\)\+var\(--hstop/, sel);
  assert.match(ruleFor("html.hs")?.[1] || "", /--hstop:0px/, "close: right under the clock strip");
  assert.match(ruleFor("html.hs.hsclear")?.[1] || "", /--hstop:38px/, "clear: below the blur (fades out near 100pt)");
  assert.match(ruleFor("html.hs body.month .left")?.[1] || "", /top:calc\(48px\+env\(safe-area-inset-top,0px\)\+var\(--hstop/);
});

test("no rule outside html.hs / html.hsfill mentions the new variables (desktop and a Safari tab unchanged)", () => {
  for (const [s, d] of rules) if (/--hs(gap|top|shift)/.test(d)) assert.match(s, /^html\.hs/, `${s} uses --hs*`);
});

/* ---- the readout proves it on his phone: one screenshot shows the numbers and which fit ran ---- */
const readout = fs.readFileSync(fileURLToPath(new URL("../calendar-readout.js", import.meta.url)), "utf8");

test("the readout shows the fit, the heights of html and body, and 100vh/dvh/lvh/svh in px", () => {
  for (const w of ["fit ", "gap ", "shift ", "html h ", "body h ", "100vh", "100dvh", "100lvh", "100svh", ".drop"]) assert.ok(readout.includes(w), `readout shows "${w}"`);
});

test("the readout carries his two switches: Fill (auto, on, off) and Top (close, clear)", () => {
  assert.match(readout, /id="readoutFill"/);
  assert.match(readout, /id="readoutTop"/);
  assert.match(readout, /H\.fit\.set\("fill"/);
  assert.match(readout, /H\.fit\.set\("top"/);
});
