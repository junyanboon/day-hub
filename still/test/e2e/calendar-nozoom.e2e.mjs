// The calendar never zooms on the phone, and a pasted pairing code lands clean and visible (Junyan, 2026-11-12: "there
// shouldn't be any optino to zoom on a calendar app right? Also when I try to paste the pairing code in it adds extra
// digits"; scope "not the desktop just mobile"). iOS zooms the page when a focused text box has text under 16px, so
// every text box on a touch phone must be 16px or more; the viewport forbids pinch zoom; touch-action stops double-tap
// zoom. The pairing box shows what is in it, and a paste drops spaces and line breaks and replaces the box.
// Not part of `node --test`: it needs playwright-core and Google Chrome.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-nozoom.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8803), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

/** Every text box, select and textarea on the page with its computed text size (checkboxes and hidden ones skipped). */
const sizes = (page) => page.evaluate(() => [...document.querySelectorAll("input,select,textarea")]
  .filter((el) => !["checkbox", "radio", "range", "color", "hidden"].includes(el.type) && el.getClientRects().length)
  .map((el) => ({ id: el.id || el.className || el.tagName, px: parseFloat(getComputedStyle(el).fontSize) })));
const small = (list) => list.filter((x) => x.px < 16);
const fmt = (list) => list.map((x) => `${x.id} ${x.px}px`).join(", ");

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
try {
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" };

  /* ---- the viewport forbids zoom ---- */
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", "1"); });
  await page.goto(URL_); await page.waitForSelector(".ev"); await sleep(600);
  const vp = await page.evaluate(() => document.querySelector('meta[name="viewport"]').content);
  check("viewport: maximum-scale=1", /maximum-scale=1(\.0)?\b/.test(vp), vp);
  check("viewport: user-scalable=no", /user-scalable=no/.test(vp), vp);

  /* ---- touch-action stops double-tap zoom on the whole page ---- */
  const ta = await page.evaluate(() => [getComputedStyle(document.documentElement).touchAction, getComputedStyle(document.body).touchAction]);
  check("touch page: html and body are touch-action manipulation", ta.every((t) => t === "manipulation"), ta.join(" / "));

  /* ---- every text box is 16px or more: the main page, the event editor, settings ---- */
  let s = await sizes(page);
  // the phone has no New task bar any more (d1, 2026-11-12), so the main page may have no text box at all
  check("phone, calendar: no text box under 16px", !small(s).length, fmt(small(s)) || fmt(s) || "no text box shown");
  await page.evaluate(() => document.querySelector(".ev").click()); await sleep(700);
  s = await sizes(page);
  check("phone, event editor: no text box under 16px", s.some((x) => x.id === "pTitle") && !small(s).length, fmt(small(s)) || fmt(s));
  const title = s.find((x) => x.id === "pTitle");
  check("phone, event editor: the title stays big (20px)", title && title.px === 20, title && title.px + "px");
  await page.evaluate(() => document.querySelector('[data-p="set"]').click()); await sleep(500);
  s = await sizes(page);
  check("phone, settings: no select under 16px", s.some((x) => x.id === "tz1") && !small(s).length, fmt(small(s)) || fmt(s));
  check("phone: no page errors", !errors.length, errors.join(" | "));
  await ctx.close();

  /* ---- the pairing box: visible, plain, no autocorrect or autofill offer, 16px+ ---- */
  const pctx = await browser.newContext(phone);
  const pp = await pctx.newPage();
  await pp.goto(URL_); await pp.waitForSelector("#pairIn");
  const attrs = await pp.evaluate(() => { const i = document.querySelector("#pairIn"); return { type: i.type, ac: i.getAttribute("autocomplete"), cap: i.getAttribute("autocapitalize"), cor: i.getAttribute("autocorrect"), spell: i.spellcheck, px: parseFloat(getComputedStyle(i).fontSize) }; });
  check("pairing box: shows the code as plain text", attrs.type === "text", attrs.type);
  check("pairing box: no autofill, autocapitalize, autocorrect or spellcheck", attrs.ac === "off" && attrs.cap === "off" && attrs.cor === "off" && attrs.spell === false, JSON.stringify(attrs));
  check("pairing box: text 16px or more", attrs.px >= 16, attrs.px + "px");

  /** Paste text into the pairing box the way a phone does: a paste event carrying the clipboard text. */
  const paste = (text) => pp.evaluate((t) => {
    const i = document.querySelector("#pairIn"); i.focus();
    const dt = new DataTransfer(); dt.setData("text/plain", t);
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    if (i.dispatchEvent(ev)) { i.setRangeText(t, i.selectionStart, i.selectionEnd, "end"); i.dispatchEvent(new Event("input", { bubbles: true })); }   // what the browser does if the page lets it
    return i.value;
  }, text);
  await pp.fill("#pairIn", "old123");
  let v = await paste("  Ab3d ef9\n gh-7\r\n ");
  check("paste: spaces and line breaks dropped, and it replaces what was there", v === "Ab3def9gh-7", JSON.stringify(v));
  v = await paste("Ab3def9gh-7");
  check("paste twice: still one copy of the code", v === "Ab3def9gh-7", JSON.stringify(v));
  await pctx.close();

  /* ---- desktop looks and behaves as before ---- */
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: "America/Toronto" });
  const dp = await dctx.newPage();
  await dp.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
  await dp.goto(URL_); await dp.waitForSelector(".ev"); await sleep(400);
  const d = await dp.evaluate(() => ({ nt: getComputedStyle(document.querySelector("#newTask")).fontSize, ta: getComputedStyle(document.body).touchAction }));
  check("desktop: the new task box keeps its 13px text", d.nt === "13px", d.nt);
  check("desktop: no touch-action change", d.ta === "auto", d.ta);
  await dctx.close();
  const d2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: "America/Toronto" });
  const dp2 = await d2.newPage();
  await dp2.goto(URL_); await dp2.waitForSelector("#pairIn");
  const dt = await dp2.evaluate(() => document.querySelector("#pairIn").type);
  check("desktop: the pairing box is unchanged (hidden code)", dt === "password", dt);
  await d2.close();
} finally {
  await browser.close(); server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
