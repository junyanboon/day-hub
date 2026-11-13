// The iPhone home screen app's fit (2026-11-12, BUILD 2026-11-12g; still/test/calendar-homescreen-fit.test.mjs).
// Chrome cannot reproduce the iOS 26 short page (WebKit bug 301994): it never lays a page out shorter than its window.
// What this proves is the page's side only: a plain phone tab and a desktop get no new class and no new geometry;
// a page that reports standalone with the iPhone's numbers (window 402x812, screen 402x874, top inset 62, bottom 34)
// gets html.hs and html.hsfill, the page grows by 62, the bottom-pinned boxes (the toast stands in: a phone has no
// "+ New task" bar since 2026-11-12j) keep their place above the screen's bottom edge, the
// header starts below the blur (clear, the default since d23) or right under the strip (close), and the readout's
// switches flip them.
// Whether iOS paints the stretched part is for the phone to show.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-homescreen.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8806), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
// PIN: the hidden toast's box ends 52 above the screen's bottom (its own 18 + the 34 home bar inset), plus the 20 it
// is pushed down while hidden: 874 - 52 + 20. Any bottom-pinned box off by the shift would show here.
const PIN = 874 - 18 - 34 + 20;
const geo = (page) => page.evaluate(() => {
  const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
  return { cls: [...document.documentElement.classList].filter((c) => /^hs/.test(c)).join(" "), gap: document.documentElement.style.getPropertyValue("--hsgap"),
    shift: document.documentElement.style.getPropertyValue("--hsshift"), inner: innerHeight, toast: (() => { const t = document.querySelector(".toast"); return t ? Math.round(parseFloat(getComputedStyle(t).bottom)) : null; })(),
    html: Math.round(document.documentElement.getBoundingClientRect().height), app: b(".app"), bar: b(".bar"), drop: b(".drop"), pin: b(".toast"), strip: Math.round(parseFloat(getComputedStyle(document.body, "::before").height)) };
});

async function open({ standalone, viewport, isMobile, hasTouch, screen, safe, store = {}, growsTo = 0, growsLate = 0 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: isMobile ? 3 : 1, isMobile, hasTouch, timezoneId: "America/Toronto" });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  /* Chrome 157 ignores a display-mode emulation, so the page is told the way iOS tells it: navigator.standalone */
  if (standalone) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true }));
  /* growsTo: his iPhone (iOS 26, build 12g readout). The real window is full height; the page is laid out short
     (docH 812) and innerHeight reads 812 until html is stretched, then the full height. Chrome's own fixed layer is
     already full height here, as his phone's is once stretched. */
  if (growsTo) await page.addInitScript(({ full, short }) => {
    Object.defineProperty(window, "innerHeight", { get: () => document.documentElement.classList.contains("hsfill") ? full : short, configurable: true });
    const real = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
    Object.defineProperty(Element.prototype, "clientHeight", { get() { return this === document.documentElement ? short : real.get.call(this); }, configurable: true });
  }, { full: growsTo, short: growsTo - 62 });
  /* growsLate: the window grows growsLate ms after the stretch turns on, and iOS fires no resize for it (the timing
     risk the 2026-11-12h review named). Until then innerHeight is short and the fixed layer ends 62 early, as on a
     short window, so the page measures a shift of 62; after it, both read full height without any event. */
  if (growsLate) await page.addInitScript(({ full, short, late }) => {
    let t0 = null;
    const grown = () => { if (!document.documentElement.classList.contains("hsfill")) return false; if (t0 == null) t0 = performance.now(); return performance.now() - t0 >= late; };
    Object.defineProperty(window, "innerHeight", { get: () => grown() ? full : short, configurable: true });
    const real = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
    Object.defineProperty(Element.prototype, "clientHeight", { get() { return this === document.documentElement ? short : real.get.call(this); }, configurable: true });
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const r = rect.call(this);
      const floor = this.style && this.style.position === "fixed" && this.style.bottom === "0px" && this.style.height === "0px";
      return floor && !grown() ? new DOMRect(r.x, r.y - (full - short), r.width, r.height) : r;
    };
  }, { full: 874, short: 812, late: growsLate });
  if (screen) await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 3, mobile: true, screenWidth: screen.width, screenHeight: screen.height });
  if (safe) await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: safe });
  await page.addInitScript((s) => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", "1"); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, store);
  await page.goto(URL_);
  await page.waitForSelector(".ev");
  await sleep(500);
  return { ctx, page, errors };
}

