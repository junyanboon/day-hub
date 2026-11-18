// node --test still/test/calendar-top-gap.test.mjs
// Junyan, 2026-11-12, on the home screen app on his iPhone: "also the space above the header section is really large.
// Any way to fix that (if it' stoo cloes tot he top then it gets blurry as well)".
// The phone's own strip (clock, battery, camera pill) is the safe area at the top, about 62pt on his phone; the pill
// ends near 48pt. Then, with a screenshot of Notion Calendar on the same phone: "Here is what notion calendar looks
// lke". Notion's title text starts about 8pt under the strip, ours about 20pt, so ours comes up 12pt: the header bar
// drops its own 8px top padding when there is a strip, and tucks --tuck (4px) into the slack at the bottom of it. The fixed status strip
// (body::before) shrinks by the same --tuck so it never covers the header's top edge. A screen with no strip
// (desktop, a Safari tab) is unchanged, and the desktop rules are not touched at all.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const html = fs.readFileSync(fileURLToPath(new URL("../calendar.html", import.meta.url)), "utf8");
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const phoneStart = css.indexOf("@media (max-width:760px){");
const phone = css.slice(phoneStart, css.indexOf("\n}", phoneStart));
const outside = css.slice(0, phoneStart);
const decl = (block, sel, prop) => {
  const rule = [...block.matchAll(/(^|\n|\})\s*([^{}]+)\{([^{}]*)\}/g)].find((m) => m[2].trim() === sel);
  assert.ok(rule, `no ${sel} rule`);
  const d = rule[3].split(/;(?![^(]*\))/).map((s) => s.trim()).find((s) => s.startsWith(prop + ":"));
  assert.ok(d, `no ${prop} in ${sel}`);
  return d.slice(prop.length + 1).trim();
};
const tuck = () => { const m = /--tuck:(\d+)px/.exec(phone); assert.ok(m, "--tuck is set in the phone block"); return +m[1]; };
/** Work out a CSS length in px for a given top inset: env(), var(--tuck), calc(), min(), max(). */
const px = (expr, inset) => {
  const js = expr
    .replace(/env\(safe-area-inset-top,0px\)/g, String(inset))
    .replace(/var\(--tuck\)/g, String(tuck()))
    .replace(/(\d+(?:\.\d+)?)px/g, "$1")
    .replace(/calc\(/g, "(")
    .replace(/\bmax\(/g, "Math.max(")
    .replace(/\bmin\(/g, "Math.min(");
  assert.match(js, /^[\d\s.+\-*/(),Mathmaxin]+$/, `can work out ${expr}`);
  return Function(`return ${js}`)();
};
/** The first word of a shorthand, minding brackets: "calc(8px - x) 10px" gives "calc(8px - x)". */
const first = (v) => { let d = 0; for (let i = 0; i < v.length; i++) { if (v[i] === "(") d++; else if (v[i] === ")") d--; else if (v[i] === " " && !d) return v.slice(0, i); } return v; };
const barTop = (inset) => px(first(decl(phone, ".bar", "padding")), inset);
const appTop = (inset) => px(decl(phone, ".app", "padding-top"), inset);
const strip = (inset) => px(decl(phone, "body::before", "height"), inset);
const barMin = (inset) => px(decl(phone, ".bar", "min-height"), inset);
const popTop = (inset) => px(decl(phone, "body.month .left", "top"), inset);

test("on his phone (62pt strip) the header moves up 12pt, like Notion Calendar, and stays clear of the camera pill", () => {
  assert.equal(tuck(), 4);
  const before = 62 + 8, after = appTop(62) + barTop(62);
  assert.equal(after, 58);
  assert.equal(before - after, 12);
  assert.ok(appTop(62) >= 48, "the header starts below the camera pill");
  assert.equal(barMin(62), 44, "the bar's height shrinks with its padding, so centring does not push the row back down");
});

test("the status strip shrinks by the same tuck, so it ends where the header starts and never covers it", () => {
  for (const inset of [0, 20, 47, 59, 62]) assert.equal(strip(inset), appTop(inset), `inset ${inset}`);
});

test("the month popover sits under the header the same as before", () => {
  for (const inset of [0, 62]) assert.equal(popTop(inset) - (appTop(inset) + barMin(inset)), 4, `inset ${inset}`);
});

test("a screen with no strip (Safari tab, narrow window) looks exactly as before", () => {
  assert.equal(appTop(0), 0);
  assert.equal(strip(0), 0);
  assert.equal(barTop(0), 8);
  assert.equal(barMin(0), 52);
  assert.equal(popTop(0), 56);
});

test("desktop rules are untouched", () => {
  assert.ok(outside.includes('body::before{content:"";position:fixed;left:0;right:0;top:0;height:env(safe-area-inset-top,0px);'));
  assert.ok(outside.includes("height:100%;padding-top:env(safe-area-inset-top,0px);background:var(--bar)}"));
  assert.ok(outside.includes(".bar{display:flex;align-items:center;gap:8px;padding:12px 16px 10px 20px;"));
  assert.ok(!outside.includes("--tuck"));
});
