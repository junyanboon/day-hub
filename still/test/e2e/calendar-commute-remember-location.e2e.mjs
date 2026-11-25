// Commute panel: Remember a Location text as a place (Junyan, 2026-11-25, d38 "38 yes"). Teach "Studio 509A" once on one block; a second
// event on another day with the same Location text and a different title then goes to the real address; "Studio 5" does not; the
// title memory ("Remember for every ...") still works; a failed save shows the toast and breaks nothing.
// 2026-11-25e (d42, d43): no switch for an emoji-only or too-long Location; two switches give one true message; a remembered text shows
// "TEXT" goes to ADDRESS with a Forget link; Forget removes it (and says so when it cannot); teaching through a picked suggestion and a
// Saved places chip. Not covered here: the Google cannot find message after a forget (the page caches pins, so the no-pin case needs a
// fresh page; the message itself is the existing d37 code and is tested in calendar-commute.e2e.mjs).
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
// a Location whose key is 117 characters: "loc:" + key would be 121, one over what the server keeps
const LONG = "Annex " + "z".repeat(111);
const EXTRA = [
  EV("rl1", "Bus to Annex", "2026-11-27T15:00:00Z", "2026-11-27T15:25:00Z"), EV("rl1n", "Hall booking", "2026-11-27T15:30:00Z", "2026-11-27T16:30:00Z", "Studio 509A"),
  EV("rl2", "Subway to Gym", "2026-11-28T15:00:00Z", "2026-11-28T15:25:00Z"), EV("rl2n", "Rehearsal block", "2026-11-28T15:30:00Z", "2026-11-28T16:30:00Z", "Studio 509A"),
  EV("rl3", "Transit to Yoga", "2026-11-29T15:00:00Z", "2026-11-29T15:25:00Z"), EV("rl3n", "Teaching", "2026-11-29T15:30:00Z", "2026-11-29T16:30:00Z", "Studio 5"),
  EV("rl4", "Streetcar to Class", "2026-11-30T15:00:00Z", "2026-11-30T15:25:00Z"), EV("rl4n", "DM Advanced Training", "2026-11-30T15:30:00Z", "2026-11-30T16:30:00Z"),
  EV("rl5", "Commute home", "2026-12-01T15:00:00Z", "2026-12-01T15:25:00Z"), EV("rl5n", "DM Advanced Training", "2026-12-01T15:30:00Z", "2026-12-01T16:30:00Z"),
  EV("rl6", "TTC to Spot", "2026-12-02T15:00:00Z", "2026-12-02T15:25:00Z"), EV("rl6n", "Meeting up", "2026-12-02T15:30:00Z", "2026-12-02T16:30:00Z", "Studio 509A"),
  // 2026-11-25e: later in the same days, so the page does not step further. Choir A to D: title and Location both rememberable.
  EV("ca", "Bus to Choir A", "2026-11-27T18:00:00Z", "2026-11-27T18:25:00Z"), EV("can", "Choir night", "2026-11-27T18:30:00Z", "2026-11-27T19:30:00Z", "Studio 7B"),
  EV("cb", "Bus to Choir B", "2026-11-28T18:00:00Z", "2026-11-28T18:25:00Z"), EV("cbn", "Choir night", "2026-11-28T18:30:00Z", "2026-11-28T19:30:00Z", "Studio 7B"),
  EV("cc", "Bus to Choir C", "2026-11-29T18:00:00Z", "2026-11-29T18:25:00Z"), EV("ccn", "Choir night", "2026-11-29T18:30:00Z", "2026-11-29T19:30:00Z", "Studio 7B"),
  EV("cd", "Bus to Choir D", "2026-11-30T18:00:00Z", "2026-11-30T18:25:00Z"), EV("cdn", "Choir night", "2026-11-30T18:30:00Z", "2026-11-30T19:30:00Z", "Studio 7B"),
  EV("pk", "Streetcar to Pick", "2026-11-28T20:00:00Z", "2026-11-28T20:25:00Z"), EV("pkn", "Pick night", "2026-11-28T20:30:00Z", "2026-11-28T21:30:00Z", "Studio 3C"),
  EV("ch", "Bus to Chip", "2026-11-29T20:00:00Z", "2026-11-29T20:25:00Z"), EV("chn", "Chip night", "2026-11-29T20:30:00Z", "2026-11-29T21:30:00Z", "Studio 4D"),
  EV("em", "Streetcar to Fun", "2026-12-01T18:00:00Z", "2026-12-01T18:25:00Z"), EV("emn", "Party", "2026-12-01T18:30:00Z", "2026-12-01T19:30:00Z", "\u{1F389}\u{1F389} !!"),
  EV("lg", "Bus to Long", "2026-12-02T18:00:00Z", "2026-12-02T18:25:00Z"), EV("lgn", "Long hall", "2026-12-02T18:30:00Z", "2026-12-02T19:30:00Z", LONG),
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
      await fetch(BASE + "/quest/places", { method: "POST", headers: { "X-Quest-Key": "test", "content-type": "application/json" }, body: JSON.stringify({ op: "put", place: { name: "Annex Studio", category: "saved", address: "1 Chip Rd, Toronto", lat: 43.66, lng: -79.4 } }) });
      const phone = label === "phone";
      const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
      const page = await ctx.newPage();
      await page.clock.install({ time: new Date(NOW) });
      const errors = [], dirTo = []; let failSave = false, failList = "", failDel = false;
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => { if (/\/quest\/commute\/directions/.test(r.url()) && r.method() === "POST") { try { dirTo.push(JSON.parse(r.postData() || "{}").to); } catch (e) {} } });
      await page.route("**/planner/events*", async (route) => {
        const res = await route.fetch(); const j = await res.json();
        await route.fulfill({ response: res, json: { ...j, events: (j.events || []).concat(EXTRA) } });
      });
      await page.route("**/quest/places", (route) => {
        let body = {}; if (route.request().method() === "POST") { try { body = JSON.parse(route.request().postData() || "{}"); } catch (e) {} }
        const failIt = route.request().method() === "POST" && ((body.op === "del" ? failDel : failSave) || (failList && body.op === "put" && String((body.place || {}).list || "").startsWith(failList + ":")));
        if (failIt) return route.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "the server said no" }) });
        return route.continue();
      });
      await page.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([{ lat: "43.6649", lon: "-79.4101" }]) }));
      stubOpenMeteo(page);
      await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
      await page.goto(URL_); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
      const open = async (title) => {
        if (phone && await page.evaluate(() => document.body.classList.contains("popen"))) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); }
        for (let i = 0; i < 14; i++) {
          const el = page.locator(`.ev:not(.ghost):has-text("${title}")`).first();
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

      // ---- 2026-11-25e. d43: a text that cannot be remembered gets no switch
      const openFresh = async (title) => { await page.reload(); await page.waitForSelector(".ev", { state: "attached" }); await sleep(600); return open(title); };   // the arrows only go forward: start from today each time
      const rows = async (pre) => (await placesOnServer(page)).filter((p) => p.category === "commute-for" && p.list.startsWith(pre));
      const switches = () => page.evaluate(() => ({ loc: !!document.querySelector("#cmRemLoc"), title: !!document.querySelector("#cmRem"), forget: !!document.querySelector("#cmForgetLoc") }));
      check(`${label}: emoji-only Location block opens`, await openFresh("Streetcar to Fun"));
      await tap('#cmBox [data-cm="rowto"]'); await sleep(250);
      let sx = await switches();
      check(`${label}: an emoji-only Location gets no Remember "TEXT" switch (the title switch is still there)`, !sx.loc && sx.title && !sx.forget, JSON.stringify(sx));
      await tap("#cmRem"); await page.fill("#cmTo", "1 Party Rd, Toronto"); await page.press("#cmTo", "Enter"); await sleep(1100);
      check(`${label}: with only the title switch the message is the old one`, (await toastText(page)) === "Remembered for every Party", await toastText(page));
      check(`${label}: too-long Location block opens`, await openFresh("Bus to Long"));
      await tap('#cmBox [data-cm="rowto"]'); await sleep(250);
      sx = await switches();
      check(`${label}: a 117 character Location gets no Remember "TEXT" switch`, !sx.loc && sx.title && !sx.forget, JSON.stringify(sx));
      await page.fill("#cmTo", "2 Long Rd, Toronto"); await page.press("#cmTo", "Enter"); await sleep(1100);
      check(`${label}: nothing was saved for the emoji or the long text`, (await rows("loc:")).every((r) => r.list === "loc:studio 509a"), JSON.stringify((await rows("loc:")).map((r) => r.list)));

      // d43: both switches on, one message that is true for both
      const both = async (title, addr, mode) => {
        check(`${label}: ${title} opens`, await openFresh(title));
        await tap('#cmBox [data-cm="rowto"]'); await sleep(250);
        await tap("#cmRem"); await tap("#cmRemLoc");
        if (mode === "all") failSave = true; else failList = mode;
        await page.fill("#cmTo", addr); await page.press("#cmTo", "Enter"); await sleep(1100);
        failSave = false; failList = "";
        return toastText(page);
      };
      let tt = await both("Bus to Choir A", "77 Choir Rd, Toronto", "loc");
      check(`${label}: title saved, Location failed: one message naming the one that did not`, /^Remembered for every Choir night\. Not remembered "Studio 7B": /.test(tt), tt);
      check(`${label}: ...and the server holds the title row only`, (await rows("for:choir")).length === 1 && (await rows("loc:studio 7b")).length === 0);
      tt = await both("Bus to Choir B", "78 Choir Rd, Toronto", "for");
      check(`${label}: Location saved, title failed: one message naming the one that did not`, /^Remembered "Studio 7B"\. Not remembered for every Choir night: /.test(tt), tt);
      check(`${label}: ...and the server holds the Location row`, (await rows("loc:studio 7b")).length === 1);
      tt = await both("Bus to Choir C", "79 Choir Rd, Toronto", "all");
      check(`${label}: both failed: one message naming both`, /^Not remembered for every Choir night or "Studio 7B": /.test(tt), tt);
      check(`${label}: ...and the failed attempt is not marked as good (red toast)`, await page.evaluate(() => document.querySelector("#toast").classList.contains("bad")));
      tt = await both("Bus to Choir D", "80 Choir Rd, Toronto", "");
      check(`${label}: both worked: one message for both`, tt === 'Remembered for every Choir night and "Studio 7B"', tt);
      check(`${label}: ...and a repeat teach replaced the Location row (still one row, new address)`, (await rows("loc:studio 7b")).length === 1 && (await rows("loc:studio 7b"))[0].address === "80 Choir Rd, Toronto" && (await rows("for:choir")).length === 1);

      // teaching through a picked suggestion and through a Saved places chip (before this only the typed path was tested)
      check(`${label}: suggestion block opens`, await openFresh("Streetcar to Pick"));
      await tap('#cmBox [data-cm="rowto"]'); await sleep(250); await tap("#cmRemLoc");
      await page.fill("#cmTo", "St."); await sleep(800);
      await tap('#cmSug [data-cm="sug"][data-pid="gp-smh"]'); await sleep(1100);
      check(`${label}: picked suggestion with the switch on: Remembered "Studio 3C"`, (await toastText(page)) === 'Remembered "Studio 3C"', await toastText(page));
      const pr = await rows("loc:studio 3c");
      check(`${label}: ...the row holds the picked place's address and pin`, pr.length === 1 && pr[0].address === "30 Bond St, Toronto, ON M5B 1W8" && pr[0].lat === 43.6533, JSON.stringify(pr));
      check(`${label}: chip block opens`, await openFresh("Bus to Chip"));
      await tap('#cmBox [data-cm="rowto"]'); await sleep(250); await tap("#cmRemLoc");
      await tap('#cmAsk .chip:has-text("Annex Studio")'); await sleep(1100);
      check(`${label}: Saved places chip with the switch on: Remembered "Studio 4D"`, (await toastText(page)) === 'Remembered "Studio 4D"', await toastText(page));
      const cr = await rows("loc:studio 4d");
      check(`${label}: ...the row holds the chip's address`, cr.length === 1 && cr[0].address === "1 Chip Rd, Toronto", JSON.stringify(cr));

      // d42: a remembered text shows "TEXT" goes to ADDRESS with a Forget link; a repeat teach replaces the row
      check(`${label}: block 6 reopens`, await openFresh("TTC to Spot"));
      await tap('#cmBox [data-cm="rowto"]'); await sleep(250);
      const fl = await page.evaluate(() => { const d = document.querySelector("#cmForgetLoc"), b = d && d.querySelector("button"); return d ? { text: d.querySelector("span").innerText.trim(), btn: b.innerText.trim(), tag: b.tagName, h: Math.round(b.getBoundingClientRect().height), dis: b.disabled, after: d.previousElementSibling && d.previousElementSibling.querySelector("#cmRemLoc") ? "switch" : "other" } : null; });
      check(`${label}: the To box shows "Studio 509A" goes to 509 Bloor St W, Toronto, with a Forget button right after the switch, 44px tall`, !!fl && fl.text === '"Studio 509A" goes to 509 Bloor St W, Toronto' && fl.btn === "Forget" && fl.tag === "BUTTON" && fl.h >= 44 && !fl.dis && fl.after === "switch", JSON.stringify(fl));
      if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `remloc-${label}-forgetline.png`) });
      const idBefore = (await rows("loc:studio 509a"))[0].id;
      await tap("#cmRemLoc"); await page.fill("#cmTo", "511 Bloor St W, Toronto"); await page.press("#cmTo", "Enter"); await sleep(1100);
      const rp = await rows("loc:studio 509a");
      check(`${label}: teaching the same text again replaces the row (one row, same id, new address)`, rp.length === 1 && rp[0].id === idBefore && rp[0].address === "511 Bloor St W, Toronto", JSON.stringify(rp));
      await tap('#cmBox [data-cm="rowto"]'); await sleep(250);
      await page.evaluate(() => { document.activeElement.blur(); const c = S.cals.find((x) => x.id === S.ev.calId); window.__was = c.writable; c.writable = false; cmPaint(); });
      check(`${label}: on a read-only calendar the Forget button is disabled`, await page.evaluate(() => document.querySelector("#cmForgetLoc button")?.disabled === true));
      await page.evaluate(() => { S.cals.find((x) => x.id === S.ev.calId).writable = window.__was; cmPaint(); });

      // a title memory block has no Forget link
      check(`${label}: block 5 (title memory) reopens`, await openFresh("Commute home"));
      await tap('#cmBox [data-cm="rowto"]'); await sleep(250);
      check(`${label}: a block with no Location text has no Forget link (the title memory is not changed)`, !(await switches()).forget);

      // Forget failing leaves the memory
      check(`${label}: block 2 reopens (goes to the remembered address)`, await openFresh("Subway to Gym"));
      check(`${label}: block 2 shows the real address`, /^Studio 509A 511 Bloor St W, Toronto$/.test(await toRow()), await toRow());
      await tap('#cmBox [data-cm="rowto"]'); await sleep(250);
      failDel = true; await tap('#cmForgetLoc button'); await sleep(900); failDel = false;
      check(`${label}: Forget failing says: Not forgotten. Try again in a moment.`, (await toastText(page)) === "Not forgotten. Try again in a moment.", await toastText(page));
      check(`${label}: ...the memory and the Forget line are still there`, (await rows("loc:studio 509a")).length === 1 && (await switches()).forget);
      // Forget working
      dirTo.length = 0;
      await tap('#cmForgetLoc button'); await sleep(1200);
      check(`${label}: Forget says: Forgot "Studio 509A".`, (await toastText(page)) === 'Forgot "Studio 509A".', await toastText(page));
      check(`${label}: ...the loc: row is gone from the server and the title rows are untouched`, (await rows("loc:studio 509a")).length === 0 && (await rows("for:")).length === 3, JSON.stringify((await rows("")).map((r) => r.list)));
      check(`${label}: ...the Forget line is gone from the box`, !(await switches()).forget);
      check(`${label}: ...directions were asked again, now for the text as written`, dirTo.some((t) => t && t.address === "Studio 509A"), JSON.stringify(dirTo));
      await tap('#cmBox [data-cm="cancel"]'); await sleep(300);
      check(`${label}: block 2 goes back to the Location text as written`, (await toRow()) === "Rehearsal block Studio 509A", await toRow());
      // the next block with that text, and a To typed for a block
      check(`${label}: block 6 reopens`, await openFresh("TTC to Spot"));
      check(`${label}: a To he typed for this block is untouched`, /511 Bloor St W, Toronto/.test(await toRow()), await toRow());
      check(`${label}: block 1 reopens`, await openFresh("Bus to Annex"));
      check(`${label}: ...and so is the one on block 1`, /509 Bloor St W, Toronto/.test(await toRow()), await toRow());
      if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `remloc-${label}-forget.png`) });

      check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    } finally { server.kill(); }
  }
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
