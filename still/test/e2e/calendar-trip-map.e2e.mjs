// Slice 04, the trip map and saved places (Junyan, 2026-11-17: "35 yes, 36 yes", mock
// https://claude.ai/artifact/BQLvpC1YQjAUDhuBJefsRi as drawn). A trip card on the Trips page opens the trip: on a
// computer the plans sit left and the map, a place's card and "Saved places N" sit right; on a phone Map is a tab
// (d11). Montreal Birthday starts with the four Montreal places (d36). Add a place by name or address (d32), found or
// not; remove one; Directions goes to Google Maps. The rules themselves are tested in still/test/trip-map.test.mjs.
// The plan addresses' map lookups are put in this browser's memory first, so nothing here asks OpenStreetMap for an
// address; the map tiles and Leaflet itself do load from the internet.
// Not part of `node --test`: it needs playwright-core and Google Chrome.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-trip-map.e2e.mjs
//   SHOTS=<folder> also saves a computer and a phone screenshot of the trip.
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8815), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
const SPOTS = { "1255 rue jeanne-mance, montréal": { lat: 45.5079, lng: -73.5646 }, "mount royal, montréal": null };
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText || "", sel);
const shown = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; }, sel);
const rows = (page) => page.evaluate(() => [...document.querySelectorAll("#page .tpl-row")].map((r) => r.innerText.replace(/\s+/g, " ").trim()));
const pins = (page) => page.evaluate(() => [...document.querySelectorAll("#page .leaflet-marker-icon")].map((m) => m.innerText.replace(/\s+/g, "")));   // a tile's count badge sits on its corner, so innerText may put a gap before it
const toastText = async (page) => { await page.waitForFunction(() => document.querySelector("#toast.on"), null, { timeout: 4000 }).catch(() => {}); return text(page, "#toast"); };

