// The trip bar and "Be there early by" (Junyan, 2026-11-25: "60 B trip bar is cute, 61 yes 62yes"), clicked in the test browser at phone width
// (390, touch) against the faked dev routes (calendar-dev.mjs): Leave by and Arrive on one row that fits the phone, the bar (travel, then the
// spare minutes in green), the quiet line, the four chips (5 default), a pick that is remembered on this device, moves the arrive-by time the
// page asks the server for, and moves the leave time for Transit and Drive. The clock is fixed (Nov 24 2026, 10:00 in Toronto).
// Not part of `node --test`: it needs playwright-core.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-commute-early.e2e.mjs
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
const PORT = +(process.env.PORT || 8885), base = `http://localhost:${PORT}`;
const NOW = "2026-11-24T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const browser = await launchTestBrowser(chromium);
const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });

try {
  await serverReady(server);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  await page.clock.install({ time: new Date(NOW) });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([{ lat: "43.6495", lon: "-79.4290" }]) }));
  stubOpenMeteo(page);
  await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
  const load = async () => { await page.goto(`${base}/still/calendar.html?api=${encodeURIComponent(base)}`); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500); };
  const dev = (q) => page.evaluate(async ([b, q]) => (await (await fetch(b + "/__dev/directions" + q)).json()), [base, q]);
  const bt = async () => flat(await page.evaluate(() => document.querySelector("#cmBox")?.innerText || ""));
  const trip = () => page.evaluate(() => ({ leave: document.querySelector("#cmBox .cmleave .big")?.textContent.trim(), arrive: document.querySelector("#cmBox .cmleave .ar")?.textContent.trim(),
    green: document.querySelector("#cmBox .cmtb .sp")?.textContent.trim() || "", quiet: document.querySelector("#cmBox .cmleave .cmchecked")?.textContent.replace(/\s+/g, " ").trim() || "",
    early: [...document.querySelectorAll('#cmBox [data-cm="early"]')].map((b) => b.textContent.trim() + ":" + b.getAttribute("aria-pressed")).join(",") }));
  const settled = () => page.waitForFunction(() => { const b = document.querySelector("#cmBox"); return !!b && !!b.querySelector(".cmleave .big") && !/Getting directions|Checking/.test(b.innerText); });
  await load();
  await page.evaluate(() => { const k = C.addDays(today(), 1); panel("event", eventsFor(k, k).find((e) => e.title === "Transit")); });
  await sleep(500);
  if (await page.locator("#cmHomeIn").count()) { await page.fill("#cmHomeIn", "100 Queen St W, Toronto"); await page.click('[data-cm="home"]'); await sleep(700); }
  if (await page.locator("#cmTo").count()) { await page.fill("#cmTo", "Gladstone Hotel, Toronto"); await page.press("#cmTo", "Enter"); await sleep(700); }
  await settled(); await sleep(300);

  let x = await trip();
  check("default: the four chips, 5 min pressed", x.early === "5 min:true,10 min:false,15 min:false,20 min:false", x.early);
  check("Leave by 9:20 am on the left, Arrive 9:54 am on the right, one row", x.leave === "9:20 am" && x.arrive === "9:54 am", JSON.stringify(x));
  check("the green segment says the real spare minutes (6 min: Google arrives a minute early)", x.green === "6 min", x.green);
  check("the quiet line names the plan and its start, then Checked and Check again", /^Spare time before Work block at 10 am · Checked .* · Check again$/.test(x.quiet), x.quiet);
  check("no 'This block is over.' and no 'Nothing saved with this block yet.'", !/This block is over|Nothing saved/.test(await bt()));
  const geo = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(), t = r("#cmBox .cmtrip"), l = r("#cmBox .cmleave .big"), a = r("#cmBox .cmleave .ar"), m = r("#cmBox .cmmid span"), bar = r("#cmBox .cmtb"), tr = r("#cmBox .cmtb .tr"), sp = r("#cmBox .cmtb .sp"), box = document.querySelector("#cmBox");
    return { rowH: t.height, sameLine: Math.abs(l.top - a.top) < 4 && Math.abs(m.top - l.top) < 14, barH: bar.height, trW: tr.width, spW: sp.width, barW: bar.width, over: box.scrollWidth > box.clientWidth, lw: l.width, aw: a.width, aRight: Math.abs(a.right - t.right) < 2 }; });
  check("at 390px the row is one line, the right time sits at the right edge, nothing scrolls sideways", geo.sameLine && geo.aRight && !geo.over && geo.rowH < 60, JSON.stringify(geo));
  check("the bar is 22px high and its segments are in proportion (34 min travel to 6 spare, the green not under its minimum)", Math.abs(geo.barH - 22) < 1 && geo.spW >= 44 && geo.trW > geo.spW, JSON.stringify(geo));

  const calls0 = (await dev("")).calls;
  await page.locator('#cmBox [data-cm="early"]', { hasText: "15 min" }).tap(); await sleep(300); await settled(); await sleep(300);
  x = await trip(); const calls1 = (await dev("")).calls;
  check("tapping 15 min presses it and releases 5 min", x.early === "5 min:false,10 min:false,15 min:true,20 min:false", x.early);
  check("the pick is remembered on this device", await page.evaluate(() => localStorage.getItem("cal-commute-early")) === "15");
  const last = calls1[calls1.length - 1], prev = calls0[calls0.length - 1];
  check("Transit: the page asked the server again with an arrive-by 10 minutes earlier", calls1.length === calls0.length + 1 && Date.parse(prev.arriveBy) - Date.parse(last.arriveBy) === 10 * 60000, JSON.stringify([prev && prev.arriveBy, last.arriveBy]));
  check("Transit: Leave by 9:10 am, Arrive 9:44 am, 16 min spare", x.leave === "9:10 am" && x.arrive === "9:44 am" && x.green === "16 min", JSON.stringify(x));

  await page.locator('#cmBox [data-cm="mode"]', { hasText: "Drive" }).tap(); await sleep(500); await settled(); await sleep(300);
  x = await trip();
  check("Drive with 15: leave is the arrive-by minus 27 min (9:18 am), arrive 9:45 am, 15 min spare", x.leave === "9:18 am" && x.arrive === "9:45 am" && x.green === "15 min", JSON.stringify(x));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });   // SHOT=<file.png> keeps a picture of the Drive panel with 15 min picked

  await load();
  await page.evaluate(() => { const k = C.addDays(today(), 1); panel("event", eventsFor(k, k).find((e) => e.title === "Transit")); });
  await sleep(500); await settled(); await sleep(300);
  x = await trip();
  check("after a reload the 15 min pick is still pressed and still used", x.early === "5 min:false,10 min:false,15 min:true,20 min:false" && x.green === "15 min", JSON.stringify(x));
  check("no page errors", errors.length === 0, errors.join(" | "));
} finally { server.kill(); await browser.close(); }
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
