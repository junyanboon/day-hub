// The night blocks float and bed time is a setting (Junyan, 2026-11-27: "why is it floating at 12am instead of 10pm?", "3 11pm is bed time",
// "wind down should be a candle morning routine should be the sun emoji and sleep is a bed emoji"). On a computer and a phone width, with his
// own seed (the dev server's nightly "Wind down" plan is set aside): Friday's column holds a dashed "Suggested: Wind Down" 10 to 11 pm and
// "Suggested: Sleep" from 11 pm that runs on past midnight into a taller column; Saturday's column does NOT draw that Sleep again (one rule:
// a night block is drawn once, in the column of the day it starts) and holds Morning Routine 7 to 8 am; the icons are a candle, a bed and a sun,
// also on the panel's Suggestions card; a tap in the extension makes no new event; Accept writes the three real events and the real Sleep still
// floats once in Friday's column; the new Bedtime pick in Settings moves the night and is kept after a reload. The clock is fixed (page.clock).
// Not covered: WebKit and a real iPhone. Not part of `node --test`: it needs playwright-core.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-night-float.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
import { serverReady } from "../helpers/dev-server.mjs";
import { stubOpenMeteo } from "../helpers/open-meteo-stub.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8871), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const NOW = "2026-11-25T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const KEY = { "X-Quest-Key": "test", "content-type": "application/json" };


