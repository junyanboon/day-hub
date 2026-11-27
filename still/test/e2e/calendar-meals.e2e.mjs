// Meal suggestions (Junyan, 2026-11-27: "if meals are missing can we have it suggested as well? (We need to eat)"; "4 yes but we want specifically
// Super Veggie, Nutty Pudding & Dinner"; "Nutty Pudding is 30 minutes, Super veggie is 1 hr (I need to cook) Dinner is also 1 hr (generally around 6pm..)").
// On a computer and a phone width, with its own seed (the dev server's own plans are set aside): Friday has no meals, so its column holds dashed
// "Suggested: Super Veggie" 8 to 9 am (right after Morning Routine, which ends at 8), "Nutty Pudding" 12:30 to 1 pm and "Dinner" 5 to 6 pm (6 pm is a
// Samba, so earlier), with the broccoli, peanut and pot icons; Saturday already has all three (the Dinner is "Bday Dinner w/ Phil & Co."), so its column
// holds none; the panel's Suggestions card shows them with Accept, Skip and Show; Accept writes the event and the ghost goes; Skip is kept after a reload;
// the Daily blocks switch turns them off. The clock is fixed (page.clock). Not covered: WebKit and a real iPhone. Needs playwright-core.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-meals.e2e.mjs
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
const PORT = +(process.env.PORT || 8873), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const NOW = "2026-11-25T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const KEY = { "X-Quest-Key": "test", "content-type": "application/json" };


