// Community Birthdays on the calendar (Junyan, 2026-11-24: "Also can we add the community birthdays as well to the
// calendar (put it somewhere that it doesn't get in the way)"). The calendar is display only: its events never draw as
// pills, timed blocks or month pills and never make the day header taller. A day that has one shows a small cake chip in
// the day header (a count when there are several); a tap opens the plain list titled "Birthdays". Month view shows one
// small cake mark, no text. The left rail lists the calendar read-only and its tick hides or shows the chips. A birthday
// is never editable and the Now panel ("Rest of today") leaves it out.
// The clock is pinned: the dev server runs with DEV_TODAY=2026-11-24 and the page with page.clock, so no check reads the
// real clock. Today is Tue Nov 24, 10:00 Toronto. Dev data (calendar-dev.mjs): Remembrance Day on +1, Caney's and Ada's
// birthdays on +5, a timed "Cake at the studio" 15:00 on today, all on the display-only calendar "bday".
// Not part of `node --test`: it needs playwright-core and the test browser (`sh scripts/install-test-browser.sh`).
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-birthdays.e2e.mjs
//   SHOTS=<folder> also saves the computer and phone screenshots there.
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8837), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const SHOTS = process.env.SHOTS || "";
const NOW = new Date("2026-11-24T15:00:00Z");   // 10:00 in Toronto
const D = (n) => new Date(Date.UTC(2026, 10, 24 + n)).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_TODAY: "2026-11-24", TZ: "America/Toronto" } });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await launchTestBrowser(chromium);
const desktop = { viewport: { width: 1280, height: 900 }, timezoneId: "America/Toronto" };
const phone = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" };
async function open(ctxOpts, n = "7") {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errors = [], writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (/\/planner\/event(\?|$)/.test(r.url()) && r.method() !== "GET") writes.push(r.method()); });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((n) => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", n); }, n);
  await page.goto(URL_); await page.waitForSelector(".ev"); await sleep(600);
  return { ctx, page, errors, writes };
}
const day = (page, k, sel) => page.evaluate(([k, sel]) => { const el = document.querySelector(`.day[data-day="${k}"] ${sel}`); if (!el) return null; const r = el.getBoundingClientRect(); return { text: el.textContent.trim(), h: Math.round(r.height * 10) / 10, w: Math.round(r.width * 10) / 10 }; }, [k, sel]);
const headH = (page, k) => day(page, k, ".dhead").then((r) => r && r.h);
const panelTitle = (page) => page.evaluate(() => document.querySelector("#pbody .big")?.textContent.trim() || "");
const panelRows = (page) => page.evaluate(() => [...document.querySelectorAll("#pbody .row")].map((r) => ({ text: r.textContent.replace(/\s+/g, " ").trim(), button: r.tagName === "BUTTON", key: r.dataset.key || "" })));
const tickBday = (page) => page.evaluate(() => [...document.querySelectorAll("#cals label")].find((l) => /Community Birthdays/.test(l.textContent)).querySelector("input").click());

