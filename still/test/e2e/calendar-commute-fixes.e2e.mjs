// Commute block fixes (Junyan, 2026-11-24 feedback; d17 A, d18 yes, d19 yes). Clicks every control this change adds in the
// test browser: the map tiles carry a Referer under the live page's "Referrer-Policy: same-origin" header, no date line on a
// Commute block, Length as minus / plus with the end time, Block type as one line with "change", From is where the block
// before ended, To falls back to Home (never Home to Home).
// The dev server (calendar-dev.mjs) sends the same Referrer-Policy header as the live site. Tile requests are answered here, and
// the Referer each one carried is read. Leaflet itself loads from the internet. The clock is fixed, so no test reads the real one.
// Not part of `node --test`: it needs playwright-core and the test browser.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-commute-fixes.e2e.mjs
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
const PORT = +(process.env.PORT || 8827), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const NOW = "2026-11-24T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const browser = await launchTestBrowser(chromium);
const panelText = async (page) => flat(await page.evaluate(() => document.querySelector("#pbody")?.innerText || ""));

try {
  const sizes = [
    ["computer", { viewport: { width: 1280, height: 860 } }],
    ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ];
  for (const [label, opts] of sizes) {
    const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
    await serverReady(server);
    const phone = label === "phone";
    const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date(NOW) });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://nominatim.openstreetmap.org/**", (route) => {
      const q = decodeURIComponent(new URL(route.request().url()).searchParams.get("q") || "");
      const at = /queen/i.test(q) ? { lat: "43.6529", lon: "-79.3849" } : { lat: "43.6495", lon: "-79.4290" };
      route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([at]) });
    });
    const wx = stubOpenMeteo(page);
    const tiles = [];   // any map tile asked for (none now: the Commute panel draws no map)
    await page.route("https://tile.openstreetmap.org/**", (route) => { tiles.push(route.request().headers()["referer"] || ""); route.fulfill({ status: 200, contentType: "image/png", body: PNG }); });
    await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
    await page.goto(URL_); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    const open = async (title) => {
      if (phone && await page.evaluate(() => document.body.classList.contains("popen"))) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); }
      for (let i = 0; i < 6; i++) {
        const el = page.locator(`.ev:not(.ghost):has-text("${title}")`).first();
        if (await el.count() && await el.isVisible()) { await el.click(); await sleep(400); await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); return true; }
        await page.click("#next"); await sleep(300);
      }
      return false;
    };

    // 0. the page really is served with the header the live site sends
    const hdr = await page.evaluate(async (u) => (await fetch(u)).headers.get("referrer-policy"), URL_);
    check(`${label}: the page is served with Referrer-Policy: same-origin, as live`, hdr === "same-origin", String(hdr));

    // 1. a Commute block: no date line; Length and Block type (computer)
    check(`${label}: Transit opens`, await open("Transit"));
    let pt = await panelText(page);
    check(`${label}: no date and time line on a Commute block`, !/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d{1,2}, \d{1,2}(:\d\d)? [ap]m to /.test(pt), pt.slice(0, 160));
    if (!phone) {
      const len = await page.evaluate(() => { const r = document.querySelector(".lenrow"); return r ? { text: r.innerText.replace(/\s+/g, " ").trim(), chips: document.querySelectorAll("[data-dur]").length, hs: [...r.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().height)), labels: [...r.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")) } : null; });
      check(`${label}: Length reads "25 min" with the end time beside it, no chip row`, !!len && len.chips === 0 && /25 min/.test(len.text) && /ends 10 am/.test(len.text), JSON.stringify(len));
      check(`${label}: minus and plus are 44px or taller with their labels`, !!len && len.hs.every((h) => h >= 44) && len.labels.join("|") === "15 minutes shorter|15 minutes longer", JSON.stringify(len));
      await page.click('[data-lenstep="1"]');
      let t = await page.evaluate(() => document.querySelector(".lenrow").innerText.replace(/\s+/g, " "));
      check(`${label}: plus moves the end 15 minutes: 40 min, ends 10:15 am`, /40 min/.test(t) && /ends 10:15 am/.test(t), t);
      await page.click('[data-lenstep="-1"]'); await page.click('[data-lenstep="-1"]');   // 40 to 25 to 15
      t = await page.evaluate(() => document.querySelector(".lenrow").innerText.replace(/\s+/g, " "));
      check(`${label}: minus stops at 15 min, ends 9:50 am, and the minus button is then off`, /15 min/.test(t) && /ends 9:50 am/.test(t) && await page.evaluate(() => document.querySelector('[data-lenstep="-1"]').disabled), t);
      await page.click('[data-lenstep="1"]'); await page.click('[data-lenstep="1"]');   // 45 min
      await page.click("#pSave"); await sleep(700);
      await open("Transit");
      t = await page.evaluate(() => document.querySelector(".lenrow")?.innerText.replace(/\s+/g, " ") || "");
      check(`${label}: Save keeps the new length (45 min, ends 10:20 am)`, /45 min/.test(t) && /ends 10:20 am/.test(t), t);
      // Block type: one line, change shows the chips, a pick works and folds back
      const line = await page.evaluate(() => { const l = document.querySelector("#typeLine"); return { text: l.innerText.replace(/\s+/g, " ").trim(), chipsHidden: document.querySelector("#typeChips").hidden, lineHidden: l.hidden }; });
      check(`${label}: Block type reads "Commute · change", chips hidden`, line.text === "Commute · change" && line.chipsHidden && !line.lineHidden, JSON.stringify(line));
      await page.click("[data-typechange]");
      const ch = await page.evaluate(() => ({ chips: !document.querySelector("#typeChips").hidden, line: document.querySelector("#typeLine").hidden, first: document.querySelector("#typeChips .chip").innerText.trim(), n: document.querySelectorAll("#typeChips .chip").length }));
      check(`${label}: change shows the chip row, "Guess: ..." first`, ch.chips && ch.line && /^Guess: /.test(ch.first), JSON.stringify(ch));
      await page.click('#typeChips [data-kind="errand"]');
      const after = await page.evaluate(() => ({ text: document.querySelector("#typeLine").innerText.replace(/\s+/g, " ").trim(), chipsHidden: document.querySelector("#typeChips").hidden }));
      check(`${label}: picking a chip names it on the line and folds the chips back`, /^Errands · change$/.test(after.text) && after.chipsHidden, JSON.stringify(after));
      await page.click('[data-typechange]'); await page.click('#typeChips [data-kind=""]');
      check(`${label}: picking Guess goes back to the guess`, /^Commute · change$/.test(await page.evaluate(() => document.querySelector("#typeLine").innerText.replace(/\s+/g, " ").trim())));
      // other blocks keep the date line
      await open("Work block"); pt = await panelText(page);
      check(`${label}: a Work block keeps its date line`, /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d{1,2}, [\d:]+ [ap]m to /.test(pt), pt.slice(0, 120));
      // a new block keeps the full chip row (no one-line type), and has the same Length line
      const nb = await page.evaluate(() => { const s = C.instant(C.addDays(today(), 2), 180, S.tz); panel("event", { isNew: true, id: "draft", calId: "joint", title: "", s, e: s + 3600000, start: new Date(s).toISOString(), end: new Date(s + 3600000).toISOString(), k: "other" });
        return { line: !!document.querySelector("#typeLine"), chips: [...document.querySelectorAll("#typeChips .chip")].filter((c) => c.getClientRects().length).length, len: document.querySelector(".lenrow")?.innerText.replace(/\s+/g, " ") }; });
      check(`${label}: a new block keeps all the type chips and has the same Length line`, !nb.line && nb.chips >= 12 && /1 h/.test(nb.len) && /ends 3:?\d* ?am|ends 4 am/.test(nb.len), JSON.stringify(nb));
      await open("Transit");
    }
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `fixes-${label}-transit.png`) });

    // 2. From and To. No Home yet: Where you are, and the ask
    pt = await panelText(page);
    check(`${label}: no Home saved: From says Where you are, To asks`, /From Where you are/i.test(pt) && /Where are you going\?/.test(pt), pt.slice(0, 200));
    await page.fill("#cmHomeIn", "100 Queen St W, Toronto"); await page.click('[data-cm="home"]'); await sleep(700);
    pt = await panelText(page);
    check(`${label}: Home saved: the first trip of the day starts at Home`, /From Home/i.test(pt));
    check(`${label}: ...and From and To are not both Home: To still asks`, /Where are you going\?/.test(pt) && !/To Home/i.test(pt), pt.slice(0, 220));

    // Subway to class: first of its day: From Home, To is its own address; the weather box (d31 B) in place of the small map
    check(`${label}: Subway to class opens`, await open("Subway to class"));
    pt = await panelText(page);
    check(`${label}: Subway to class: From Home, To 1 Yonge St`, /From Home/i.test(pt) && /To 1 Yonge St/i.test(pt), pt.slice(0, 220));
    await page.waitForSelector("#cmWx .big", { timeout: 8000 }).catch(() => {});
    const text = (sel) => page.evaluate((x) => document.querySelector(x)?.innerText || "", sel);
    check(`${label}: the weather box (d31 B) shows where the small map was, from Home's point, and no map tile is asked for`, /\d+° · /.test(flat(await text("#cmWx"))) && tiles.length === 0 && wx.urls.length >= 1 && /latitude=43\.65&longitude=-79\.38&/.test(wx.urls[0]), JSON.stringify({ tiles: tiles.length, urls: wx.urls }));
    // Commute 9:15 follows Subway to class: From is where that trip ended, To is Home (nothing else says where)
    check(`${label}: the Commute block after it opens`, await open("Commute"));
    pt = await panelText(page);
    check(`${label}: From is where the block before it ended (1 Yonge St), To is Home`, /From 1 Yonge St/i.test(pt) && /To Home/i.test(pt) && !/Where are you going\?/.test(pt), pt.slice(0, 260));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `fixes-${label}-commute-after.png`) });

    check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
    await ctx.close(); server.kill();
  }
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
