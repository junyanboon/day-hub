// The dash moves into the header row when the keyboard is up (BUILD 2026-11-18c; Junyan, 2026-11-18, d43: "43 D is good").
// Build n put the dash in its own 44 px row above "Event" at all times. With the keyboard up that pushed the Title 44 px
// lower than build l (header 149..193, Title 205..241 on n, against header 105..149, Title 161..197 on l, 402 x 874 home
// screen app, Top clear) and he saw the Title in the top blur on his phone. Layout D:
//   - keyboard down: the dash stays centred above the "Event" / Save row, no x (as build n);
//   - keyboard up: the dash sits IN the header row, in the left spot where the x used to be ("---  Event  Save"), the header
//     row and the Title sit exactly where build l put them (105..149 and 161..197), the tap area stays 44 high and a tap
//     on it closes the sheet the way the dash does now (unsaved typing dropped, nothing sent);
//   - a new event focuses its Title only after the sheet has finished sliding in (the phone never sees a focused box
//     behind the keyboard while the sheet is still moving);
//   - the readout's kb line also gives the page scroll and the sheet content scroll.
// Chrome cannot show the iOS keyboard or the system blur; only his phone proves those (rule W84).
// Not part of `node --test`: it needs playwright-core and the test browser (`sh scripts/install-test-browser.sh`).
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-dashheader.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8836), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await launchTestBrowser(chromium);
const KB = 395;

/** his home screen app: 402 x 874, top inset 62, Top clear (the default, so 62 + 38 = 100) */
async function open({ standalone = true, safe = { top: 62, bottom: 34 } } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" });
  const page = await ctx.newPage(), errors = [], sent = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (/\/planner\/event(\?|$)/.test(r.url()) && r.method() !== "GET") sent.push(r.method()); });
  const cdp = await ctx.newCDPSession(page);
  if (standalone) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true }));
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: safe });
  await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", "3"); });
  await page.goto(URL_); await page.waitForSelector(".ev"); await sleep(600);
  return { ctx, page, errors, sent };
}
const keyboard = (page) => page.evaluate((kb) => { Object.defineProperty(window, "visualViewport", { configurable: true, value: { height: innerHeight - kb, offsetTop: 0, pageTop: 0, width: innerWidth, scale: 1, addEventListener() {}, removeEventListener() {} } }); }, KB);
const newEvent = async (page) => { await page.evaluate(() => { const s = C.instant(C.addDays(today(), 1), 540, S.tz); panel("event", { isNew: true, id: "draft", calId: "joint", title: "", s, e: s + 3600000, start: new Date(s).toISOString(), end: new Date(s + 3600000).toISOString(), k: "other" }); }); await sleep(450); };
const rect = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), cx: (r.left + r.right) / 2 }; }, sel);
const isOpen = (page) => page.evaluate(() => document.body.classList.contains("popen"));
const near = (a, b, d = 1) => a !== undefined && b !== undefined && Math.abs(a - b) <= d;

