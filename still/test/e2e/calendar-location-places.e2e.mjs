// The Location row's places list and "Keep in Saved places" (Junyan, 2026-11-24, d28 to d30: "yes to all thre").
// Clicks every control this change adds in the test browser against the faked dev routes (calendar-dev.mjs). The Location row is drawn only
// by the phone's event sheet (760px wide or less); the computer panel got its own Location box in d33 (still/test/e2e/calendar-desk-location.e2e.mjs
// tests it), so at 1280px the checks here are that the Commute box and its new switch work. The clock is fixed, so no test reads the real one.
// Not part of `node --test`: it needs playwright-core.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-location-places.e2e.mjs
//   BROWSER=webkit (and PW_DIR with playwright) runs it in WebKit at iPhone size when that build is installed.
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const pw = require(process.env.BROWSER === "webkit" ? "playwright" : "playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
import { stubOpenMeteo } from "../helpers/open-meteo-stub.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8861), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const NOW = "2026-11-24T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const browser = process.env.BROWSER === "webkit" ? await pw.webkit.launch() : await launchTestBrowser(pw.chromium);
const shown = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; }, sel);
const calls = (page) => page.evaluate(async (b) => (await (await fetch(b + "/__dev/places")).json()), BASE);
const mode = (page, m) => page.evaluate(async ([b, m]) => fetch(b + "/__dev/places?mode=" + m), [BASE, m]);
const reset = (page) => page.evaluate(async (b) => fetch(b + "/__dev/places?reset=1"), BASE);
const locRows = (page) => page.evaluate(() => [...document.querySelectorAll('#locSug [data-loc="sug"]')].map((b) => ({ main: b.children[1].childNodes[0].textContent, sub: b.querySelector("small")?.textContent || "", pin: b.children[0].textContent, h: Math.round(b.getBoundingClientRect().height) })));
const cmRows = (page) => page.evaluate(() => document.querySelectorAll('#cmSug [data-cm="sug"]').length);
const locVal = (page) => page.evaluate(() => document.querySelector('.sheet [data-f="location"]')?.value);
const chipsOf = (page) => page.evaluate(() => [...document.querySelectorAll("#cmBox .chips .chip[data-cm^=pick]")].map((c) => c.textContent.trim()));
const savedOnServer = (page) => page.evaluate(async (b) => (await (await fetch(b + "/quest/places", { headers: { "X-Quest-Key": "test" } })).json()).places, BASE);

