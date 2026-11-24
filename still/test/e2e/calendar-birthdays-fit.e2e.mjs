// The Community Birthdays cake must fit the day header (Junyan, 2026-11-24: "put it somewhere that it doesn't get in the way").
// A day with the studio key chip AND birthdays shows its full day name and number, the key chip (where the column is wide
// enough to show it) and the cake with its count: each fully inside its column, nothing overlapping, and the header exactly
// as tall as a day without birthdays. Dev data (calendar-dev.mjs), today Tue Nov 24: +0 has keys and one birthday, +1 keys
// and one, +5 keys and two, +2 neither. The clock is pinned (DEV_TODAY and page.clock); test browser only.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-birthdays-fit.e2e.mjs
//   SHOTS=<folder> saves the Week 1280 and phone 7 screenshots there.  DEV_ROOT=<other copy of the pages> checks that copy
//   (key chip alone on main: set KEYS_ONLY=1, which tests the days that have no birthday on a copy that lacks the feature).
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8838), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const SHOTS = process.env.SHOTS || "", KEYS_ONLY = !!process.env.KEYS_ONLY;
const NOW = new Date("2026-11-24T15:00:00Z");   // 10:00 in Toronto
const D = (n) => new Date(Date.UTC(2026, 10, 24 + n)).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_TODAY: "2026-11-24", TZ: "America/Toronto" } });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await launchTestBrowser(chromium);
const desktop = { viewport: { width: 1280, height: 900 }, timezoneId: "America/Toronto" };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" };
async function open(ctxOpts, n) {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((n) => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", n); }, n);
  await page.goto(URL_); await page.waitForSelector(".ev"); await sleep(600);
  return { ctx, page, errors };
}
/** The boxes of one day's header parts, measured in the page: the column, the header, the name and number (a Range over the
    text, so a clipped letter still counts), the key chip and the cake. */
const measure = (page, k) => page.evaluate((k) => {
  const col = document.querySelector(`.day[data-day="${k}"]`); if (!col) return null;
  const box = (el) => { if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const text = (el) => { if (!el) return null; const g = document.createRange(); g.selectNodeContents(el); const r = g.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const name = col.querySelector(".dn > span[data-open]"), num = name?.querySelector("b"), cake = col.querySelector(".bday span") || col.querySelector(".bday");
  const nameBox = text(name);
  return { col: box(col), head: box(col.querySelector(".dhead")), name: nameBox, num: text(num), keys: box(col.querySelector(".keys")), shape: box(col.querySelector(".shape")), cake: box(cake), tap: box(col.querySelector(".bday")), cakeText: col.querySelector(".bday")?.textContent.trim() || "", nameText: name?.textContent.replace(/\s+/g, " ").trim() || "" };
}, k);
const inside = (a, c) => !!a && a.l >= c.l - 0.5 && a.r <= c.r + 0.5 && a.t >= c.t - 0.5 && a.b <= c.b + 0.5;
const apart = (a, b) => !a || !b || a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;
const heads = (page) => page.evaluate(() => [...document.querySelectorAll(".day .dhead")].map((h) => Math.round(h.getBoundingClientRect().height * 10) / 10));

async function checkDay(label, page, k, want) {
  const m = await measure(page, k);
  if (!m) return check(`${label}: day ${k} is on screen`, false);
  const parts = { "day name and number": m.name, "number": m.num, ...(want.keys ? { "key chip": m.keys } : {}), ...(want.cake ? { "cake": m.cake } : {}) };
  for (const [n, b] of Object.entries(parts)) check(`${label}: ${n} is fully inside its column`, inside(b, m.col) && inside(b, m.head), JSON.stringify(b) + " in " + JSON.stringify(m.col));
  if (want.cake) check(`${label}: the cake shows its count (${want.cake})`, m.cakeText === want.cake, m.cakeText);
  if (want.keys) check(`${label}: the key chip is shown`, !!m.keys);
  const pairs = [["name", m.name, "key chip", m.keys], ["name", m.name, "cake", m.cake], ["key chip", m.keys, "cake", m.cake]];
  for (const [a, ab, b, bb] of pairs) if (ab && bb) check(`${label}: ${a} and ${b} do not overlap`, apart(ab, bb), JSON.stringify(ab) + " vs " + JSON.stringify(bb));
  if (want.cake) check(`${label}: the tap box is inside the column`, inside(m.tap, m.col), JSON.stringify(m.tap));
  if (want.cake) check(`${label}: the tap box does not cover the key chip or the name`, apart(m.tap, m.keys) && apart(m.tap, m.name), JSON.stringify(m.tap));
  if (want.cake && m.cake && m.name && m.cake.t > m.name.b - 1) check(`${label}: the cake sits level with the strip under the name`, Math.abs((m.cake.t + m.cake.b) / 2 - (m.shape.t + m.shape.b) / 2) <= 4 && (m.cake.r <= m.col.r) && m.shape.r <= m.cake.l + 1, JSON.stringify({ cake: m.cake, shape: m.shape }));
  return m;
}

try {
  const BOTH = { keys: true, cake: "🎂 2" };      // +5: keys and two birthdays
  const ONE = { keys: true, cake: "🎂" };         // +1: keys and one birthday
  if (KEYS_ONLY) {
    /* the baseline: only the studio key chip, on a copy of the pages that has no cake (main) */
    for (const [label, ctxOpts, n, panelOpen] of [["main, Week 1280 panel open", desktop, "7", true], ["main, Week 1280 panel closed", desktop, "7", false]]) {
      const { ctx, page } = await open(ctxOpts, n);
      if (!panelOpen) { await page.click("#panelBtn"); await sleep(600); }
      for (const k of [D(1), D(5)]) { const m = await measure(page, k); check(`${label}: ${k} (keys only) name fully inside`, inside(m.name, m.col) && inside(m.name, m.head), `${m.nameText} ${JSON.stringify(m.name)} col ${JSON.stringify(m.col)}`); check(`${label}: ${k} key chip inside`, !m.keys || inside(m.keys, m.col), JSON.stringify(m.keys)); }
      await ctx.close();
    }
  } else {
    const cases = [
      ["Week 1280 panel open", desktop, "7", true], ["Week 1280 panel closed", desktop, "7", false],
      ["3 days 1280 panel open", desktop, "3", true], ["Day 1280 panel open", desktop, "1", true],
      ["phone 7", phone, "7", true], ["phone 3", phone, "3", true], ["phone 1", phone, "1", true],
    ];
    for (const [label, ctxOpts, n, panelOpen] of cases) {
      const { ctx, page, errors } = await open(ctxOpts, n);
      if (!panelOpen) { await page.click("#panelBtn"); await sleep(600); }
      const hs = await heads(page);
      check(`${label}: every day header is the same height (birthdays add none)`, new Set(hs).size === 1, hs.join(","));
      const narrow = await page.evaluate(() => document.querySelector("#strip").classList.contains("narrow"));
      const days = n === "1" ? [D(0)] : n === "3" ? [D(0), D(1), D(2)] : [D(0), D(1), D(2), D(3), D(4), D(5), D(6)];
      const keyShown = !narrow;   // a column under 72 px hides the key chip (main's own rule: the slim rail carries the shifts)
      for (const k of days) {
        const cake = k === D(5) ? "🎂 2" : (k === D(0) || k === D(1)) ? "🎂" : "";
        await checkDay(`${label} ${k}`, page, k, { keys: keyShown && [D(0), D(1), D(5)].includes(k), cake });
      }
      // the first day of the view that has keys and two birthdays: bring +5 into view for the 1 and 3 day views
      if (n !== "7") { await page.evaluate((k) => { document.querySelector(`.day[data-day="${k}"] [data-open]`)?.scrollIntoView({ inline: "start" }); }, D(5)); }
      if (SHOTS && label === "Week 1280 panel open") await page.screenshot({ path: path.join(SHOTS, "birthdays-fit-week-1280-panel-open.png") });
      if (SHOTS && label === "phone 7") await page.screenshot({ path: path.join(SHOTS, "birthdays-fit-phone-7.png") });
      check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
    // 1 and 3 day views: also look at the +5 day (keys and two birthdays) once it is the current day
    for (const [label, ctxOpts, n] of [["Day 1280 on +5", desktop, "1"], ["3 days 1280 on +5", desktop, "3"], ["phone 1 on +5", phone, "1"], ["phone 3 on +5", phone, "3"]]) {
      const { ctx, page } = await open(ctxOpts, n);
      await page.evaluate((k) => goTo(k, false), D(5));
      await sleep(500);
      const m = await checkDay(label, page, D(5), BOTH);
      const hs = await heads(page);
      check(`${label}: header the same height for all shown days`, new Set(hs).size === 1, hs.join(","));
      await ctx.close();
    }
  }
} finally {
  await browser.close(); server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