try {
  /* ---- keyboard UP: dash in the header row, header and Title where build l put them ---- */
  { const { ctx, page, errors, sent } = await open();
    await newEvent(page); await keyboard(page);
    await page.evaluate(() => { document.querySelector("#pTitle").focus(); sheetFit(); }); await sleep(100);
    const g = await rect(page, "#pGrab"), head = await rect(page, ".shead"), label = await rect(page, ".shead b"), save = await rect(page, "#pSave"), title = await rect(page, "#pTitle");
    const all = JSON.stringify({ g, head, label, save, title });
    check("keyboard up: the header row sits at 105..149 (build l)", head && near(head.top, 105) && near(head.bottom, 149), all);
    check("keyboard up: the Title sits at 161..197 (build l)", title && near(title.top, 161) && near(title.bottom, 197), all);
    check("keyboard up: the dash is IN the header row (its box inside 105..149, 44 high)", g && head && g.top >= head.top - 0.5 && g.bottom <= head.bottom + 0.5 && g.h >= 44 && g.h <= 46, all);
    check("keyboard up: the dash is in the left spot, left of 'Event' ('---  Event  Save')", g && label && save && g.right <= label.left + 0.5 && g.cx < label.left && save.left > label.right, all);
    check("keyboard up: the dash is drawn (a 4 px bar) inside the header row", await page.evaluate(() => { const g = document.querySelector("#pGrab"), h = document.querySelector(".shead").getBoundingClientRect(), s = getComputedStyle(g, "::before"), r = g.getBoundingClientRect(), t = r.top + parseFloat(s.top), L = r.left + parseFloat(s.left); return parseFloat(s.height) === 4 && t >= h.top && t + 4 <= h.bottom && L >= r.left && L + parseFloat(s.width) <= r.right; }));
    check("keyboard up: no x anywhere", !(await page.evaluate(() => [...document.querySelectorAll("#panel button")].some((b) => b.getClientRects().length && /✕|×/.test(b.textContent)))));
    await page.fill("#pTitle", "Typed with the keyboard up");
    await page.touchscreen.tap(g.cx, (g.top + g.bottom) / 2); await sleep(450);
    check("keyboard up: a tap on the dash in the header row closes the sheet, nothing saved", !(await isOpen(page)) && !sent.length, JSON.stringify({ open: await isOpen(page), sent }));
    check("no page errors (keyboard up)", !errors.length, errors.join("; "));
    await ctx.close(); }

  /* ---- the same on an existing event, and with the sheet's content scrolled: the dash stays in the header row ---- */
  { const { ctx, page, errors } = await open();
    await page.evaluate(() => { const ev = eventsFor(today(), C.addDays(today(), 7)).find((e) => !e.allDay && calOf(e.calId).writable && !e.ghost); panel("event", ev); }); await sleep(450);
    await keyboard(page);
    await page.evaluate(() => { document.querySelector('.sheet [data-f="description"]').focus(); sheetFit(); const b = document.querySelector("#pbody"); b.scrollTop = 60; }); await sleep(100);
    const g = await rect(page, "#pGrab"), head = await rect(page, ".shead");
    check("keyboard up, existing event, content scrolled: the dash is still in the header row", g && head && g.top >= head.top - 0.5 && g.bottom <= head.bottom + 0.5, JSON.stringify({ g, head }));
    check("no page errors (existing event)", !errors.length, errors.join("; "));
    await ctx.close(); }

  /* ---- keyboard DOWN: unchanged from build n, the dash centred above the Event row, no x ---- */
  { const { ctx, page } = await open();
    await newEvent(page);
    const g = await rect(page, "#pGrab"), head = await rect(page, ".shead"), panel = await rect(page, "#panel");
    const all = JSON.stringify({ g, head, panel });
    check("keyboard down: the dash is centred above the Event row", g && head && panel && near(g.cx, 201, 1) && g.bottom <= head.top + 0.5 && g.h >= 44, all);
    check("keyboard down: no x", !(await page.evaluate(() => [...document.querySelectorAll("#panel button")].some((b) => b.getClientRects().length && /✕|×/.test(b.textContent)))));
    await keyboard(page); await page.evaluate(() => { document.querySelector("#pTitle").focus(); sheetFit(); });
    await page.evaluate(() => { delete window.visualViewport; document.activeElement.blur(); sheetFit(); }); await sleep(100);
    const g2 = await rect(page, "#pGrab"), head2 = await rect(page, ".shead");
    check("keyboard back down: the dash goes back above the Event row, centred", g2 && head2 && near(g2.cx, 201, 1) && g2.bottom <= head2.top + 0.5, JSON.stringify({ g2, head2 }));
    await ctx.close(); }

  /* ---- the menu sheet never gets the keyboard layout: its dash stays centred on top ---- */
  { const { ctx, page } = await open();
    await page.evaluate(() => { document.body.classList.add("popen"); panel("now"); }); await sleep(450);
    const g = await rect(page, "#pGrab");
    check("menu sheet: the dash is centred on top", g && near(g.cx, 201, 1) && g.h >= 44, JSON.stringify(g));
    await ctx.close(); }

  /* ---- a new event focuses its Title only after the sheet has slid in ---- */
  // the spot needs clear column 12 px above and below it: the test browser taps up to 7 px off where Chrome did
  { const { ctx, page } = await open();
    const spot = await page.evaluate(() => { const v = document.querySelector("#view").getBoundingClientRect(); for (const col of document.querySelectorAll(".col")) { const c = col.getBoundingClientRect(); for (let y = Math.max(v.top + 20, c.top); y < Math.min(v.bottom - 20, c.bottom); y += 6) { const x = c.left + c.width / 2; if ([-12, 0, 12].every((d) => document.elementFromPoint(x, y + d) === col)) return { x, y }; } } return null; });
    check("found an empty hour to tap", !!spot);
    await page.evaluate(() => { window.__f = []; document.addEventListener("focusin", (e) => { if (e.target.id === "pTitle") window.__f.push({ t: Math.round(performance.now()), top: document.querySelector("#panel").getBoundingClientRect().top }); }); });
    await page.touchscreen.tap(spot.x, spot.y);
    await sleep(120);
    const early = await page.evaluate(() => document.activeElement && document.activeElement.id);
    check("new event: the Title is not focused while the sheet is still sliding in (120 ms)", early !== "pTitle", early);
    await sleep(700);
    const f = await page.evaluate(() => ({ active: document.activeElement && document.activeElement.id, ev: window.__f, top: document.querySelector("#panel").getBoundingClientRect().top }));
    check("new event: the Title is focused once the sheet has settled", f.active === "pTitle", JSON.stringify(f));
    check("new event: it took focus only when the sheet was already in place (not behind the keyboard line)", f.ev.length >= 1 && near(f.ev[0].top, f.top, 2), JSON.stringify(f));
    await ctx.close(); }

  /* ---- the readout's kb line carries the page scroll and the sheet content scroll ---- */
  { const { ctx, page } = await open();
    await newEvent(page); await keyboard(page);
    await page.evaluate(() => { document.querySelector("#pTitle").focus(); sheetFit(); });
    await page.evaluate(() => { const s = document.createElement("script"); s.src = "calendar-readout.js?v=test"; document.head.appendChild(s); });
    await page.waitForSelector("#readout"); await sleep(400);
    const text = await page.evaluate(() => document.querySelector("#readout").innerText);
    const line = (text.match(/\nkb [^\n]*/) || [""])[0].trim();
    check("readout kb line: ends with page scroll, document scroll and sheet content scroll", /title \d+\.\.\d+ scroll win -?\d+ doc -?\d+ body -?\d+$/.test(line), line);
    await ctx.close(); }
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