try {
  /* ---- computer: chips, no pills, header height, the list, the mark in month view, the tick ---- */
  { const { ctx, page, errors, writes } = await open(desktop);
    const noPill = (title) => page.evaluate((t) => ![...document.querySelectorAll(".pill,.ev,.pip,.p")].some((x) => x.textContent.includes(t)), title);
    check("a day with one birthday shows a 🎂 chip, no count", (await day(page, D(1), ".bday"))?.text === "🎂", JSON.stringify(await day(page, D(1), ".bday")));
    check("two birthdays show the cake and a count", (await day(page, D(5), ".bday"))?.text === "🎂 2", JSON.stringify(await day(page, D(5), ".bday")));
    check("a day with none has no chip", (await day(page, D(2), ".bday")) === null);
    check("no all-day pill for a birthday", (await noPill("Remembrance Day")) && (await noPill("Caney's Birthday")) && (await noPill("Ada's Birthday")));
    check("a timed birthday-calendar event draws no block today", await noPill("Cake at the studio"));
    check("the chip sits by the day number, in the day header", await page.evaluate((k) => { const c = document.querySelector(`.day[data-day="${k}"] .dn .bday`); return !!c && !!c.parentElement.querySelector("[data-open]"); }, D(1)));
    const hBday = await headH(page, D(1)), hNone = await headH(page, D(2)), hTwo = await headH(page, D(5));
    check("the header is no taller for a birthday (one or two)", hBday === hNone && hTwo === hNone, `${hBday} / ${hTwo} vs ${hNone}`);
    check("the day's all-day row count ignores birthdays", (await page.evaluate((k) => document.querySelector(`.day[data-day="${k}"]`).dataset.ad, D(1))) === "0");
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "birthdays-computer.png") });

    await page.click(`.day[data-day="${D(5)}"] .bday`); await sleep(400);
    check("the chip opens the plain list titled Birthdays", (await panelTitle(page)) === "Birthdays", await panelTitle(page));
    const rows = await panelRows(page);
    check("the list names both birthdays", rows.length === 2 && rows.some((r) => /Caney's Birthday/.test(r.text)) && rows.some((r) => /Ada's Birthday/.test(r.text)), JSON.stringify(rows));
    check("a birthday row is not a button and opens nothing", rows.every((r) => !r.button && !r.key));
    await page.click("#pbody .row"); await sleep(300);
    check("tapping a birthday row never opens the event panel", (await panelTitle(page)) === "Birthdays" && !(await page.$("#pTitle")));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "birthdays-computer-list.png") });

    await page.click(`.day[data-day="${D(1)}"] .bday`); await sleep(300);
    check("one birthday lists as one row", (await panelRows(page)).length === 1);

    await page.evaluate(() => panel("now")); await sleep(300);
    const now = await page.evaluate(() => document.querySelector("#pbody").textContent);
    check("the Now panel and Rest of today leave birthdays out", !/Cake at the studio|Birthday|Remembrance/.test(now), now.slice(0, 120));
    check("no write went out", writes.length === 0, writes.join());

    const lab = await page.evaluate(() => [...document.querySelectorAll("#cals label")].find((l) => /Community Birthdays/.test(l.textContent))?.textContent.replace(/\s+/g, " ").trim());
    check("the rail lists Community Birthdays as read-only", /Community Birthdays read-only/.test(lab || ""), lab);
    await tickBday(page); await sleep(400);
    check("unticking the calendar hides every chip", (await page.$$(".bday")).length === 0);
    await tickBday(page); await sleep(400);
    check("ticking it shows them again", (await page.$$(".bday")).length >= 3);

    await page.click('[data-n="m"]'); await sleep(500);
    const mk = await page.evaluate((k) => { const c = document.querySelector(`.mday[data-k="${k}"]`); const m = c.querySelectorAll(".bd"); return { n: m.length, text: m[0]?.textContent.trim(), cell: c.textContent }; }, D(1));
    check("month view shows one 🎂 mark and no text", mk.n === 1 && mk.text === "🎂" && !/Remembrance/.test(mk.cell), JSON.stringify(mk));
    check("two birthdays still show one month mark", (await page.evaluate((k) => document.querySelectorAll(`.mday[data-k="${k}"] .bd`).length, D(5))) === 1);
    check("month view has no birthday pills", await page.evaluate(() => ![...document.querySelectorAll(".mday .p")].some((x) => /Birthday|Remembrance|Cake/.test(x.textContent))));
    check("a day with none has no month mark", await page.evaluate((k) => !document.querySelector(`.mday[data-k="${k}"] .bd`), D(2)));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "birthdays-computer-month.png") });
    await tickBday(page); await sleep(300);
    check("the tick hides the month marks too", (await page.$$(".bd")).length === 0);
    check("no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  /* ---- phone: a 44 px touch target, the sheet list ---- */
  { const { ctx, page, errors, writes } = await open(phone, "3");
    const k = D(1);
    const chip = await day(page, k, ".bday");
    check("phone: the chip is a wide touch box (44 across; in a column under 160 px it sits level with the strip, 17 tall, clear of the name row)", !!chip && chip.w >= 44 && chip.h >= 17, JSON.stringify(chip));
    check("phone: the chip stays inside the header (nothing clipped)", await page.evaluate((k) => { const c = document.querySelector(`.day[data-day="${k}"] .bday`).getBoundingClientRect(), h = document.querySelector(`.day[data-day="${k}"] .dhead`).getBoundingClientRect(); return c.top >= h.top - 0.5 && c.bottom <= h.bottom + 0.5; }, k));
    check("phone: header height unchanged by a birthday", (await headH(page, k)) === (await headH(page, D(2))), `${await headH(page, k)} vs ${await headH(page, D(2))}`);
    const spill = await page.evaluate(() => [...document.querySelectorAll(".dhead .dn")].flatMap((d) => { const day = d.closest(".day").getBoundingClientRect(); return [...d.querySelectorAll("span,b")].filter((x) => x.getClientRects().length).filter((x) => { const r = x.getBoundingClientRect(); return r.left < day.left + 2 || r.right > day.right - 2; }).map((x) => x.textContent.trim()); }));
    check("phone: no day header row spills over its day (chips and number all fit)", spill.length === 0, spill.join(" ; "));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "birthdays-phone.png") });
    await page.tap(`.day[data-day="${k}"] .bday`); await sleep(700);
    check("phone: the tap opens the list sheet titled Birthdays", (await panelTitle(page)) === "Birthdays" && await page.evaluate(() => document.body.classList.contains("popen")));
    check("phone: the sheet names the birthday", (await panelRows(page)).some((r) => /Remembrance Day/.test(r.text)));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "birthdays-phone-list.png") });
    check("phone: no write went out and no page errors", writes.length === 0 && errors.length === 0, errors.join(" | "));
    await ctx.close(); }
} finally {
  await browser.close(); server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
