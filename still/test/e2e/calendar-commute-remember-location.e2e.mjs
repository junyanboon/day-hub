// Commute panel: Remember a Location text as a place (Junyan, 2026-11-25, d38 "38 yes"). Teach "Studio 509A" once on one block; a second
// event on another day with the same Location text and a different title then goes to the real address; "Studio 5" does not; the
// title memory ("Remember for every ...") still works; a failed save shows the toast and breaks nothing.
// Computer and phone widths, in the test browser. The clock is fixed and the extra events are fixed instants (no real clock anywhere).
// The dev server (calendar-dev.mjs) fakes /quest/places in memory. Not part of `node --test`: it needs playwright-core.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-commute-remember-location.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
import { stubOpenMeteo } from "../helpers/open-meteo-stub.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8853), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const NOW = "2026-11-25T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

/* each case: a Commute block, then the event it leads to (with its Location text) one hour later */
const EV = (id, title, s, e, location = "") => ({ id, calId: "joint", title, start: s, end: e, allDay: false, htmlLink: "https://calendar.google.com", ...(location ? { location } : {}) });
const EXTRA = [
  EV("rl1", "Bus to Annex", "2026-11-27T15:00:00Z", "2026-11-27T15:25:00Z"), EV("rl1n", "Hall booking", "2026-11-27T15:30:00Z", "2026-11-27T16:30:00Z", "Studio 509A"),
  EV("rl2", "Subway to Gym", "2026-11-28T15:00:00Z", "2026-11-28T15:25:00Z"), EV("rl2n", "Rehearsal block", "2026-11-28T15:30:00Z", "2026-11-28T16:30:00Z", "Studio 509A"),
  EV("rl3", "Transit to Yoga", "2026-11-29T15:00:00Z", "2026-11-29T15:25:00Z"), EV("rl3n", "Teaching", "2026-11-29T15:30:00Z", "2026-11-29T16:30:00Z", "Studio 5"),
  EV("rl4", "Streetcar to Class", "2026-11-30T15:00:00Z", "2026-11-30T15:25:00Z"), EV("rl4n", "DM Advanced Training", "2026-11-30T15:30:00Z", "2026-11-30T16:30:00Z"),
  EV("rl5", "Commute home", "2026-12-01T15:00:00Z", "2026-12-01T15:25:00Z"), EV("rl5n", "DM Advanced Training", "2026-12-01T15:30:00Z", "2026-12-01T16:30:00Z"),
  EV("rl6", "TTC to Spot", "2026-12-02T15:00:00Z", "2026-12-02T15:25:00Z"), EV("rl6n", "Meeting up", "2026-12-02T15:30:00Z", "2026-12-02T16:30:00Z", "Studio 509A"),
];

const browser = await launchTestBrowser(chromium);
const shown = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; }, sel);
const panelText = async (page) => flat(await page.evaluate(() => document.querySelector("#pbody")?.innerText || ""));
const toastText = (page) => page.evaluate(() => document.querySelector("#toast")?.innerText || "");
const placesOnServer = (page) => page.evaluate(async (b) => (await (await fetch(b + "/quest/places", { headers: { "X-Quest-Key": "test" } })).json()).places, BASE);

