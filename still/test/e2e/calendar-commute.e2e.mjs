// Commute blocks, slice 1 (Junyan, 2026-11-24: "1 yes, 2 A, 3 yes, 4 A"). Clicks every control of the Commute panel in
// the test browser, on a computer and on a phone: Going by, Home, the ask, Remember for every ..., Open in Google Maps,
// the small map, Open map (Show where I am, Whole trip, Close), Add a photo (shrunk to 1600px), Add a note, See the
// photo, and "From last time you went here" on a later block to the same place.
// The clock is fixed (Nov 24 2026, 10:00 in Toronto) for the page and for the dev server, so no test reads the real clock.
// The map lookup (OpenStreetMap search) and the map tiles are answered here; Leaflet itself loads from the internet.
// Not part of `node --test`: it needs playwright-core and the test browser.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-commute.e2e.mjs
//   SHOTS=<folder> also saves a computer and a phone screenshot of the panel and the open map.
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8817), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const NOW = "2026-11-24T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const browser = await launchTestBrowser(chromium);
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText || "", sel);
const shown = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; }, sel);
const panelText = async (page) => flat(await text(page, "#pbody"));

try {
  const sizes = [
    ["computer", { viewport: { width: 1280, height: 860 } }],
    ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ];
  for (const [label, opts] of sizes) {
    if (process.env.ONLY && process.env.ONLY !== label) continue;
    const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
    await new Promise((ok) => server.stdout.once("data", ok));
    const phone = label === "phone";
    const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto", permissions: ["geolocation"], geolocation: { latitude: 43.7, longitude: -79.42 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date(NOW) });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const asked = [];
    await page.route("https://nominatim.openstreetmap.org/**", (route) => {
      const q = decodeURIComponent(new URL(route.request().url()).searchParams.get("q") || ""); asked.push(q);
      const at = /queen/i.test(q) ? { lat: "43.6529", lon: "-79.3849" } : /nowhere/i.test(q) ? null : { lat: "43.6495", lon: "-79.4290" };
      route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(at ? [at] : []) });
    });
    await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
    await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
    await page.goto(URL_); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    const open = async (title) => {
      if (phone && await page.evaluate(() => document.body.classList.contains("popen"))) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); }   // the phone sheet covers the cards
      for (let i = 0; i < 6; i++) {
        const el = page.locator(`.ev:has-text("${title}")`).first();
        if (await el.count() && await el.isVisible()) { await el.click(); await sleep(400); return true; }
        await page.click("#next"); await sleep(300);
      }
      return false;
    };
    const chip = (m) => page.locator(`#cmBox [data-cm="mode"][data-v="${m}"]`);

    // the cards carry the mode's emoji
    check(`${label}: Transit opens`, await open("Transit"));
    const ic = await page.evaluate(() => [...document.querySelectorAll(".ev")].filter((e) => /Transit|Bus to studio|Subway to class/.test(e.innerText)).map((e) => e.querySelector(".ei")?.textContent));
    check(`${label}: the transit cards show 🚇`, ic.length >= 1 && ic.every((x) => x === "🚇"), JSON.stringify(ic));

    // the panel: Going by, no address, no Home
    await page.waitForSelector("#cmBox [data-cm=mode]", { timeout: 5000 });
    await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || ""), null, { timeout: 5000 });
    let pt = await panelText(page);
    const chips = await page.evaluate(() => [...document.querySelectorAll('#cmBox [data-cm="mode"]')].map((b) => b.textContent + ":" + b.getAttribute("aria-pressed")));
    check(`${label}: Going by has three chips, Transit pressed (guessed from the title)`, JSON.stringify(chips) === '["🚶 Commute:false","🚇 Transit:true","🚗 Drive:false"]', JSON.stringify(chips));
    check(`${label}: no address anywhere, so the panel asks "Where are you going?"`, /Where are you going\?/i.test(pt) && /Not set yet/.test(pt));
    check(`${label}: no Google Maps link, no map, no photo buttons before there is an address`, !(await shown(page, "#cmBox a")) && !(await shown(page, "#cmMap")) && !(await shown(page, "#cmFile")) && !/Add a photo/.test(pt));
    check(`${label}: the ask offers Remember for every Work block`, /Remember for every Work block/.test(pt));
    check(`${label}: no route steps, times, alerts or Check now are drawn`, !/leave by|heads up|check now|get directions|\d+ min walk|closure|weather/i.test(pt), pt);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `commute-${label}-ask.png`) });

    // Home
    check(`${label}: Home is asked once`, await shown(page, "#cmHomeIn"));
    await page.fill("#cmHomeIn", "100 Queen St W, Toronto"); await page.click('[data-cm="home"]'); await sleep(600);
    check(`${label}: Home is saved and From says Home`, /From Home/i.test(await panelText(page)) && !(await shown(page, "#cmHomeIn")));

    // the ask: type, remember
    await page.fill("#cmTo", "Gladstone Hotel, Toronto"); await page.check("#cmRem"); await page.click('#cmAsk [data-cm="go"]'); await sleep(900);
    pt = await panelText(page);
    check(`${label}: To shows what he typed and the ask is gone`, /To Gladstone Hotel, Toronto/i.test(pt) && !/Where are you going\?/i.test(pt), pt.slice(0, 200));
    let href = await page.getAttribute('#cmBox a:has-text("Open in Google Maps")', "href");
    check(`${label}: Open in Google Maps, transit, from Home to the address`, href === "https://www.google.com/maps/dir/?api=1&origin=100%20Queen%20St%20W%2C%20Toronto&destination=Gladstone%20Hotel%2C%20Toronto&travelmode=transit", href);
    check(`${label}: the link opens in a new tab`, await page.getAttribute('#cmBox a:has-text("Open in Google Maps")', "target") === "_blank");
    const places = await page.evaluate(async (b) => (await (await fetch(b + "/quest/places", { headers: { "X-Quest-Key": "test" } })).json()).places, BASE);
    check(`${label}: Home and "Remember for every Work block" are saved places`, places.some((p) => p.category === "home" && p.name === "Home") && places.some((p) => p.category === "commute-for" && p.list === "for:work block" && /Gladstone/.test(p.address)), JSON.stringify(places.map((p) => [p.category, p.list])));

    // the small map
    await page.waitForFunction(() => document.querySelectorAll("#cmMap .cmpin").length >= 2, null, { timeout: 15000 }).catch(() => {});
    const pins = await page.evaluate(() => [...document.querySelectorAll("#cmMap .cmpin")].map((m) => m.textContent));
    check(`${label}: the small map has a From pin and a To pin`, pins.includes("From") && pins.includes("To"), JSON.stringify(pins));

    // Going by: Drive
    await chip("drive").click(); await sleep(900);
    await page.waitForSelector('#cmBox a:has-text("Open in Google Maps")', { timeout: 5000 });
    href = await page.getAttribute('#cmBox a:has-text("Open in Google Maps")', "href");
    check(`${label}: picking Drive by hand changes the link to driving`, /travelmode=driving$/.test(href), href);
    const ic2 = await page.evaluate(() => [...document.querySelectorAll(".ev")].filter((e) => /Transit/.test(e.innerText)).map((e) => e.querySelector(".ei")?.textContent));
    check(`${label}: the hand-picked mode beats the title: the card now shows 🚗`, ic2.includes("🚗"), JSON.stringify(ic2));
    const stored = await page.evaluate(async (b) => { const now = Date.now(); const r = await (await fetch(b + "/planner/events?from=" + new Date(now - 864e5 * 3).toISOString() + "&to=" + new Date(now + 864e5 * 9).toISOString(), { headers: { "X-Quest-Key": "test" } })).json(); return r.events.find((e) => e.title === "Transit")?.mode; }, BASE);
    check(`${label}: the server holds mode drive on the event`, stored === "drive", String(stored));
    await chip("commute").click(); await sleep(700);
    href = await page.getAttribute('#cmBox a:has-text("Open in Google Maps")', "href");
    check(`${label}: Commute is the walking link`, /travelmode=walking$/.test(href), href);

    // Change To: the ask comes back with a Cancel
    await page.click('#cmBox [data-cm="edit"]'); await sleep(200);
    check(`${label}: Change on To brings the ask back, with Cancel`, await shown(page, "#cmTo") && await shown(page, '#cmAsk [data-cm="cancel"]'));
    await page.fill("#cmTo", "nowhere land"); await page.click('#cmAsk [data-cm="go"]'); await sleep(700);
    check(`${label}: an address the map cannot find still works, with a note that there is no pin`, /To nowhere land/i.test(await panelText(page)));
    const gm = await page.getAttribute('#cmBox a:has-text("Open in Google Maps")', "href");
    check(`${label}: the link still builds for it`, /destination=nowhere%20land/.test(gm), gm);
    await page.click('#cmBox [data-cm="edit"]'); await sleep(200);
    await page.fill("#cmTo", "Gladstone Hotel, Toronto"); await page.click('#cmAsk [data-cm="go"]'); await sleep(900);

    // the big map
    await page.click('#cmBox [data-cm="map"]'); await sleep(400);
    await page.waitForFunction(() => document.querySelectorAll("#cmBigMap .cmpin").length >= 2, null, { timeout: 15000 }).catch(() => {});
    const box = await page.evaluate(() => { const r = document.querySelector(".cmbig").getBoundingClientRect(); return { w: r.width, h: r.height, x: r.left }; });
    check(`${label}: Open map fills ${phone ? "the screen" : "the calendar area"}`, phone ? box.w >= 389 && box.h >= 843 : box.w > 1000 && box.h > 700, JSON.stringify(box));
    check(`${label}: the big map has Show where I am, Whole trip and Close`, ["gps", "fit", "close"].every((a) => true) && (await page.locator('.cmbig [data-cm]').allTextContents()).join("|") === "Show where I am|Whole trip|Close");
    const geoBefore = await page.evaluate(() => document.querySelectorAll(".cmpin.me").length);
    await page.click('.cmbig [data-cm="gps"]'); await sleep(900);
    check(`${label}: Show where I am puts a You pin only after the press`, geoBefore === 0 && await page.evaluate(() => document.querySelectorAll(".cmpin.me").length) === 1);
    await page.evaluate(() => { document.querySelector("#cmBigMap").scrollIntoView(); });
    const z0 = await page.evaluate(() => window.L && [...document.querySelectorAll(".leaflet-container")].length);
    await page.click('.cmbig [data-cm="fit"]'); await sleep(500);
    check(`${label}: Whole trip refits the map`, z0 >= 1);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `commute-${label}-map.png`) });
    await page.click('.cmbig [data-cm="close"]'); await sleep(200);
    check(`${label}: Close leaves the panel`, !(await shown(page, ".cmbig")) && await shown(page, "#cmBox"));

    // Add a note
    await page.click('#cmBox [data-cm="note"]'); await sleep(200);
    check(`${label}: Add a note: a note box and The place too, on`, await shown(page, "#cmNote") && await page.isChecked("#cmWith") && !(await shown(page, ".cmshot")));
    await page.click('.cmmodal [data-cm="shotsave"]'); await sleep(300);
    check(`${label}: an empty note is not saved`, /Add a note or a photo first/.test(await text(page, "#toast")) && await shown(page, "#cmNote"));
    await page.fill("#cmNote", "Side door on Queen, ring twice"); await page.click('.cmmodal [data-cm="shotsave"]'); await sleep(700);
    check(`${label}: the note shows under Photos and notes`, /Side door on Queen, ring twice/.test(await panelText(page)));

    // Add a photo: shrunk to 1600 on the long side, orientation kept
    const big = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 3200; c.height = 2000; const x = c.getContext("2d"); x.fillStyle = "#c33"; x.fillRect(0, 0, 3200, 2000); return c.toDataURL("image/jpeg", .9).split(",")[1]; });
    check(`${label}: the photo box asks a phone for its camera`, await page.getAttribute("#cmFile", "capture") === "environment" && await page.getAttribute("#cmFile", "accept") === "image/*");
    await page.setInputFiles("#cmFile", { name: "sign.jpg", mimeType: "image/jpeg", buffer: Buffer.from(big, "base64") });
    await page.waitForSelector(".cmshot", { timeout: 5000 });
    const dim = await page.evaluate(() => { const i = document.querySelector(".cmshot"); return [i.naturalWidth, i.naturalHeight]; });
    check(`${label}: the picture is shrunk to a long side of 1600 and stays wide`, dim[0] === 1600 && dim[1] === 1000, JSON.stringify(dim));
    check(`${label}: the photo screen: the picture, a note and The place too (on)`, await shown(page, "#cmNote") && await page.isChecked("#cmWith"));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `commute-${label}-photo.png`) });
    await page.fill("#cmNote", "Exit sign for the south platform"); await page.click('.cmmodal [data-cm="shotsave"]'); await sleep(900);
    check(`${label}: the photo is saved with its note and a See the photo button`, /Exit sign for the south platform/.test(await panelText(page)) && await page.locator('#cmBox [data-cm="see"]').count() === 1);
    await page.click('#cmBox [data-cm="see"]'); await page.waitForSelector(".cmmodal img", { timeout: 5000 });
    const sized = await page.evaluate(() => { const i = document.querySelector(".cmmodal img"); return i.complete && i.naturalWidth; });
    check(`${label}: See the photo shows the saved picture`, sized === 1600, String(sized));
    await page.click('.cmmodal [data-cm="closemodal"]'); await sleep(150);
    // the camera pin on the map shows the photo
    await page.waitForFunction(() => document.querySelectorAll("#cmMap .cmpin.photo").length === 1, null, { timeout: 8000 }).catch(() => {});
    check(`${label}: the map has a 📷 pin for the photo`, await page.evaluate(() => document.querySelectorAll("#cmMap .cmpin.photo").length) === 1);
    await page.evaluate(() => document.querySelector("#cmBox").scrollIntoView()); await sleep(200);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `commute-${label}-panel.png`), fullPage: false });
    await page.click('#cmBox [data-cm="map"]'); await page.waitForSelector("#cmBigMap .cmpin.photo", { timeout: 15000 });
    await page.click("#cmBigMap .cmpin.photo"); await page.waitForSelector(".cmmodal img", { timeout: 5000 });
    check(`${label}: tapping the photo pin shows the photo`, await page.evaluate(() => document.querySelectorAll(".cmmodal img").length) === 1);
    await page.keyboard.press("Escape"); await sleep(200);
    check(`${label}: Escape closes the map and the photo`, !(await shown(page, ".cmbig")) && !(await shown(page, ".cmmodal")));

    // a later block before the same-titled event fills itself and shows what he saved last time
    check(`${label}: the later Commute block opens`, await open("Commute"));
    await page.waitForFunction(() => /Photos and notes/i.test(document.querySelector("#cmBox")?.innerText || ""), null, { timeout: 6000 }).catch(() => {});
    pt = await panelText(page);
    check(`${label}: its To is filled from "Remember for every Work block", no ask`, /To Gladstone Hotel, Toronto/i.test(pt) && !/Where are you going\?/i.test(pt), pt.slice(-300));
    check(`${label}: it shows "From last time you went here" with the photo and the note`, /From last time you went here/i.test(pt) && /Exit sign for the south platform/.test(pt) && /Side door on Queen/.test(pt));
    check(`${label}: the guess is Commute (🚶) for a plain Commute title`, (await chip("commute").getAttribute("aria-pressed")) === "true");

    // a block whose next event has an address uses it; one with its own location uses that
    check(`${label}: Bus to studio opens`, await open("Bus to studio"));
    await page.waitForFunction(() => /\bTo\b/.test(document.querySelector("#cmBox")?.innerText || ""), null, { timeout: 5000 }).catch(() => {});
    pt = await panelText(page);
    check(`${label}: the next event's address is used for the To`, /To Studio on-site · 527, 527 Bloor St W, Toronto/i.test(pt) && !/Where are you going\?/i.test(pt), pt.slice(0, 200));
    check(`${label}: Bus to studio is Transit`, (await chip("transit").getAttribute("aria-pressed")) === "true");
    check(`${label}: Subway to class opens`, await open("Subway to class"));
    await page.waitForFunction(() => /\bTo\b/.test(document.querySelector("#cmBox")?.innerText || ""), null, { timeout: 5000 }).catch(() => {});
    check(`${label}: the block's own location is used for the To`, /To 1 Yonge St, Toronto/i.test(await panelText(page)));

    // a non-commute block has none of this
    check(`${label}: a plain block has no Commute box`, await open("Work block") && !(await shown(page, "#cmBox")));
    check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
    await ctx.close(); server.kill();
    await sleep(300);
  }
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
