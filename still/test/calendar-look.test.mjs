// node --test still/test/calendar-look.test.mjs
// Junyan, 2026-11-11: "the colours are a bit confusing. Give me a complete colour and visual redesign to make it much
// more professional and exciting", and "the month and stuff fade out on the top edge so it needs to be clean".
// Then, the same day: "Can you give me three more colour schemes. Make it really inspirational for a dancer and
// business owner". Then, on the one light look, Studio Morning: "How about a dark version instead?", so it became
// Studio Evening, and a phone that saved Studio Morning opens in Studio Evening. So the page has four looks (calendar-core.js LOOKS): Ink (the default, the :root block) and three
// more, each one :root[data-look="..."] block of variables over it. Every look is checked here the same way:
// each block type a clearly different colour in the same family as Ink, the "now" accent never mistaken for a type,
// readable text on every event card, solid bars, and nothing but colours changed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "../calendar-core.js";
const C = globalThis.CalCore;

const html = fs.readFileSync(fileURLToPath(new URL("../calendar.html", import.meta.url)), "utf8");
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const head = html.slice(0, html.indexOf("</head>"));
const varsOf = (body) => Object.fromEntries([...body.matchAll(/--([\w-]+):([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const base = varsOf(css.match(/:root\{([\s\S]*?)\}/)[1]);
const blockOf = (id) => { const m = css.match(new RegExp(`:root\\[data-look="${id}"\\]\\{([^}]*)\\}`)); return m && m[1]; };
const LOOKS = C.LOOKS.map((l) => l.id);
/** The variables a look ends up with: Ink's, with its own block on top. */
const varsFor = (id) => (id === "ink" ? base : { ...base, ...varsOf(blockOf(id) || "") });
const resolver = (vars) => (v) => { let x = v; for (let i = 0; i < 6; i++) { const m = /^var\(--([\w-]+)\)$/.exec(x); if (!m) break; x = vars[m[1]]; } return x; };
const hex = (h) => { const n = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)); };
/** color-mix(in srgb, a p, b): plain sRGB mixing, as the browser does it. */
const mix = (a, p, b) => a.map((x, i) => x * p + b[i] * (1 - p));
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function lab(rgb) {
  const [r, g, b] = rgb.map(lin), f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
/** How different two colours look (CIEDE2000). About 2 is just visible; Ink's two closest block types are 12 apart. */
function deltaE(c1, c2) {
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2), rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2, Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hue = (y, x) => { const v = Math.atan2(y, x) / rad; return v < 0 ? v + 360 : v; }, hp1 = hue(b1, ap1), hp2 = hue(b2, ap2);
  let dh = hp2 - hp1; if (Cp1 * Cp2 === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dL = L2 - L1, dC = Cp2 - Cp1, dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh * rad / 2), Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2; if (Cp1 * Cp2 !== 0) { if (Math.abs(hp1 - hp2) > 180) hb += hp1 + hp2 < 360 ? 360 : -360; hb /= 2; }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const SL = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cpb, SH = 1 + 0.015 * Cpb * T;
  const RT = -2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const hueChroma = (rgb) => { const [, a, b] = lab(rgb); return [(Math.atan2(b, a) * 180 / Math.PI + 360) % 360, Math.hypot(a, b)]; };
const kinds = C.KINDS.map(([k]) => k);
const pctOf = (vars, name) => { const v = resolver(vars)(vars[name]); assert.match(v, /^\d+%$/, `--${name}`); return parseFloat(v) / 100; };
const colour = (vars, name) => { const v = resolver(vars)(vars[name]); assert.match(v, /^#[0-9a-f]{6}$/i, `--${name} = ${v}`); return hex(v); };

test("the looks: Ink first and the default, then Stage Lights, Studio Evening and Velvet & Brass", () => {
  assert.deepEqual(C.LOOKS.map((l) => l.name), ["Ink", "Stage Lights", "Studio Evening", "Velvet & Brass"]);
  assert.equal(C.lookId(null), "ink"); assert.equal(C.lookId("nonsense"), "ink"); assert.equal(C.lookId("stage"), "stage");
  for (const id of LOOKS.slice(1)) assert.ok(blockOf(id), `no :root[data-look="${id}"] block`);
});

test("a phone that saved Studio Morning opens in Studio Evening, not Ink", () => {
  assert.equal(C.lookId("morning"), "evening");
  assert.equal(C.lookId("evening"), "evening");
  assert.ok(!C.LOOKS.some((l) => l.id === "morning" || /Morning/.test(l.name)), "Studio Morning is no longer offered");
  assert.ok(!blockOf("morning"), "no Studio Morning block left in the CSS");
});

test("a look changes colours only: its block holds nothing but variables, and no look adds a rule of its own", () => {
  for (const id of LOOKS.slice(1)) {
    const body = blockOf(id).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    for (const decl of body.split(";").map((s) => s.trim()).filter(Boolean)) assert.match(decl, /^(--[\w-]+|color-scheme):/, `${id}: ${decl}`);
    for (const k of Object.keys(varsOf(body))) assert.ok(k in base, `${id} sets --${k}, which Ink does not have`);
  }
  const rules = [...css.matchAll(/([^{}]*data-look[^{}]*)\{([^}]*)\}/g)].map((m) => [m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(), m[2]]);
  const extra = rules.filter(([sel]) => !/^:root\[data-look="\w+"\]$/.test(sel));
  assert.deepEqual(extra.map(([s]) => s), [], "a look adds a rule beyond its variables");
});

test("no colour is written outside the look variables (black shadows aside)", () => {
  const rules = css.replace(/:root(\[data-look="\w+"\])?\{[^}]*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.deepEqual(rules.match(/#[0-9a-f]{3,8}\b/gi) || [], [], "a hex colour in a rule");
  assert.doesNotMatch(rules, /rgba?\(\s*255/, "a white rgba in a rule");
  assert.doesNotMatch(rules, /(?<![-\w])white(?![-\w])/);
  const script = html.slice(html.indexOf("<script>", html.indexOf("</style>")));
  assert.doesNotMatch(script, /rgba\(255/, "the page script draws a fixed white");
});

for (const id of ["ink", "stage", "evening", "velvet"]) {
  const vars = varsFor(id), R = resolver(vars);
  test(`${id}: every block type takes a palette colour, all clearly different, each in its Ink colour family`, () => {
    const inkC = Object.fromEntries(kinds.map((k) => [k, colour(base, "k-" + k)]));
    const cs = kinds.map((k) => { assert.match(vars["k-" + k], /^var\(--[a-z]+\)$/, `--k-${k} should name a palette colour`); return colour(vars, "k-" + k); });
    for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
      const d = deltaE(cs[i], cs[j]);
      assert.ok(d >= 10, `${kinds[i]} and ${kinds[j]} are too alike (deltaE ${d.toFixed(1)})`);
    }
    for (const [i, k] of kinds.entries()) {
      const [h0, c0] = hueChroma(inkC[k]), [h, c] = hueChroma(cs[i]);
      if (c0 < 20) { assert.ok(c < 30, `${k} should stay a quiet grey-ish colour (chroma ${c.toFixed(0)})`); continue; }
      let dh = Math.abs(h - h0); if (dh > 180) dh = 360 - dh;
      assert.ok(dh <= 30, `${k} left its Ink colour family (hue moved ${dh.toFixed(0)} degrees)`);
    }
  });

  test(`${id}: the now accent can never be mistaken for a block type`, () => {
    const now = colour(vars, "now");
    assert.equal(R(vars.accent), R(vars.now), "--accent and --now are one colour");
    for (const k of kinds) {
      const d = deltaE(now, colour(vars, "k-" + k));
      assert.ok(d >= 15, `--k-${k} is too close to the now colour (deltaE ${d.toFixed(1)})`);
    }
    const onAcc = colour(vars, "on-accent");
    assert.ok(contrast(onAcc, now) >= 3, `text on the accent ${contrast(onAcc, now).toFixed(2)}:1`);
    const todayText = colour(vars, "accent-ink"), todayBg = mix(now, 0.12, colour(vars, "bar"));
    assert.ok(contrast(todayText, todayBg) >= 4.5, `Today button ${contrast(todayText, todayBg).toFixed(2)}:1`);
  });

  test(`${id}: titles read at 4.5:1 or better on every card, pill and month chip, and so do the times`, () => {
    const bg = colour(vars, "bg"), bar = colour(vars, "bar");
    const fill = pctOf(vars, "ev-fill"), pill = pctOf(vars, "pill-fill"), tp = pctOf(vars, "ev-title"), sp = pctOf(vars, "ev-time-p");
    const titleOn = colour(vars, "ev-ink"), timeOn = colour(vars, "ev-time");
    for (const k of kinds) {
      const c = colour(vars, "k-" + k), title = mix(c, tp, titleOn), time = mix(c, sp, timeOn);
      for (const [where, bgc, ink] of [["card", mix(c, fill, bg), title], ["card time", mix(c, fill, bg), time], ["all-day pill", mix(c, pill, bar), title], ["month chip", mix(c, pill, bg), title]]) {
        assert.ok(contrast(ink, bgc) >= 4.5, `${k} ${where}: ${contrast(ink, bgc).toFixed(2)}:1`);
      }
      assert.ok(contrast(c, bg) >= 3, `${k}: its colour bar ${contrast(c, bg).toFixed(2)}:1 on the background`);
    }
    for (const t of ["ink", "soft"]) assert.ok(contrast(colour(vars, t), bg) >= 4.5, `--${t} on the background`);
    assert.ok(contrast(colour(vars, "faint"), bar) >= 3.9, "--faint on the bar");
  });

  test(`${id}: bars are opaque and the swatch, theme colour and CSS agree`, () => {
    const L = C.LOOKS.find((l) => l.id === id);
    assert.match(R(vars.bar), /^#[0-9a-f]{6}$/i, "--bar is opaque");
    assert.equal(L.theme.toLowerCase(), R(vars.bar).toLowerCase(), "theme-color is the header bar");
    assert.equal(L.bg.toLowerCase(), R(vars.bg).toLowerCase(), "swatch background");
    assert.equal(L.accent.toLowerCase(), R(vars.now).toLowerCase(), "swatch accent");
    const scheme = id === "ink" ? /color-scheme:(\w+)\}?\s*$/.exec(css.match(/:root\{([\s\S]*?)\}/)[1])[1] : (/color-scheme:(\w+)/.exec(blockOf(id)) || [0, "dark"])[1];
    assert.equal(L.scheme, scheme, "light or dark, for the form controls and the meta tag");
  });
}

test("the top and bottom bars are solid: no blur, no see-through backgrounds, no sky gradient", () => {
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.doesNotMatch(css, /--sky|background-attachment:fixed/);
  for (const sel of [".bar{", ".dhead{", ".corner{"]) {
    const body = css.slice(css.indexOf(sel)).split("}")[0];
    assert.match(body, /background:var\(--bar\)/, `${sel} background`);
  }
  assert.match(css, /\.drop\{[^}]*background:var\(--bar\)/, "the New task bar on a phone");
});

test("the saved look is put on before the page is drawn, with its theme colour, and Ink stays the plain page", () => {
  const style = head.indexOf("<style>"), core = head.indexOf('<script src="calendar-core.js'), apply = head.indexOf("cal-look");
  assert.ok(core > 0 && core < style, "calendar-core.js loads in the head, before the styles");
  assert.ok(apply > core && apply < style, "the saved look is read in the head");
  assert.match(head.slice(core, style), /dataset\.look/);
  assert.match(head.slice(core, style), /theme-color/);
  assert.doesNotMatch(html.slice(html.indexOf("</head>")), /<script src="calendar-core\.js/, "loaded once");
  assert.match(head, /<meta name="theme-color" content="#14171e">/, "Ink's theme colour is still the default");
});

test("every look is dark now, so the light-only pieces are gone: no status-bar strip, no --status, no light scheme", () => {
  assert.ok(C.LOOKS.every((l) => l.scheme === "dark"));
  assert.doesNotMatch(css, /body::before/);
  assert.doesNotMatch(css, /--status/);
  assert.doesNotMatch(css, /color-scheme:light/);
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/, "the iPhone clock stays white over the dark header");
});

test("Studio Evening is a warm brown, clearly apart from Ink (blue-black), Stage Lights (plum) and Velvet & Brass (emerald)", () => {
  const ev = varsFor("evening");
  for (const t of ["bg", "bar"]) {
    const [h, c] = hueChroma(colour(ev, t));
    assert.ok(h >= 40 && h <= 90 && c >= 2.5, `--${t} is a warm brown (hue ${h.toFixed(0)}, chroma ${c.toFixed(1)})`);
    for (const id of ["ink", "stage", "velvet"]) {
      const d = deltaE(colour(ev, t), colour(varsFor(id), t));
      assert.ok(d >= 5, `--${t} is too close to ${id} (deltaE ${d.toFixed(1)})`);
    }
  }
  const [h] = hueChroma(colour(ev, "now"));
  assert.ok(h >= 25 && h <= 55, `"now" is a coral (hue ${h.toFixed(0)})`);
});

test("the Look row: one swatch per look in the menu sheet, and a tap saves it on this device", () => {
  assert.match(html, /<p class="lbl"[^>]*>Look<\/p>/);
  assert.match(html, /button\[data-look\]/, "the click handler picks up a swatch tap");
  assert.match(html, /store\.set\("cal-look"/);
});
