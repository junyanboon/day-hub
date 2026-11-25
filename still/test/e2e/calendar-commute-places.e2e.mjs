// Commute panel: tap the line to change it, the places list, Open in Organic Maps (Junyan, 2026-11-24, d24 to d27: "Yes to all four").
// Clicks every control this change adds in the test browser, at computer and phone widths. The places server is faked by the dev
// server (calendar-dev.mjs: /quest/commute/places and /place, in the contract's shape; the real routes are in still-api and not
// deployed yet). The clock is fixed, so no test reads the real one. Not part of `node --test`: it needs playwright-core.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-commute-places.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8851), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const NOW = "2026-11-24T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const browser = await launchTestBrowser(chromium);
const shown = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; }, sel);
const panelText = async (page) => flat(await page.evaluate(() => document.querySelector("#pbody")?.innerText || ""));
const calls = (page) => page.evaluate(async (b) => (await (await fetch(b + "/__dev/places")).json()), BASE);
const mode = (page, m) => page.evaluate(async ([b, m]) => fetch(b + "/__dev/places?mode=" + m), [BASE, m]);
const rowsOf = (page) => page.evaluate(() => [...document.querySelectorAll("#cmSug [data-cm=sug]")].map((b) => ({ main: b.children[1].childNodes[0].textContent, sub: b.querySelector("small")?.textContent || "", pin: b.children[0].textContent })));

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
    const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date(NOW) });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://nominatim.openstreetmap.org/**", (route) => {
      const q = decodeURIComponent(new URL(route.request().url()).searchParams.get("q") || "");
      const at = /queen/i.test(q) ? { lat: "43.6529", lon: "-79.3849" } : /nowhere/i.test(q) ? null : { lat: "43.6495", lon: "-79.4290" };
      route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(at ? [at] : []) });
    });
    await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
    await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
    await page.goto(URL_); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    const open = async (title) => {
      if (phone && await page.evaluate(() => document.body.classList.contains("popen"))) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); }
      for (let i = 0; i < 6; i++) {
        const el = page.locator(`.ev:has-text("${title}")`).first();
        if (await el.count() && await el.isVisible()) { await el.click(); await sleep(400); await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); return true; }
        await page.click("#next"); await sleep(300);
      }
      return false;
    };
    const type = async (sel, text) => { await page.fill(sel, ""); await page.type(sel, text, { delay: 20 }); };

    check(`${label}: Transit opens`, await open("Transit"));
    // Home first, so From reads Home and the list has something near
    await page.fill("#cmHomeIn", "100 Queen St W, Toronto"); await page.click('[data-cm="home"]'); await sleep(700);
    let pt = await panelText(page);
    check(`${label}: From reads Home, To is not set yet and its box is open`, /From Home/i.test(pt) && /Not set yet/.test(pt) && await shown(page, "#cmTo"), pt.slice(0, 200));
    check(`${label}: no Change button anywhere in the Commute panel`, await page.locator('#cmBox button:text-is("Change"), #cmBox [data-cm="editfrom"], #cmBox [data-cm="edit"]').count() === 0);

    // d25: the list. Under 3 characters nothing is asked; after 3 and a pause, one call with a session and near (Home has a pin)
    await mode(page, "ok"); await page.evaluate(async (b) => fetch(b + "/__dev/places?reset=1"), BASE);
    await page.focus("#cmTo"); await page.type("#cmTo", "St", { delay: 20 }); await sleep(600);
    check(`${label}: two characters ask nothing`, (await calls(page)).placesCalls.length === 0);
    await page.type("#cmTo", ".", { delay: 20 }); await sleep(120);
    check(`${label}: nothing is asked before the 300 ms pause`, (await calls(page)).placesCalls.length === 0);
    await sleep(500);
    let c = await calls(page);
    check(`${label}: after 3 characters and a pause, one places call with the text, a session id and near`, c.placesCalls.length === 1 && c.placesCalls[0].q === "St." && /^[a-z0-9]{8,}$/.test(c.placesCalls[0].session || "") && Math.abs(c.placesCalls[0].near.lat - 43.6529) < 1e-6, JSON.stringify(c.placesCalls));
    const session = c.placesCalls[0].session;
    let rows = await rowsOf(page);
    check(`${label}: the list shows 5 rows, name over the small line, each with a pin`, rows.length === 5 && rows[0].main === "St. Michael's Hospital" && rows[0].sub === "Bond Street, Toronto, ON" && rows.every((r) => r.pin === "📍"), JSON.stringify(rows.slice(0, 2)));
    const hs = await page.evaluate(() => [...document.querySelectorAll("#cmSug [data-cm=sug]")].map((b) => Math.round(b.getBoundingClientRect().height)));
    check(`${label}: list rows are 44px or taller`, hs.every((h) => h >= 44), JSON.stringify(hs));
    check(`${label}: the list has no error line`, !(await shown(page, "#cmSug .cmstop")));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `places-${label}-list.png`) });
    await page.type("#cmTo", "x", { delay: 20 }); await sleep(700);
    c = await calls(page);
    check(`${label}: typing on asks again with the same session`, c.placesCalls.length === 2 && c.placesCalls[1].session === session && c.placesCalls[1].q === "St.x", JSON.stringify(c.placesCalls.map((x) => [x.q, x.session === session])));
    await page.fill("#cmTo", "St."); await sleep(700);
    // a pick saves name, address and coordinates
    await page.click('#cmSug [data-cm="sug"][data-i="0"]'); await sleep(900);
    c = await calls(page);
    check(`${label}: tapping a row asks /place with its id and the same session`, c.placeCalls.length === 1 && c.placeCalls[0].id === "gp-smh" && c.placeCalls[0].session === session, JSON.stringify(c.placeCalls));
    pt = await panelText(page);
    check(`${label}: the To row reads the name over the address, and the box is closed`, /To St\. Michael's Hospital 30 Bond St, Toronto, ON M5B 1W8/i.test(pt) && !(await shown(page, "#cmTo")), pt.slice(0, 220));
    const route = await page.evaluate(async (b) => { const r = await (await fetch(b + "/quest/commute/route?block=" + encodeURIComponent(keyOf(S.ev)), { headers: { "X-Quest-Key": "test" } })).json(); return r.route && r.route.to; }, BASE);
    check(`${label}: the server holds name, address, lat and lng for that To`, !!route && route.name === "St. Michael's Hospital" && route.address === "30 Bond St, Toronto, ON M5B 1W8" && route.lat === 43.6533 && route.lng === -79.3772, JSON.stringify(route));

    // d26: Open in Organic Maps with both ends
    const om = await page.getAttribute('#cmBox a:has-text("Open in Organic Maps")', "href");
    check(`${label}: Open in Organic Maps is the trip from Home to the place by transit`, om === "https://omaps.app/route?sll=43.6529,-79.3849&saddr=Home&dll=43.6533,-79.3772&daddr=St.%20Michael's%20Hospital&type=transit", om);
    check(`${label}: it sits on the same row as Open in Google Maps, and opens in a new tab`, await page.evaluate(() => { const a = document.querySelector("#cmLinks"); return !!a && a.querySelectorAll("a").length === 2 && /Google Maps/.test(a.children[0].textContent) && a.children[1].target === "_blank"; }));
    await page.click('#cmBox [data-cm="mode"][data-v="drive"]'); await sleep(800);
    check(`${label}: Drive changes the Organic Maps link to vehicle`, /&type=vehicle$/.test(await page.getAttribute('#cmBox a:has-text("Open in Organic Maps")', "href")));
    await page.click('#cmBox [data-cm="mode"][data-v="commute"]'); await sleep(800);
    check(`${label}: Walk changes it to pedestrian`, /&type=pedestrian$/.test(await page.getAttribute('#cmBox a:has-text("Open in Organic Maps")', "href")));
    check(`${label}: there is no Open map button`, !/Open map\b/.test(await panelText(page)));

    // d24: the rows are real buttons with their words, 44px or taller
    const rowInfo = await page.evaluate(() => [...document.querySelectorAll("#cmBox .cmroute > .cmr")].map((r) => ({ tag: r.tagName, label: r.getAttribute("aria-label"), h: Math.round(r.getBoundingClientRect().height), text: r.innerText.replace(/\s+/g, " ").trim() })));
    check(`${label}: From and To are two buttons, 44px or taller, with the screen reader words`, rowInfo.length === 2 && rowInfo.every((r) => r.tag === "BUTTON" && r.h >= 44) && rowInfo[0].label === "Change where you start" && rowInfo[1].label === "Change where you are going", JSON.stringify(rowInfo));
    check(`${label}: From reads just Home; To reads the name with its address under it`, /^from home$/i.test(rowInfo[0].text) && /^to St\. Michael's Hospital 30 Bond St, Toronto, ON M5B 1W8$/i.test(rowInfo[1].text), JSON.stringify(rowInfo.map((r) => r.text)));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `places-${label}-rows.png`) });

    // tap the From line: a typing box in place, label above, cursor in it, enterkeyhint go, Saved places (Home first), Cancel
    await page.click('#cmBox [data-cm="rowfrom"]'); await sleep(250);
    const box = await page.evaluate(() => { const i = document.querySelector("#cmFromIn"); return { label: document.querySelector('label[for="cmFromIn"]')?.textContent, focus: document.activeElement === i, hint: i?.getAttribute("enterkeyhint"), chips: [...document.querySelectorAll("#cmFromAsk .chip")].map((b) => b.textContent), cancel: !!document.querySelector('#cmFromAsk [data-cm="cancelfrom"]'), rowfrom: !!document.querySelector('[data-cm="rowfrom"]'), toBox: !!document.querySelector("#cmTo"), toRow: !!document.querySelector('[data-cm="rowto"]'), saved: /saved places/i.test(document.querySelector("#cmFromAsk")?.innerText || ""), oneBox: document.querySelectorAll(".cmask input").length };
    });
    check(`${label}: tapping From opens a box in place: label From, cursor in it, enterkeyhint go, Saved places with Home first, Cancel`, box.label === "From" && box.focus && box.hint === "go" && box.chips[0] === "Home" && box.cancel && box.saved && !box.rowfrom && box.toRow && !box.toBox, JSON.stringify(box));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `places-${label}-from-open.png`) });
    await page.click('#cmFromAsk [data-cm="cancelfrom"]'); await sleep(200);
    check(`${label}: Cancel closes the From box`, !(await shown(page, "#cmFromIn")) && await shown(page, '[data-cm="rowfrom"]'));
    // only one open at a time
    await page.click('#cmBox [data-cm="rowto"]'); await sleep(200);
    check(`${label}: tapping To opens its box (label To, Cancel)`, await page.evaluate(() => document.querySelector('label[for="cmTo"]')?.textContent === "To" && !!document.querySelector('#cmAsk [data-cm="cancel"]') && document.activeElement?.id === "cmTo"));
    await page.click('#cmBox [data-cm="rowfrom"]'); await sleep(200);
    check(`${label}: only one row is open at a time: From opened, To closed`, await shown(page, "#cmFromIn") && !(await shown(page, "#cmTo")) && await shown(page, '[data-cm="rowto"]'));
    // Enter with no pick: the typed text as it is
    await page.fill("#cmFromIn", "Queen Station, Toronto"); await page.press("#cmFromIn", "Enter"); await sleep(900);
    pt = await panelText(page);
    check(`${label}: Enter with no pick uses the typed text as it is (From Queen Station, Toronto)`, /From Queen Station, Toronto/i.test(pt) && !(await shown(page, "#cmFromIn")), pt.slice(0, 200));
    // Home on the From line does what Back to Home does
    await page.click('#cmBox [data-cm="rowfrom"]'); await page.click('#cmFromAsk .chip:has-text("Home")'); await sleep(900);
    pt = await panelText(page);
    check(`${label}: picking Home on the From line brings From back to Home`, /From Home/i.test(pt) && !(await shown(page, "#cmFromIn")), pt.slice(0, 200));

    // a saved place on To
    await page.click('#cmBox [data-cm="rowto"]'); await sleep(200);
    check(`${label}: To's saved places also lead with Home`, await page.evaluate(() => document.querySelector("#cmAsk .chip")?.textContent === "Home"));
    await page.click('#cmAsk [data-cm="cancel"]'); await sleep(200);

    // places answers that are not a list
    await page.evaluate(async (b) => fetch(b + "/__dev/places?reset=1"), BASE);
    await mode(page, "404");
    await page.click('#cmBox [data-cm="rowto"]'); await type("#cmTo", "Gladstone"); await sleep(700);
    c = await calls(page);
    check(`${label}: 404 (not deployed yet): the box asked, shows no list and no error`, c.placesCalls.length >= 1 && (await rowsOf(page)).length === 0 && !(await shown(page, "#cmSug .cmstop")) && !/error|could not|off for/i.test(await page.evaluate(() => document.querySelector("#cmAsk").innerText)));
    check(`${label}: ...and no toast either`, !(await shown(page, ".toast.bad, #toast")) || !/places|suggest/i.test(await page.evaluate(() => document.querySelector(".toast, #toast")?.innerText || "")));
    await page.press("#cmTo", "Enter"); await sleep(900);
    pt = await panelText(page);
    check(`${label}: with the list off, typing and Enter still set the To as before`, /To Gladstone/i.test(pt), pt.slice(0, 200));
    for (const m of ["no-key", "error"]) {
      await mode(page, m); await page.click('#cmBox [data-cm="rowto"]'); await type("#cmTo", "Gladstone"); await sleep(700);
      check(`${label}: ${m}: no list and no line`, (await rowsOf(page)).length === 0 && !(await shown(page, "#cmSug .cmstop")));
      await page.click('#cmAsk [data-cm="cancel"]'); await sleep(150);
    }
    await mode(page, "stopped"); await page.click('#cmBox [data-cm="rowto"]'); await type("#cmTo", "Gladstone"); await sleep(700);
    const stop = await page.evaluate(() => document.querySelector("#cmSug .cmstop")?.innerText);
    check(`${label}: stopped: the one small soft line and no rows`, stop === "Place suggestions are off for the rest of the month. Type the full address." && (await rowsOf(page)).length === 0, String(stop));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `places-${label}-stopped.png`) });
    await page.fill("#cmTo", "Ab"); await sleep(150);
    check(`${label}: the stopped line goes when the text is under 3 characters again`, !(await shown(page, "#cmSug .cmstop")));
    await page.click('#cmAsk [data-cm="cancel"]'); await sleep(150);

    // a slow answer for text he has since changed is ignored
    await mode(page, "ok");
    await page.click('#cmBox [data-cm="rowto"]'); await page.fill("#cmTo", "slowpoke"); await sleep(450);   // asked, answer due in 900 ms
    await page.fill("#cmTo", "Stm"); await sleep(1500);
    rows = await rowsOf(page);
    check(`${label}: a late answer for changed text is ignored (rows are for "Stm", never "Slow answer")`, rows.length === 5 && !rows.some((r) => r.main === "Slow answer"), JSON.stringify(rows.map((r) => r.main)));
    // repaints do not wipe what he is typing
    await page.evaluate(() => { document.querySelector("#cmTo").focus(); cmPaint(); });
    check(`${label}: a repaint keeps the typed text, the cursor and the list rows`, await page.evaluate(() => document.querySelector("#cmTo").value === "Stm" && document.activeElement.id === "cmTo" && document.querySelectorAll("#cmSug [data-cm=sug]").length === 5));
    await page.click('#cmAsk [data-cm="cancel"]'); await sleep(150);

    // d26: only To has coordinates; and none
    await page.click('#cmBox [data-cm="rowfrom"]'); await page.fill("#cmFromIn", "nowhere land"); await page.press("#cmFromIn", "Enter"); await sleep(900);
    await page.click('#cmBox [data-cm="rowto"]'); await page.click('#cmSug [data-cm="sug"]').catch(() => {});
    await page.fill("#cmTo", "St."); await sleep(700); await page.click('#cmSug [data-cm="sug"][data-i="1"]'); await sleep(900);
    const om2 = await page.getAttribute('#cmBox a:has-text("Open in Organic Maps")', "href").catch(() => null);
    check(`${label}: with no coordinates for From, Open in Organic Maps shows just the To spot`, om2 === "https://omaps.app/map?v=1&ll=43.6487,-79.3715&n=St.%20Lawrence%20Market", String(om2));
    await page.click('#cmBox [data-cm="rowto"]'); await page.fill("#cmTo", "nowhere land"); await page.press("#cmTo", "Enter"); await sleep(900);
    check(`${label}: a To with no coordinates has no Organic Maps button, Google Maps stays`, await page.locator('#cmBox a:has-text("Open in Organic Maps")').count() === 0 && await page.locator('#cmBox a:has-text("Open in Google Maps")').count() === 1);

    // read-only calendar: the rows are not tappable
    await page.evaluate(() => { const c = S.cals.find((x) => x.id === S.ev.calId); window.__was = c.writable; c.writable = false; cmPaint(); });
    const ro = await page.evaluate(() => ({ buttons: document.querySelectorAll("#cmBox .cmroute button").length, rows: document.querySelectorAll("#cmBox .cmroute .cmr").length, text: [...document.querySelectorAll("#cmBox .cmroute .cmr")].map((r) => r.innerText.replace(/\s+/g, " ").trim()) }));
    check(`${label}: on a read-only calendar the From and To lines are not buttons`, ro.buttons === 0 && ro.rows === 2 && /^from /i.test(ro.text[0]) && /^to /i.test(ro.text[1]), JSON.stringify(ro));
    await page.evaluate(() => { S.cals.find((x) => x.id === S.ev.calId).writable = window.__was; cmPaint(); });

    check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
    await ctx.close(); server.kill();
  }
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