try {
  const sizes = [
    ["computer", { viewport: { width: 1280, height: 860 } }],
    ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ];
  for (const [label, opts] of sizes) {
    if (process.env.ONLY && process.env.ONLY !== label) continue;
    const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
    await new Promise((ok) => server.stdout.once("data", ok));
    try {
      // Home is saved first, so every trip has a From and the page really asks for directions
      await fetch(BASE + "/quest/places", { method: "POST", headers: { "X-Quest-Key": "test", "content-type": "application/json" }, body: JSON.stringify({ op: "put", place: { name: "Home", category: "home", address: "100 Queen St W, Toronto", lat: 43.6529, lng: -79.3849 } }) });
      const phone = label === "phone";
      const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
      const page = await ctx.newPage();
      await page.clock.install({ time: new Date(NOW) });
      const errors = [], dirTo = []; let failSave = false;
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => { if (/\/quest\/commute\/directions/.test(r.url()) && r.method() === "POST") { try { dirTo.push(JSON.parse(r.postData() || "{}").to); } catch (e) {} } });
      await page.route("**/planner/events*", async (route) => {
        const res = await route.fetch(); const j = await res.json();
        await route.fulfill({ response: res, json: { ...j, events: (j.events || []).concat(EXTRA) } });
      });
      await page.route("**/quest/places", (route) => {
        if (failSave && route.request().method() === "POST") return route.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "the server said no" }) });
        return route.continue();
      });
      await page.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([{ lat: "43.6649", lon: "-79.4101" }]) }));
      stubOpenMeteo(page);
      await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
      await page.goto(URL_); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
      const open = async (title) => {
        if (phone && await page.evaluate(() => document.body.classList.contains("popen"))) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); }
        for (let i = 0; i < 14; i++) {
          const el = page.locator(`.ev:has-text("${title}")`).first();
          const inView = await el.count() && await el.evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.left < innerWidth; });
          if (inView) { await el.scrollIntoViewIfNeeded(); await el.click(); await sleep(400); await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); await sleep(500); return true; }
          await page.evaluate(() => document.querySelector("#next").click()); await sleep(400);   // the phone hides the arrows; this is the same step
        }
        return false;
      };
      const tap = async (sel) => { const el = page.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await el.click(); };
      const toRow = async () => flat(await page.evaluate(() => document.querySelector("#cmVto")?.innerText || ""));

      // 1. the first block: no memory yet. To reads the Location text; the To box offers the second switch
      check(`${label}: block 1 opens`, await open("Bus to Annex"));
      check(`${label}: before any memory the To reads the event with its Location text as written`, (await toRow()) === "Hall booking Studio 509A", await toRow());
      await tap('#cmBox [data-cm="rowto"]'); await sleep(250);
      const sw = await page.evaluate(() => { const r = document.querySelector("#cmRemLoc"); return r ? { role: r.getAttribute("role"), on: r.checked, text: r.parentElement.innerText.trim(), dis: r.disabled, others: [...document.querySelectorAll("#cmAsk .cmrem")].map((l) => l.innerText.trim()) } : null; });
      check(`${label}: the To box has the switch: Remember "Studio 509A" as this place (off), beside the other two`, !!sw && sw.role === "switch" && !sw.on && !sw.dis && sw.text === 'Remember "Studio 509A" as this place' && sw.others.length === 3 && sw.others[0] === "Keep in Saved places" && /^Remember for every Hall booking$/.test(sw.others[1]), JSON.stringify(sw));
      // a repaint keeps it
      await tap("#cmRemLoc");
      await page.evaluate(() => { document.querySelector("#cmTo").focus(); cmPaint(); });
      check(`${label}: a repaint keeps the switch on`, await page.evaluate(() => document.querySelector("#cmRemLoc").checked));
      await page.fill("#cmTo", "509 Bloor St W, Toronto"); await page.press("#cmTo", "Enter"); await sleep(1100);
      check(`${label}: toast says Remembered "Studio 509A"`, (await toastText(page)).includes('Remembered "Studio 509A"'), await toastText(page));
      let ps = (await placesOnServer(page)).filter((p) => p.category === "commute-for");
      check(`${label}: the server holds one loc: row with the address`, ps.length === 1 && ps[0].list === "loc:studio 509a" && ps[0].address === "509 Bloor St W, Toronto" && ps[0].name === "Studio 509A" && ps[0].savedBy === "Calendar", JSON.stringify(ps));
      check(`${label}: this block's own To shows the typed address`, /509 Bloor St W, Toronto/.test(await toRow()), await toRow());
      if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `remloc-${label}-1.png`) });

      // 2. another day, another title, the same Location text: the real address with nothing more to do
      dirTo.length = 0;
      check(`${label}: block 2 opens`, await open("Subway to Gym"));
      const r2 = await toRow();
      check(`${label}: block 2 shows the real address with the Location text beside it, no ask`, /^Studio 509A 509 Bloor St W, Toronto$/.test(r2) && !(await shown(page, "#cmTo")), r2);
      check(`${label}: block 2 asked Google for the real address, not the room name`, dirTo.some((t) => t && t.address === "509 Bloor St W, Toronto") && !dirTo.some((t) => t && t.address === "Studio 509A"), JSON.stringify(dirTo));
      check(`${label}: block 2 has directions (no no-route line)`, !(await shown(page, "#cmNoRoute")) && /\d+ min/.test(await panelText(page)));
      const gm = await page.getAttribute('#cmBox a:has-text("Open in Google Maps")', "href");
      check(`${label}: the Google Maps button goes to the real address`, /destination=509%20Bloor%20St%20W%2C%20Toronto/.test(gm), gm);
      if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `remloc-${label}-2.png`) });

      // 3. a near-miss text does not match
      check(`${label}: block 3 opens`, await open("Transit to Yoga"));
      const r3 = await toRow();
      check(`${label}: "Studio 5" is not "Studio 509A": the To reads the text as written`, r3 === "Teaching Studio 5", r3);

      // 4. the title memory still works
      check(`${label}: block 4 opens`, await open("Streetcar to Class"));
      check(`${label}: block 4 has no place yet (To not set, box open)`, /Not set yet/.test(await panelText(page)) && await shown(page, "#cmTo"));
      check(`${label}: with no Location text there is no second switch, and the title switch is there`, !(await shown(page, "#cmRemLoc")) && await shown(page, "#cmRem"));
      await tap("#cmRem"); await page.fill("#cmTo", "Bloor St W at Bathurst St"); await page.press("#cmTo", "Enter"); await sleep(1100);
      check(`${label}: toast says Remembered for every DM Advanced Training`, (await toastText(page)).includes("Remembered for every DM Advanced Training"), await toastText(page));
      check(`${label}: block 5 opens`, await open("Commute home"));
      const r5 = await toRow();
      check(`${label}: block 5 (same title, other day) goes to the remembered address`, /Bloor St W at Bathurst St/.test(r5) && !(await shown(page, "#cmTo")), r5);

      // 5. a failed save shows the toast and breaks nothing
      check(`${label}: block 6 opens`, await open("TTC to Spot"));
      check(`${label}: block 6 (Studio 509A again) already goes to the real address`, /^Studio 509A 509 Bloor St W, Toronto$/.test(await toRow()), await toRow());
      failSave = true;
      await tap('#cmBox [data-cm="rowto"]'); await sleep(250);
      await tap("#cmRemLoc"); await page.fill("#cmTo", "509 Bloor St W, Toronto"); await page.press("#cmTo", "Enter"); await sleep(1100);
      check(`${label}: a failed save shows "Not remembered: ..."`, /Not remembered: /.test(await toastText(page)), await toastText(page));
      check(`${label}: the To is still set and the panel still works`, /509 Bloor St W, Toronto/.test(await toRow()) && !(await shown(page, "#cmTo")) && await page.locator('#cmBox [data-cm="mode"]').count() === 3);
      failSave = false;
      ps = (await placesOnServer(page)).filter((p) => p.category === "commute-for");
      check(`${label}: nothing new was saved (still two rows: the loc: and the for: row)`, ps.length === 2 && ps.some((p) => p.list === "loc:studio 509a") && ps.some((p) => p.list === "for:dm advanced training"), JSON.stringify(ps.map((p) => p.list)));

      // 6. a read-only calendar: the switch is disabled
      await tap('#cmBox [data-cm="rowto"]'); await sleep(200);
      await page.evaluate(() => { document.activeElement.blur(); const c = S.cals.find((x) => x.id === S.ev.calId); window.__was = c.writable; c.writable = false; cmPaint(); });
      const ro = await page.evaluate(() => { const r = document.querySelector("#cmRemLoc"); return r ? r.disabled : "none"; });
      check(`${label}: on a read-only calendar the switch is disabled (or the box is not offered)`, ro === true || ro === "none", String(ro));
      await page.evaluate(() => { S.cals.find((x) => x.id === S.ev.calId).writable = window.__was; cmPaint(); });

      check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    } finally { server.kill(); }
  }
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
