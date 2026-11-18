// node --test still/test/calendar-phone-fixes.test.mjs
// Three phone faults (Junyan, 2026-11-12, scope "(not the desktop just mobile"):
// 1. "When I scroll up hard Sun 1 goes down butn ot the top bar": the day list (#view, class sc) bounced past its end on
//    iOS and carried the sticky day header with it. On a touch phone every scroller, and the page itself, has
//    overscroll-behavior:none, which stops the rubber band (iOS 16+). Desktop rules are untouched.
// 2. d20 ("20 yes"): the month picker's body class `month` also matched the month view's `.month{display:grid}` rule, so
//    one tap on the month name re-laid the whole page as a 7-column grid. The grid rule now names the div only.
// 3. The test app's readout box covered the lower half of the event sheet and swallowed its taps; the box now lets taps
//    through everywhere but its own two buttons (see calendar-readout.js and e2e/calendar-phone-taps.e2e.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const html = fs.readFileSync(fileURLToPath(new URL("../calendar.html", import.meta.url)), "utf8");
const readout = fs.readFileSync(fileURLToPath(new URL("../calendar-readout.js", import.meta.url)), "utf8");
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
/** Every rule in a CSS text, as [selector list, declarations], with @media blocks opened. */
const rules = (text) => [...text.replace(/@media[^{]*\{/g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim().replace(/^\/\*[\s\S]*?\*\/\s*/g, ""), m[2]]);
const touchBlocks = [...css.matchAll(/@media \(hover:none\) and \(pointer:coarse\)\{([\s\S]*?\})\}/g)].map((m) => m[1]).join("\n");
const outsideTouch = css.replace(/@media \(hover:none\) and \(pointer:coarse\)\{[\s\S]*?\}\}/g, "");
const has = (block, sel, decl) => rules(block).some(([s, d]) => s.split(",").map((x) => x.trim()).includes(sel) && d.replace(/\s/g, "").includes(decl));

test("touch phone: the page and every scroller never bounce past their ends", () => {
  for (const sel of ["html", "body", ".sc", ".sc.snap", ".pbody", ".left", ".page"])
    assert.ok(has(touchBlocks, sel, "overscroll-behavior:none"), `${sel} has overscroll-behavior:none on touch`);
});

test("desktop: no new overscroll rule outside the touch block (only the old sideways one on .sc.snap)", () => {
  const found = rules(outsideTouch).filter(([, d]) => /overscroll-behavior/.test(d)).map(([s, d]) => s + "{" + d.trim() + "}");
  assert.deepEqual(found, [".sc.snap{scroll-snap-type:x mandatory;scroll-padding-left:var(--gut);overscroll-behavior-x:contain}"]);
});

test("d20: the month view's grid rules never match the body (the picker's body.month class)", () => {
  const bare = rules(css).filter(([s]) => s.split(",").some((x) => /(^|[\s>+~])\.month\b(?![-\w])/.test(x.trim()) && !/^body/.test(x.trim())));
  assert.deepEqual(bare.map(([s]) => s), [], "a bare .month selector also matches <body class=month>");
  assert.ok(rules(css).some(([s, d]) => s === "div.month" && /grid-template-columns:repeat\(7/.test(d)), "the 7-column grid is on div.month");
});

test("the readout box lets taps through, except on its own buttons", () => {
  assert.match(readout, /#readout\{[^}]*pointer-events:none/);
  assert.match(readout, /#readout button\{[^}]*pointer-events:auto/);
});
