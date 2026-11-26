// The Notes box in the phone's event sheet shows two full rows of text (BUILD 2026-11-12n; Junyan, 2026-11-12: "the
// notes sectino is a bit too small (neeed to be 2 rows)"). Before n an empty or one-line Notes box was one row tall
// (min-height 46px: 13px padding, one 20.8px line, 13px padding). Checked at his size (402 x 874, iOS 26 home screen
// app, and a Safari tab), with the keyboard down and with the keyboard up while Notes is focused. With the keyboard up
// the dash, "Event" and Save stay below the clear strip and above the keyboard (calendar-keyboard.e2e.mjs), and the
// whole two-row box is in the space left under the header row.
// Chrome cannot show the iOS keyboard; only his phone proves that (rule W84).
// Not part of `node --test`: it needs playwright-core and the test browser (`sh scripts/install-test-browser.sh`).
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-notes.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
import { serverReady } from "../helpers/dev-server.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8817), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await serverReady(server);
const browser = await launchTestBrowser(chromium);
const KB = 395;   // his keyboard with the suggestion bar, in CSS px (calendar-keyboard.e2e.mjs)

async function open({ standalone, safe }) {
  const viewport = { width: 402, height: standalone ? 874 : 812 };
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  if (standalone) {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true }));
    await page.addInitScript(({ full, short }) => {
      Object.defineProperty(window, "innerHeight", { get: () => document.documentElement.classList.contains("hsfill") ? full : short, configurable: true });
      const real = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
      Object.defineProperty(Element.prototype, "clientHeight", { get() { return this === document.documentElement ? short : real.get.call(this); }, configurable: true });
    }, { full: 874, short: 812 });
  }
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 3, mobile: true, screenWidth: 402, screenHeight: 874 });
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: safe });
  await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", "3"); });
  await page.goto(URL_);
  await page.waitForSelector(".ev");
  await sleep(500);
  return { ctx, page, errors };
}
const keyboard = (page) => page.evaluate((kb) => {
  Object.defineProperty(window, "visualViewport", { configurable: true, value: { height: innerHeight - kb, offsetTop: 0, pageTop: 0, width: innerWidth, scale: 1, addEventListener() {}, removeEventListener() {} } });
}, KB);
const keyboardDown = (page) => page.evaluate(() => { delete window.visualViewport; document.activeElement?.blur(); sheetFit(); });
const newEvent = (page) => page.evaluate(() => { const s = C.instant(C.addDays(today(), 1), 540, S.tz); panel("event", { isNew: true, id: "draft", calId: "joint", title: "", s, e: s + 3600000, start: new Date(s).toISOString(), end: new Date(s + 3600000).toISOString(), k: "other" }); });
const editEvent = (page) => page.evaluate(() => { const ev = eventsFor(today(), C.addDays(today(), 7)).find((e) => !e.allDay && calOf(e.calId).writable && !e.ghost); panel("event", ev); });

/** How many full rows of text the Notes box shows, and how many of them are on screen (below the header row and the
    clear line, above the keyboard). focus: put the cursor in Notes first (and run the page's own keyboard fit). */
const notes = (page, focus) => page.evaluate(({ focus }) => {
  const t = document.querySelector('.sheet textarea[data-f="description"]');
  if (focus) { t.focus(); sheetFit(); }
  const cs = getComputedStyle(t), lh = parseFloat(cs.lineHeight), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
  const r = t.getBoundingClientRect(), vv = window.visualViewport, bottom = vv ? vv.offsetTop + vv.height : innerHeight;
  const b = (s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.top), Math.round(q.bottom)]; };
  const head = b(".shead");
  const textTop = r.top + pt, textBot = r.bottom - pb;
  const seenTop = Math.max(textTop, head[1]), seenBot = Math.min(textBot, bottom);
  return { rows: Math.floor((textBot - textTop) / lh + 0.01), seen: Math.max(0, Math.floor((seenBot - seenTop) / lh + 0.01)),
    box: [Math.round(r.top), Math.round(r.bottom)], lh, bottom, head, x: b("#pGrab"), label: b(".shead b"), save: b("#pSave"), panel: b("#panel") };
}, { focus });

function checkCase(tag, g, { kb, clear }) {
  check(`${tag}: the Notes box is two full rows tall`, g.rows >= 2, JSON.stringify({ rows: g.rows, box: g.box, lh: g.lh }));
  check(`${tag}: both rows are on screen`, g.seen >= 2, JSON.stringify({ seen: g.seen, box: g.box, head: g.head, bottom: g.bottom }));
  if (kb) {
    const inView = (r) => r && r[0] >= clear - 0.5 && r[1] <= g.bottom + 0.5;
    check(`${tag}: the dash, "Event" and Save stay below ${clear} and above the keyboard`, inView(g.x) && inView(g.label) && inView(g.save), JSON.stringify({ x: g.x, label: g.label, save: g.save, bottom: g.bottom }));
  }
}

try {
  for (const [name, standalone, safe, clear] of [["home screen", true, { top: 62, bottom: 34 }, 100], ["Safari tab", false, { top: 0, bottom: 34 }, 0]]) {
    const { ctx, page, errors } = await open({ standalone, safe });
    /* a new event, Notes empty */
    await newEvent(page); await sleep(400);
    checkCase(`${name}, new event, keyboard down`, await notes(page, false), { kb: false });
    await keyboard(page);
    checkCase(`${name}, new event, keyboard up on Notes`, await notes(page, true), { kb: true, clear });
    /* one line typed: still two rows */
    await page.fill('.sheet [data-f="description"]', "Bring speaker");
    checkCase(`${name}, new event, one line typed, keyboard up`, await notes(page, true), { kb: true, clear });
    await keyboardDown(page);
    checkCase(`${name}, new event, one line typed, keyboard down`, await notes(page, false), { kb: false });
    /* an existing event, edited */
    await page.evaluate(() => closeSheet()); await sleep(300);
    await editEvent(page); await sleep(400);
    checkCase(`${name}, edit event, keyboard down`, await notes(page, false), { kb: false });
    await keyboard(page);
    checkCase(`${name}, edit event, keyboard up on Notes`, await notes(page, true), { kb: true, clear });
    await keyboardDown(page);
    /* a long note still grows with its text (up to the old cap) and does not shrink to two */
    await page.fill('.sheet [data-f="description"]', "one\ntwo\nthree\nfour");
    const g = await notes(page, false);
    check(`${name}: four lines of notes show four rows`, g.rows >= 4, JSON.stringify({ rows: g.rows, box: g.box }));
    check(`${name}: no page errors`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
