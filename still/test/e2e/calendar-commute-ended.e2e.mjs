// d45 and d46 (Junyan, 2026-11-25: "45 yes I want to be able to see it still", "46 yes remove it", "47 yes").
// Clicks every state in the test browser, on a computer and on a phone, against the faked dev routes (calendar-dev.mjs):
//  - a panel open while the Commute block runs, the clock then moves past the block's end, and Transit, Drive, Walk are tapped: Leave by, the way
//    fold (still open), its steps, Heads up and the chip minutes stay, "Checked TIME" shows with no Check again, no "This block is over." line, no early chips, no row
//    says another way is quicker, and no request goes to the server;
//  - a fresh open of an ended block shows the answer kept in this browser (no request); with none kept nothing shows in the Leave by area, with From, To,
//    the map buttons and Photos and notes as before, and still no request;
//  - a re-check that comes back not ok (a Check again, and a chip tap after a minute) keeps the good directions and puts the server's message under
//    Leave by; a failed load does the same with Try again; a changed To never shows the old trip's answer;
//  - the "Open in Google" link is gone from the sheet and the computer panel for an event that has a link (the foot is Delete on the left, Save on the right).
// The page clock is pinned (page.clock), the dev server's days come from DEV_NOW, so no test reads the real clock. No call leaves the test machine.
// Not part of `node --test`: it needs playwright-core.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-commute-ended.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
import { stubOpenMeteo } from "../helpers/open-meteo-stub.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8891);
const DEV_NOW = "2026-11-24T15:00:00Z";          // the dev server's "today" (Nov 24, 10:00 in Toronto): the Transit block is Nov 25, 9:35 to 10:00
const RUNNING = "2026-11-25T14:40:00Z";           // 9:40 in Toronto: the block is running
const OVER = "2026-11-25T15:10:00Z";              // 10:10 in Toronto: the block is over
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const browser = await launchTestBrowser(chromium);
const OFF = "Directions are off for the rest of this month. They come back on the 1st.";
const LOST = "Directions could not be loaded. Check your connection and try again.";

