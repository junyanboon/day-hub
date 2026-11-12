// node --test still/test/calendar-look.test.mjs
// Junyan, 2026-11-11: "the colours are a bit confusing. Give me a complete colour and visual redesign to make it much
// more professional and exciting", and "the month and stuff fade out on the top edge so it needs to be clean".
// Then, the same day: "Can you give me three more colour schemes. Make it really inspirational for a dancer and
// business owner". Then, on the one light look, Studio Morning: "How about a dark version instead?" (Studio Evening).
// Then, with a screenshot of Studio Morning and a picture of a charcoal header reading "November 2026": "Let's go wtih
// the calendar mode with the night mode for when it's night".
// So the page has four looks (calendar-core.js LOOKS): Studio (the default; its day half is Studio Morning and its
// night half a neutral charcoal, picked by the sun), Ink (the plain :root block), Stage Lights and Velvet & Brass,
// each face one :root[data-look="..."] block of variables over Ink's. Every face is checked here the same way: each
// block type a clearly different colour in the same family as Ink, the "now" accent never mistaken for a type,
// readable text on every event card (past ones too), solid bars, and nothing but colours changed.
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


/** Every face the page can wear: Ink (the plain :root), the other looks, and the two halves of Studio. Each face has
    the swatch / theme-color data from LOOKS. */
const FACES = C.LOOKS.flatMap((l) => (l.day ? [[l.day.face, l.day], [l.night.face, l.night]] : [[l.id, l]]));
const faceIds = FACES.map(([f]) => f);
const dataOf = (id) => FACES.find(([f]) => f === id)[1];
const rgbaOf = (s) => { const m = /^rgba?\(([^)]*)\)$/.exec(s); assert.ok(m, s); const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p.slice(0, 3), p[3] ?? 1]; };
const at = (iso) => Date.parse(iso);
const TOR = "America/Toronto";

test("the looks: Studio first and the default, then Ink, Stage Lights and Velvet & Brass", () => {
  assert.deepEqual(C.LOOKS.map((l) => l.name), ["Studio", "Ink", "Stage Lights", "Velvet & Brass"]);
  assert.equal(C.lookId(null), "studio"); assert.equal(C.lookId("nonsense"), "studio");
  for (const id of ["ink", "stage", "velvet", "studio"]) assert.equal(C.lookId(id), id);
  assert.deepEqual(faceIds, ["studio-day", "studio-night", "ink", "stage", "velvet"]);
  for (const id of faceIds.filter((f) => f !== "ink")) assert.ok(blockOf(id), `no :root[data-look="${id}"] block`);
});

test("a saved Studio Morning or Studio Evening opens in Studio; Studio Evening is gone", () => {
  assert.equal(C.lookId("morning"), "studio");
  assert.equal(C.lookId("evening"), "studio");
  assert.ok(!C.LOOKS.some((l) => /Evening|Morning/.test(l.name)), "no Studio Evening or Studio Morning in the Look row");
  assert.ok(!blockOf("evening") && !blockOf("morning"), "no old blocks left in the CSS");
  assert.doesNotMatch(html, /Studio Evening/);
});

