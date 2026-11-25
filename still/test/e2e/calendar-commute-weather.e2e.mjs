// d31 B (Junyan, 2026-11-25: "31 B"): the weather box that replaces the small map in the Commute panel.
// Clicks and checks every state in the test browser, on a computer and on a phone, against the faked dev routes (calendar-dev.mjs) and a
// stand-in for Open-Meteo (helpers/open-meteo-stub.mjs): the box with an icon, the big line, the small line and the tip; the quiet
// "Checking the weather…" line while the answer is on its way (the rest of the panel works at once); "No forecast yet for that day." for a
// block past the forecast; no box for a block that has ended; "Weather is not available right now." when the call fails or From has no pin;
// one answer per rounded place kept for 30 minutes; a repaint that does not flash the box or take focus from the From box; Open in Organic
// Maps still gets its coordinates with no map; and nothing in the Commute panel draws a map any more.
// The clock is fixed (Nov 24 2026, 10:00 in Toronto), so no test reads the real one. Not part of `node --test`: it needs playwright-core.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-commute-weather.e2e.mjs
//   SHOTS=<folder> also saves a computer and a phone screenshot of the box.
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
import { stubOpenMeteo } from "../helpers/open-meteo-stub.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8871), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const NOW = "2026-11-24T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const browser = await launchTestBrowser(chromium);
const wxText = (page) => page.evaluate(() => (document.querySelector("#cmWx")?.innerText || "").replace(/\s+/g, " ").trim());

