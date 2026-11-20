// The phone's two sheets close by the dash or a tap outside, never an x (BUILD 2026-11-12m; Junyan, 2026-11-12: "Let's
// not have the X close just me pressing the long dash at the top is good neough or clicking off the menu should close
// it"). Both sheets are the one #panel: the event sheet (Event, Save) and the menu from the three-line button (Now,
// Settings, Shortcuts). Checks at phone size against the fake backend (calendar-dev.mjs):
//   - no x on either sheet; the dash (grabber) is drawn thin but takes a tap 44 px high;
//   - a tap on the dash closes, a tap outside closes, and the tap outside does nothing else (no event opens behind it,
//     no new event starts); a tap on a text box, a row, the "Event" label or a tab never closes;
//   - closing does what x did: unsaved typing is dropped, nothing is sent, a half-made new event is removed;
//   - with the keyboard up (home screen app, Top clear) the dash shows below the clear strip and still closes;
//   - a desktop window keeps its x on the side panel.
// Chrome cannot show the iOS keyboard or the system blur; only his phone proves those (rule W84).
// Not part of `node --test`: it needs playwright-core and the test browser (`sh scripts/install-test-browser.sh`).
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-dashclose.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8826), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await launchTestBrowser(chromium);

async function open({ viewport = { width: 390, height: 844 }, mobile = true, standalone, safe } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" } : { viewport, timezoneId: "America/Toronto" });
  const page = await ctx.newPage(), errors = [], sent = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (/\/planner\/event(\?|$)/.test(r.url()) && r.method() !== "GET") sent.push({ m: r.method(), b: JSON.parse(r.postData() || "{}") }); });
  if (standalone) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true }));
  if (safe) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: safe }); }
  await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", "3"); });
  await page.goto(URL_); await page.waitForSelector(".ev"); await sleep(600);
  return { ctx, page, errors, sent };
}
const openEv = async (page, title, d) => { const ok = await page.evaluate(([title, d]) => { const k = C.addDays(today(), d); const ev = eventsFor(k, k).find((e) => e.title === title && C.wall(e.s, S.tz).day === k); if (ev) panel("event", ev); return !!ev; }, [title, d]); await sleep(450); return ok; };
const newEvent = async (page) => { await page.evaluate(() => { const s = C.instant(C.addDays(today(), 1), 540, S.tz); panel("event", { isNew: true, id: "draft", calId: "joint", title: "", s, e: s + 3600000, start: new Date(s).toISOString(), end: new Date(s + 3600000).toISOString(), k: "other" }); }); await sleep(450); };
const box = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; }, sel);
const tapAt = async (page, x, y) => { await page.touchscreen.tap(x, y); await sleep(450); };
const tap = async (page, sel) => { const b = await box(page, sel); if (!b) return false; await tapAt(page, b.left + b.w / 2, b.top + b.h / 2); return true; };
const isOpen = (page) => page.evaluate(() => document.body.classList.contains("popen"));
const state = (page) => page.evaluate(() => ({ open: document.body.classList.contains("popen"), tab: S.tab, ev: !!S.ev, draft: !!document.querySelector(".ev.draft, .draft"), on: !!document.querySelector(".ev.on") }));
/** A tap well outside the sheet: on the calendar near the top of the hours, where an event or an empty hour sits. */
const outside = async (page) => { const p = await box(page, "#panel"); await tapAt(page, 200, Math.max(140, p.top / 2)); };
/** Any visible x anywhere in the open panel. */
const anyX = (page) => page.evaluate(() => [...document.querySelectorAll("#panel button")].filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== "hidden" && /✕|×/.test(b.textContent)).map((b) => b.id || b.className));
/** The drawn dash (its painted bar, the ::before) and the tap area (the button itself). */
const grab = (page) => page.evaluate(() => { const g = document.querySelector("#panel .grab"); if (!g || !g.getClientRects().length) return null; const r = g.getBoundingClientRect(), cs = getComputedStyle(g, "::before"); return { tag: g.tagName, label: g.getAttribute("aria-label"), top: r.top, h: r.height, w: r.width, barW: parseFloat(cs.width), barH: parseFloat(cs.height), barTop: r.top + parseFloat(cs.top || 0) }; });
const KB = 395;
const keyboard = (page) => page.evaluate((kb) => { Object.defineProperty(window, "visualViewport", { configurable: true, value: { height: innerHeight - kb, offsetTop: 0, pageTop: 0, width: innerWidth, scale: 1, addEventListener() {}, removeEventListener() {} } }); }, KB);