try {
  /* ---- a desktop: nothing new ---- */
  { const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
    const g = await geo(page);
    check("desktop: no home screen class", g.cls === "", g.cls);
    check("desktop: the page is the window's height", g.html === 900, String(g.html));
    check("desktop: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- a phone in a Safari tab (not standalone), even with the iPhone's numbers: nothing new ---- */
  { const { ctx, page, errors } = await open({ viewport: { width: 402, height: 812 }, isMobile: true, hasTouch: true, screen: { width: 402, height: 874 }, safe: { top: 62, bottom: 34 } });
    const g = await geo(page);
    check("phone tab: no home screen class", g.cls === "", g.cls);
    check("phone tab: the page is the window's height", g.html === 812, String(g.html));
    check("phone tab: the page ends on the window's bottom, no + New task bar", g.app && g.app[1] === 812 && (!g.drop || g.drop[1] === 0), JSON.stringify([g.app, g.drop]));
    check("phone tab: the header still tucks 4px into the strip (as before)", g.app && g.bar && g.bar[0] === 58, JSON.stringify(g.bar));
    check("phone tab: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- an installed touch app with no top inset (Android, a touch laptop): no header gap, header where a tab has it ---- */
  { const { ctx, page, errors } = await open({ standalone: true, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, screen: { width: 412, height: 915 }, safe: { top: 0, bottom: 0 } });
    const g = await geo(page);
    await ctx.close();
    const t = await open({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, screen: { width: 412, height: 915 }, safe: { top: 0, bottom: 0 } });
    const tg = await geo(t.page);
    await t.ctx.close();
    check("installed app, no top inset: no hs class", !/\bhs\b|hsclear/.test(g.cls), g.cls);
    check("installed app, no top inset: the header starts where it does in a plain tab", g.bar && tg.bar && g.bar[0] === tg.bar[0], `${JSON.stringify(g.bar)} vs tab ${JSON.stringify(tg.bar)}`);
    check("installed app, no top inset: no page errors", errors.length === 0, errors.join(" | ")); }

  /* ---- the home screen app with his numbers ---- */
  { const { ctx, page, errors } = await open({ standalone: true, viewport: { width: 402, height: 812 }, isMobile: true, hasTouch: true, screen: { width: 402, height: 874 }, safe: { top: 62, bottom: 34 } });
    check("the page sees navigator.standalone (the emulation works)", await page.evaluate(() => navigator.standalone === true));
    let g = await geo(page);
    check("home screen app: html.hs, html.hsclear and html.hsfill are on, gap 62", g.cls === "hs hsclear hsfill" && g.gap === "62px", `${g.cls} ${g.gap}`);
    check("home screen app: the page is 874 tall (812 + 62)", g.html === 874, String(g.html));
    check("home screen app: the page ends at the screen's bottom (874)", g.app && g.app[1] === 874, JSON.stringify(g.app));
    check("home screen app: the toast sits 52 above the screen's bottom (pinned boxes in place)", g.pin && g.pin[1] === PIN, JSON.stringify(g.pin));
    check("window stays short: the pinned shift is the whole gap (62)", g.shift === "62px", g.shift);
    check("window stays short: the toast sits 62 lower than its own 18 + 34", g.toast === 18 + 34 - 62, String(g.toast));
    { const again = await page.evaluate(() => { CalHook.fit.apply(); dispatchEvent(new Event("resize")); return CalHook.fit.get(); });
      const g2 = await geo(page);
      check("window stays short: a second apply keeps gap 62 and shift 62", again.gap === 62 && g2.gap === "62px" && g2.shift === "62px" && g2.pin[1] === PIN, `${JSON.stringify(again)} ${g2.shift} ${JSON.stringify(g2.pin)}`); }
    check("home screen app, no saved choice: Top is clear, the header starts below the blur (100)", g.cls.includes("hsclear") && g.bar && g.bar[0] === 100 && g.strip === 100, `${g.cls} ${JSON.stringify(g.bar)} strip ${g.strip}`);
    check("no saved Top choice on the device", await page.evaluate(() => localStorage.getItem("cal-hstop") === null));

    /* the readout's switches */
    const tap = async (sel) => { const b = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); await page.touchscreen.tap(b.x, b.y); };
    for (let i = 0; i < 5; i++) { await tap("#title"); await sleep(120); }
    await sleep(600);
    const text = await page.evaluate(() => document.querySelector("#readout")?.innerText || "");
    check("readout shows BUILD 2026-11-13c trips phone no Local", /BUILD 2026-11-13c trips phone no Local/.test(text));
    check("readout shows the fit line", /fit auto gap 62 shift 62 top clear\s+rules hs hsclear hsfill/.test(text), (text.match(/\nfit [^\n]*/) || [""])[0]);
    check("the Top button says clear", (await page.textContent("#readoutTop")) === "Top clear");
    check("readout shows html and body heights and the four units", /html h 874 body h 874\s+100vh \d+ 100dvh \d+ 100lvh \d+ 100svh \d+/.test(text), (text.match(/html h [^\n]*/) || [""])[0]);
    check("readout shows the + New task bar is hidden on a phone", /\.drop 0\.\.0/.test(text), (text.match(/\.drop [^ ]*/) || [""])[0]);
    await tap("#readoutTop"); await sleep(200);
    g = await geo(page);
    check("Top switch: close moves the header right under the 62pt strip", !g.cls.includes("hsclear") && g.bar && g.bar[0] === 62 && g.strip === 62, `${g.cls} ${JSON.stringify(g.bar)} strip ${g.strip}`);
    check("the Top button says close", (await page.textContent("#readoutTop")) === "Top close");
    await tap("#readoutTop"); await sleep(200);
    g = await geo(page);
    check("Top switch again: back to clear (100)", g.cls.includes("hsclear") && g.bar && g.bar[0] === 100, `${g.cls} ${JSON.stringify(g.bar)}`);
    await tap("#readoutTop"); await sleep(200);   // clear > close, so the kept choice below is a real save
    await tap("#readoutFill"); await sleep(200);   // auto > on: same gap here
    await tap("#readoutFill"); await sleep(200);   // on > off
    g = await geo(page);
    check("Fill switch: off puts the page back to 812", !g.cls.includes("hsfill") && g.html === 812 && g.app[1] === 812, `${g.cls} ${g.html}`);
    const kept = await page.evaluate(() => [localStorage.getItem("cal-hsfill"), localStorage.getItem("cal-hstop")].join(" "));
    check("the switches are kept on the device", kept === "off close", kept);
    check("home screen app: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- his iPhone on iOS 26: once html is stretched the window grows to 874 (build 12g readout, 5:32 PM) ---- */
  { const { ctx, page, errors } = await open({ standalone: true, growsTo: 874, viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, screen: { width: 402, height: 874 }, safe: { top: 62, bottom: 34 } });
    let g = await geo(page);
    check("window grows: the fake works (innerHeight 874 with the stretch on, docH 812)", g.inner === 874 && await page.evaluate(() => document.documentElement.clientHeight) === 812, String(g.inner));
    check("window grows: the stretch stays on, gap 62", g.cls === "hs hsclear hsfill" && g.gap === "62px", `${g.cls} ${g.gap}`);
    check("window grows: the pinned shift is 0", g.shift === "0px", g.shift);
    check("window grows: the toast sits 52 above the screen's bottom, not 62 past it", g.pin && g.pin[1] === PIN, JSON.stringify(g.pin));
    check("window grows: the toast keeps its own 18 + 34 from the bottom", g.toast === 18 + 34, String(g.toast));
    const again = await page.evaluate(() => { CalHook.fit.apply(); dispatchEvent(new Event("resize")); dispatchEvent(new Event("pageshow")); return CalHook.fit.get(); });
    g = await geo(page);
    check("window grows: a second apply (and a resize, a pageshow) keeps gap 62, the stretch on and shift 0", again.gap === 62 && g.cls.includes("hsfill") && g.gap === "62px" && g.shift === "0px" && g.pin[1] === PIN, `${JSON.stringify(again)} ${g.cls} ${g.shift} ${JSON.stringify(g.pin)}`);
    const tap = async (sel) => { const b = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); await page.touchscreen.tap(b.x, b.y); };
    for (let i = 0; i < 5; i++) { await tap("#title"); await sleep(120); }
    await sleep(600);
    const text = await page.evaluate(() => document.querySelector("#readout")?.innerText || "");
    check("window grows: the readout says gap 62 shift 0", /fit auto gap 62 shift 0 top clear/.test(text), (text.match(/\nfit [^\n]*/) || [""])[0]);
    check("window grows: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- his iPhone, but the window grows late (150 ms after the stretch) and iOS fires no resize ---- */
  { const { ctx, page, errors } = await open({ standalone: true, growsLate: 150, viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, screen: { width: 402, height: 874 }, safe: { top: 62, bottom: 34 } });
    const resizes = await page.evaluate(() => { window.__rs = 0; addEventListener("resize", () => window.__rs++); return 0; });
    await sleep(1200);
    const g = await geo(page);
    check("late growth: the fake works (innerHeight 874 now, no resize fired)", g.inner === 874 && await page.evaluate(() => window.__rs) === resizes, String(g.inner));
    check("late growth, no resize: the pinned shift ends at 0", g.cls === "hs hsclear hsfill" && g.shift === "0px", `${g.cls} ${g.shift}`);
    check("late growth, no resize: the toast sits 52 above the screen's bottom", g.pin && g.pin[1] === PIN, JSON.stringify(g.pin));
    check("late growth: once settled, no run is left waiting", await page.evaluate(() => CalHook.fit.pending()) === 0, String(await page.evaluate(() => CalHook.fit.pending())));
    { const n = await page.evaluate(() => { for (let i = 0; i < 300; i++) { dispatchEvent(new Event("resize")); dispatchEvent(new Event("orientationchange")); } return CalHook.fit.pending(); });
      check("late growth: 300 resizes and turns leave at most 3 runs waiting", n <= 3, String(n)); }
    check("late growth: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- the home screen app where iOS already fills the screen: no stretch, top still clear ---- */
  { const { ctx, page } = await open({ standalone: true, viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, screen: { width: 402, height: 874 }, safe: { top: 62, bottom: 34 } });
    const g = await geo(page);
    check("already full: no stretch, no shift, top clear", g.cls === "hs hsclear" && g.html === 874 && g.app[1] === 874 && g.pin[1] === PIN && !g.shift, `${g.cls} ${g.html} ${JSON.stringify([g.app, g.pin])}`);
    await ctx.close(); }
} finally {
  await browser.close(); server.kill();
}
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} pass, ${bad} fail`);
process.exit(bad ? 1 : 0);
