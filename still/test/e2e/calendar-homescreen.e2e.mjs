// The iPhone home screen app's fit (2026-11-12, BUILD 2026-11-12g; still/test/calendar-homescreen-fit.test.mjs).
// Chrome cannot reproduce the iOS 26 short page (WebKit bug 301994): it never lays a page out shorter than its window.
// What this proves is the page's side only: a plain phone tab and a desktop get no new class and no new geometry;
// a page that reports standalone with the iPhone's numbers (window 402x812, screen 402x874, top inset 62, bottom 34)
// gets html.hs and html.hsfill, the page grows by 62, the "+ New task" bar moves to the screen's bottom edge, the
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
const geo = (page) => page.evaluate(() => {
  const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
  return { cls: [...document.documentElement.classList].filter((c) => /^hs/.test(c)).join(" "), gap: document.documentElement.style.getPropertyValue("--hsgap"),
    html: Math.round(document.documentElement.getBoundingClientRect().height), app: b(".app"), bar: b(".bar"), drop: b(".drop"), strip: Math.round(parseFloat(getComputedStyle(document.body, "::before").height)) };
});

async function open({ standalone, viewport, isMobile, hasTouch, screen, safe, store = {} }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: isMobile ? 3 : 1, isMobile, hasTouch, timezoneId: "America/Toronto" });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  /* Chrome 157 ignores a display-mode emulation, so the page is told the way iOS tells it: navigator.standalone */
  if (standalone) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true }));
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
    check("phone tab: the + New task bar sits on the window's bottom", g.drop && g.drop[1] === 812, JSON.stringify(g.drop));
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
    check("home screen app: the + New task bar ends at the screen's bottom (874)", g.drop && g.drop[1] === 874, JSON.stringify(g.drop));
    check("home screen app, no saved choice: Top is clear, the header starts below the blur (100)", g.cls.includes("hsclear") && g.bar && g.bar[0] === 100 && g.strip === 100, `${g.cls} ${JSON.stringify(g.bar)} strip ${g.strip}`);
    check("no saved Top choice on the device", await page.evaluate(() => localStorage.getItem("cal-hstop") === null));

    /* the readout's switches */
    const tap = async (sel) => { const b = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); await page.touchscreen.tap(b.x, b.y); };
    for (let i = 0; i < 5; i++) { await tap("#title"); await sleep(120); }
    await sleep(600);
    const text = await page.evaluate(() => document.querySelector("#readout")?.innerText || "");
    check("readout shows BUILD 2026-11-12g top clear", /BUILD 2026-11-12g top clear/.test(text));
    check("readout shows the fit line", /fit auto gap 62 top clear\s+rules hs hsclear hsfill/.test(text), (text.match(/\nfit [^\n]*/) || [""])[0]);
    check("the Top button says clear", (await page.textContent("#readoutTop")) === "Top clear");
    check("readout shows html and body heights and the four units", /html h 874 body h 874\s+100vh \d+ 100dvh \d+ 100lvh \d+ 100svh \d+/.test(text), (text.match(/html h [^\n]*/) || [""])[0]);
    check("readout shows where the + New task bar sits", /\.drop \d+\.\.874/.test(text));
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
    check("Fill switch: off puts the page back to 812", !g.cls.includes("hsfill") && g.html === 812 && g.drop[1] === 812, `${g.cls} ${g.html}`);
    const kept = await page.evaluate(() => [localStorage.getItem("cal-hsfill"), localStorage.getItem("cal-hstop")].join(" "));
    check("the switches are kept on the device", kept === "off close", kept);
    check("home screen app: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- the home screen app where iOS already fills the screen: no stretch, top still clear ---- */
  { const { ctx, page } = await open({ standalone: true, viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, screen: { width: 402, height: 874 }, safe: { top: 62, bottom: 34 } });
    const g = await geo(page);
    check("already full: no stretch, top clear", g.cls === "hs hsclear" && g.html === 874 && g.drop[1] === 874, `${g.cls} ${g.html} ${JSON.stringify(g.drop)}`);
    await ctx.close(); }
} finally {
  await browser.close(); server.kill();
}
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} pass, ${bad} fail`);
process.exit(bad ? 1 : 0);