try {
  const sizes = [
    ["computer", { viewport: { width: 1280, height: 860 } }],
    ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ];
  for (const [label, opts] of sizes) {
    // a fresh dev server per size, so each starts with no saved places
    const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
    await new Promise((ok) => server.stdout.once("data", ok));
    const phone = label === "phone";
    const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-11-13T15:00:00Z") });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((spots) => { localStorage.setItem("quest-key", "test"); localStorage.setItem("trip-map-spots-v1", JSON.stringify(spots)); }, SPOTS);
    await page.goto(URL_); await page.waitForSelector('#rail [data-page="travel"]', { state: "attached" }); await sleep(400);
    await page.evaluate(() => document.querySelector('#rail [data-page="travel"]').click());
    await page.waitForFunction(() => /Brazil Carnaval/.test(document.querySelector("#page")?.innerText || ""), null, { timeout: 5000 }).catch(() => {});

    // a trip card opens the trip
    await page.click('#page .tcard[data-trip="2026 🇨🇦 Montreal Birthday"]');
    await page.waitForFunction(() => document.querySelectorAll("#page .tpl-row").length >= 4, null, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll("#page .leaflet-marker-icon").length >= 5, null, { timeout: 15000 }).catch(() => {});
    await sleep(300);
    const head = phone ? flat(await text(page, "#page .ttop")) : flat(await text(page, "#page .tleft .phead"));
    check(`${label}: the trip opens with its head`, phone ? /Montreal Birthday Nov 12 to Nov 17/.test(head) && !/2026/.test(head)
      : /2026 🇨🇦 Montreal Birthday Thu Nov 12 to Tue Nov 17 · You \+ Caney/.test(head), head);   // slice 05 gave the computer's dates their weekdays
    check(`${label}: the address stays on calendar.html`, new URL(page.url()).pathname.endsWith("/still/calendar.html"));

    if (phone) {
      const tabs = await page.evaluate(() => [...document.querySelectorAll("#page .ttabs2 button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")]));
      check(`${label}: Map is a tab on the trip, and the trip opens on it`, JSON.stringify(tabs) === '[["Itinerary","false"],["Map","true"]]', JSON.stringify(tabs));
      check(`${label}: on the Map tab the map shows and the plans do not`, await shown(page, "#page .tmapbox") && !(await shown(page, "#page .tleft")));
    } else {
      check(`${label}: no tabs on a computer: the plans and the map side by side`, !(await shown(page, "#page .ttabs2")) && await shown(page, "#page .tleft") && await shown(page, "#page .tmapbox") &&
        await page.evaluate(() => document.querySelector("#page .tleft").getBoundingClientRect().right <= document.querySelector("#page .tside").getBoundingClientRect().left + 1));
    }

    // d36: the four Montreal places, saved to the server
    const list = await rows(page);
    check(`${label}: Saved places 4, the four Montreal places`, flat(await text(page, "#page .tsh")) === "Saved places 4" &&
      list.length === 4 && /^💃 Alliance Dance Company 2529 Rue Ontario E · 4 plans$/.test(list[0]) && /Mount Royal lookout/.test(list[3]), JSON.stringify(list));
    const saved = await page.evaluate(async (b) => (await (await fetch(b + "/quest/places", { headers: { "X-Quest-Key": "test" } })).json()).places.map((p) => p.id), BASE);
    check(`${label}: the four are on the server under Day Quest's ids`, JSON.stringify(saved) === '["mtl-alliance","mtl-piernas","mtl-studio","mtl-royal"]', JSON.stringify(saved));

    // pins (d31): a tile per saved place, a blue count where plans sit, a plain dot for the stay's own address
    const p0 = await pins(page);
    check(`${label}: four place tiles and one plain plan dot, Alliance counts 4`, p0.length === 5 && p0.includes("💃4") && p0.filter((x) => x === "").length === 1, JSON.stringify(p0));
    const legend = flat(await text(page, "#page .tlegend"));
    check(`${label}: the legend in the mock's words`, legend === "💃 saved place ● plan address ❷ plans there", legend);
    // the legend never hides a pin (Junyan's check on 8816, 2026-11-18): every pin sits clear of the legend box
    const under = await page.evaluate(() => {
      const lg = document.querySelector("#page .tlegend").getBoundingClientRect();
      return [...document.querySelectorAll("#page .leaflet-marker-icon")].filter((m) => {
        const r = m.getBoundingClientRect();
        return r.right > lg.left && r.left < lg.right && r.bottom > lg.top && r.top < lg.bottom;
      }).map((m) => m.getAttribute("title") || m.innerText);
    });
    check(`${label}: the legend covers no pin`, under.length === 0, JSON.stringify(under));
    check(`${label}: the add box in the mock's words`, await page.getAttribute("#page #tAddIn", "placeholder") === "Add place: a name or an address, then Enter");

    // a saved place row opens its card
    await page.click('#page .tpl-row[data-tpin="mtl-alliance"]'); await sleep(250);
    const card = flat(await text(page, "#page .tcardx"));
    const dir = await page.getAttribute("#page .tcardx a.go", "href");
    check(`${label}: Alliance's card: address, the plans there, Directions and Remove place`,
      /^💃 Alliance Dance Company × 2529 Rue Ontario E, Montréal Fri 9:00 PM Lambada workshop Fri 10:00 PM Social Sat 1:00 PM Zouk, Lambada, Solo Battle workshops Sun 1:00 PM Lambada, Zouk workshops \+ Practica Directions ↗ Remove place$/.test(card), card);
    check(`${label}: Directions is Google Maps directions to the pin`, dir === "https://www.google.com/maps/dir/?api=1&destination=45.5341%2C-73.5523", dir);
    check(`${label}: the picked pin grows and is named`, (await page.evaluate(() => document.querySelector("#page .tpin.on")?.innerText || "")).includes("Alliance Dance Company"));

    // a plan row with a place opens that place; a plain dot has no Remove
    /* slice 05 (read a trip) redrew the computer's plans and gave a plan row its own details, so on a computer the
       stay's plain dot is picked on the map itself; the phone's rows are slice 04's as they were (d14) */
    if (phone) {
      await page.click('#page .ttabs2 [data-ttab="Itinerary"]'); await sleep(200);
      check(`${label}: the itinerary rows in the mock's words`, flat(await text(page, "#page .tleft")).toLowerCase().includes("Fri Nov 13 5:00 PM Check in: Montreal stay 📍 Montreal stay 9:00 PM Lambada workshop 📍 Alliance Dance Company".toLowerCase()),
        flat(await text(page, "#page .tleft")).slice(0, 700));
      await page.click('#page .trow[data-tpin^="plan:"]'); await sleep(300);
    } else {
      check(`${label}: the itinerary rows in slice 05's words`, flat(await text(page, "#page .tleft")).toLowerCase().includes("Fri Nov 13 5:00 pm 🏨 Montreal stay Check-in 5:00 pm (Fri), check-out 10:30 am (Tue) Missing: confirmation #, cancellation policy, confirmation file 9:00 pm 💃 Lambada workshop 📍 Alliance Dance Company".toLowerCase()),
        flat(await text(page, "#page .tleft")).slice(0, 700));
      await page.click("#page .leaflet-marker-icon:has(.tpin.dot)"); await sleep(300);
    }
    if (phone) check(`${label}: a plan row jumps to the Map tab`, await shown(page, "#page .tmapbox") && !(await shown(page, "#page .tleft")));
    const dot = flat(await text(page, "#page .tcardx"));
    check(`${label}: the stay's dot: from the plan, not a saved place, and no Remove`, /^🔵 Montreal stay × 1255 Rue Jeanne-Mance, Montréal · from the plan, not a saved place Fri 5:00 PM Check in: Montreal stay Directions ↗$/.test(dot), dot);
    await page.click("#page .tcardx [data-tclose]"); await sleep(150);
    check(`${label}: × closes the card`, !(await shown(page, "#page .tcardx")));

    // + Add place: found
    await page.fill("#page #tAddIn", "Schwartz's Deli"); await page.press("#page #tAddIn", "Enter");
    check(`${label}: a found place: the toast says Saved Schwartz's Deli`, await toastText(page) === "Saved Schwartz's Deli");
    await page.waitForFunction(() => document.querySelectorAll("#page .tpl-row").length === 5, null, { timeout: 4000 }).catch(() => {});
    check(`${label}: its pin drops (📍) and the list says Saved places 5`, flat(await text(page, "#page .tsh")) === "Saved places 5" && (await pins(page)).some((p) => p.startsWith("📍")), JSON.stringify(await pins(page)));
    check(`${label}: and its card opens`, /^📍 Schwartz's Deli/.test(flat(await text(page, "#page .tcardx"))));
    await sleep(2700);
    // not found
    await page.fill("#page #tAddIn", "Le Mystère"); await page.press("#page #tAddIn", "Enter");
    check(`${label}: not found: still saved, and the toast says so`, await toastText(page) === "Saved, but no pin: we could not find it. Add the street to place it.");
    await page.waitForFunction(() => document.querySelectorAll("#page .tpl-row").length === 6, null, { timeout: 4000 }).catch(() => {});
    const lost = (await rows(page)).find((r) => /Le Mystère/.test(r)) || "";
    check(`${label}: its row shows No pin`, /^📍 Le Mystère Not found on the map No pin$/.test(lost), lost);
    check(`${label}: the box is empty again and keeps the cursor`, await page.evaluate(() => document.activeElement?.id === "tAddIn" && !document.activeElement.value));

    // Remove place
    await sleep(2700);
    await page.click('#page .tpl-row:has-text("Le Mystère")'); await sleep(200);
    await page.click("#page .tcardx [data-trm]");
    check(`${label}: Remove place: the toast says Removed Le Mystère`, await toastText(page) === "Removed Le Mystère");
    await page.waitForFunction(() => document.querySelectorAll("#page .tpl-row").length === 5, null, { timeout: 4000 }).catch(() => {});
    const left = await page.evaluate(async (b) => (await (await fetch(b + "/quest/places", { headers: { "X-Quest-Key": "test" } })).json()).places.map((p) => p.name), BASE);
    check(`${label}: it leaves the list and the server`, !(await rows(page)).some((r) => /Le Mystère/.test(r)) && !left.includes("Le Mystère"), JSON.stringify(left));

    check(`${label}: nothing runs off the side`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (process.env.SHOTS) {
      await page.click('#page .tpl-row[data-tpin="mtl-alliance"]'); await sleep(600);
      if (phone) await page.evaluate(() => { document.querySelector("#page").scrollTop = 0; });
      await page.screenshot({ path: path.join(process.env.SHOTS, `trip-map-${label}.png`), fullPage: !phone });
    }

    // ‹ Trips goes back to the cards
    await page.click("#page [data-tback]:visible"); await sleep(250);
    check(`${label}: ‹ Trips goes back to the trip cards`, (await page.evaluate(() => document.querySelectorAll("#page .tcard").length)) === 2);
    check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
    await ctx.close();
    server.kill();
  }
} finally {
  await browser.close();
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} of ${results.length} passed`);
process.exit(bad.length ? 1 : 0);
