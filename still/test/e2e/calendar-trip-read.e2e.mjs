// Slice 05, read a trip (Junyan, 2026-11-18: "70 yes, 71 yes, 72 yes, 73 yes it's probably not needed at all", then
// "74 yes": mock https://claude.ai/artifact/DoUcZHR3SbkquBrUoyKnCA as drawn). On a computer the trip's left column
// shows Day Quest's full trip: chips, day buttons, every plan once on its own day, Staying and
// Check-out lines, Maybe and Outside the trip dates; a plan row opens its details under the map, read only. A phone is
// unchanged (d14): its trip page is compared, word for word, with main's copy served by the same dev server.
// The rules themselves are tested in still/test/trip-read.test.mjs.
// Not part of `node --test`: it needs playwright-core, Google Chrome and git (for main's copy).
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-trip-read.e2e.mjs
//   SHOTS=<folder> also saves the computer trip page at 1280 px.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8818), OLD_PORT = PORT + 1;
const urlOf = (port) => `http://localhost:${port}/still/calendar.html?api=${encodeURIComponent("http://localhost:" + port)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const MTL = "2026 🇨🇦 Montreal Birthday";
const SPOTS = { "1255 rue jeanne-mance, montréal": { lat: 45.5079, lng: -73.5646 }, "mount royal, montréal": null };

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText || "", sel);
const shown = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; }, sel);

async function serve(port, root) {
  const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(port)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, ...(root ? { DEV_ROOT: root } : {}) } });
  await new Promise((ok) => server.stdout.once("data", ok));
  return server;
}
async function openTrip(browser, port, opts) {
  const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-11-13T15:00:00Z") });
  const errors = [], writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.method() !== "GET" && r.method() !== "OPTIONS") writes.push(r.method() + " " + new URL(r.url()).pathname); });
  await page.addInitScript((spots) => { localStorage.setItem("quest-key", "test"); localStorage.setItem("trip-map-spots-v1", JSON.stringify(spots)); }, SPOTS);
  await page.goto(urlOf(port)); await page.waitForSelector('#rail [data-page="travel"]', { state: "attached" }); await sleep(400);
  await page.evaluate(() => document.querySelector('#rail [data-page="travel"]').click());
  await page.waitForFunction(() => /Brazil Carnaval/.test(document.querySelector("#page")?.innerText || ""), null, { timeout: 5000 }).catch(() => {});
  await page.click(`#page .tcard[data-trip="${MTL}"]`);
  await page.waitForFunction(() => document.querySelectorAll("#page .tpl-row").length >= 4, null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll("#page .leaflet-marker-icon").length >= 5, null, { timeout: 15000 }).catch(() => {});
  await sleep(400);
  return { ctx, page, errors, writes };
}

