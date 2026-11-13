// The keyboard over the phone's event sheet (BUILD 2026-11-12l; Junyan, 2026-11-12: "Event title also gets pushed into
// the blur"). His 7:53 PM screenshot (iPhone home screen app, 402 x 874, iOS 26, build k): with the keyboard open for
// the Title, the sheet's header row (x, Event, Save) sat behind the clock and the Title right under it, in the system
// blur. Cause: sheetFit pins the sheet to the visual viewport (top = offsetTop, height = its height). In a home screen
// app that viewport starts at the very top of the screen, under the status bar, and the sheet had no top padding there.
// Each case below fakes the keyboard the way iOS reports it (visualViewport shorter, maybe slid down by offsetTop) and
// checks that the header row and the box being typed in sit fully inside the part of the screen that is left, below
// the top inset (62) and, in a home screen app with Top "clear", below the blur too (62 + 38 = 100).
// Chrome cannot show the iOS keyboard or the system blur; only his phone proves those (rule W84).
// Not part of `node --test`: it needs playwright-core and Google Chrome.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-keyboard.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8816), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
const KB = 395;   // his keyboard with the suggestion bar, in CSS px (screenshot 7:53 PM: keyboard top near 479 of 874)

/** standalone: fake a home screen app (navigator.standalone). grown: his iOS 26 window, 812 laid out then 874 once
    stretched (calendar-homescreen.e2e.mjs). paired: false shows the pairing box. */
async function open({ standalone, grown, safe, store = {}, paired = true, viewport = { width: 402, height: grown ? 874 : 812 } }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  if (standalone) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true }));
  if (grown) await page.addInitScript(({ full, short }) => {
    Object.defineProperty(window, "innerHeight", { get: () => document.documentElement.classList.contains("hsfill") ? full : short, configurable: true });
    const real = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
    Object.defineProperty(Element.prototype, "clientHeight", { get() { return this === document.documentElement ? short : real.get.call(this); }, configurable: true });
  }, { full: 874, short: 812 });
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 3, mobile: true, screenWidth: 402, screenHeight: 874 });
  if (safe) await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: safe });
  await page.addInitScript(({ s, paired }) => { if (paired) localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", "3"); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, { s: store, paired });
  await page.goto(URL_);
  await page.waitForSelector(paired ? ".ev" : "#pairIn");
  await sleep(500);
  return { ctx, page, errors };
}

/** Put the keyboard up: visualViewport loses KB px at the bottom and may slide by offsetTop; then the page's own fit runs. */
const keyboard = (page, offsetTop = 0) => page.evaluate(([kb, off]) => {
  Object.defineProperty(window, "visualViewport", { configurable: true, value: { height: innerHeight - kb, offsetTop: off, pageTop: off, width: innerWidth, scale: 1, addEventListener() {}, removeEventListener() {} } });
}, [KB, offsetTop]);
const keyboardDown = (page) => page.evaluate(() => { delete window.visualViewport; document.activeElement?.blur(); sheetFit(); });
/** Focus a box in the sheet, run the page's fit, and read where the header row and the box sit. */
const focusRead = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel); el.focus(); sheetFit();
  const vv = window.visualViewport, top = vv.offsetTop, bottom = vv.offsetTop + vv.height;
  const b = (e) => { const r = (typeof e === "string" ? document.querySelector(e) : e).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
  return { top, bottom, panel: b("#panel"), x: b("#pX"), save: document.querySelector("#pSave") ? b("#pSave") : null, label: b(".shead b"), head: b(".shead"), box: b(el) };
}, sel);
/* a new event at 9 AM tomorrow in the calendar's own zone, built the way an empty-hour tap builds it (calendar.html) */
const newEvent = (page) => page.evaluate(() => { const s = C.instant(C.addDays(today(), 1), 540, S.tz); panel("event", { isNew: true, id: "draft", calId: "joint", title: "", s, e: s + 3600000, start: new Date(s).toISOString(), end: new Date(s + 3600000).toISOString(), k: "other" }); });
/** clear: the line nothing may sit above (the top inset, plus the clear strip in a home screen app). */
function headerChecks(tag, g, clear) {
  const inView = (r) => r && r[0] >= Math.max(g.top, clear) - 0.5 && r[1] <= g.bottom + 0.5;
  check(`${tag}: x, "Event" and Save sit below ${clear} and above the keyboard`, inView(g.x) && inView(g.label) && inView(g.save), JSON.stringify({ x: g.x, label: g.label, save: g.save, top: g.top, bottom: g.bottom }));
  check(`${tag}: the box being typed in is fully on screen, under the header row`, g.box[0] >= g.head[1] - 0.5 && g.box[1] <= g.bottom + 0.5 && g.box[0] >= clear, JSON.stringify({ box: g.box, head: g.head, bottom: g.bottom }));
  check(`${tag}: the sheet still fills the space the keyboard leaves`, g.panel[0] === Math.round(g.top) && g.panel[1] === Math.round(g.bottom), JSON.stringify({ panel: g.panel, top: g.top, bottom: g.bottom }));
}

