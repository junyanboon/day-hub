// d33 (Junyan, 2026-11-25: "33 yes"): an editable Location box in the computer event panel, with the same places list as the phone's Location row.
// Clicks it at 1280px in the test browser against the faked dev routes (calendar-dev.mjs): the box shows the event's location, typing 3 characters and
// pausing shows the list in its own list box (not the Commute box's), a pick fills "Name, full address", Save sends only a changed Location (and nothing when
// it is unchanged), and a block with no location saves a typed one. The clock is fixed, so no test reads the real one. Not part of `node --test`.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-desk-location.e2e.mjs
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
const PORT = +(process.env.PORT || 8891), BASE = `http://localhost:${PORT}`;
const NOW = "2026-11-24T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const browser = await launchTestBrowser(chromium);
const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
try {
  await serverReady(server);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: "America/Toronto" });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  await page.clock.install({ time: new Date(NOW) });
  const errors = [], sent = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (/\/planner\/event(\?|$)/.test(r.url()) && r.method() !== "GET") sent.push({ m: r.method(), b: JSON.parse(r.postData() || "{}") }); });
  await page.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([{ lat: "43.6495", lon: "-79.4290" }]) }));
  stubOpenMeteo(page);
  await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
  await page.goto(`${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
  const openEv = async (title, d) => {
    const ok = await page.evaluate(([title, d]) => { const k = C.addDays(today(), d); const ev = eventsFor(k, k).find((e) => e.title === title && C.wall(e.s, S.tz).day === k); if (ev) panel("event", ev); return !!ev; }, [title, d]);
    await sleep(500); return ok;
  };
  const rows = () => page.evaluate(() => [...document.querySelectorAll('#locSug [data-loc="sug"]')].map((b) => b.children[1].childNodes[0].textContent));
  const calls = () => page.evaluate(async (b) => (await (await fetch(b + "/__dev/places")).json()), BASE);
  const lastPatch = () => [...sent].reverse().find((x) => x.m === "PATCH")?.b;

  check("computer: Subway to class opens with a Location box holding its location", await openEv("Subway to class", 2) && await page.inputValue("#pLoc") === "1 Yonge St, Toronto");
  check("computer: the box has its own list box, announced to a screen reader, and no rows yet", await page.evaluate(() => { const l = document.querySelector("#locSug"); return !!l && l.getAttribute("aria-live") === "polite" && l.children.length === 0 && document.querySelector("#pLoc").getAttribute("aria-controls") === "locSug"; }));
  // Save with nothing changed sends no Location
  const before = sent.length; await page.click("#pSave"); await sleep(600);
  check("computer: Save with the Location unchanged sends nothing at all", sent.length === before, JSON.stringify(sent.slice(before)));

  // typing shows the list
  await openEv("Subway to class", 2);
  await page.evaluate(async (b) => fetch(b + "/__dev/places?reset=1"), BASE);
  await page.fill("#pLoc", ""); await page.focus("#pLoc"); await page.keyboard.type("St.", { delay: 20 }); await sleep(900);
  const c = await calls(); let r = await rows();
  check("computer: after 3 characters and a pause there is one call and the list shows 5 rows", c.placesCalls.length === 1 && c.placesCalls[0].q === "St." && r.length === 5 && r[0] === "St. Michael's Hospital", JSON.stringify([c.placesCalls.length, r]));
  check("computer: the typing cursor is still in the box and the Commute box's list is empty", await page.evaluate(() => document.activeElement?.id === "pLoc" && !document.querySelectorAll('#cmSug [data-cm="sug"]').length));
  // pick one
  await page.click('#locSug [data-loc="sug"][data-pid="gp-smh"]'); await sleep(900);
  check("computer: a pick fills the box with 'Name, full address' and closes the list", await page.inputValue("#pLoc") === "St. Michael's Hospital, 30 Bond St, Toronto, ON M5B 1W8" && (await rows()).length === 0, await page.inputValue("#pLoc"));
  await page.click("#pSave"); await sleep(900);
  check("computer: Save sends only the new Location", JSON.stringify(Object.keys(lastPatch() || {}).filter((k) => k !== "id" && k !== "calId")) === JSON.stringify(["location"]) && lastPatch().location === "St. Michael's Hospital, 30 Bond St, Toronto, ON M5B 1W8", JSON.stringify(lastPatch()));

  // typed by hand, no pick
  await openEv("Subway to class", 2);
  await page.fill("#pLoc", "  12 Main St, Toronto  "); await page.click("#pSave"); await sleep(900);
  check("computer: a hand-typed location is saved trimmed", lastPatch()?.location === "12 Main St, Toronto", JSON.stringify(lastPatch()));
  // clearing it
  await openEv("Subway to class", 2);
  await page.fill("#pLoc", ""); await page.click("#pSave"); await sleep(900);
  check("computer: clearing the box saves an empty Location", lastPatch()?.location === "", JSON.stringify(lastPatch()));
  check("computer: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  const bad = results.filter((x) => !x.ok); console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`); process.exitCode = bad.length ? 1 : 0;
} finally { server.kill(); await browser.close(); }