const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
const old = fs.mkdtempSync(path.join(os.tmpdir(), "trip-read-main-"));
const servers = [];
try {
  /* ---------- computer ---------- */
  servers.push(await serve(PORT));
  const { ctx, page, errors, writes } = await openTrip(browser, PORT, { viewport: { width: 1280, height: 860 } });
  const L = () => text(page, "#page #tRead");
  const head = flat(await text(page, "#page .tleft .phead"));
  check("computer: the head names the trip with its weekdays and who", head === "‹ Trips 🇨🇦 2026 🇨🇦 Montreal Birthday Thu Nov 12 to Tue Nov 17 · You + Caney", head);
  const chips = await page.evaluate(() => [...document.querySelectorAll("#page .tchips span")].map((c) => [c.textContent, c.className]));
  check("computer: an amber chip per plan still to book; no days away once the trip has started", JSON.stringify(chips) === '[["Spa & Recovery not booked","need"]]', JSON.stringify(chips));
  check("computer: the Itinerary only, so no tab bar (d73, d75: no Bookings, Ideas or Must-haves)", await page.evaluate(() => !document.querySelector("#page #tRead .seg, #page #tRead [data-ttab]") && !/Must-haves|Bookings|Ideas/.test(document.querySelector("#page .tleft").innerText)));
  const days = await page.evaluate(() => [...document.querySelectorAll("#page .tdays button")].map((b) => b.textContent));
  check("computer: day buttons All, Thu 12 to Tue 17", JSON.stringify(days) === '["All","Thu 12","Fri 13","Sat 14","Sun 15","Mon 16","Tue 17"]', JSON.stringify(days));
  check("computer: slice 04's plain rows are not shown on a computer", !(await shown(page, "#page #tDays")) && await shown(page, "#page #tRead"));

  const all = flat(await L()).toLowerCase(), has = (s) => all.includes(s.toLowerCase());
  check("computer: no Maybe, and a plan with no date is left out (2026-11-18)", await page.evaluate(() => ![...document.querySelectorAll("#page #tRead .tday")].some((d) => /maybe/i.test(d.textContent))) && !all.includes("poutine crawl") && /^.*all thu 12 .* tue 17 thu nov 12/.test(all), all.slice(0, 200));
  check("computer: a stay reads Check-in and check-out with their days", has("5:00 pm 🏨 Montreal stay Check-in 5:00 pm (Fri), check-out 10:30 am (Tue)"));
  check("computer: an end time sits under the start", has("10:00 pm to 2:00 am 🎶 Social 📍 Alliance Dance Company"));
  check("computer: Need to book on a plan still to book", /♨ spa & recovery day ?need to book/.test(all) && await page.evaluate(() => [...document.querySelectorAll("#page #tRead .ttag.need")].some((t) => t.textContent === "Need to book")), all.match(/.{0,40}spa & recovery day.{0,80}/)?.[0]);
  check("computer: a Missing line under a plan", /spa & recovery day ?need to book .*missing: address/.test(all), all.match(/spa & recovery day.{0,80}/)?.[0]);
  check("computer: Staying on the days between, Check-out on the last day", has("Staying: Montreal stay") && has("Check-out: Montreal stay by 10:30 am"));
  check("computer: Outside the trip dates at the bottom", /outside the trip dates 11:00 am to 12:30 pm 🥞 goodbye brunch no place yet missing: address$/.test(all), all.slice(-120));
  const once = await page.evaluate(() => [...document.querySelectorAll("#page #tRead .trow")].map((r) => r.dataset.tplan));
  check("computer: each plan once", once.length === new Set(once).size && once.length > 10, once.length + " rows");
  check("computer: no add box or drop zone in the itinerary", !(await page.evaluate(() => !!document.querySelector("#page #tRead input, #page #tRead [data-drop], #page #tRead textarea"))));

  // a day button shows that day alone
  await page.click('#page .tdays [data-tday="2"]'); await sleep(150);
  const sat = flat(await L()).toLowerCase();
  check("computer: Sat 14 shows that day only", sat.includes("sat nov 14") && !sat.includes("fri nov 13") && !sat.includes("outside the trip dates"), sat.slice(0, 160));
  await page.click('#page .tdays [data-tday="-1"]'); await sleep(150);

  // a stay's details (d71): only the fields with a value, the hotel checklist as saved, and the reservation drop (no Book, no Notion link)
  await page.click('#page #tRead [data-tplan="notion-stay"]'); await sleep(300);
  const stay = flat(await text(page, "#page #tCard"));
  check("computer: the stay's details", stay === "🏨 Montreal stay × Check-in 5:00 pm (Fri) Check-out 10:30 am (Tue) Status Prepaid Address 1255 Rue Jeanne-Mance, Montréal Google Maps ↗ · Directions ↗ Booked through Airbnb Cancel by Missing Confirmation # Missing Files Missing Notes Late check-in is fine, call the desk HOTEL CHECKLIST ✓ Research and pick the place Upload confirmation # Cancellation policy ✓ Address (opens in Google Maps) Pay outstanding balance Pictures of the room & amenities Drop the reservation here, or click to pick it", stay);
  const links = await page.evaluate(() => [...document.querySelectorAll("#page #tCard a")].map((a) => [a.textContent, a.href, a.target]));
  check("computer: only Google Maps and Directions links, in a new tab", JSON.stringify(links) === JSON.stringify([
    ["Google Maps ↗", "https://www.google.com/maps/search/?api=1&query=1255%20Rue%20Jeanne-Mance%2C%20Montr%C3%A9al", "_blank"],
    ["Directions ↗", "https://www.google.com/maps/dir/?api=1&destination=1255%20Rue%20Jeanne-Mance%2C%20Montr%C3%A9al", "_blank"]]), JSON.stringify(links));
  const amber = await page.evaluate(() => [...document.querySelectorAll("#page #tCard .tkv .need")].map((x) => x.textContent));
  check("computer: what the plan is missing is amber", JSON.stringify(amber) === '["Cancel by","Missing","Confirmation #","Missing","Files","Missing"]', JSON.stringify(amber));
  check("computer: the stay's row is lit and its dot grows", await page.evaluate(() => !!document.querySelector('#page #tRead [data-tplan="notion-stay"].on') && !!document.querySelector("#page .tpin.dot.on")));
  check("computer: nothing to edit in the details but the file pick", await page.evaluate(() => [...document.querySelectorAll("#page #tCard input, #page #tCard textarea, #page #tCard select, #page #tCard [contenteditable]")].every((x) => x.matches("[data-tdrop] input[type=file]"))));

  // the reservation file: picked (or dropped) on the card, sent to /quest/trips/file, then listed under Files
  await page.setInputFiles("#page #tCard [data-tdrop] input", { name: "airbnb.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") }); await sleep(500);
  const filed = flat(await text(page, "#page #tCard"));
  check("computer: a dropped reservation is saved and listed under Files", filed.includes("Files Ref._Montreal stay_confirmation.pdf ↗") && (await text(page, "#toast").catch(() => "")).includes("Saved as Ref._Montreal stay_confirmation.pdf"), filed);
  await page.setInputFiles("#page #tCard [data-tdrop] input", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") }); await sleep(300);
  check("computer: a file that is not a PDF or image is refused, not sent", (await text(page, "#toast").catch(() => "")).includes("Only a PDF or an image"));

  // a plan to book: no Book button (2026-11-18), a calendar copy takes no file, and its pin grows when it sits on a saved place
  await page.click('#page #tRead [data-tplan="seed-spa"]').catch(() => {}); await sleep(250);
  const spa = flat(await text(page, "#page #tCard"));
  check("computer: Need to book has no Book button and no drop on a calendar copy", spa === "♨ Spa & Recovery Day Need to book × When Mon Nov 16, 11:00 am to 5:30 pm Status Need to Book Address Missing", spa);
  const lw = await page.evaluate(() => [...document.querySelectorAll("#page #tRead .trow")].find((r) => /Lambada workshop/.test(r.textContent))?.dataset.tplan);
  await page.click(`#page #tRead [data-tplan="${lw}"]`); await sleep(250);
  check("computer: a plan on a saved place grows that place's pin", (await page.evaluate(() => document.querySelector("#page .tpin.on")?.innerText || "")).includes("Alliance Dance Company"));
  check("computer: its When reads the day and time", flat(await text(page, "#page #tCard")).includes("When Fri Nov 13, 9:00 pm"), flat(await text(page, "#page #tCard")));

  // a saved place still shows the place card; × clears
  await page.click('#page .tpl-row[data-tpin="mtl-piernas"]'); await sleep(250);
  const pc = flat(await text(page, "#page #tCard"));
  check("computer: a saved place shows its place card, and no plan stays lit", /^💃 Las Piernas × 2019 Rue Moreau/.test(pc) && !(await page.evaluate(() => !!document.querySelector("#page #tRead .trow.on"))), pc);
  await page.click('#page #tRead [data-tplan="notion-stay"]'); await sleep(200);
  await page.click("#page #tCard [data-tclose]"); await sleep(150);
  check("computer: × clears the details and the pin", (await text(page, "#page #tCard")) === "" && !(await page.evaluate(() => !!document.querySelector("#page .tpin.on, #page #tRead .trow.on"))));

  // no word cut off at 1280 px
  const cut = await page.evaluate(() => [...document.querySelectorAll("#page #tRead *, #page #tCard *, #page .tleft .phead *")]
    .filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && !e.matches(".seg")).map((e) => e.className + ": " + e.textContent.slice(0, 40)));
  check("computer: no word cut off at 1280 px", cut.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), JSON.stringify(cut));

  if (process.env.SHOTS) {
    await page.click('#page #tRead [data-tplan="notion-stay"]'); await page.setViewportSize({ width: 1280, height: 1500 });
    await page.evaluate(() => { document.querySelector("#page").scrollTop = 0; }); await sleep(900);
    await page.screenshot({ path: path.join(process.env.SHOTS, "trip-read-computer-1280.png"), fullPage: true });
  }

  /* the only writes: slice 04's four Montreal places saved once when the trip first opens, and the one reservation file */
  check("computer: nothing written but the four starting places and the one reservation", writes.length === 5 && writes.filter((w) => w === "POST /quest/places").length === 4 && writes.includes("POST /quest/trips/file"), JSON.stringify(writes));
  check("computer: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();

  /* ---------- phone: unchanged from main (d14) ---------- */
  execSync(`git archive origin/main still | tar -x -C "${old}"`, { cwd: path.join(here, "../../..") });
  servers.push(await serve(OLD_PORT, old));
  const phoneOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  const read = async (port) => {
    const t = await openTrip(browser, port, phoneOpts), out = {};
    const words = () => t.page.evaluate(() => {
      const c = document.querySelector("#page").cloneNode(true);
      c.querySelectorAll(".leaflet-container").forEach((m) => m.remove());   // map tiles and their credits load at their own pace
      document.body.appendChild(c); const s = c.innerText; c.remove(); return s.replace(/\s+/g, " ").trim();
    });
    out.map = await words();
    await t.page.click('#page .ttabs2 [data-ttab="Itinerary"]'); await sleep(200);
    out.itinerary = await words();
    await t.page.click('#page .trow[data-tpin^="plan:"]'); await sleep(300);
    out.planDot = await words();
    out.errors = t.errors.length;
    await t.ctx.close();
    return out;
  };
  const now = await read(PORT + 0), then = await read(OLD_PORT);
  for (const k of ["map", "itinerary", "planDot"]) check(`phone: the ${k} view reads exactly as main's`, now[k] === then[k] && now[k].length > 200, now[k] === then[k] ? now[k].length + " characters" : "now: " + now[k].slice(0, 300) + " | main: " + then[k].slice(0, 300));
  check("phone: no page errors", now.errors === 0);
} finally {
  await browser.close();
  for (const s of servers) s.kill();
  fs.rmSync(old, { recursive: true, force: true });
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} of ${results.length} passed`);
process.exit(bad.length ? 1 : 0);
