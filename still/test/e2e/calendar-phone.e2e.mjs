// The calendar on a phone, in a real browser with real touch events (Junyan, 2026-11-11: swipes changed days too
// easily in the day view; the top edge faded; no Home Screen icon).
// Not part of `node --test still/test/*.test.mjs`: it needs playwright-core and Google Chrome.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-phone.e2e.mjs
// It starts calendar-dev.mjs (the fake still-api with a made-up week) on its own port; nothing reaches his server.
// Touches go through Chrome's DevTools Input.dispatchTouchEvent, so the browser scrolls the page itself the way a
// finger would, and the page's own swipe code sees ordinary touchstart / touchmove / touchend events.
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8801), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  /** One finger from (x0, y0) to (x1, y1) in `ms`, in `steps` moves, then lifted. */
  async function drag(x0, y0, x1, y1, ms = 350, steps = 14) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await sleep(ms / steps);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(1100);   // let a snap or a smooth scroll finish
  }
  /** A fast flick: the moves go out back to back (awaiting each DevTools call one by one takes about 40 ms a move,
      far slower than a finger). */
  async function flick(x0, y0, x1, y1, steps = 4) {
    const sends = [cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] })];
    for (let i = 1; i <= steps; i++) sends.push(cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }] }));
    sends.push(cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }));
    await Promise.all(sends);
    await sleep(1100);
  }
  const shown = () => page.evaluate(() => {
    const v = document.querySelector("#view"), days = [...document.querySelectorAll(".day")];
    const w = days[0].getBoundingClientRect().width;
    return { day: days[Math.round(v.scrollLeft / w)].dataset.day, top: Math.round(v.scrollTop), left: Math.round(v.scrollLeft), w };
  });
  async function open(n) {
    await page.addInitScript((n) => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", n); }, String(n));
    await page.goto(URL_);
    await page.waitForSelector(".ev");
    await sleep(600);
    await page.evaluate(() => { document.querySelector("#view").scrollTop = 7 * 56; });
    await sleep(200);
  }
  const plus = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

  /* ---- day view ---- */
  await open(1);
  let a = await shown();
  await drag(200, 650, 240, 350, 450);
  let b = await shown();
  check("day view: an up/down scroll drifting 40 px right keeps the day", b.day === a.day, `${a.day} -> ${b.day}`);
  check("day view: that scroll really scrolled the hours (positive control)", b.top > a.top + 100, `scrollTop ${a.top} -> ${b.top}`);
  a = b; await drag(240, 300, 200, 600, 450); b = await shown();
  check("day view: a scroll back up drifting 40 px left keeps the day", b.day === a.day, `${a.day} -> ${b.day}`);
  a = b; await drag(300, 500, 120, 510, 260); b = await shown();
  check("day view: a clear swipe left goes to the next day", b.day === plus(a.day, 1), `${a.day} -> ${b.day}`);
  a = b; await drag(110, 500, 300, 495, 260); b = await shown();
  check("day view: a clear swipe right goes back a day", b.day === plus(a.day, -1), `${a.day} -> ${b.day}`);
  a = b; await drag(250, 500, 195, 504, 600); b = await shown();
  check("day view: a short slow nudge stays on the day", b.day === a.day, `${a.day} -> ${b.day}`);
  a = b; await drag(260, 500, 140, 575, 300); b = await shown();
  check("day view: a diagonal swipe (sideways under twice the up/down) stays on the day", b.day === a.day, `${a.day} -> ${b.day}`);
  a = b; await flick(250, 500, 195, 503); b = await shown();
  check("day view: a quick 55 px flick goes to the next day", b.day === plus(a.day, 1), `${a.day} -> ${b.day}`);
  a = b; await drag(330, 818, 60, 818, 260); b = await shown();
  check("day view: a swipe on the New task box keeps the day", b.day === a.day, `${a.day} -> ${b.day}`);

  /* ---- 3 days ---- */
  await open(3);
  a = await shown(); await drag(200, 650, 240, 350, 450); b = await shown();
  check("3 days: an up/down scroll drifting 40 px keeps the days", b.day === a.day, `${a.day} -> ${b.day}`);
  a = b; await drag(320, 500, 120, 505, 260); b = await shown();
  check("3 days: a clear swipe left moves on", b.day > a.day, `${a.day} -> ${b.day}`);

  /* ---- 7 days ---- */
  await open(7);
  a = await shown(); await drag(200, 650, 240, 350, 450); b = await shown();
  check("7 days: an up/down scroll drifting 40 px keeps the week", b.day === a.day, `${a.day} -> ${b.day}`);
  a = b; await drag(320, 500, 120, 505, 260); b = await shown();
  check("7 days: a clear swipe left goes to the next week", b.day === plus(a.day, 7), `${a.day} -> ${b.day}`);

  /* ---- a clean top and bottom edge ---- */
  await open(1);
  const edge = await page.evaluate(() => [".bar", ".dhead", ".corner", ".drop"].map((s) => {
    const cs = getComputedStyle(document.querySelector(s)), bg = cs.backgroundColor;
    const alpha = /rgba\(/.test(bg) ? +bg.split(",")[3].replace(")", "") : /rgb\(/.test(bg) ? 1 : 0;
    return { s, alpha, blur: cs.backdropFilter || cs.webkitBackdropFilter || "none" };
  }));
  for (const e of edge) check(`${e.s} is solid (no see-through, no blur)`, e.alpha === 1 && /^(none|)$/.test(e.blur), `alpha ${e.alpha}, blur ${e.blur}`);

  /* ---- Home Screen icon ---- */
  const icons = await page.evaluate(async () => {
    const href = (sel) => document.querySelector(sel)?.href || null;
    const size = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(`${i.naturalWidth}x${i.naturalHeight}`); i.onerror = () => ok("missing"); i.src = src; });
    const man = href('link[rel="manifest"]');
    const m = man ? await fetch(man).then((r) => r.json()).catch(() => null) : null;
    return { touch: href('link[rel="apple-touch-icon"]') && await size(href('link[rel="apple-touch-icon"]')),
      svg: href('link[rel="icon"][type="image/svg+xml"]'), png: href('link[rel="icon"][type="image/png"]') && await size(href('link[rel="icon"][type="image/png"]')),
      theme: document.querySelector('meta[name="theme-color"]')?.content, capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
      man: m && { theme: m.theme_color, bg: m.background_color, icons: await Promise.all(m.icons.map(async (i) => `${i.sizes}${i.purpose ? " " + i.purpose : ""}=${await size(new URL(i.src, man).href)}`)) } };
  });
  check("apple-touch-icon is 180x180", icons.touch === "180x180", String(icons.touch));
  check("an SVG favicon and a PNG fallback", !!icons.svg && /^\d+x\d+$/.test(icons.png || ""), `${icons.svg} / ${icons.png}`);
  check("the web manifest has 192, 512 and a maskable 512, all loading", !!icons.man && ["192x192=192x192", "512x512=512x512", "512x512 maskable=512x512"].every((x) => icons.man.icons.includes(x)), JSON.stringify(icons.man?.icons));
  const barHex = await page.evaluate(() => "#" + getComputedStyle(document.querySelector(".bar")).backgroundColor.match(/\d+/g).slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join(""));
  check("theme colour matches the header, and the manifest opens on Studio's night charcoal", !!icons.theme && icons.theme === barHex && icons.man?.theme === "#262626" && icons.man?.bg === "#1c1c1c", `${icons.theme} / bar ${barHex} / ${icons.man?.theme} / ${icons.man?.bg}`);
  check("apple-mobile-web-app-capable is set", icons.capable === "yes");
  check("no page errors", errors.length === 0, errors.join(" | "));

  /* ---- Studio follows the sun (Junyan, 2026-11-11: "the calendar mode with the night mode for when it's night") ----
     A phone that saved Stage Lights while he tried looks, with a fixed Toronto clock on 2026-11-11 (sunset 4:56 pm). */
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: "America/Toronto",
    storageState: { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: "cal-look", value: "stage" }, { name: "quest-key", value: "test" }] }] } });
  const p2 = await ctx2.newPage();
  const errors2 = []; p2.on("pageerror", (e) => errors2.push(e.message));
  await p2.addInitScript(() => { requestAnimationFrame(() => { window.__firstLook = document.documentElement.dataset.look; window.__firstBg = getComputedStyle(document.body).backgroundColor; }); });
  await p2.clock.install({ time: new Date("2026-11-11T11:30:00-05:00") });
  await p2.goto(URL_); await sleep(800);
  const look = () => p2.evaluate(() => ({ face: document.documentElement.dataset.look || null, theme: document.querySelector('meta[name="theme-color"]').content,
    saved: localStorage.getItem("cal-look"), reset: localStorage.getItem("cal-look-reset"), first: window.__firstLook, firstBg: window.__firstBg }));
  let l = await look();
  check("a phone with an old saved look opens in Studio once, the day half at 11:30 am", l.face === "studio-day" && l.saved === null && !!l.reset, JSON.stringify(l));
  check("the day half is on before the first paint (no flash)", l.first === "studio-day" && l.firstBg === "rgb(255, 253, 249)", `${l.first} ${l.firstBg}`);
  check("theme-color is the day half's header", l.theme === "#fffdf9", l.theme);
  await p2.clock.fastForward("05:25:00");   // 4:55 pm, a minute before sunset
  l = await look();
  check("still the day half a minute before sunset", l.face === "studio-day", l.face);
  await p2.clock.fastForward("00:02:00");   // 4:57 pm: the 30 s timer fires with the page open
  l = await look();
  check("crossing sunset with the page open flips to the night half, no reload", l.face === "studio-night" && l.theme === "#262626", JSON.stringify(l));
  await p2.evaluate(() => { document.querySelector('button[data-look="velvet"]') || (document.querySelector("#panelBtn").click(), document.querySelector('[data-p="set"]').click()); });
  await sleep(300);
  await p2.click('button[data-look="velvet"]');
  l = await look();
  check("a tap on Velvet & Brass puts it on and saves it", l.face === "velvet" && l.saved === "velvet", JSON.stringify(l));
  await p2.reload(); await sleep(600);
  l = await look();
  check("after the one reset his tap is kept on the next load", l.face === "velvet" && l.saved === "velvet", JSON.stringify(l));
  check("no page errors in the Studio checks", errors2.length === 0, errors2.join(" | "));
  await ctx2.close();
} finally {
  await browser.close(); server.kill();
}
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} pass, ${bad} fail`);
process.exit(bad ? 1 : 0);
