// The plane in the calendar's left rail opens the calendar's own Trips page (Junyan, 2026-11-13: "I want it to stay on
// the calendar app"), drawn as look A (d3: "3A"): tabs Upcoming / Past / Local, one card per trip with Day Quest's
// chips, side by side on a computer and stacked on a phone. Upcoming and Past switch in place; Local and + New trip are
// links to Day Quest (d4: "4 no"); a card opens nothing yet. "‹ Calendar" goes back. The browser clock is pinned to
// 2026-11-13 so "Now" and "50 days away" never depend on today.
// Not part of `node --test`: it needs playwright-core and Google Chrome.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-trips.e2e.mjs
//   SHOTS=<folder> also saves a desktop and a phone screenshot of the page.
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8806), BASE = `http://localhost:${PORT}`;
const API = `?api=${encodeURIComponent(BASE)}`;
const URL_ = `${BASE}/still/calendar.html${API}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
const cards = (page) => page.evaluate(() => [...document.querySelectorAll("#page .tcard")].map((c) => {
  const r = c.getBoundingClientRect();
  return { title: c.querySelector(".t")?.textContent, dates: c.querySelector(".s")?.textContent, x: Math.round(r.left), y: Math.round(r.top),
    chips: [...c.querySelectorAll(".tchips span")].map((s) => [s.className, s.textContent]), tag: c.tagName, trip: c.dataset.trip };
}));
try {
  const sizes = [
    ["desktop", { viewport: { width: 1280, height: 800 } }],
    ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ];
  for (const [label, opts] of sizes) {
    const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-11-13T15:00:00Z") });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
    await page.goto(URL_); await page.waitForSelector('#rail [data-page="travel"]', { state: "attached" }); await sleep(400);
    await page.evaluate(() => document.querySelector('#rail [data-page="travel"]').click());
    await page.waitForFunction(() => /Brazil Carnaval/.test(document.querySelector("#page")?.innerText || ""), null, { timeout: 5000 }).catch(() => {});
    await sleep(300);
    const at = new URL(page.url());
    check(`${label}: the plane keeps the address on calendar.html`, at.pathname.endsWith("/still/calendar.html") && !at.hash, page.url());
    const head = await page.evaluate(() => ({ h2: document.querySelector("#page h2")?.textContent, meta: document.querySelector("#page .phead .meta")?.textContent,
      back: document.querySelector('#page .phead [data-page="cal"]')?.textContent, add: document.querySelector("#page #tripNew")?.textContent }));
    check(`${label}: header reads ‹ Calendar, Trips, From your Travel Planner in Notion, + New trip`,
      head.back === "‹ Calendar" && head.h2 === "Trips" && head.meta === "From your Travel Planner in Notion" && head.add === "+ New trip", JSON.stringify(head));
    const tabs = await page.evaluate(() => [...document.querySelectorAll("#page .ttabs > *")].map((b) => [b.textContent, b.getAttribute("aria-pressed")]));
    check(`${label}: tabs Upcoming 2, Past 1, Local with Upcoming pressed`, JSON.stringify(tabs) === JSON.stringify([["Upcoming2", "true"], ["Past1", "false"], ["Local", null]]), JSON.stringify(tabs));
    const up = await cards(page);
    check(`${label}: Montreal card with its dates and chips Now, 3 to book, 7 booked, 43 bookings`,
      up[0]?.title === "🧳 2026 🇨🇦 Montreal Birthday" && up[0]?.dates === "Nov 12, 2026 to Nov 17, 2026" &&
      JSON.stringify(up[0]?.chips) === JSON.stringify([["now", "Now"], ["need", "3 to book"], ["paid", "7 booked"], ["", "43 bookings"]]), JSON.stringify(up[0]));
    check(`${label}: Brazil card with its dates and chips 50 days away, 13 booked, 14 bookings`,
      up[1]?.title === "🧳 2027 🇧🇷 Brazil Carnaval" && up[1]?.dates === "Jan 2, 2027 to Feb 7, 2027" &&
      JSON.stringify(up[1]?.chips) === JSON.stringify([["", "50 days away"], ["paid", "13 booked"], ["", "14 bookings"]]), JSON.stringify(up[1]));
    check(`${label}: ${label === "phone" ? "cards stacked" : "cards side by side"}`,
      up.length === 2 && (label === "phone" ? up[0].x === up[1].x && up[1].y > up[0].y : up[0].y === up[1].y && up[1].x > up[0].x), JSON.stringify(up.map((c) => [c.x, c.y])));
    check(`${label}: no Next Travel blocks card on this page`, !/next travel blocks/i.test(await page.evaluate(() => document.querySelector("#page").innerText)));
    check(`${label}: nothing runs off the side`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const ns = await page.evaluate(() => document.querySelectorAll("#page .ttabs button").length);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `trips-${label}.png`) });
    // a card is not a link or a button yet, and a click on it changes nothing
    await page.click("#page .tcard"); await sleep(200);
    check(`${label}: a trip card opens nothing yet, but carries its trip name`, up[0].tag === "DIV" && up[0].trip === "2026 🇨🇦 Montreal Birthday" &&
      new URL(page.url()).pathname.endsWith("/calendar.html") && (await cards(page)).length === 2 && ns === 2);
    await page.click('#page [data-triptab="past"]'); await sleep(200);
    const past = await cards(page);
    const tabs2 = await page.evaluate(() => [...document.querySelectorAll("#page .ttabs button")].map((b) => b.getAttribute("aria-pressed")));
    check(`${label}: Past switches in place to Egypt, 614 days ago, 6 bookings`, past.length === 1 && past[0].title === "🧳 2025 Egypt" &&
      JSON.stringify(past[0].chips) === JSON.stringify([["", "614 days ago"], ["", "6 bookings"]]) && JSON.stringify(tabs2) === '["false","true"]' &&
      new URL(page.url()).pathname.endsWith("/calendar.html"), JSON.stringify(past));
    await page.click('#page [data-triptab="upcoming"]'); await sleep(200);
    check(`${label}: Upcoming switches back`, (await cards(page)).length === 2);
    const hrefs = await page.evaluate(() => [document.querySelector("#page .ttabs .tlink")?.getAttribute("href"), document.querySelector("#page #tripNew")?.getAttribute("href")]);
    check(`${label}: Local and + New trip link to Day Quest's Local tab and new-trip flow`,
      hrefs[0] === `quest.html${location_search()}#trips-local` && hrefs[1] === `quest.html${location_search()}#trips-new`, JSON.stringify(hrefs));
    await page.click('#page [data-page="cal"]'); await sleep(400);
    check(`${label}: ‹ Calendar goes back to the calendar`, await page.evaluate(() => document.querySelector("#page").hidden));
    // the event panel's Travel button still opens this page (desktop panel)
    if (label === "desktop") {
      await page.evaluate(() => { document.querySelector("#page").hidden = true; });
      const ok = await page.evaluate(() => { const b = document.createElement("button"); b.dataset.page = "travel"; document.body.appendChild(b); b.click(); b.remove(); return !document.querySelector("#page").hidden && /Trips/.test(document.querySelector("#page h2")?.textContent || ""); });
      check(`${label}: a data-page="travel" button (the event panel's Open the Travel page) opens Trips`, ok);
    }
    check(`${label}: no page errors`, !errors.length, errors.join(" | "));
    await ctx.close();
  }
  // Day Quest's side of the two links: #trips-local opens its Trips page on the Local tab (computer width, where its
  // Trips page lives); #trips-new starts its own new-trip flow (the name prompt, dismissed here so nothing is written).
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: "America/Toronto" });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
    await page.goto(`${BASE}/still/quest.html${API}#trips-local`);
    await page.waitForFunction(() => document.body.classList.contains("trips-home"), null, { timeout: 8000 }).catch(() => {});
    const on = await page.evaluate(() => document.querySelector('#tripHome [data-ht="Local"]')?.classList.contains("on"));
    check("Day Quest: #trips-local opens the Trips page on the Local tab", !!on);
    const page2 = await ctx.newPage();   // a fresh page: a hash change on the same page would not reload Day Quest
    let asked = "";
    page2.on("dialog", (d) => { asked = asked || d.message(); d.dismiss(); });
    await page2.goto(`${BASE}/still/quest.html${API}#trips-new`);
    await page2.waitForFunction(() => document.body.classList.contains("trips-home"), null, { timeout: 8000 }).catch(() => {});
    await sleep(300);
    check("Day Quest: #trips-new asks for the new trip's name", /Trip name/.test(asked), asked);
    check("Day Quest: #trips-new is dropped from the address, so a reload does not ask again", new URL(page2.url()).hash === "#trips", page2.url());
    await ctx.close();
  }
} finally {
  await browser.close(); server.kill();
}
function location_search() { return API; }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} of ${results.length} passed`);
process.exit(bad.length ? 1 : 0);