test("once on every device, the look saved while trying them is forgotten, so it opens in Studio; taps after that stick", () => {
  const box = (init) => { const m = new Map(Object.entries(init)); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  for (const old of ["stage", "velvet", "evening", "morning", "ink", null]) {
    const s = box(old ? { "cal-look": old } : {});
    assert.equal(C.startLook(s), "studio", `saved ${old}`);
    assert.equal(s.getItem("cal-look"), null);
    assert.equal(s.getItem("cal-look-reset"), C.LOOK_RESET);
    s.setItem("cal-look", "velvet");
    assert.equal(C.startLook(s), "velvet", "his tap after the reset is kept");
    assert.equal(C.startLook(s), "velvet", "and kept on every load after");
  }
  const page = html.slice(html.indexOf("</head>"));
  assert.match(page, /store\.set\("cal-look", S\.look\)/, "a tap saves the look, Ink and Studio included");
  assert.match(head, /CalCore\.startLook\(localStorage\)/, "the reset runs in the head, before the first paint");
});

test("a look changes colours only: its block holds nothing but variables, and no look adds a rule of its own", () => {
  for (const id of faceIds.filter((f) => f !== "ink")) {
    const body = blockOf(id).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    for (const decl of body.split(";").map((s) => s.trim()).filter(Boolean)) assert.match(decl, /^(--[\w-]+|color-scheme):/, `${id}: ${decl}`);
    for (const k of Object.keys(varsOf(body))) assert.ok(k in base, `${id} sets --${k}, which Ink does not have`);
  }
  const rules = [...css.matchAll(/([^{}]*data-look[^{}]*)\{([^}]*)\}/g)].map((m) => [m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(), m[2]]);
  const extra = rules.filter(([sel]) => !/^:root\[data-look="[\w-]+"\]$/.test(sel));
  assert.deepEqual(extra.map(([s]) => s), [], "a look adds a rule beyond its variables");
});