try {
  /* ---- the event sheet: no x, a dash you can hit, and what each tap does ---- */
  { const { ctx, page, errors, sent } = await open();
    check("Work block opens in the sheet", await openEv(page, "Work block", 2) && await isOpen(page));
    check("event sheet: no x button", (await anyX(page)).length === 0 && !(await page.$("#pX")), JSON.stringify(await anyX(page)));
    const head = await page.evaluate(() => [document.querySelector(".shead b")?.textContent, document.querySelector("#pSave")?.textContent]);
    check('event sheet: "Event" and Save stay', head.join("|") === "Event|Save", head.join("|"));
    const g = await grab(page);
    check("event sheet: the dash is a button named Close", g && g.tag === "BUTTON" && g.label === "Close", JSON.stringify(g));
    check("event sheet: the dash takes a tap 44 px high and wide enough for a thumb", g && g.h >= 44 && g.w >= 88, JSON.stringify(g));
    check("event sheet: the drawn dash stays thin (about 40 x 4)", g && g.barW >= 30 && g.barW <= 60 && g.barH <= 6, JSON.stringify(g));
    /* taps inside never close */
    await tap(page, "#pTitle"); check("a tap on the Title box keeps it open", await isOpen(page));
    await page.evaluate(() => document.activeElement?.blur());
    await tap(page, ".shead b"); check('a tap on "Event" keeps it open', await isOpen(page));
    await tap(page, '.sheet [data-f="location"]'); check("a tap on the Location box keeps it open", await isOpen(page));
    await page.evaluate(() => document.activeElement?.blur());
    await tap(page, '[data-sheet="type"]'); check("a tap on the Type row keeps it open", await isOpen(page));
    /* the dash: unsaved typing is dropped, the way x dropped it */
    await page.fill("#pTitle", "Work block CHANGED"); await page.fill('.sheet [data-f="location"]', "Somewhere new"); await page.evaluate(() => document.activeElement?.blur());
    const n0 = sent.length;
    await tap(page, "#panel .grab");
    let s = await state(page);
    check("a tap on the dash closes the sheet", !s.open && s.tab === "now" && !s.ev, JSON.stringify(s));
    check("the dash sends nothing (unsaved typing is dropped)", sent.length === n0, JSON.stringify(sent.slice(n0)));
    await openEv(page, "Work block", 2);
    check("reopened after the dash: the old title, no location", await page.evaluate(() => document.querySelector("#pTitle").value === "Work block" && !document.querySelector('.sheet [data-f="location"]').value));
    /* a tap outside: closes, drops typing, and does nothing else */
    await page.fill("#pTitle", "Work block AGAIN"); await page.evaluate(() => document.activeElement?.blur());
    await outside(page);
    s = await state(page);
    check("a tap outside closes the sheet", !s.open && s.tab === "now" && !s.ev, JSON.stringify(s));
    check("the tap outside opens nothing behind it and starts no new event", !s.draft && !s.on && sent.length === n0, JSON.stringify(s));
    await openEv(page, "Work block", 2);
    check("reopened after a tap outside: the old title", await page.evaluate(() => document.querySelector("#pTitle").value === "Work block"));
    await tap(page, "#panel .grab");
    check("no page errors (event sheet)", !errors.length, errors.join("; "));
    await ctx.close(); }

  /* ---- a new event, half typed: a tap outside removes it, the way x did ---- */
  { const { ctx, page, errors, sent } = await open();
    await newEvent(page); await page.fill("#pTitle", "Half typed"); await page.evaluate(() => document.activeElement?.blur());
    await outside(page);
    const s = await state(page);
    check("new event: a tap outside closes it and removes the new card", !s.open && !s.draft, JSON.stringify(s));
    check("new event: nothing is saved", !sent.length, JSON.stringify(sent));
    await newEvent(page); await tap(page, "#panel .grab");
    check("new event: the dash closes it and nothing is saved", !(await isOpen(page)) && !sent.length);
    check("no page errors (new event)", !errors.length, errors.join("; "));
    await ctx.close(); }

  /* ---- the three-line menu: the same two ways out, no x ---- */
  { const { ctx, page, errors } = await open();
    await tap(page, "#panelBtn");
    check("the three-line button opens the menu", await isOpen(page) && await page.evaluate(() => S.tab === "now"));
    check("menu: no x button", (await anyX(page)).length === 0, JSON.stringify(await anyX(page)));
    const g = await grab(page);
    check("menu: the dash takes a tap 44 px high", g && g.h >= 44 && g.w >= 88, JSON.stringify(g));
    await tap(page, '.ptabs [data-p="set"]');
    check("menu: a tap on Settings keeps it open", await isOpen(page) && await page.evaluate(() => S.tab === "set"));
    await tap(page, "#panel .grab");
    check("menu: a tap on the dash closes it", !(await isOpen(page)));
    await tap(page, "#panelBtn"); await outside(page);
    const s = await state(page);
    check("menu: a tap outside closes it and opens nothing behind", !s.open && !s.draft && !s.on, JSON.stringify(s));
    check("no page errors (menu)", !errors.length, errors.join("; "));
    await ctx.close(); }

  /* ---- keyboard up in the home screen app (Top clear): the dash shows below the clear strip and closes ---- */
  { const { ctx, page, errors, sent } = await open({ viewport: { width: 402, height: 874 }, standalone: true, safe: { top: 62, bottom: 34 } });
    await newEvent(page); await keyboard(page);
    await page.evaluate(() => { document.querySelector("#pTitle").focus(); sheetFit(); });
    const g = await grab(page), head = await box(page, ".shead");
    check("keyboard up: the dash shows", !!g, JSON.stringify(g));
    check("keyboard up: the drawn dash sits below the clear strip (100)", g && g.barTop >= 100, JSON.stringify(g));
    check("keyboard up: the dash takes a tap 44 px high, inside the header row (layout D, d43)", g && g.h >= 44 && g.top >= head.top - 0.5 && g.top + g.h <= head.top + head.h + 0.5, JSON.stringify({ g, head }));
    await page.fill("#pTitle", "Typed with the keyboard up");
    await tap(page, "#panel .grab");
    check("keyboard up: a tap on the dash closes it and saves nothing", !(await isOpen(page)) && !sent.length);
    check("no page errors (keyboard)", !errors.length, errors.join("; "));
    await ctx.close(); }

  /* ---- a desktop window keeps its x on the side panel; no dash, no cover ---- */
  { const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 }, mobile: false });
    check("1280px: the side panel keeps its x", !!(await box(page, "#pClose")));
    check("1280px: no dash", !(await grab(page)));
    await openEv(page, "Work block", 2);
    const hit = await page.evaluate(() => { const el = document.elementFromPoint(400, 300); return el && !!el.closest("#view"); });
    check("1280px: with an event open, the calendar still takes clicks (no cover)", hit);
    check("no page errors (desktop)", !errors.length, errors.join("; "));
    await ctx.close(); }
} finally {
  await browser.close(); server.kill();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  process.exitCode = bad.length ? 1 : 0;
}