const EV = (id, title, s, e, x = {}) => ({ id, calId: "joint", title, start: s, end: e, allDay: false, htmlLink: "https://calendar.google.com", ...x });
const SEED = [
  EV("n1", "Samba", "2026-11-27T23:00:00Z", "2026-11-28T00:00:00Z"),   // Friday 6 to 7 pm
  EV("n2", "Brunch", "2026-11-28T16:00:00Z", "2026-11-28T17:00:00Z"),   // Saturday 11 am: a late plan, it never pushes bed past 11 pm
];
const browser = await launchTestBrowser(chromium);
const serverEvents = async () => (await (await fetch(BASE + "/planner/events?from=2026-11-20T00:00:00Z&to=2026-12-05T00:00:00Z", { headers: KEY })).json()).events;
const FRI = "2026-11-27", SAT = "2026-11-28";
try {
  const sizes = [
    ["computer", { viewport: { width: 1280, height: 860 } }],
    ["phone", { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ];
  for (const [label, opts] of sizes) {
    if (process.env.ONLY && process.env.ONLY !== label) continue;
    const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
    await serverReady(server);
    try {
      const phone = label === "phone";
      const baseIds = new Set((await (await fetch(BASE + "/planner/events?from=2020-01-01T00:00:00Z&to=2031-01-01T00:00:00Z", { headers: KEY })).json()).events.map((e) => e.id));
      for (const e of SEED) await fetch(BASE + "/planner/event", { method: "POST", headers: KEY, body: JSON.stringify(e) });
      const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
      const page = await ctx.newPage();
      await page.clock.install({ time: new Date(NOW) });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/planner/events*", async (route) => {
        const res = await route.fetch(); const j = await res.json();
        await route.fulfill({ response: res, json: { ...j, events: (j.events || []).filter((e) => !baseIds.has(e.id)) } });
      });
      stubOpenMeteo(page);
      await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
      const load = async () => { await page.goto(URL_); await page.waitForSelector(".ev", { state: "attached" }); await sleep(900); };
      const dayView = async (d) => { await page.evaluate(() => setN(1)); await sleep(300); await page.evaluate((x) => goTo(x, false), d); await sleep(600); };
      const toastText = () => page.evaluate(() => document.querySelector("#toast")?.innerText || "");
      const tap = (sel) => page.locator(sel).first().click();
      const closeSheet = async () => { if (phone && await page.evaluate(() => document.body.classList.contains("popen"))) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); } };
      /* where a block is drawn in a column, in hours from that column's midnight (the column's own pixels over S.h) */
      const geo = (day, title, ghost = true) => page.evaluate(([d, t, g]) => {
        const col = document.querySelector(`.col[data-day="${d}"]`); if (!col) return null;
        const els = [...col.querySelectorAll(g ? ".ev.ghost" : ".ev:not(.ghost)")].filter((x) => x.querySelector(".t")?.textContent === t); if (!els.length) return null;
        const c = col.getBoundingClientRect(), r = els[0].getBoundingClientRect();
        return { n: els.length, top: (r.top - c.top) / S.h, bottom: (r.bottom - c.top) / S.h, col: c.height / S.h, icon: els[0].querySelector(".ei")?.textContent || "", text: els[0].innerText.replace(/\s+/g, " ") };
      }, [day, title, ghost]);
      const near = (a, b) => Math.abs(a - b) < 0.1;
      const count = (title, ghost) => page.evaluate(([t, g]) => [...document.querySelectorAll(g ? ".ev.ghost" : ".ev:not(.ghost)")].filter((x) => x.querySelector(".t")?.textContent === t).length, [title, ghost]);

      await load(); await dayView(FRI);
      const wind = await geo(FRI, "Wind Down"), sleepG = await geo(FRI, "Sleep");
      check(`${label}: Friday's column holds Wind Down from 10 to 11 pm, dashed, with the candle`, !!wind && near(wind.top, 22) && near(wind.bottom, 23) && wind.icon === "\u{1F56F}\uFE0F", JSON.stringify(wind));
      check(`${label}: ... and Sleep from 11 pm that runs past midnight to 7 am (a taller column), with the bed`, !!sleepG && near(sleepG.top, 23) && near(sleepG.bottom, 31) && sleepG.col >= 31 && sleepG.icon === "\u{1F6CF}\uFE0F", JSON.stringify(sleepG));
      check(`${label}: they read "Suggested: Wind Down" and "Suggested: Sleep" like Commute does`, await page.evaluate(() => ["Wind Down", "Sleep"].every((t) => { const el = [...document.querySelectorAll('.col[data-day="2026-11-27"] .ev.ghost')].find((x) => x.querySelector(".t")?.textContent === t); return el && /^Suggested: /.test(getComputedStyle(el.querySelector(".t"), "::before").content.replace(/"/g, "")); })));
      const inCols = (key) => page.evaluate((k) => [...document.querySelectorAll(`.ev[data-key$="${k}"]`)].map((x) => x.closest(".col").dataset.day), key);
      check(`${label}: Friday night's Sleep is drawn in Friday's column only, not again at the top of Saturday's (one rule: a block is drawn once, where it starts)`, JSON.stringify(await inCols("auto:sleep:2026-11-27")) === JSON.stringify([FRI]), JSON.stringify(await inCols("auto:sleep:2026-11-27")));
      const sat = await geo(SAT, "Sleep");
      check(`${label}: Saturday's column starts with no Sleep (its own night's Sleep is from 11 pm)`, !!sat && near(sat.top, 23), JSON.stringify(sat));
      check(`${label}: Friday night's Morning Routine is Saturday 7 to 8 am, with the sun, drawn once`, JSON.stringify(await inCols("auto:morning:2026-11-27")) === JSON.stringify([SAT]) && await page.evaluate(() => { const el = document.querySelector('.col[data-day="2026-11-28"] .ev[data-key$="auto:morning:2026-11-27"]'); const c = el.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect(); return Math.abs((r.top - c.top) / S.h - 7) < 0.1 && el.querySelector(".ei")?.textContent === "\u2600\uFE0F"; }));
      check(`${label}: no day draws the same night block twice`, await page.evaluate(() => { const seen = new Set(); for (const el of document.querySelectorAll(".ev.ghost")) { const k = el.dataset.key; if (seen.has(k)) return false; seen.add(k); } return true; }));
      if (process.env.SHOTS) { await page.evaluate(() => { document.querySelector("#view").scrollTop = 17 * S.h; }); await sleep(300); await page.screenshot({ path: path.join(process.env.SHOTS, `night-float-${label}-friday.png`) }); }

      // a tap in the extension below midnight makes no event
      await page.evaluate(() => { document.querySelector("#view").scrollTop = 99999; }); await sleep(300);
      const box = await page.evaluate(() => { const c = document.querySelector('.col[data-day="2026-11-27"]').getBoundingClientRect(); return { x: c.left + 8, y: c.bottom - 3 * S.h }; });
      await page.mouse.click(box.x, box.y); await sleep(400);
      check(`${label}: a tap in the extension starts no new event`, (await page.evaluate(() => document.querySelectorAll(".ev.draft").length)) === 0);
      await closeSheet();

      // the panel's Suggestions card carries the icons (today's night blocks are in it)
      if (phone) { await page.evaluate(() => document.querySelector("#panelBtn").click()); await sleep(400); }
      await page.evaluate(() => goToday(false)); await sleep(500);
      await page.evaluate(() => document.querySelector('[data-p="now"]')?.click()); await sleep(300);
      const card = await page.evaluate(() => [...document.querySelectorAll("#pbody .sugg b")].map((b) => b.textContent.trim()));
      check(`${label}: the panel cards read the same icons (candle, bed, sun)`, ["\u{1F56F}\uFE0F Wind Down", "\u{1F6CF}\uFE0F Sleep", "\u2600\uFE0F Morning Routine"].every((t) => card.includes(t)), JSON.stringify(card));
      await closeSheet();

      // Settings: the Bedtime pick moves the night and is kept
      if (phone && await page.evaluate(() => document.body.classList.contains("popen"))) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); }
      if (phone) await page.evaluate(() => document.querySelector("#panelBtn").click());
      await tap('[data-p="set"]'); await sleep(300);
      check(`${label}: Settings has a Bedtime pick beside Daily blocks, 11 pm by default`, await page.evaluate(() => document.querySelector("#bedSel")?.value) === "1380", await page.evaluate(() => document.querySelector("#bedSel")?.value));
      await page.selectOption("#bedSel", "1350"); await sleep(600); await closeSheet();
      await dayView(FRI);
      const w2 = await geo(FRI, "Wind Down"), s2 = await geo(FRI, "Sleep");
      check(`${label}: Bedtime 10:30 pm: Wind Down 9:30 to 10:30 pm, Sleep from 10:30 pm`, !!w2 && !!s2 && near(w2.top, 21.5) && near(s2.top, 22.5), JSON.stringify([w2, s2]));
      await load(); await dayView(FRI);
      check(`${label}: the pick is kept after a reload`, near((await geo(FRI, "Sleep"))?.top ?? 0, 22.5));
      await page.evaluate(() => { localStorage.removeItem("cal-bedtime"); }); await load(); await dayView(FRI);

      // Accept: the three real events are written, and the real Sleep still floats once in Friday's column
      await page.locator('.ev.ghost[data-key$="auto:wind:2026-11-27"]').first().click(); await sleep(500);
      await tap("#pAcc"); await sleep(1800);
      const evs = await serverEvents();
      const real = Object.fromEntries(["Wind Down", "Sleep", "Morning Routine"].map((t) => [t, evs.find((e) => e.title === t && e.start.startsWith("2026-11-2") && Date.parse(e.start) >= Date.parse("2026-11-28T00:00:00Z"))]));
      check(`${label}: Accept wrote Wind Down, Sleep and Morning Routine for Friday night (Sleep 11 pm to 7 am)`, Object.values(real).every(Boolean) && Date.parse(real["Sleep"].end) - Date.parse(real["Sleep"].start) === 8 * 3600000, JSON.stringify(real));
      await closeSheet(); await dayView(FRI);
      const rs = await geo(FRI, "Sleep", false);
      check(`${label}: the accepted Sleep floats in Friday's column (11 pm to 7 am), once, and is not drawn again in Saturday's`, !!rs && rs.n === 1 && near(rs.top, 23) && near(rs.bottom, 31) && (await geo(SAT, "Sleep", false)) === null, JSON.stringify(rs));
      check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    } finally { server.kill(); }
  }
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