try {
  /* ---- his case: the home screen app, iOS 26 grown window, Top clear (the default) ---- */
  { const { ctx, page, errors } = await open({ standalone: true, grown: true, safe: { top: 62, bottom: 34 } });
    check("home screen app: html.hs hsclear hsfill are on", await page.evaluate(() => ["hs", "hsclear", "hsfill"].every((c) => document.documentElement.classList.contains(c))));
    await newEvent(page); await sleep(400);
    await keyboard(page);
    headerChecks("home screen, new event, Title", await focusRead(page, "#pTitle"), 100);
    await page.fill('.sheet [data-f="location"]', "Studio A"); await page.fill('.sheet [data-f="description"]', "Bring speaker\nand the long cable\nand water");
    headerChecks("home screen, new event, Location", await focusRead(page, '.sheet [data-f="location"]'), 100);
    headerChecks("home screen, new event, Notes", await focusRead(page, '.sheet [data-f="description"]'), 100);
    await keyboardDown(page);
    const back = await page.evaluate(() => { const p = $("#panel"), r = p.getBoundingClientRect(); return { kb: p.classList.contains("kb"), top: p.style.top, pad: getComputedStyle(p).paddingTop, bottom: Math.round(r.bottom) }; });
    check("keyboard down: the sheet goes back to the bottom with no extra top padding", !back.kb && back.top === "" && back.pad === "0px", JSON.stringify(back));
    /* an existing event with a location and notes, edited */
    await page.evaluate(() => { const ev = eventsFor(today(), C.addDays(today(), 7)).find((e) => !e.allDay && calOf(e.calId).writable && !e.ghost); panel("event", ev); }); await sleep(400);
    await page.fill('.sheet [data-f="location"]', "Home"); await keyboard(page, 0);
    headerChecks("home screen, edit event, Location", await focusRead(page, '.sheet [data-f="location"]'), 100);
    headerChecks("home screen, edit event, Notes", await focusRead(page, '.sheet [data-f="description"]'), 100);
    headerChecks("home screen, edit event, Title", await focusRead(page, "#pTitle"), 100);
    /* iOS sometimes also slides the page down by offsetTop: the sheet follows it and stays below the strip */
    await keyboard(page, 40);
    headerChecks("home screen, page slid 40, Title", await focusRead(page, "#pTitle"), 100);
    await keyboardDown(page);
    check("home screen: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- home screen app with Top "close": the header row still clears the 62pt status strip ---- */
  { const { ctx, page, errors } = await open({ standalone: true, grown: true, safe: { top: 62, bottom: 34 }, store: { "cal-hstop": "close" } });
    await newEvent(page); await sleep(400); await keyboard(page);
    headerChecks("home screen Top close, Title", await focusRead(page, "#pTitle"), 62);
    await keyboardDown(page);
    check("home screen Top close: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- home screen app with Fill off (the window stays 812): same top ---- */
  { const { ctx, page, errors } = await open({ standalone: true, safe: { top: 62, bottom: 34 }, store: { "cal-hsfill": "off" } });
    await newEvent(page); await sleep(400); await keyboard(page);
    headerChecks("home screen Fill off, Title", await focusRead(page, "#pTitle"), 100);
    await keyboardDown(page);
    check("home screen Fill off: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- Safari tab, no top inset reported: nothing moves down, the header is at the visible top ---- */
  { const { ctx, page, errors } = await open({ safe: { top: 0, bottom: 34 } });
    await newEvent(page); await sleep(400); await keyboard(page, 90);
    const g = await focusRead(page, "#pTitle");
    headerChecks("Safari tab, page slid 90, Title", g, 0);
    check("Safari tab, no inset: the header row starts at the sheet's top (only its 1px edge and 4px gap, no padding)", g.head[0] - g.panel[0] <= 5, JSON.stringify({ head: g.head, panel: g.panel }));
    await keyboardDown(page);
    check("Safari tab: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- Safari tab that draws under the status bar (inset 62 reported): the header row clears the strip ---- */
  { const { ctx, page, errors } = await open({ safe: { top: 62, bottom: 34 } });
    await newEvent(page); await sleep(400); await keyboard(page);
    headerChecks("Safari tab with a 62 inset, Title", await focusRead(page, "#pTitle"), 62);
    await keyboardDown(page);
    check("Safari tab with a 62 inset: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- the pairing box (in the page, not a sheet): with the keyboard up it stays on screen, below the strip ---- */
  { const { ctx, page, errors } = await open({ standalone: true, grown: true, safe: { top: 62, bottom: 34 }, paired: false });
    await keyboard(page);
    const g = await page.evaluate(() => { const el = $("#pairIn"); el.focus(); dispatchEvent(new Event("resize")); const r = el.getBoundingClientRect(), b = $("#pairGo").getBoundingClientRect(), vv = window.visualViewport;
      return { box: [Math.round(r.top), Math.round(r.bottom)], go: [Math.round(b.top), Math.round(b.bottom)], bottom: vv.offsetTop + vv.height, winY: scrollY, docTop: document.scrollingElement.scrollTop }; });
    check("pairing box: the code box and Pair sit below the clear strip (100) and above the keyboard", g.box[0] >= 100 && g.go[1] <= g.bottom, JSON.stringify(g));
    check("pairing box: the page itself did not scroll", g.winY === 0 && g.docTop === 0, JSON.stringify(g));
    check("pairing box: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- the readout shows the numbers that prove it on the phone: visual viewport, the sheet and its header row ---- */
  { const { ctx, page } = await open({ standalone: true, grown: true, safe: { top: 62, bottom: 34 } });
    await newEvent(page); await sleep(400); await keyboard(page);
    await focusRead(page, "#pTitle");
    await page.evaluate(() => { const s = document.createElement("script"); s.src = "calendar-readout.js?v=test"; document.head.appendChild(s); });
    await page.waitForSelector("#readout"); await sleep(400);
    const text = await page.evaluate(() => document.querySelector("#readout").innerText);
    const line = (text.match(/\nkb [^\n]*/) || [""])[0].trim();
    const m = line.match(/^kb on vv 479@0 sheet 0\.\.479 pad 100 head (\d+)\.\.(\d+) title (\d+)\.\.(\d+)$/);
    check("readout has a kb line: keyboard on, visual viewport, sheet, pad 100, header row and Title below 100", !!m && +m[1] >= 100 && +m[3] >= +m[2], line);
    await ctx.close(); }
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