test("no colour is written outside the look variables (black shadows aside)", () => {
  const rules = css.replace(/:root(\[data-look="[\w-]+"\])?\{[^}]*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.deepEqual(rules.match(/#[0-9a-f]{3,8}\b/gi) || [], [], "a hex colour in a rule");
  assert.doesNotMatch(rules, /rgba?\(\s*255/, "a white rgba in a rule");
  assert.doesNotMatch(rules, /(?<![-\w])white(?![-\w])/);
  const script = html.slice(html.indexOf("<script>", html.indexOf("</style>")));
  assert.doesNotMatch(script, /rgba\(255/, "the page script draws a fixed white");
});

test("big shadows and the pop-up dimmer go through --lift, so the light look can soften them", () => {
  const rules = css.replace(/:root(\[data-look="[\w-]+"\])?\{[^}]*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(rules, /rgba?\(0[ ,]+0[ ,]+0/, "a fixed black shadow in a rule");
  for (const sel of [".ev.on{", ".modal{", "box-shadow:-20px"]) assert.match(css.slice(css.indexOf(sel)).split("}")[0], /var\(--lift\) calc\(\d+% \* var\(--lift-k\)\)/, sel);
  const day = varsFor("studio-day");
  assert.ok(parseFloat(day["lift-k"]) <= 0.5, "the cream look's shadows are at most half as strong");
  assert.notEqual(day.lift, "#000000", "and warm, not black");
  for (const id of ["ink", "stage", "velvet", "studio-night"]) assert.equal(varsFor(id)["lift-k"], "1", `${id} keeps its shadows`);
});

for (const id of faceIds) {
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

  test(`${id}: the now accent can never be mistaken for a block type (Studio On-Site and Dance included)`, () => {
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

  test(`${id}: an event that is over is paler but its title still reads at 4.5:1 or better`, () => {
    const bg = colour(vars, "bg"), fill = pctOf(vars, "dim-fill"), tp = pctOf(vars, "dim-title"), ink = colour(vars, "dim-ink");
    assert.ok(fill < pctOf(vars, "ev-fill"), "the card is paler than a coming one");
    for (const k of kinds) {
      const c = colour(vars, "k-" + k), card = mix(c, fill, bg), title = mix(c, tp, ink);
      assert.ok(contrast(title, card) >= 4.5, `${k} done: ${contrast(title, card).toFixed(2)}:1`);
      // the same card under the pointer (4% more colour), and its time line in --dim-time
      const hover = mix(c, fill + 0.04, bg), time = colour(vars, "dim-time");
      assert.ok(contrast(title, hover) >= 4.5, `${k} done, hovered: ${contrast(title, hover).toFixed(2)}:1`);
      assert.ok(contrast(time, hover) >= 4.5, `${k} done, its time: ${contrast(time, hover).toFixed(2)}:1`);
    }
  });

  test(`${id}: bars are opaque and the swatch, theme colour and CSS agree`, () => {
    const L = dataOf(id);
    assert.match(R(vars.bar), /^#[0-9a-f]{6}$/i, "--bar is opaque");
    assert.equal(L.theme.toLowerCase(), R(vars.bar).toLowerCase(), "theme-color is the header bar");
    assert.equal(L.bg.toLowerCase(), R(vars.bg).toLowerCase(), "swatch background");
    assert.equal(L.accent.toLowerCase(), R(vars.now).toLowerCase(), "swatch accent");
    assert.equal(L.ink.toLowerCase(), R(vars.ink).toLowerCase(), "swatch ink");
    const scheme = id === "ink" ? /color-scheme:(\w+)\}?\s*$/.exec(css.match(/:root\{([\s\S]*?)\}/)[1])[1] : (/color-scheme:(\w+)/.exec(blockOf(id)) || [0, "dark"])[1];
    assert.equal(L.scheme, scheme, "light or dark, for the form controls and the meta tag");
  });

  test(`${id}: the strip behind the iPhone clock is dark enough for its white text, or not there at all`, () => {
    const st = R(vars.status);
    if (st === "transparent") return;
    assert.ok(contrast([255, 255, 255], colour(vars, "status")) >= 7, "white clock text on the strip");
  });
}

test("the past-event rule dims by colour, never by see-through", () => {
  const rules = css.replace(/:root(\[data-look="[\w-]+"\])?\{[^}]*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(rules, /\.ev\.done\{[^}]*opacity/);
  assert.doesNotMatch(rules, /\.day\.past \.ev[,{][^}]*opacity/);
  assert.match(rules, /\.ev\.done:not\(\.ghost\),\.day\.past \.ev:not\(\.ghost\)\{background:color-mix\(in srgb,var\(--c\) var\(--dim-fill\),var\(--bg\)\);color:color-mix\(in srgb,var\(--c\) var\(--dim-title\),var\(--dim-ink\)\)\}/);
});

test("the top and bottom bars are solid: no blur, no see-through backgrounds, no sky gradient", () => {
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.doesNotMatch(css, /--sky|background-attachment:fixed/);
  for (const sel of [".bar{", ".dhead{", ".corner{"]) {
    const body = css.slice(css.indexOf(sel)).split("}")[0];
    assert.match(body, /background:var\(--bar\)/, `${sel} background`);
  }
});

test("a phone has no New task bar at the bottom; the computer keeps its box (Junyan, 2026-11-12, d1)", () => {
  const phone = css.slice(css.indexOf("@media (max-width:760px){"));
  assert.match(phone.slice(0, phone.indexOf("\n}")), /\.drop\{display:none\}/, "hidden on a phone");
  assert.match(css, /\.drop\{position:fixed;left:calc\(var\(--rail\) \+ 14px\)/, "the computer's box stays bottom left");
  assert.match(phone, /\.sc\{padding-bottom:env\(safe-area-inset-bottom,0px\)\}/, "the hours no longer leave room for the bar");
});

test("the look is put on before the page is drawn, with its theme colour", () => {
  const style = head.indexOf("<style>"), core = head.indexOf('<script src="calendar-core.js'), apply = head.indexOf("startLook");
  assert.ok(core > 0 && core < style, "calendar-core.js loads in the head, before the styles");
  assert.ok(apply > core && apply < style, "the saved look is read in the head");
  const s = head.slice(core, style);
  assert.match(s, /lookFace\(id, Date\.now\(\), tz\)/);
  assert.match(s, /dataset\.look/);
  assert.match(s, /theme-color/);
  assert.match(s, /localStorage\.getItem\("cal-tz"\)/, "the calendar's own time zone picks the city");
  assert.doesNotMatch(html.slice(html.indexOf("</head>")), /<script src="calendar-core\.js/, "loaded once");
  const v = /calendar-core\.js\?v=(\d+)"/.exec(head);
  assert.ok(v && +v[1] >= 9, "the stamp moved on, so a phone does not keep the old core");
});

test("Studio's night half is a neutral charcoal like his picture, with the same coral family as the day half", () => {
  const n = varsFor("studio-night"), d = varsFor("studio-day");
  for (const t of ["bg", "bar", "raise", "ink", "soft"]) { const [, c] = hueChroma(colour(n, t)); assert.ok(c < 1.5, `--${t} has no tint (chroma ${c.toFixed(1)})`); }
  assert.ok(deltaE(colour(n, "bg"), hex("#1c1c1c")) < 3, "page about #1c1c1c");
  assert.ok(deltaE(colour(n, "ink"), hex("#e6e6e6")) < 3, "text about #e6e6e6");
  const [lb] = lab(colour(n, "bg")), [lbar] = lab(colour(n, "bar"));
  assert.ok(lbar - lb >= 2 && lbar - lb <= 8, `the header and bottom bar a touch lifted (L ${lb.toFixed(1)} to ${lbar.toFixed(1)})`);
  const [hd] = hueChroma(colour(d, "now")), [hn] = hueChroma(colour(n, "now"));
  assert.ok(Math.abs(hd - hn) <= 15, `one coral family (hue ${hd.toFixed(0)} by day, ${hn.toFixed(0)} by night)`);
  assert.ok(lab(colour(n, "now"))[0] > lab(colour(d, "now"))[0] + 10, "brighter at night");
  for (const id of ["ink", "stage", "velvet"]) assert.ok(deltaE(colour(n, "bg"), colour(varsFor(id), "bg")) >= 4, `night apart from ${id}`);
});

test("Studio's day half is Studio Morning exactly as PR 125 shipped it", () => {
  const was = { amber: "#9a7d00", orange: "#a35a0a", lime: "#4f9418", emerald: "#14946a", cyan: "#0e8fa3", blue: "#2563c8", indigo: "#6358d0",
    purple: "#9a46c8", pink: "#c7317f", slate: "#5f6f86", sand: "#a1865a", stone: "#857d77", red: "#c42b3c", bg: "#faf6ef", bar: "#fffdf9",
    raise: "#f4eee4", raise2: "#e8dfd1", ink: "#1f1b16", soft: "#5e554a", faint: "#736a5e", now: "#d24a22", "on-accent": "#ffffff",
    "accent-ink": "#b23a17", "ev-fill": "14%", "pill-fill": "16%", "ev-title": "50%", "ev-ink": "#1f1b16", "ev-time": "#4a4239", status: "#1f1b16" };
  const d = varsFor("studio-day");
  for (const [k, v] of Object.entries(was)) assert.equal(resolver(d)(d[k]), v, `--${k}`);
});

test("Studio follows the sun in Toronto: summer and winter, just before and just after sunrise and sunset", () => {
  const fmt = (ms) => new Date(ms).toLocaleTimeString("en-CA", { timeZone: TOR, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  // Published times for Toronto (NRC sunrise/sunset tables), to within 3 minutes.
  const near = (ms, hhmm) => { const [h, m] = fmt(ms).split(":").map(Number), [H, M] = hhmm.split(":").map(Number); return Math.abs(h * 60 + m - (H * 60 + M)) <= 3; };
  for (const [day, rise, set] of [["2026-06-21", "05:36", "21:03"], ["2026-12-21", "07:48", "16:43"], ["2026-11-11", "07:05", "16:56"]]) {
    const s = C.sunTimes(day, C.placeOf(TOR));
    assert.ok(near(s.rise, rise), `${day} sunrise ${fmt(s.rise)}, about ${rise}`);
    assert.ok(near(s.set, set), `${day} sunset ${fmt(s.set)}, about ${set}`);
    const M = 60000;
    assert.equal(C.sunHalf(s.rise - M, TOR), "night", `${day} a minute before sunrise`);
    assert.equal(C.sunHalf(s.rise + M, TOR), "day", `${day} a minute after sunrise`);
    assert.equal(C.sunHalf(s.set - M, TOR), "day", `${day} a minute before sunset`);
    assert.equal(C.sunHalf(s.set + M, TOR), "night", `${day} a minute after sunset`);
  }
  assert.equal(C.sunHalf(at("2026-07-01T04:00:00Z"), TOR), "night", "midnight in summer");
  assert.equal(C.sunHalf(at("2026-01-15T17:00:00Z"), TOR), "day", "noon in winter");
  assert.equal(C.sunHalf(at("2026-06-21T21:00:00-04:00"), TOR), "day", "9 pm on the longest day is still light");
  assert.equal(C.sunHalf(at("2026-12-21T17:00:00-05:00"), TOR), "night", "5 pm on the shortest day is dark");
});

test("the city comes from the calendar's time zone, Toronto when unknown; the same instant can be day in one and night in another", () => {
  assert.deepEqual(C.placeOf("Somewhere/Else"), C.placeOf(TOR));
  assert.deepEqual(C.placeOf("UTC"), C.placeOf(TOR));
  const t = at("2026-11-11T15:00:00Z"); // 10 am in Toronto, 3 pm in London, midnight in Tokyo
  assert.equal(C.sunHalf(t, "Europe/London"), "day");
  assert.equal(C.sunHalf(t, "Asia/Tokyo"), "night");
  assert.equal(C.sunHalf(t, TOR), "day");
});

test("lookFace: Studio wears its day or night half, the others always the same face, Ink the plain page", () => {
  const noon = at("2026-11-11T12:00:00-05:00"), late = at("2026-11-11T22:00:00-05:00");
  assert.deepEqual(C.lookFace("studio", noon, TOR), { face: "studio-day", theme: "#fffdf9", scheme: "light" });
  assert.deepEqual(C.lookFace("studio", late, TOR), { face: "studio-night", theme: "#262626", scheme: "dark" });
  assert.deepEqual(C.lookFace(null, late, TOR), C.lookFace("studio", late, TOR), "no saved look is Studio");
  assert.deepEqual(C.lookFace("evening", noon, TOR), C.lookFace("studio", noon, TOR));
  for (const t of [noon, late]) {
    assert.deepEqual(C.lookFace("ink", t, TOR), { face: null, theme: "#14171e", scheme: "dark" });
    assert.equal(C.lookFace("stage", t, TOR).face, "stage");
    assert.equal(C.lookFace("velvet", t, TOR).face, "velvet");
  }
});

test("the page flips Studio by itself: on its 30 s timer, when it comes back into view, and on a time zone change", () => {
  const page = html.slice(html.indexOf("</head>"));
  assert.match(page, /setInterval\(\(\) => \{ showLook\(\);/);
  assert.match(page, /visibilitychange", \(\) => \{ if \(!document\.hidden\) showLook\(\); \}/);
  assert.match(page, /t\.id === "tz1"\) \{[^\n]*showLook\(\)/);
  assert.match(page, /function showLook\(\) \{\n  const f = C\.lookFace\(S\.look, Date\.now\(\), S\.tz\)/);
});

test("the Look row: Studio first with a split cream and charcoal swatch, one swatch per look, and a tap saves it", () => {
  assert.match(html, /<p class="lbl"[^>]*>Look<\/p>/);
  assert.match(html, /button\[data-look\]/, "the click handler picks up a swatch tap");
  assert.match(html, /lk-chip \$\{l\.day \? "split" : ""\}/);
  assert.match(css, /\.lk-chip\.split\{[^}]*var\(--lk-bg2\)/);
});

test("the title: month bold and the year light where there is room; a phone shows the month alone", () => {
  assert.match(html, /\$\("#title"\)\.innerHTML = `\$\{MON\[mo - 1\]\} <span>\$\{y\}<\/span>`/);
  assert.match(css, /\.bar h1\{[^}]*font-weight:700/);
  assert.match(css, /\.bar h1 span\{font-weight:300;color:var\(--ink\)\}/);
  const phone = css.slice(css.indexOf("@media (max-width:760px)"));
  assert.match(phone, /\.bar h1 span,\.status\{display:none\}/);
});