try {
  const sizes = [["computer", { viewport: { width: 1280, height: 860 } }], ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]];
  for (const [label, opts] of sizes) {
    if (process.env.ONLY && process.env.ONLY !== label) continue;
    const port = PORT + (label === "phone" ? 1 : 0), base = `http://localhost:${port}`;
    const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(port)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
    await new Promise((ok) => server.stdout.once("data", ok));
    const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    await page.clock.install({ time: new Date(NOW) });
    const errors = [], tiles = []; page.on("pageerror", (e) => errors.push(e.message));
    let nomatim = "found";
    await page.route("https://nominatim.openstreetmap.org/**", (route) => {
      const q = decodeURIComponent(new URL(route.request().url()).searchParams.get("q") || "");
      const at = nomatim === "none" || /nowhere/i.test(q) ? null : /queen/i.test(q) ? { lat: "43.6529", lon: "-79.3849" } : { lat: "43.6495", lon: "-79.4290" };
      route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(at ? [at] : []) });
    });
    await page.route("https://tile.openstreetmap.org/**", (route) => { tiles.push(route.request().url()); route.fulfill({ status: 200, contentType: "image/png", body: Buffer.alloc(0) }); });
    const wx = stubOpenMeteo(page, { delayMs: 1200 });
    await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
    await page.goto(`${base}/still/calendar.html?api=${encodeURIComponent(base)}`); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    const openEv = async (title, d, shift = 0) => {
      const ok = await page.evaluate(([title, d, shift]) => { const k = C.addDays(today(), d); const ev = eventsFor(k, k).find((e) => e.title === title && C.wall(e.s, S.tz).day === k);
        if (!ev) return false; const x = shift ? { ...ev, id: ev.id + "-x" + shift, s: ev.s + shift * 864e5, e: ev.e + shift * 864e5, start: new Date(ev.s + shift * 864e5).toISOString(), end: new Date(ev.e + shift * 864e5).toISOString() } : ev; panel("event", x); return true; }, [title, d, shift]);
      await sleep(400); await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); return ok;
    };
    // a block with no To yet asks for one first; give it the same To so the trip (and the weather box) appears
    const giveTo = async () => { if (await page.locator("#cmTo").count()) { await page.fill("#cmTo", "Gladstone Hotel, Toronto"); await page.press("#cmTo", "Enter"); await sleep(600); } };

    // Home, then a To for Transit (tomorrow 9:35)
    check(`${label}: Transit opens`, await openEv("Transit", 1));
    await page.fill("#cmHomeIn", "100 Queen St W, Toronto"); await page.click('[data-cm="home"]'); await sleep(700);
    check(`${label}: no weather box while the To is still being asked (no trip yet)`, await page.locator("#cmWx").count() === 0);
    await page.fill("#cmTo", "Gladstone Hotel, Toronto"); await page.press("#cmTo", "Enter");

    // loading: the quiet line first, and the rest of the panel is usable at once
    await page.waitForSelector("#cmWx", { timeout: 3000 });
    check(`${label}: the box first says "Checking the weather…"`, await wxText(page) === "Checking the weather…", await wxText(page));
    check(`${label}: while it waits, Going by, From, To and the map buttons are all there and the Walk chip works`, await page.locator('#cmBox [data-cm="mode"]').count() === 3 && await page.locator('#cmBox [data-cm="rowfrom"]').count() === 1 && await page.locator('#cmBox a:has-text("Open in Google Maps")').count() === 1);
    // the box fills on its own; the From box keeps focus and the typed text while that happens
    await page.click('#cmBox [data-cm="rowfrom"]'); await page.focus("#cmFromIn"); await page.keyboard.type("Que", { delay: 30 });
    await page.waitForFunction(() => /\d+° · /.test(document.querySelector("#cmWx")?.innerText || ""), null, { timeout: 6000 });
    check(`${label}: when the weather arrives, focus and the typed text are still in the From box`, await page.evaluate(() => document.activeElement?.id === "cmFromIn" && document.activeElement.value === "Que"));
    check(`${label}: the box has the icon, the big line, the small line and one tip`, await page.evaluate(() => {
      const w = document.querySelector("#cmWx"); return !!w && !!w.querySelector(".wxi")?.textContent.trim() && /^3° · light rain$/.test(w.querySelector(".big").textContent) && /^feels like 0° when you leave$/.test(w.querySelector(".meta").textContent) && w.querySelectorAll(".wxtip").length === 1 && /^Bring an umbrella\./.test(w.querySelector(".wxtip").textContent); }), await wxText(page));
    check(`${label}: asked once, with only the rounded From point, the fields, the time zone and the day count`, wx.urls.length === 1 && wx.urls[0] === "https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code&timezone=America%2FToronto&timeformat=unixtime&forecast_days=16", JSON.stringify(wx.urls));
    await page.press("#cmFromIn", "Escape"); await page.click('#cmBox [data-cm="cancelfrom"]'); await sleep(300);

    // a repaint draws the box from memory at once (no loading line, no flash) and asks nothing again
    const sync = await page.evaluate(() => { cmPaint(); return document.querySelector("#cmWx")?.innerText.replace(/\s+/g, " ").trim(); });
    check(`${label}: a repaint draws the weather in the same moment, with no loading line`, /3° · light rain/.test(sync), sync);
    await page.click('#cmBox [data-cm="mode"][data-v="drive"]'); await sleep(900);
    await page.click('#cmBox [data-cm="mode"][data-v="transit"]'); await sleep(900);
    check(`${label}: retyping, repainting and switching the way did not ask again (kept 30 minutes per rounded place)`, wx.urls.length === 1, JSON.stringify(wx.urls.length));
    // Open in Organic Maps still gets its coordinates with no map (the pin lookups run for the links)
    const om = await page.getAttribute('#cmLinks a:has-text("Organic Maps")', "href").catch(() => null);
    check(`${label}: Open in Organic Maps still gets both points with no map on the panel`, /^https:\/\/omaps\.app\/route\?sll=43\.6529,-79\.3849&.*&dll=43\.6495,-79\.429&/.test(om || ""), String(om));
    check(`${label}: nothing in the Commute panel draws a map: no Leaflet, no tiles asked for`, await page.locator("#cmBox .leaflet-container, #cmMap").count() === 0 && tiles.length === 0, JSON.stringify(tiles));
    if (process.env.SHOTS) { await page.evaluate(() => document.querySelector("#cmWx")?.scrollIntoView({ block: "center" })); await sleep(200); await page.screenshot({ path: path.join(process.env.SHOTS, `weather-${label}.png`) }); }
    const fit = await page.evaluate(() => { const w = document.querySelector("#cmWx").getBoundingClientRect(), b = document.querySelector("#cmBox").getBoundingClientRect(); return { inside: w.left >= b.left - 1 && w.right <= b.right + 1, wide: Math.round(w.width), h: Math.round(w.height) }; });
    check(`${label}: the box fits inside the Commute box`, fit.inside && fit.h >= 60, JSON.stringify(fit));
    // a block that leaves from a different place asks once for that place (the first place stays kept)
    check(`${label}: Bus to studio opens (from Home as well)`, await openEv("Bus to studio", 1)); await giveTo();
    await page.waitForFunction(() => /\d+° · /.test(document.querySelector("#cmWx")?.innerText || ""), null, { timeout: 4000 });
    check(`${label}: a different From place asks once more, for its own point, and then shows its weather`, wx.urls.length === 2 && wx.urls[1].includes("latitude=43.65&longitude=-79.43&") && !/Checking/.test(await wxText(page)), JSON.stringify(wx.urls.length));
    await page.evaluate(() => cmPaint()); await sleep(300);
    check(`${label}: and a repaint of it asks nothing`, wx.urls.length === 2);

    // beyond the forecast: no box content but the quiet line, and the rest still works
    check(`${label}: a Commute block 20 days out opens`, await openEv("Transit", 1, 20)); await giveTo();
    await page.waitForSelector("#cmWx", { timeout: 4000 });
    check(`${label}: it says "No forecast yet for that day." and asks nothing`, await wxText(page) === "No forecast yet for that day." && wx.urls.length === 2, await wxText(page));
    check(`${label}: and the To line and the map buttons are still there`, await page.locator('#cmBox [data-cm="rowto"]').count() === 1 && await page.locator('#cmBox a:has-text("Open in Google Maps")').count() === 1);
    // ended: no box at all
    check(`${label}: a Commute block from 2 days ago opens`, await openEv("Transit", 1, -3)); await giveTo();
    await sleep(900);
    check(`${label}: a block that has ended has no weather box at all, and no ask`, await page.locator("#cmWx").count() === 0 && wx.urls.length === 2);

    // a failed call
    wx.fail = true; await page.evaluate(() => { for (const k of Object.keys(CMW.cache)) delete CMW.cache[k]; });
    check(`${label}: Subway to class opens (the weather call will fail)`, await openEv("Subway to class", 2));
    await page.waitForFunction(() => /not available/.test(document.querySelector("#cmWx")?.innerText || ""), null, { timeout: 6000 }).catch(() => {});
    check(`${label}: a failed call says "Weather is not available right now."`, await wxText(page) === "Weather is not available right now.", await wxText(page));
    check(`${label}: and the rest of the panel is fine (the way chips, Heads up, Check again)`, await page.locator('#cmBox [data-cm="mode"]').count() === 3 && /Check again/.test(await page.innerText("#cmBox")));
    const askedBefore = wx.urls.length;
    await page.evaluate(() => cmPaint()); await sleep(500);
    check(`${label}: a failure is remembered for a moment, so a repaint does not ask again at once`, wx.urls.length === askedBefore, `${askedBefore} -> ${wx.urls.length}`);
    check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
    await ctx.close(); server.kill();

    // From with no pin: its address cannot be found on the map
    const server2 = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(port + 10)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
    await new Promise((ok) => server2.stdout.once("data", ok));
    const b2 = `http://localhost:${port + 10}`;
    const ctx2 = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    const p2 = await ctx2.newPage(); p2.setDefaultTimeout(8000); await p2.clock.install({ time: new Date(NOW) });
    const wx2 = stubOpenMeteo(p2);
    await p2.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "[]" }));
    await p2.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
    await p2.goto(`${b2}/still/calendar.html?api=${encodeURIComponent(b2)}`); await p2.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    await p2.evaluate(() => { const k = C.addDays(today(), 2); panel("event", eventsFor(k, k).find((e) => e.title === "Subway to class")); });
    await sleep(500); await p2.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {});
    await p2.fill("#cmHomeIn", "Nowhere Land 1"); await p2.click('[data-cm="home"]'); await sleep(700);
    await p2.waitForFunction(() => /not available/.test(document.querySelector("#cmWx")?.innerText || ""), null, { timeout: 6000 }).catch(() => {});
    check(`${label}: From with no pin says "Weather is not available right now." and asks Open-Meteo nothing`, flat(await p2.evaluate(() => document.querySelector("#cmWx")?.innerText)) === "Weather is not available right now." && wx2.urls.length === 0, JSON.stringify(wx2.urls));
    await ctx2.close(); server2.kill();
  }
  const bad = results.filter((r) => !r.ok); console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`); process.exitCode = bad.length ? 1 : 0;
} finally { await browser.close(); }