try {
  const sizes = [["computer", { viewport: { width: 1280, height: 860 } }], ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]];
  for (const [label, opts] of sizes) {
    if (process.env.ONLY && process.env.ONLY !== label) continue;
    const phone = label === "phone", port = PORT + (phone ? 1 : 0), base = `http://localhost:${port}`;
    const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(port)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW, TZ: "America/Toronto" } });
    await new Promise((ok) => server.stdout.once("data", ok));
    const errors = [];
    const dev = (q) => fetch(`${base}/__dev/directions?${q}`).then((r) => r.json());
    const newPage = async (ctx, time) => {
      const page = await ctx.newPage(); page.setDefaultTimeout(8000);
      const reqs = { n: 0 }; page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/quest/commute/directions")) reqs.n++; });
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install({ time: new Date(time) });
      await page.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([{ lat: "43.6495", lon: "-79.4290" }]) }));
      stubOpenMeteo(page);
      await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
      await page.goto(`${base}/still/calendar.html?api=${encodeURIComponent(base)}`); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
      return { page, reqs };
    };
    const openEv = async (page, title) => {
      const ok = await page.evaluate((title) => { const k = today(); const ev = eventsFor(k, k).find((e) => e.title === title); if (!ev) return false; panel("event", ev); return true; }, title);
      await sleep(400); await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); return ok;
    };
    const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const box = (page) => page.evaluate(() => (document.querySelector("#cmBox")?.innerText || "").replace(/\s+/g, " ").trim());
    const tap = async (page, sel) => { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await l.click(); };
    const count = (page, sel) => page.locator(sel).count();
    const chipTexts = (page) => page.evaluate(() => [...document.querySelectorAll('#cmBox [data-cm="mode"]')].map((b) => b.textContent.replace(/\s+/g, " ").trim()));
    const waitDirs = (page) => page.waitForSelector("#cmBox .cmleave .big", { timeout: 8000 });
    const giveTo = async (page) => { if (await count(page, "#cmTo")) { await page.fill("#cmTo", "Gladstone Hotel, Toronto"); await page.press("#cmTo", "Enter"); await sleep(600); } };

    // ---- context 1: the block is running, then it ends while the panel is open
    const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    let { page, reqs } = await newPage(ctx, RUNNING);
    check(`${label}: the Transit block (Nov 25, 9:35 to 10:00) opens while it runs`, await openEv(page, "Transit"));
    await page.fill("#cmHomeIn", "100 Queen St W, Toronto"); await page.click('[data-cm="home"]'); await sleep(700);
    await giveTo(page); await waitDirs(page);
    await tap(page, '#cmBox [data-cm="fold"][data-v="way"]');
    let t = await box(page);
    check(`${label}: running: Leave by, Check again, the way fold open with its steps, Heads up`, /leave by/i.test(t) && /Checked [^·]*· Check again/.test(t) && /Walk to Dev Station North/.test(t) && /Heads up · 2/.test(t) && !/This block is over/.test(t), t.slice(0, 260));
    const before = await chipTexts(page), leaveBefore = flat(await page.locator("#cmBox .cmleave .big").innerText()), checkedBefore = (t.match(/Checked [^·]*?(?= ·)/) || [""])[0];
    const nBefore = reqs.n;

    await page.clock.fastForward(30 * 60 * 1000);   // 10:10: the block is over, the panel is still open
    await tap(page, '#cmBox [data-cm="mode"][data-v="drive"]'); await sleep(700);
    t = await box(page);
    check(`${label}: after the end, one tap on Drive keeps Leave by, the way fold, the steps and Heads up`, /leave by/i.test(t) && /The way there · 27 min/.test(t) && /The way there · 27 min · /.test(t) && /Heads up · 1/.test(t), t.slice(0, 300));
    check(`${label}: no "This block is over." line; "Checked TIME", no Check again and no early chips`, !/This block is over/.test(t) && !/Be there early/i.test(t) && await count(page, '#cmBox [data-cm="early"]') === 0 && /Checked \d{1,2}(:\d{2})? (am|pm)/.test(t) && !/Check again|Checking/.test(t) && await count(page, '#cmBox [data-cm="check"]') === 0, t.slice(0, 300));
    check(`${label}: the chips still show every way's minutes`, (await chipTexts(page)).filter((x) => /\d+ min/.test(x)).length >= 2, JSON.stringify(await chipTexts(page)));
    check(`${label}: no row says another way is quicker right now`, !/quicker right now/.test(t) && await count(page, ".cmquick") === 0);
    await tap(page, '#cmBox [data-cm="mode"][data-v="transit"]'); await sleep(700);
    t = await box(page);
    check(`${label}: back on Transit the Transit directions are the same as before the end`, flat(await page.locator("#cmBox .cmleave .big").innerText()) === leaveBefore && /Walk to Dev Station North/.test(t) && /Heads up · 2/.test(t), `${leaveBefore} / ${t.slice(0, 200)}`);
    check(`${label}: the fold he opened is still open`, await page.getAttribute('#cmBox [data-cm="fold"][data-v="way"]', "aria-expanded") === "true" && await page.locator("#cmBox .cmsteps").first().isVisible());
    await tap(page, '#cmBox [data-cm="mode"][data-v="commute"]'); await sleep(500); t = await box(page);
    check(`${label}: Walk still switches to the kept Walk answer (too far to walk) and no over line is drawn`, !/This block is over/.test(t) && /Too far to walk \(9 km\)\./.test(t) && !/Check again/.test(t), t.slice(0, 200));
    await tap(page, '#cmBox [data-cm="mode"][data-v="transit"]'); await sleep(500);
    check(`${label}: no request went to the server after the block ended (chip taps, the page's own check)`, reqs.n === nBefore, `${nBefore} before, ${reqs.n} after`);
    await page.clock.fastForward(5 * 60 * 1000); await sleep(300);
    check(`${label}: a minute tick later still sends nothing`, reqs.n === nBefore);
    check(`${label}: no weather box once the block is over`, await count(page, "#cmWx") === 0);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `commute-ended-${label}.png`) });
    check(`${label}: no page errors (panel open across the end)`, !errors.length, errors.join("; "));
    await page.close();

    // ---- a fresh open of the ended block: the answer kept in this browser
    ({ page, reqs } = await newPage(ctx, OVER));
    check(`${label}: the ended block opens fresh`, await openEv(page, "Transit")); await sleep(500);
    t = await box(page);
    check(`${label}: fresh open: the kept answer shows (Leave by, Arrive, chip minutes), with Checked TIME and no over line`, /leave by/i.test(t) && /Arrive /i.test(t) && !/This block is over/.test(t) && /Checked [^·]*?(am|pm)/.test(t) && !/Check again/.test(t) && (await chipTexts(page)).some((x) => /Transit 34 min/.test(x)), t.slice(0, 300));
    check(`${label}: its time is the time of the answer he last saw (${checkedBefore})`, t.includes(checkedBefore), t.slice(0, 200));
    check(`${label}: the folds start as always (way closed, Heads up open) and nothing was requested`, await page.getAttribute('#cmBox [data-cm="fold"][data-v="way"]', "aria-expanded") === "false" && await page.getAttribute('#cmBox [data-cm="fold"][data-v="heads"]', "aria-expanded") === "true" && reqs.n === 0, `requests ${reqs.n}`);
    check(`${label}: From, To, the map buttons and Photos and notes are there`, await count(page, '#cmBox [data-cm="rowfrom"]') === 1 && await count(page, '#cmBox [data-cm="rowto"]') === 1 && await count(page, "#cmBox #cmLinks a") >= 1 && /photos and notes/i.test(t));
    // a changed To is another trip: the old trip's answer never shows
    await tap(page, '#cmBox [data-cm="rowto"]'); await page.fill("#cmTo", "Queen and Spadina, Toronto"); await page.press("#cmTo", "Enter"); await sleep(900);
    t = await box(page);
    check(`${label}: a changed To (another trip) shows no kept directions, nothing in the Leave by area, and sends nothing`, !/leave by/i.test(t) && !/This block is over/.test(t) && await count(page, "#cmBox .cmleave") === 0 && reqs.n === 0, t.slice(0, 260));
    await page.close();
    await ctx.close();

    // ---- an ended block with nothing kept: a clean browser
    const ctx2 = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    ({ page, reqs } = await newPage(ctx2, OVER));
    check(`${label}: the ended block opens in a browser that never saw its directions`, await openEv(page, "Transit")); await sleep(600);
    t = await box(page);
    check(`${label}: nothing in the Leave by area (no over line), no way fold, no minutes on the chips`, !/This block is over/.test(t) && await count(page, "#cmBox .cmleave") === 0 && !/leave by|the way there|heads up|check again/i.test(t) && !(await chipTexts(page)).some((x) => /\d+ min/.test(x)) && reqs.n === 0, t.slice(0, 260));
    check(`${label}: and From, To, the map buttons and Photos and notes are still there`, await count(page, '#cmBox [data-cm="rowfrom"]') === 1 && await count(page, '#cmBox [data-cm="rowto"]') === 1 && await count(page, "#cmBox #cmLinks a") >= 1 && /photos and notes/i.test(t));
    await page.close(); await ctx2.close();

    // ---- a not-ok re-check on a running block keeps the good directions
    const ctx3 = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    ({ page, reqs } = await newPage(ctx3, RUNNING));
    await dev("reset=1");
    await openEv(page, "Transit"); await waitDirs(page);
    await tap(page, '#cmBox [data-cm="fold"][data-v="way"]');
    const leave1 = flat(await page.locator("#cmBox .cmleave .big").innerText()), cheq1 = (flat(await page.locator("#cmBox .cmchecked").first().innerText()).match(/Checked [^·]*?(?= ·)/) || [""])[0];
    await dev("state=stopped");
    await tap(page, '#cmBox [data-cm="check"]'); await sleep(700);
    t = await box(page);
    check(`${label}: Check again that comes back "stopped": Leave by, the steps and Heads up stay`, flat(await page.locator("#cmBox .cmleave .big").innerText()) === leave1 && /Walk to Dev Station North/.test(t) && /Heads up · 2/.test(t), t.slice(0, 300));
    check(`${label}: the server's message sits under the Leave by area, with the time of the answer shown`, await page.evaluate((m) => { const l = document.querySelector("#cmBox .cmleave"), a = l && l.querySelector('[role="alert"]'); return !!a && a.textContent === m && /Checked/.test(l.innerText) && /Leave by/i.test(l.innerText); }, OFF) && t.includes(cheq1), `${t.slice(0, 200)} / ${cheq1}`);
    check(`${label}: the checked line keeps Check again`, /Check again/.test(t) && !/Try again/.test(t));
    await page.clock.fastForward(2 * 60 * 1000);
    await tap(page, '#cmBox [data-cm="mode"][data-v="drive"]'); await sleep(800);
    t = await box(page);
    check(`${label}: a chip tap after a minute that gets "stopped" keeps the Drive directions and shows the message`, /leave by/i.test(t) && /The way there · 27 min/.test(t) && t.includes(OFF), t.slice(0, 300));
    await dev("state=ok");
    await tap(page, '#cmBox [data-cm="check"]'); await sleep(800);
    check(`${label}: a good re-check takes the message away`, !(await box(page)).includes(OFF));
    // a failed load
    await page.route("**/quest/commute/directions", (route) => route.abort());
    await tap(page, '#cmBox [data-cm="check"]'); await sleep(800);
    t = await box(page);
    check(`${label}: a failed load keeps the directions and says "${LOST}" with Try again`, /leave by/i.test(t) && /The way there/.test(t) && t.includes(LOST) && /Try again/.test(t) && await count(page, '#cmBox [data-cm="check"]') === 1, t.slice(0, 300));
    await page.unroute("**/quest/commute/directions");
    await tap(page, '#cmBox [data-cm="check"]'); await sleep(800);
    t = await box(page);
    check(`${label}: Try again with the connection back clears the message`, !t.includes(LOST) && /Check again/.test(t) && /leave by/i.test(t), t.slice(0, 200));
    check(`${label}: no page errors (not-ok and failed re-checks)`, !errors.length, errors.join("; "));
    await page.close(); await ctx3.close();

    // ---- a reload whose first check fails: the directions this browser last had stay (Junyan, 2026-11-25, 53)
    const ctx5 = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    ({ page, reqs } = await newPage(ctx5, RUNNING));
    await dev("reset=1");
    await openEv(page, "Transit"); await waitDirs(page);
    const leave5 = flat(await page.locator("#cmBox .cmleave .big").innerText());
    const cheq5 = (flat(await page.locator("#cmBox .cmchecked").first().innerText()).match(/Checked [^·]*?(?= ·)/) || [""])[0];
    await page.route("**/quest/commute/directions", (route) => route.abort());
    await page.reload(); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    await openEv(page, "Transit"); await sleep(600);
    t = await box(page);
    check(`${label}: reload with the directions call failing: the last directions show with Checked TIME, Try again and the failure words`, flat(await page.locator("#cmBox .cmleave .big").innerText()) === leave5 && t.includes(cheq5) && /Try again/.test(t) && t.includes(LOST), t.slice(0, 300));
    await page.unroute("**/quest/commute/directions");
    await page.reload(); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    await dev("state=stopped");
    await openEv(page, "Transit"); await sleep(700);
    t = await box(page);
    check(`${label}: reload with the server saying no: the last directions show, with the server's words and Check again`, flat(await page.locator("#cmBox .cmleave .big").innerText()) === leave5 && t.includes(OFF) && /Check again/.test(t), t.slice(0, 300));
    await page.close();
    // another trip stored: never shown, the error stays
    await page.context().clearCookies();
    ({ page, reqs } = await newPage(ctx5, RUNNING));
    await page.evaluate(() => { const all = JSON.parse(localStorage.getItem("cal-commute-last") || "{}"); for (const k of Object.keys(all)) all[k].sig = "another|trip|1"; localStorage.setItem("cal-commute-last", JSON.stringify(all)); });
    await page.reload(); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
    await openEv(page, "Transit"); await sleep(700);
    t = await box(page);
    check(`${label}: a kept answer for another trip is never shown (the server's words only)`, !/leave by/i.test(t) && t.includes(OFF), t.slice(0, 300));
    await dev("reset=1");
    check(`${label}: no page errors (reload with a failed first check)`, !errors.length, errors.join("; "));
    await page.close(); await ctx5.close();

    // ---- d46: the Open in Google link is gone (the events have an htmlLink)
    const ctx4 = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    ({ page } = await newPage(ctx4, RUNNING));
    const hasLink = await page.evaluate(() => { const k = today(); const ev = eventsFor(k, k).find((e) => e.title === "Work block"); return !!(ev && ev.htmlLink); });
    check(`${label}: the test event has a Google link`, hasLink);
    await openEv(page, "Work block");
    const gone = await page.evaluate(() => ({ text: /Open in Google/.test(document.querySelector("#pbody")?.innerText || document.body.innerText), a: !!document.querySelector('#pbody a[href*="calendar.google"], .sheet a[href*="calendar.google"]') }));
    check(`${label}: no "Open in Google" text or link in the ${phone ? "sheet" : "panel"}`, !gone.text && !gone.a, JSON.stringify(gone));
    if (!phone) {
      const r = await page.evaluate(() => { const d = document.querySelector("#pDel").getBoundingClientRect(), s = document.querySelector("#pSave").getBoundingClientRect(), p = document.querySelector("#pbody").getBoundingClientRect(); return { d: [d.left, d.top], s: [s.left, s.right, s.top], p: [p.left, p.right] }; });
      check(`${label}: the panel foot is Delete on the left and Save on the right, on one line`, r.d[0] < r.p[0] + 40 && r.s[1] > r.p[1] - 40 && Math.abs(r.d[1] - r.s[2]) < 6, JSON.stringify(r));
    }
    check(`${label}: no page errors (open in Google)`, !errors.length, errors.join("; "));
    await page.close(); await ctx4.close();
    server.kill();
  }
} finally { await browser.close(); }
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed of ${results.length}`);
process.exit(failed.length ? 1 : 0);