const EV = (id, title, s, e, x = {}) => ({ id, calId: "joint", title, start: s, end: e, allDay: false, htmlLink: "https://calendar.google.com", ...x });
const SEED = [
  EV("m1", "Samba", "2026-11-27T23:00:00Z", "2026-11-28T00:00:00Z"),   // Friday 6 to 7 pm: Dinner moves earlier
  EV("m2", "Super Veggie", "2026-11-28T13:30:00Z", "2026-11-28T14:30:00Z"),   // Saturday 8:30 to 9:30 am
  EV("m3", "nutty pudding", "2026-11-28T17:30:00Z", "2026-11-28T18:00:00Z"),   // Saturday 12:30 pm
  EV("m4", "Bday Dinner w/ Phil & Co.", "2026-11-29T00:00:00Z", "2026-11-29T02:00:00Z"),   // Saturday 7 to 9 pm
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

      await load(); await dayView(FRI);
      const veg = await geo(FRI, "Super Veggie"), pud = await geo(FRI, "Nutty Pudding"), din = await geo(FRI, "Dinner");
      check(`${label}: Friday has no meals, so its column holds Super Veggie 8 to 9 am, with the broccoli`, !!veg && near(veg.top, 8) && near(veg.bottom, 9) && veg.icon === "\u{1F966}", JSON.stringify(veg));
      check(`${label}: ... Nutty Pudding 12:30 to 1 pm, with the peanuts`, !!pud && near(pud.top, 12.5) && near(pud.bottom, 13) && pud.icon === "\u{1F95C}", JSON.stringify(pud));
      check(`${label}: ... and Dinner 5 to 6 pm (a 6 pm plan is in the way, so earlier), with the pot`, !!din && near(din.top, 17) && near(din.bottom, 18) && din.icon === "\u{1F372}", JSON.stringify(din));
      check(`${label}: they are dashed and read "Suggested: Dinner" like the other suggestions`, await page.evaluate(() => ["Super Veggie", "Nutty Pudding", "Dinner"].every((t) => { const el = [...document.querySelectorAll('.col[data-day="2026-11-27"] .ev.ghost')].find((x) => x.querySelector(".t")?.textContent === t); return el && getComputedStyle(el).borderTopStyle === "dashed" && /^Suggested: /.test(getComputedStyle(el.querySelector(".t"), "::before").content.replace(/"/g, "")); })));
      check(`${label}: the Morning Routine still ends where Super Veggie starts (8 am), in order`, await page.evaluate(() => { const m = S.autoG.find((g) => g.id === "auto:morning:2026-11-26"), v = S.autoG.find((g) => g.id === "auto:veggie:2026-11-27"); return !!m && !!v && m.e === v.s; }));
      check(`${label}: no meal overlaps a real plan`, await page.evaluate(() => { const real = [...S.months["2026-11"].events].filter((e) => !e.allDay).map((e) => [Date.parse(e.start), Date.parse(e.end)]); return S.autoG.filter((g) => ["veggie", "pudding", "dinner"].includes(g.id.split(":")[1])).every((g) => real.every(([a, b]) => g.e <= a || g.s >= b)); }));
      check(`${label}: Saturday has all three meals already, so its column holds no meal suggestion`, (await geo(SAT, "Super Veggie")) === null && (await geo(SAT, "Nutty Pudding")) === null && (await geo(SAT, "Dinner")) === null
        && !(await page.evaluate(() => S.autoG.some((g) => /^auto:(veggie|pudding|dinner):2026-11-28$/.test(g.id)))));
      await dayView(SAT);
      check(`${label}: ... and its real Super Veggie, Nutty Pudding and Dinner plans are drawn as they were`, await page.evaluate(() => ["Super Veggie", "nutty pudding", "Bday Dinner w/ Phil & Co."].every((t) => [...document.querySelectorAll('.col[data-day="2026-11-28"] .ev:not(.ghost) .t')].some((x) => x.textContent === t))));
      if (process.env.SHOTS) { await dayView(FRI); await page.evaluate(() => { document.querySelector("#view").scrollTop = 6 * S.h; }); await sleep(300); await page.screenshot({ path: path.join(process.env.SHOTS, `meals-${label}-friday.png`) }); await dayView(SAT); await page.evaluate(() => { document.querySelector("#view").scrollTop = 6 * S.h; }); await sleep(300); await page.screenshot({ path: path.join(process.env.SHOTS, `meals-${label}-saturday.png`) }); }

      // the panel's Suggestions card (today, Wednesday 10 am: Super Veggie has passed, Nutty Pudding and Dinner are still ahead)
      if (phone) { await page.evaluate(() => document.querySelector("#panelBtn").click()); await sleep(400); }
      await page.evaluate(() => goToday(false)); await sleep(500);
      await page.evaluate(() => document.querySelector('[data-p="now"]')?.click()); await sleep(300);
      const cards = await page.evaluate(() => [...document.querySelectorAll("#pbody .sugg")].map((c) => ({ t: c.querySelector("b").textContent.trim(), b: [...c.querySelectorAll("button")].map((x) => x.textContent.trim()) })));
      const meal = cards.filter((c) => /Nutty Pudding|Dinner|Super Veggie/.test(c.t));
      check(`${label}: the panel cards read "\u{1F95C} Nutty Pudding" and "\u{1F372} Dinner" with Accept, Skip and Show; Super Veggie, past at 10 am, is not offered`, meal.map((c) => c.t).join("|") === "\u{1F95C} Nutty Pudding|\u{1F372} Dinner" && meal.every((c) => c.b.join() === "Accept,Skip,Show"), JSON.stringify(meal));
      await closeSheet();

      // Accept: Friday's Nutty Pudding is written to the calendar and its ghost goes
      await dayView(FRI);
      await page.locator('.ev.ghost[data-key$="auto:pudding:2026-11-27"]').first().click(); await sleep(500);
      await tap("#pAcc"); await sleep(1800);
      const wrote = (await serverEvents()).find((e) => e.title === "Nutty Pudding" && e.start === "2026-11-27T17:30:00.000Z");
      check(`${label}: Accept wrote Nutty Pudding for Friday 12:30 to 1 pm`, !!wrote && Date.parse(wrote.end) - Date.parse(wrote.start) === 30 * 60000, JSON.stringify(wrote));
      await closeSheet(); await dayView(FRI);
      const gone = [(await geo(FRI, "Nutty Pudding"))?.n ?? 0, (await geo(FRI, "Nutty Pudding", false))?.n ?? 0];   // Friday's column: the other days still suggest theirs
      check(`${label}: its ghost is gone and the real event is drawn once`, gone[0] === 0 && gone[1] === 1, JSON.stringify(gone));

      // Skip: Friday's Dinner suggestion goes and stays gone after a reload
      await page.locator('.ev.ghost[data-key$="auto:dinner:2026-11-27"]').first().click(); await sleep(500);
      await tap("#pSkip"); await sleep(800); await closeSheet();
      check(`${label}: Skip removed Friday's Dinner suggestion`, (await geo(FRI, "Dinner")) === null);
      await load(); await dayView(FRI);
      check(`${label}: ... and it stays skipped after a reload; the Super Veggie one is still there`, (await geo(FRI, "Dinner")) === null && (await geo(FRI, "Super Veggie")) !== null);

      // the Daily blocks switch turns them off
      if (phone && await page.evaluate(() => document.body.classList.contains("popen"))) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); }
      if (phone) await page.evaluate(() => document.querySelector("#panelBtn").click());
      await tap('[data-p="set"]'); await sleep(300);
      check(`${label}: the Daily blocks switch names the meals`, /Super Veggie, Nutty Pudding, Dinner/.test(await page.evaluate(() => document.querySelector('label[for="routineSw"]').textContent)));
      await page.evaluate(() => document.querySelector("#routineSw").click()); await sleep(600); await closeSheet(); await dayView(FRI);
      check(`${label}: with Daily blocks off, no meal suggestion is drawn`, (await geo(FRI, "Super Veggie")) === null && (await geo(FRI, "Nutty Pudding")) === null && !(await page.evaluate(() => S.autoG.length)));
      check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    } finally { server.kill(); }
  }
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
