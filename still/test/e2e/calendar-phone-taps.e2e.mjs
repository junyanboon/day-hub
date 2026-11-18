// Phone taps and scroll ends (Junyan, 2026-11-12; scope "(not the desktop just mobile"):
// - "the 2nd screenshot is glitchy. when I click stuff nothing happens": in the Cal TEST app the readout box (opened by
//   itself there) sat over the lower half of the event sheet and swallowed taps on the calendar list, Delete, Save and
//   "Open the Travel page". Now taps go through the box to the sheet; only its own Pause and x buttons take taps.
// - "When I scroll up hard Sun 1 goes down butn ot the top bar": the day list and every phone scroller have
//   overscroll-behavior none on touch. Chrome cannot show the iOS rubber band, so this checks the computed style only;
//   the real proof is his phone.
// - d20 ("20 yes"): one tap on the month name opens the picker without re-laying the page, and a second tap closes it.
// Not part of `node --test`: it needs playwright-core and Google Chrome.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-phone-taps.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8804), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" };
/** Open a fresh phone page on the dev data. */
async function open(ctxOpts = phone, n = "3") {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((n) => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", n); }, n);
  await page.goto(URL_); await page.waitForSelector(".ev"); await sleep(600);
  return { ctx, page, errors };
}
const centre = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
/** Open the multi-day all-day "Stay at FICTION" (a writable calendar) in the event sheet. */
const openStay = async (page) => { await page.evaluate(() => [...document.querySelectorAll("[data-key],[data-allday]")].find((x) => x.textContent.trim() === "Stay at FICTION").click()); await sleep(700); };
/** The sheet's controls whose middle is covered by something else, with what covers them. */
const covered = (page) => page.evaluate(() => [...document.querySelectorAll(".panel button,.panel select,.panel a,.panel input")]
  .filter((el) => el.getClientRects().length).map((el) => { const b = el.getBoundingClientRect(), h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return h === el || el.contains(h) ? null : `${el.id || el.textContent.trim().slice(0, 16)} under ${h ? h.id || h.className || h.tagName : "nothing"}`; })
  .filter(Boolean));

try {
  /* ---- the readout never swallows the event sheet's taps ---- */
  {
    const { ctx, page, errors } = await open();
    await page.evaluate(() => readout()); await sleep(800);
    check("readout is open", await page.evaluate(() => !document.querySelector("#readout").hidden));
    await openStay(page);
    const c = (await covered(page)).filter((x) => !/under readout(Pause|Close)$/.test(x));
    check("readout open: no sheet control is under the readout's text", !c.length, c.join("; "));
    const ids = await page.evaluate(() => ["pCal", "pDel", "pSave"].map((i) => !!document.getElementById(i)));
    check("the sheet has the calendar list, Delete and Save", ids.every(Boolean), ids.join());
    let [x, y] = await centre(page, "#pSave");
    await page.touchscreen.tap(x, y); await sleep(500);
    check("readout open: a tap on Save closes the sheet", await page.evaluate(() => S.tab === "now" && !S.ev));
    await openStay(page);
    [x, y] = await centre(page, ".panel [data-page]");
    await page.touchscreen.tap(x, y); await sleep(500);
    check("readout open: a tap on Open the Travel page opens it", await page.evaluate(() => S.page === "travel"), await page.evaluate(() => S.page));
    await page.evaluate(() => showPage("cal")); await sleep(300);
    [x, y] = await centre(page, "#readoutClose");
    await page.touchscreen.tap(x, y); await sleep(300);
    check("the readout's x still closes it", await page.evaluate(() => document.querySelector("#readout").hidden));
    check("no page errors", !errors.length, errors.join(" | "));
    await ctx.close();
  }

  /* ---- d20: one tap on the month name opens the picker and leaves the page alone; a second tap closes it ---- */
  {
    const { ctx, page, errors } = await open();
    const before = await page.evaluate(() => ({ body: getComputedStyle(document.body).display, title: Math.round(document.querySelector("#title").getBoundingClientRect().top), view: Math.round(document.querySelector("#view").getBoundingClientRect().top) }));
    let [x, y] = await centre(page, "#title");
    await page.touchscreen.tap(x, y); await sleep(600);
    const after = await page.evaluate(() => ({ open: document.body.classList.contains("month"), body: getComputedStyle(document.body).display, title: Math.round(document.querySelector("#title").getBoundingClientRect().top), view: Math.round(document.querySelector("#view").getBoundingClientRect().top) }));
    check("one tap on the month name opens the picker", after.open);
    check("the picker does not turn the page into a grid", after.body === before.body && after.body !== "grid", `${before.body} > ${after.body}`);
    check("the month name and the day list stay where they were", after.title === before.title && after.view === before.view, JSON.stringify({ before, after }));
    await page.touchscreen.tap(x, y); await sleep(600);
    check("a second tap a moment later closes the picker", !(await page.evaluate(() => document.body.classList.contains("month"))));
    await openStay(page);
    const c = await covered(page);
    check("after the picker: every sheet control takes its tap", !c.length, c.join("; "));
    check("no page errors", !errors.length, errors.join(" | "));
    await ctx.close();
  }

  /* ---- touch: no bounce at the ends of any scroller or the page ---- */
  {
    const { ctx, page } = await open();
    const ob = async (sel) => page.evaluate((s) => { const e = document.querySelector(s); const c = getComputedStyle(e); return c.overscrollBehaviorY + "/" + c.overscrollBehaviorX; }, sel);
    for (const sel of ["html", "body", "#view", "#pbody"]) check(`touch: ${sel} never bounces`, (await ob(sel)) === "none/none", await ob(sel));
    await page.evaluate(() => document.body.classList.add("month")); await sleep(200);
    check("touch: the month picker never bounces", (await ob(".left")) === "none/none", await ob(".left"));
    await page.evaluate(() => { document.body.classList.remove("month"); setN("m"); }); await sleep(500);
    check("touch: the month view (same scroller) never bounces", !!(await page.$(".month")) && (await ob("#view")) === "none/none", await ob("#view"));
    await ctx.close();
  }

  /* ---- desktop: unchanged ---- */
  {
    const { ctx, page } = await open({ viewport: { width: 1280, height: 800 }, timezoneId: "America/Toronto" });
    const d = await page.evaluate(() => ["html", "body", "#view", "#pbody"].map((s) => getComputedStyle(document.querySelector(s)).overscrollBehaviorY));
    check("desktop: overscroll left as it was (auto)", d.every((x) => x === "auto"), d.join());
    await page.evaluate(() => setN("m")); await sleep(500);
    check("desktop: the month view is still a 7-column grid", await page.evaluate(() => getComputedStyle(document.querySelector("div.month")).gridTemplateColumns.split(" ").length === 7));
    await ctx.close();
  }
} finally {
  await browser.close(); server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