try {
  /* ============ phone: the Location row ============ */
  const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
  await new Promise((ok) => server.stdout.once("data", ok));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  await page.clock.install({ time: new Date(NOW) });
  const errors = [], sent = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (/\/planner\/event(\?|$)/.test(r.url()) && r.method() !== "GET") sent.push({ m: r.method(), b: JSON.parse(r.postData() || "{}") }); });
  await page.route("https://nominatim.openstreetmap.org/**", (route) => {
    const q = decodeURIComponent(new URL(route.request().url()).searchParams.get("q") || "");
    const at = /queen/i.test(q) ? { lat: "43.6529", lon: "-79.3849" } : /nowhere/i.test(q) ? null : { lat: "43.6495", lon: "-79.4290" };
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(at ? [at] : []) });
  });
  stubOpenMeteo(page);
  await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
  await page.goto(URL_); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
  const openEv = async (title, d) => {
    const ok = await page.evaluate(([title, d]) => { const k = C.addDays(today(), d); const ev = [...eventsFor(k, k), ...ghosts()].find((e) => e.title === title && (e.allDay ? C.coversDay(e, k) : C.wall(e.s, S.tz).day === k)); if (ev) panel("event", ev); return !!ev; }, [title, d]);
    await sleep(500); await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); return ok;
  };
  const tapEl = async (sel) => { const [x, y] = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel); await page.touchscreen.tap(x, y); await sleep(250); };
  const typeLoc = async (text) => { await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.focus('.sheet [data-f="location"]'); await page.fill('.sheet [data-f="location"]', ""); await page.keyboard.type(text, { delay: 20 }); };
  const lastPatch = () => [...sent].reverse().find((x) => x.m === "PATCH")?.b;

  check("phone: a Commute block opens in the sheet with the Location row", await openEv("Transit", 1) && await shown(page, '.sheet [data-f="location"]') && await shown(page, "#cmBox"));
  check("phone: the Location row has a list box, announced to a screen reader, and no rows yet", await page.evaluate(() => { const l = document.querySelector("#locSug"); const i = document.querySelector('.sheet [data-f="location"]'); return !!l && l.getAttribute("aria-live") === "polite" && i.getAttribute("aria-controls") === "locSug" && l.children.length === 0 && l.getClientRects().length === 0; }));
  // Home first (the one point known without asking anyone), through the Commute box as before
  await page.fill("#cmHomeIn", "100 Queen St W, Toronto"); await page.click('[data-cm="home"]'); await sleep(800);

  // typing 3 characters and pausing shows the list; under 3 asks nothing
  await reset(page);
  await page.focus('.sheet [data-f="location"]'); await page.keyboard.type("St", { delay: 20 }); await sleep(600);
  check("phone: two characters in Location ask nothing", (await calls(page)).placesCalls.length === 0);
  await page.keyboard.type(".", { delay: 20 }); await sleep(100);
  check("phone: nothing is asked before the 300 ms pause", (await calls(page)).placesCalls.length === 0);
  await sleep(600);
  let c = await calls(page), s1 = c.placesCalls[0]?.session;
  check("phone: after 3 characters and a pause, one call with the text, a session id and near (Home's saved point)", c.placesCalls.length === 1 && c.placesCalls[0].q === "St." && /^[a-z0-9]{8,}$/.test(s1 || "") && Math.abs(c.placesCalls[0].near.lat - 43.6529) < 1e-6, JSON.stringify(c.placesCalls));
  let rows = await locRows(page);
  check("phone: the list shows 5 rows, name over the small line, each with a pin, 44px or taller", rows.length === 5 && rows[0].main === "St. Michael's Hospital" && rows[0].sub === "Bond Street, Toronto, ON" && rows.every((r) => r.pin === "📍" && r.h >= 44), JSON.stringify(rows.slice(0, 2)) + " h=" + rows.map((r) => r.h));
  check("phone: the Commute box's own list is a different element and stays empty", (await cmRows(page)) === 0);
  check("phone: the typing cursor is still in the Location row (the list did not rebuild it)", await page.evaluate(() => document.activeElement?.dataset?.f === "location"));
  if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, "location-list-phone.png") });
  await page.keyboard.type("x", { delay: 20 }); await sleep(800);
  c = await calls(page);
  check("phone: typing on asks again with the same session", c.placesCalls.length === 2 && c.placesCalls[1].session === s1 && c.placesCalls[1].q === "St.x");
  // a slow answer for text he has since changed is dropped
  await typeLoc("slow"); await sleep(450); await page.fill('.sheet [data-f="location"]', "zz"); await page.dispatchEvent('.sheet [data-f="location"]', "input"); await sleep(1100);
  check("phone: a slow answer for text he has since changed is dropped", (await locRows(page)).length === 0);

  // a pick
  await reset(page);
  await typeLoc("St."); await sleep(900);
  c = await calls(page); const s2 = c.placesCalls.at(-1)?.session;
  check("phone: a new focus gets a new session id", !!s2 && s2 !== s1);
  await tapEl('#locSug [data-loc="sug"][data-pid="gp-smh"]'); await sleep(900);
  c = await calls(page);
  check("phone: tapping a row asks /place with its id and the same session", c.placeCalls.length === 1 && c.placeCalls[0].id === "gp-smh" && c.placeCalls[0].session === s2, JSON.stringify(c.placeCalls));
  check("phone: Location now reads 'Name, full address' and the list is closed", (await locVal(page)) === "St. Michael's Hospital, 30 Bond St, Toronto, ON M5B 1W8" && (await locRows(page)).length === 0, await locVal(page));
  await tapEl("#pSave"); await sleep(900);
  check("phone: Save sends that Location with the event, no other new save path", lastPatch()?.location === "St. Michael's Hospital, 30 Bond St, Toronto, ON M5B 1W8", JSON.stringify(lastPatch()));
  check("phone: the pick wrote nothing to Saved places", (await savedOnServer(page)).every((p) => p.category !== "saved"));
  await openEv("Transit", 1);
  check("phone: reopened, the Location is there", (await locVal(page)) === "St. Michael's Hospital, 30 Bond St, Toronto, ON M5B 1W8");

  // address starts with the name: just the address
  await mode(page, "ok"); await typeLoc("St."); await sleep(900);
  // Enter keeps what he typed
  await typeLoc("Dinner at my sister's"); await sleep(700); await page.keyboard.press("Enter"); await sleep(300);
  check("phone: Enter keeps the typed text and closes the list", (await locVal(page)) === "Dinner at my sister's" && (await locRows(page)).length === 0);
  await tapEl("#pSave"); await sleep(900);
  check("phone: the typed Location saves as before", lastPatch()?.location === "Dinner at my sister's", JSON.stringify(lastPatch()));
  // leaving the field (tapping the Notes row) keeps the text
  await openEv("Transit", 1); await typeLoc("St."); await sleep(900);
  await tapEl('.sheet [data-f="description"]'); await sleep(300);
  check("phone: tapping elsewhere closes the list and keeps the text", (await locVal(page)) === "St." && (await locRows(page)).length === 0);

  // 404, no-key, error: no list, no error. stopped: the one soft line
  await mode(page, "404"); await typeLoc("Stm"); await sleep(900);
  c = await calls(page);
  check("phone: 404 (not on the server): it asked, shows no list and no error", c.placesCalls.length >= 1 && (await locRows(page)).length === 0 && !(await shown(page, "#locSug .cmstop")) && !/error|could not|off for/i.test(await page.evaluate(() => document.querySelector(".sheet").innerText)));
  for (const m of ["no-key", "error"]) { await mode(page, m); await typeLoc("Stm"); await sleep(900); check(`phone: ${m}: no list and no line`, (await locRows(page)).length === 0 && !(await shown(page, "#locSug .cmstop"))); }
  await mode(page, "stopped"); await typeLoc("Stm"); await sleep(900);
  const stop = await page.evaluate(() => [...document.querySelectorAll("#locSug .cmstop")].map((x) => x.innerText));
  check("phone: stopped: the one soft line", stop.length === 1 && stop[0] === "Place suggestions are off for the rest of the month. Type the full address.", JSON.stringify(stop));
  await page.fill('.sheet [data-f="location"]', "St"); await page.dispatchEvent('.sheet [data-f="location"]', "input"); await sleep(200);
  check("phone: the stopped line goes under 3 characters", !(await shown(page, "#locSug .cmstop")));
  await mode(page, "ok");

  // the pick falls back to the row's words when the /place call fails
  await typeLoc("St."); await sleep(900);
  await page.evaluate(() => { window.__send = send; });
  await page.route(BASE + "/quest/commute/place", (route) => route.abort());
  await tapEl('#locSug [data-loc="sug"][data-pid="gp-slm"]'); await sleep(900);
  check("phone: if the place call fails, Location gets the row's name and small line", (await locVal(page)) === "St. Lawrence Market, 93 Front St E, Toronto, ON", await locVal(page));
  await page.unroute(BASE + "/quest/commute/place");

  // the Commute box list still works with the Location row on the same page, and the Location text stays
  if (!(await shown(page, "#cmTo"))) { await page.click('#cmBox [data-cm="rowto"]'); await sleep(300); }   // the block's own Location is now its To, so the row is a button
  await reset(page); await page.focus("#cmTo"); await page.keyboard.type("St.", { delay: 20 }); await sleep(900);
  c = await calls(page);
  check("phone: the Commute box list still works next to the Location row, in its own element", (await cmRows(page)) === 5 && (await locRows(page)).length === 0 && c.placesCalls.length === 1 && c.placesCalls[0].session !== s1 && c.placesCalls[0].session !== s2);
  check("phone: the Location text he typed is still in its row", (await locVal(page)) === "St. Lawrence Market, 93 Front St E, Toronto, ON");

  // ---- Keep in Saved places ----
  const keepSw = await page.evaluate(() => { const k = document.querySelector("#cmKeep"), l = k.closest("label"), box = document.querySelector("#cmAsk"); const kids = [...box.children].map((x) => x.id || x.className || x.tagName); return { role: k.getAttribute("role"), on: k.checked, text: l.innerText.trim(), order: kids }; });
  check("phone: the switch reads 'Keep in Saved places', is off, and sits under the list and above Saved places", keepSw.role === "switch" && !keepSw.on && keepSw.text === "Keep in Saved places" && keepSw.order.indexOf("cmSug") < keepSw.order.findIndex((x) => /cmrem/.test(x)) , JSON.stringify(keepSw));
  const before = (await savedOnServer(page)).length;
  await page.click('#cmSug [data-cm="sug"][data-pid="gp-smh"]'); await sleep(1000);
  check("phone: a pick with the switch off saves no place", (await savedOnServer(page)).length === before);
  await page.click('#cmBox [data-cm="rowto"]'); await sleep(300);
  check("phone: the switch is off again every time a box opens", !(await page.evaluate(() => document.querySelector("#cmKeep").checked)));
  await page.fill("#cmTo", "St."); await sleep(900);
  await page.check("#cmKeep"); await page.click('#cmSug [data-cm="sug"][data-pid="gp-slm"]'); await sleep(500);
  const toastNow = await page.evaluate(() => document.body.innerText); await sleep(600);
  let kept = (await savedOnServer(page)).filter((p) => p.category === "saved");
  check("phone: a pick with the switch on saves the place once: name, address, lat, lng, category saved, savedBy Calendar", kept.length === 1 && kept[0].name === "St. Lawrence Market" && kept[0].address === "93 Front St E, Toronto, ON M5E 1C3" && kept[0].lat === 43.6487 && kept[0].lng === -79.3715 && kept[0].savedBy === "Calendar", JSON.stringify(kept));
  check("phone: a short toast says 'Saved to your places'", /Saved to your places/.test(toastNow));
  await page.click('#cmBox [data-cm="rowfrom"]'); await sleep(300);
  let ch = await chipsOf(page);
  check("phone: next time a box opens the place is a chip after Home (From)", ch[0] === "Home" && ch[1] === "St. Lawrence Market" && ch.filter((x) => x === "St. Lawrence Market").length === 1, JSON.stringify(ch));
  await page.click('#cmFromAsk [data-cm="cancelfrom"]'); await sleep(200);
  await page.click('#cmBox [data-cm="rowto"]'); await sleep(300);
  ch = await chipsOf(page);
  check("phone: and in the To box too", ch[0] === "Home" && ch[1] === "St. Lawrence Market", JSON.stringify(ch));
  // the same place again: no second copy
  await page.fill("#cmTo", "St."); await sleep(900);
  await page.check("#cmKeep"); await page.click('#cmSug [data-cm="sug"][data-pid="gp-slm"]'); await sleep(1100);
  check("phone: picking the same place again with the switch on adds no second copy", (await savedOnServer(page)).filter((p) => p.category === "saved").length === 1);
  await page.click('#cmBox [data-cm="rowto"]'); await sleep(300);
  check("phone: and only one chip", (await chipsOf(page)).filter((x) => x === "St. Lawrence Market").length === 1);
  // a chip pick sets the To and writes nothing
  await page.click('#cmAsk .chip:has-text("St. Lawrence Market")'); await sleep(900);
  check("phone: tapping the kept chip sets the To", /St\. Lawrence Market/.test(flat(await page.evaluate(() => document.querySelector("#cmBox").innerText))));
  // Go with typed text the page finds on the map
  await page.click('#cmBox [data-cm="rowfrom"]'); await sleep(300);
  await page.fill("#cmFromIn", "Queen Station, Toronto"); await page.check("#cmKeep"); await page.press("#cmFromIn", "Enter"); await sleep(1300);
  kept = (await savedOnServer(page)).filter((p) => p.category === "saved");
  check("phone: Go with typed text found on the map and the switch on keeps it (name and address are the text, with its pin)", kept.length === 2 && kept[1].name === "Queen Station, Toronto" && kept[1].address === "Queen Station, Toronto" && Math.abs(kept[1].lat - 43.6529) < 1e-6, JSON.stringify(kept[1]));
  // typed text the map cannot find: the From is still set, one plain toast, nothing kept
  await page.click('#cmBox [data-cm="rowfrom"]'); await sleep(300);
  await page.fill("#cmFromIn", "nowhere land"); await page.check("#cmKeep"); await page.press("#cmFromIn", "Enter"); await sleep(1300);
  check("phone: a place the map cannot find is not kept, and the From is still set", (await savedOnServer(page)).filter((p) => p.category === "saved").length === 2 && /nowhere land/i.test(flat(await page.evaluate(() => document.querySelector("#cmBox").innerText))));
  // a failed save: the trip's To is still set and the place is said not kept
  await page.click('#cmBox [data-cm="rowto"]'); await sleep(300); await page.fill("#cmTo", "St."); await sleep(900);
  await page.route(BASE + "/quest/places", (route) => route.request().method() === "POST" ? route.abort() : route.continue());
  await page.check("#cmKeep"); await page.click('#cmSug [data-cm="sug"][data-pid="gp-sta"]'); await sleep(1100);
  const toast = await page.evaluate(() => [...document.querySelectorAll("#toast, .toast")].map((x) => x.innerText).join("|"));
  check("phone: a failed save: the To is still set and one plain toast says the place was not kept", /St\. Andrew Station/.test(flat(await page.evaluate(() => document.querySelector("#cmBox").innerText))) && /Not kept in Saved places\. Try again/.test(toast) && !/Failed to fetch/.test(toast), toast);
  await page.unroute(BASE + "/quest/places");

  // read-only event: no list
  check("phone: a read-only event opens", await openEv("Caney away", 3));
  const ro = await page.evaluate(() => { const i = document.querySelector('.sheet [data-f="location"]'); return { dis: !!i && i.disabled }; });
  await page.evaluate(() => { const i = document.querySelector('.sheet [data-f="location"]'); i.disabled = false; });  // even forced focus/typing must not matter: the box is disabled in the page's own HTML
  await page.evaluate(() => { document.querySelector('.sheet [data-f="location"]').disabled = true; });
  await reset(page); await page.focus('.sheet [data-f="location"]').catch(() => {}); await page.keyboard.type("St.", { delay: 20 }); await sleep(800);
  check("phone: the Location box of a read-only event is disabled, asks nothing and shows no list", ro.dis && (await calls(page)).placesCalls.length === 0 && (await locRows(page)).length === 0);

  // a new event
  await page.evaluate(() => { const s = C.instant(C.addDays(today(), 2), 180, S.tz); panel("event", { isNew: true, id: "draft", calId: "joint", title: "", s, e: s + 3600000, start: new Date(s).toISOString(), end: new Date(s + 3600000).toISOString(), k: "other" }); });
  await sleep(500); await page.fill("#pTitle", "Lunch out");
  await reset(page); await typeLoc("St."); await sleep(900);
  check("phone: a new event's Location row shows the list too", (await locRows(page)).length === 5);
  await tapEl('#locSug [data-loc="sug"][data-pid="gp-stj"]'); await sleep(900);
  await tapEl("#pSave"); await sleep(1000);
  const post = [...sent].reverse().find((x) => x.m === "POST")?.b;
  check("phone: the new event is created with that Location", post?.title === "Lunch out" && post?.location === "St. James Cathedral, 106 King St E, Toronto, ON M5C 1G6", JSON.stringify(post));
  check("phone: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close(); server.kill();

  /* ============ computer: the switch and the chips work ============ */
  if (process.env.BROWSER !== "webkit") {
    const server2 = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT + 1)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
    await new Promise((ok) => server2.stdout.once("data", ok));
    const B2 = `http://localhost:${PORT + 1}`;
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: "America/Toronto" });
    const p2 = await ctx2.newPage(); await p2.clock.install({ time: new Date(NOW) });
    const errs = []; p2.on("pageerror", (e) => errs.push(e.message));
    await p2.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([{ lat: "43.6529", lon: "-79.3849" }]) }));
    stubOpenMeteo(p2);
    await p2.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
    await p2.goto(`${B2}/still/calendar.html?api=${encodeURIComponent(B2)}`); await p2.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    await p2.evaluate(() => { const k = C.addDays(today(), 1); const ev = eventsFor(k, k).find((e) => e.title === "Transit"); panel("event", ev); });
    await sleep(900); await p2.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {});
    check("computer: the panel has the Location box (d33) with its list element, and the phone's row is not there", await p2.locator("#pLoc").count() === 1 && await p2.locator("#locSug").count() === 1 && await p2.locator('[data-f="location"]').count() === 0);
    await p2.fill("#cmHomeIn", "100 Queen St W, Toronto"); await p2.click('[data-cm="home"]'); await sleep(800);
    await p2.fill("#cmTo", "St."); await sleep(900);
    check("computer: the Commute box list still works", (await p2.locator('#cmSug [data-cm="sug"]').count()) === 5);
    check("computer: the Keep in Saved places switch is there, off", await p2.evaluate(() => { const k = document.querySelector("#cmKeep"); return !!k && !k.checked && /Keep in Saved places/.test(k.closest("label").innerText); }));
    await p2.check("#cmKeep"); await p2.click('#cmSug [data-cm="sug"][data-pid="gp-sta"]'); await sleep(1100);
    await p2.click('#cmBox [data-cm="rowfrom"]'); await sleep(300);
    const ch2 = await p2.evaluate(() => [...document.querySelectorAll("#cmBox .chips .chip[data-cm^=pick]")].map((c) => c.textContent.trim()));
    check("computer: the kept place is a chip after Home", ch2[0] === "Home" && ch2[1] === "St. Andrew Station", JSON.stringify(ch2));
    check("computer: no page errors", errs.length === 0, errs.join(" | "));
    await ctx2.close(); server2.kill();
  }
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
