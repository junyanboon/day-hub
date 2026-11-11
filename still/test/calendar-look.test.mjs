// node --test still/test/calendar-look.test.mjs
// Junyan, 2026-11-11: "the colours are a bit confusing. Give me a complete colour and visual redesign to make it much
// more professional and exciting", and "the month and stuff fade out on the top edge so it needs to be clean".
// The look rules that can be checked without a browser: one named palette, each block type a different colour,
// readable text on every event card, and no see-through header.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "../calendar-core.js";
const C = globalThis.CalCore;

const html = fs.readFileSync(fileURLToPath(new URL("../calendar.html", import.meta.url)), "utf8");
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const root = css.match(/:root\{([\s\S]*?)\}/)[1];
const vars = Object.fromEntries([...root.matchAll(/--([\w-]+):([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const resolve = (v) => { let x = v; for (let i = 0; i < 5; i++) { const m = /^var\(--([\w-]+)\)$/.exec(x); if (!m) break; x = vars[m[1]]; } return x; };
const hex = (h) => { const n = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)); };
/** color-mix(in srgb, a p%, b): plain sRGB mixing, as the browser does it. */
const mix = (a, p, b) => a.map((x, i) => x * p + b[i] * (1 - p));
const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** The percentage in a rule's color-mix(in srgb,var(--c) N%,<other>). */
const pct = (rule, prop) => {
  const body = css.match(new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}"))[1];
  const m = body.match(new RegExp(prop + ":color-mix\\(in srgb,var\\(--c\\) (\\d+)%,([^)]+?)\\)"));
  return [+m[1] / 100, m[2]];
};
const kinds = C.KINDS.map(([k]) => k);

test("every block type takes its colour from the one named palette, and no two types share a colour", () => {
  const colours = kinds.map((k) => vars["k-" + k]);
  for (const [i, c] of colours.entries()) assert.match(c, /^var\(--[a-z]+\)$/, `--k-${kinds[i]} should name a palette colour, not a raw value`);
  assert.equal(new Set(colours).size, kinds.length, "two block types share a colour");
  for (const c of colours) assert.match(resolve(c), /^#[0-9a-f]{6}$/i);
});

test("the now accent is not also a block type's colour", () => {
  const now = resolve(vars.now);
  for (const k of kinds) assert.notEqual(resolve(vars["k-" + k]).toLowerCase(), now.toLowerCase(), `--k-${k} is the now colour`);
});

test("event titles read at 4.5:1 or better on their card, and so do the times", () => {
  const bg = hex(resolve(vars.bg));
  const [fillP] = pct(".ev", "background");
  const [titleP, titleOn] = pct(".ev", "color");
  const smallBody = css.match(/\.ev small\{([^}]*)\}/)[1], sm = smallBody.match(/color:color-mix\(in srgb,var\(--c\) (\d+)%,(#[0-9a-f]{6})\)/i);
  for (const k of kinds) {
    const c = hex(resolve(vars["k-" + k])), card = mix(c, fillP, bg);
    const title = mix(c, titleP, hex(titleOn === "#fff" ? "#ffffff" : titleOn)), time = mix(c, +sm[1] / 100, hex(sm[2]));
    assert.ok(contrast(title, card) >= 4.5, `${k}: title ${contrast(title, card).toFixed(2)}:1`);
    assert.ok(contrast(time, card) >= 4.5, `${k}: time ${contrast(time, card).toFixed(2)}:1`);
    assert.ok(contrast(c, bg) >= 3, `${k}: its colour bar ${contrast(c, bg).toFixed(2)}:1 on the background`);
  }
});

test("the top and bottom bars are solid: no blur, no see-through backgrounds, no sky gradient", () => {
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.doesNotMatch(css, /--sky|background-attachment:fixed/);
  for (const sel of [".bar{", ".dhead{", ".corner{"]) {
    const body = css.slice(css.indexOf(sel)).split("}")[0];
    assert.match(body, /background:var\(--bar\)/, `${sel} background`);
  }
  assert.match(resolve(vars.bar), /^#[0-9a-f]{6}$/i, "--bar is opaque");
  assert.match(css, /\.drop\{[^}]*background:var\(--bar\)/, "the New task bar on a phone");
});
