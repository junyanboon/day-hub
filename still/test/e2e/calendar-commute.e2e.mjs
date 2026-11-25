// Commute blocks, slice 1 (Junyan, 2026-11-24: "1 yes, 2 A, 3 yes, 4 A"). Clicks every control of the Commute panel in
// the test browser, on a computer and on a phone: Going by, Home, the ask, Remember for every ..., Open in Google Maps,
// the small map, Add a photo (shrunk to 1600px), Add a note, See the
// photo, and "From last time you went here" on a later block to the same place.
// The clock is fixed (Nov 24 2026, 10:00 in Toronto) for the page and for the dev server, so no test reads the real clock.
// The map lookup (OpenStreetMap search) and the map tiles are answered here; Leaflet itself loads from the internet.
// Not part of `node --test`: it needs playwright-core and the test browser.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-commute.e2e.mjs
//   SHOTS=<folder> also saves a computer and a phone screenshot of the panel.
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
    check(`${label}: Going by has three chips (Walk, Transit, Drive), Transit pressed (guessed from the title)`, JSON.stringify(chips) === '["🚶 Walk:false","🚇 Transit:true","🚗 Drive:false"]', JSON.stringify(chips));
    check(`${label}: no address anywhere, so the panel asks "Where are you going?"`, /Where are you going\?/i.test(pt) && /Not set yet/.test(pt));
    // d6 (Junyan, 2026-11-24, "6 yes"): the Commute part comes first, right under the title and time
    const lay = await page.evaluate((isPhone) => {
      const top = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
      const box = top("#cmBox"), going = top('#cmBox [data-cm="mode"]'), ask = top("#cmAsk"), title = top("#pTitle");
      const firstLen = document.querySelector("[data-lenstep]"), firstRow = document.querySelector(".srow"), cal = top("#pCal");
      return { vh: innerHeight, title: title && [title.top, title.bottom], box: box && [box.top, box.bottom], going: going && going.bottom, ask: ask && ask.bottom,
        lenTop: firstLen ? firstLen.getBoundingClientRect().top : null, rowTop: firstRow ? firstRow.getBoundingClientRect().top : null, calTop: cal && cal.top, sheet: !!document.querySelector(".sheet") };
    }, phone);
    check(`${label}: the Commute part sits right under the title and time, before the usual fields`, lay.box && lay.title && lay.box[0] >= lay.title[1] && (phone ? lay.rowTop > lay.box[0] : lay.lenTop > lay.box[1]) && lay.calTop > lay.box[1], JSON.stringify(lay));
    if (phone) check(`${label}: on a 390 by 844 phone the Going by row and the ask show without scrolling`, lay.sheet && lay.vh === 844 && lay.going < 844 && lay.ask < 844, JSON.stringify(lay));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `commute-${label}-first-open.png`) });
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

    // slice 2: directions, against the dev server's fake Google (no key, no outside call)
    await page.waitForSelector("#cmBox .cmleave", { timeout: 8000 }).catch(() => {});
    let dt = await panelText(page);
    const dirChips = await page.evaluate(() => [...document.querySelectorAll('#cmBox [data-cm="mode"]')].map((b) => b.textContent.replace(/\s+/g, " ").trim()));
    check(`${label}: Going by shows each way's minutes and marks the quickest "best way"`, /Walk$/.test(dirChips[0]) && /Transit 34 min$/.test(dirChips[1]) && /Drive 27 min best way$/.test(dirChips[2]), JSON.stringify(dirChips));
    check(`${label}: Leave by comes from the directions, with the Arrive line (no next event: when the block ends)`, /Leave by \d{1,2}(:\d{2})? (am|pm)/i.test(dt) && /Arrive \d{1,2}(:\d{2})? (am|pm), (when the block ends|\d+ min before)/i.test(dt), dt.slice(0, 400));
    check(`${label}: The way there lists the walk legs, each line with its direction, stops and minutes`, /The way there · 34 min/i.test(dt) && /Walk to Dev Station North/i.test(dt) && /Line 1 Dev Line toward Union/i.test(dt) && /5 stops/i.test(dt) && /Line 2 Test Line toward Kipling/i.test(dt) && /3 min wait before it/i.test(dt) && /Walk to Dev Studio/i.test(dt), dt);
    check(`${label}: Heads up shows the TTC alert and the weather, and nothing for closures on a transit trip`, /Heads up/i.test(dt) && /Line 1: trains move slower/i.test(dt) && /Snow from 1 pm/i.test(dt) && !/closed near/i.test(dt));
    check(`${label}: Check now and Last checked are there, and the by-itself sentence says what the page does`, /Check now/i.test(dt) && /Last checked \d{1,2}(:\d{2})? (am|pm)/i.test(dt) && /While this panel is open, it checks once in the hour before you leave\./i.test(dt));
    check(`${label}: no Parking near row`, !/parking near/i.test(dt));
    await page.waitForFunction(() => document.querySelectorAll("#cmMap .leaflet-interactive").length >= 1, null, { timeout: 15000 }).catch(() => {});
    check(`${label}: the small map draws the route line`, await page.evaluate(() => document.querySelectorAll("#cmMap path.leaflet-interactive, #cmMap .leaflet-overlay-pane path").length) >= 1);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `commute-${label}-directions.png`) });
    await page.evaluate(async (b) => fetch(b + "/__dev/directions?next=1"), BASE);
    const callsBefore = await page.evaluate(async (b) => (await (await fetch(b + "/__dev/directions")).json()).calls.length, BASE);
    await page.click('#cmBox [data-cm="check"]'); await sleep(900);
    dt = await panelText(page);
    const callsAfter = await page.evaluate(async (b) => (await (await fetch(b + "/__dev/directions")).json()).calls, BASE);
    check(`${label}: Check now asks the server again and tells it to skip its saved answer`, callsAfter.length === callsBefore + 1 && callsAfter[callsAfter.length - 1].fresh === true, JSON.stringify(callsAfter.slice(-2)));
    check(`${label}: Check now says "Checked just now" with the real time and what moved`, /Checked just now, \d{1,2}(:\d{2})? (am|pm)/i.test(dt) && /6 min earlier/i.test(dt), dt.slice(0, 300));
    check(`${label}: alerts are grouped New since, Still on and Cleared`, /New since \d{1,2}(:\d{2})? (am|pm)/i.test(dt) && /Line 2: delays of about 5 minutes/i.test(dt) && /Still on/i.test(dt) && /Cleared/i.test(dt) && /Line 1: trains move slower/i.test(dt), dt);
    check(`${label}: a source that could not be reached is named`, /Could not reach/i.test(dt) ? false : true);
    check(`${label}: "Drive is quicker right now" with a Switch to Drive button`, /Drive is quicker right now/i.test(dt) && await shown(page, '#cmBox [data-cm="switch"]'), dt);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `commute-${label}-checked.png`) });
    await page.click('#cmBox [data-cm="switch"]'); await sleep(900);
    dt = await panelText(page);
    check(`${label}: Switch to Drive makes Drive the chosen way: its roads, minutes and km, and closures in Heads up`, /The way there · 27 min · 8\.1 km/i.test(dt) && /Dev Avenue/i.test(dt) && /3\.2 km/i.test(dt) && /closed near Test Street/i.test(dt) && !/Line 2: delays/i.test(dt) && await page.evaluate(() => document.querySelector('#cmBox [data-v="drive"]').getAttribute("aria-pressed")) === "true", dt);
    await chip("transit").click(); await sleep(700);

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
    check(`${label}: Walk is the walking link`, /travelmode=walking$/.test(href), href);

    // Change To: the ask comes back with a Cancel
    await page.click('#cmBox [data-cm="edit"]'); await sleep(200);
    check(`${label}: Change on To brings the ask back, with Cancel`, await shown(page, "#cmTo") && await shown(page, '#cmAsk [data-cm="cancel"]'));
    await page.fill("#cmTo", "nowhere land"); await page.click('#cmAsk [data-cm="go"]'); await sleep(700);
    check(`${label}: an address the map cannot find still works, with a note that there is no pin`, /To nowhere land/i.test(await panelText(page)));
    const gm = await page.getAttribute('#cmBox a:has-text("Open in Google Maps")', "href");
    check(`${label}: the link still builds for it`, /destination=nowhere%20land/.test(gm), gm);
    await page.click('#cmBox [data-cm="edit"]'); await sleep(200);
    await page.fill("#cmTo", "Gladstone Hotel, Toronto"); await page.click('#cmAsk [data-cm="go"]'); await sleep(900);

    // d21 (Junyan, 2026-11-24): no Open map button, no full screen map, and nothing can open one
    check(`${label}: the panel has no Open map button and no full screen map layer`, !/Open map/.test(await panelText(page)) && await page.locator('#cmBox [data-cm="map"]').count() === 0 && await page.locator(".cmbig").count() === 0);
    check(`${label}: Open in Google Maps and the small map are still there`, await page.locator('#cmBox a:has-text("Open in Google Maps")').count() === 1 && await page.locator("#cmMap").count() === 1);

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
    await page.click("#cmMap .cmpin.photo"); await page.waitForSelector(".cmmodal img", { timeout: 5000 });
    check(`${label}: tapping the photo pin shows the photo`, await page.evaluate(() => document.querySelectorAll(".cmmodal img").length) === 1);
    await page.keyboard.press("Escape"); await sleep(200);
    check(`${label}: Escape closes the photo`, !(await shown(page, ".cmmodal")));

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
    // the same block tapped again within a moment: no page error from a map that was already removed, and one small map only
    await page.waitForFunction(() => document.querySelectorAll("#cmMap .cmpin").length >= 1, null, { timeout: 8000 }).catch(() => {});
    // the test browser's pinned clock keeps errors thrown inside a timer away from "pageerror", so the map's resize also records what it throws
    await page.evaluate(() => { window.__mapThrown = []; const o = L.Map.prototype.invalidateSize; L.Map.prototype.invalidateSize = function () { try { return o.apply(this, arguments); } catch (e) { window.__mapThrown.push(e.message); throw e; } }; });
    const thrown = () => page.evaluate(() => window.__mapThrown.slice());
    // the timing a repaint makes: the panel draws again just after the map was built, so its 60 ms resize timer meets a removed map
    const errsT = errors.length;
    await page.evaluate(async () => { const b = document.querySelector("#cmMap"); await cmMapShow(b, "small"); cmDrop("small"); b.style.height = (b.offsetHeight + 40) + "px"; });   // the box changes size, as it does when the panel draws again
    await sleep(300);
    await page.evaluate(() => { document.querySelector("#cmMap").style.height = ""; });
    check(`${label}: a map removed right after it was built throws no page error from its delayed resize`, errors.length === errsT && (await thrown()).length === 0, errors.slice(errsT).concat(await thrown()).join(" | "));
    // two overlapping draws of the same small map: the older one gives way, one map is built
    const errsO = errors.length;
    const built = await page.evaluate(async () => {
      const L = await mapLib(); let n = 0; const orig = L.map; L.map = function () { n++; return orig.apply(this, arguments); };
      const box = document.querySelector("#cmMap"); cmDrop("small");
      await Promise.all([cmMapShow(box, "small"), cmMapShow(box, "small")]);
      L.map = orig; return n;
    });
    await sleep(300);
    check(`${label}: two overlapping draws of the small map build one map and throw nothing`, built === 1 && errors.length === errsO && (await thrown()).length === 0 && await page.evaluate(() => document.querySelectorAll("#cmBox .leaflet-container").length) === 1, `built ${built} ${errors.slice(errsO).join(" | ")}`);
    const errsBefore = errors.length, thrownBefore = (await page.evaluate(() => window.__mapThrown.length));
    for (let i = 0; i < 3; i++) { await page.evaluate(() => [...document.querySelectorAll(".ev")].find((e) => /Bus to studio/.test(e.innerText))?.click()); await sleep(20); }
    await sleep(1000);
    check(`${label}: tapping the same Commute block again three times quickly throws no page error`, errors.length === errsBefore && (await thrown()).length === thrownBefore, errors.slice(errsBefore).concat((await thrown()).slice(thrownBefore)).join(" | "));
    const maps = await page.evaluate(() => [document.querySelectorAll("#cmBox .leaflet-container").length, document.querySelectorAll("#cmBox .leaflet-map-pane").length, document.querySelectorAll("#cmMap .cmpin").length]);
    check(`${label}: and exactly one small map is in the panel, with its pins`, maps[0] === 1 && maps[1] === 1 && maps[2] >= 1, JSON.stringify(maps));
    check(`${label}: Subway to class opens`, await open("Subway to class"));
    await page.waitForFunction(() => /\bTo\b/.test(document.querySelector("#cmBox")?.innerText || ""), null, { timeout: 5000 }).catch(() => {});
    check(`${label}: the block's own location is used for the To`, /To 1 Yonge St, Toronto/i.test(await panelText(page)));

    // d9 (Junyan, 2026-11-24, "9 yes"): the To and From live on the server and follow the block to another device
    const keyOfTitle = (t) => page.evaluate((x) => [...document.querySelectorAll(".ev")].find((e) => e.innerText.includes(x))?.dataset.key, t);
    const srv = (k) => page.evaluate(async ([b, k2]) => (await (await fetch(b + "/quest/commute/route?block=" + encodeURIComponent(k2), { headers: { "X-Quest-Key": "test" } })).json()).route, [BASE, k]);
    const transitKey = await keyOfTitle("Transit");
    const r0 = await srv(transitKey);
    check(`${label}: the To he typed is on the server under the block's key`, r0 && r0.to && /Gladstone/.test(r0.to.address), JSON.stringify(r0));
    check(`${label}: Transit opens again (From)`, await open("Transit"));
    await page.waitForSelector('#cmBox [data-cm="editfrom"]', { timeout: 5000 });
    await page.click('#cmBox [data-cm="editfrom"]'); await page.fill("#cmFromIn", "Queen Station, Toronto"); await page.click('#cmBox [data-cm="gofrom"]'); await sleep(700);
    check(`${label}: a changed From shows`, /From Queen Station, Toronto/i.test(await panelText(page)));
    const r1 = await srv(transitKey);
    check(`${label}: the changed From is on the server too, beside the To`, r1 && r1.from && /Queen Station/.test(r1.from.address) && /Gladstone/.test(r1.to.address), JSON.stringify(r1));
    check(`${label}: nothing about this block is kept in the browser any more`, await page.evaluate((k) => !(JSON.parse(localStorage.getItem("cal-commute-to") || "{}")[k] || JSON.parse(localStorage.getItem("cal-commute-from") || "{}")[k]), transitKey));
    // another device: a fresh browser profile (no saved copy at all) sees the same To and From
    const ctx2 = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    const page2 = await ctx2.newPage(); await page2.clock.install({ time: new Date(NOW) });
    await page2.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "[]" }));
    await page2.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
    await page2.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
    await page2.goto(URL_); await page2.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    for (let i = 0; i < 6; i++) {
      const el = page2.locator('.ev:has-text("Transit")').first();
      if (await el.count() && await el.isVisible()) { await el.click(); break; }
      await page2.click("#next"); await sleep(300);
    }
    await page2.waitForFunction(() => /\bTo\b/.test(document.querySelector("#cmBox")?.innerText || ""), null, { timeout: 6000 }).catch(() => {});
    const t2 = flat(await text(page2, "#pbody"));
    check(`${label}: on another device the same To and From show, with no ask`, /From Queen Station, Toronto/i.test(t2) && /To Gladstone Hotel, Toronto/i.test(t2) && !/Where are you going\?/i.test(t2), t2.slice(0, 240));
    await ctx2.close();
    // an address kept in this browser from before is sent up once, only where the server holds none
    const subKey = await keyOfTitle("Subway to class"), busKey = await keyOfTitle("Bus to studio");
    await page.evaluate(([a, b]) => { localStorage.setItem("cal-commute-to", JSON.stringify({ [a]: { name: "Old Spot", address: "9 Old Browser Rd", lat: null, lng: null }, [b]: { name: "x", address: "7 Browser Only Ave", lat: null, lng: null } })); }, [subKey, busKey]);
    await page.evaluate(async ([b, k]) => { await fetch(b + "/quest/commute/route", { method: "POST", headers: { "X-Quest-Key": "test", "Content-Type": "application/json" }, body: JSON.stringify({ block: k, to: { address: "1 Server Wins St" } }) }); }, [BASE, busKey]);
    await page.reload(); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    check(`${label}: Subway to class opens (old browser copy)`, await open("Subway to class"));
    await page.waitForFunction(() => /\bTo\b/.test(document.querySelector("#cmBox")?.innerText || ""), null, { timeout: 6000 }).catch(() => {});
    await sleep(500);
    const sub = await srv(subKey), bus = await srv(busKey);
    check(`${label}: the old browser address went up once and the copy here is dropped`, sub && sub.to && sub.to.address === "9 Old Browser Rd" && await page.evaluate(([a]) => !JSON.parse(localStorage.getItem("cal-commute-to") || "{}")[a], [subKey]), JSON.stringify(sub));
    check(`${label}: an old copy never overwrites what the server already holds`, bus && /1 Server Wins St/.test(bus.to.address), JSON.stringify(bus));
    check(`${label}: and it shows as the To`, /To Old Spot, 9 Old Browser Rd/i.test(await panelText(page)), (await panelText(page)).slice(0, 200));
    // the server cannot be reached: the change is kept in the browser, says so, and goes up next time
    await page.evaluate(async (b) => { await fetch(b + "/__dev/routes?down=1"); }, BASE);
    check(`${label}: Bus to studio opens (server down)`, await open("Bus to studio"));
    await sleep(500);
    await page.click('#cmBox [data-cm="edit"]'); await page.fill("#cmTo", "55 Offline Ave"); await page.click('#cmAsk [data-cm="go"]'); await sleep(900);
    check(`${label}: with the server down the To still shows, and a note says it is on this device only`, /To 55 Offline Ave/i.test(await panelText(page)) && /this device only/i.test(await text(page, "#toast")), await text(page, "#toast"));
    check(`${label}: the browser copy is the fallback, marked pending`, await page.evaluate((k) => { const o = JSON.parse(localStorage.getItem("cal-commute-to") || "{}")[k]; return !!o && o.pending === true && o.address === "55 Offline Ave"; }, busKey));
    await page.evaluate(async (b) => { await fetch(b + "/__dev/routes?down=0"); }, BASE);
    await page.reload(); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    check(`${label}: Bus to studio opens (server back)`, await open("Bus to studio"));
    await page.waitForFunction(() => /55 Offline Ave/.test(document.querySelector("#cmBox")?.innerText || ""), null, { timeout: 6000 }).catch(() => {});
    await sleep(500);
    const bus2 = await srv(busKey);
    check(`${label}: the change made while offline went up and replaced the old server To`, bus2 && /55 Offline Ave/.test(bus2.to.address) && await page.evaluate((k) => !JSON.parse(localStorage.getItem("cal-commute-to") || "{}")[k], busKey), JSON.stringify(bus2));

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
