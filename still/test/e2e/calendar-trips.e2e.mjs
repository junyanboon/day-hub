// The plane in the calendar's left rail opens the calendar's own Trips page (Junyan, 2026-11-13: "I want it to stay on
// the calendar app"). The address stays on calendar.html, the page lists the Montreal trip with its dates, and
// "‹ Calendar" goes back to the calendar. The browser clock is pinned to 2026-11-13 so "Now" never depends on today.
// Not part of `node --test`: it needs playwright-core and Google Chrome.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-trips.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8806), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
try {
  for (const [label, opts] of [["desktop", { viewport: { width: 1280, height: 800 } }], ["tablet", { viewport: { width: 900, height: 700 } }]]) {
    const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-11-13T15:00:00Z") });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
    await page.goto(URL_); await page.waitForSelector('#rail [data-page="travel"]'); await sleep(400);
    await page.click('#rail [data-page="travel"]');
    await page.waitForFunction(() => /Montreal Birthday/.test(document.querySelector("#page")?.innerText || ""), null, { timeout: 5000 }).catch(() => {});
    await sleep(300);
    const at = new URL(page.url());
    check(`${label}: the plane keeps the address on calendar.html`, at.pathname.endsWith("/still/calendar.html") && !at.hash, page.url());
    const txt = await page.evaluate(() => { const p = document.querySelector("#page"); return p && !p.hidden ? p.innerText : ""; });
    check(`${label}: the page title is Trips`, /\bTrips\b/.test(await page.evaluate(() => document.querySelector("#page h2")?.textContent || "")));
    check(`${label}: Montreal Birthday shows with its dates`, /Montreal Birthday/.test(txt) && /Nov 12 to Nov 17, 2026/.test(txt), txt.replace(/\s+/g, " ").slice(0, 200));
    check(`${label}: it is marked Now`, /\bNow\b/.test(txt));
    check(`${label}: the trip from still-api shows too`, /Brazil Carnaval/.test(txt));
    check(`${label}: the plane is the pressed rail button`, await page.evaluate(() => document.querySelector('#rail [data-page="travel"]').getAttribute("aria-pressed") === "true"));
    await page.click('#page [data-page="cal"]'); await sleep(400);
    check(`${label}: ‹ Calendar goes back to the calendar`, await page.evaluate(() => document.querySelector("#page").hidden && !!document.querySelector(".ev")));
    check(`${label}: no page errors`, !errors.length, errors.join(" | "));
    await ctx.close();
  }
} finally {
  await browser.close(); server.kill();
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} of ${results.length} passed`);
process.exit(bad.length ? 1 : 0);
