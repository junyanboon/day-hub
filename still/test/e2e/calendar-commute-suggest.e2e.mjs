// Suggested Commute blocks (Junyan, 2026-11-25, d48 "48 yes suggest commute blocks", d49 "49yes"): a dashed Suggested Commute before each of
// his plans that has a place away from Home (a Location, or a place taught for the event's name), 30 minutes ending when the plan starts.
// Covered, on a computer and a phone width: they show before a Location plan and a remembered-name plan; none before a plan at Home, after a
// Commute block, after a plan at the same place, or for staff and read-only calendars; no directions, places-search or weather request is
// sent while they are on screen (and exactly one GET /quest/places is); a failed places load is quiet; Accept writes a real Commute (same
// times, Joint Plans) and the suggestion is gone; Skip hides it for good (after a reload too); the new Settings switch turns them off and on
// and leaves the four routine suggestions alone; gym sessions share one place taught once ("Remember for every gym session"), the accepted
// block is Walk and its To shows the place's name over its address. The clock is fixed (page.clock) and every event is a fixed instant.
// Not covered: WebKit (not installed for this Playwright) and a real iPhone. Not part of `node --test`: it needs playwright-core.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-commute-suggest.e2e.mjs
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
const PORT = +(process.env.PORT || 8861), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const NOW = "2026-11-25T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const KEY = { "X-Quest-Key": "test", "content-type": "application/json" };

const EV = (id, title, s, e, x = {}) => ({ id, calId: "joint", title, start: s, end: e, allDay: false, htmlLink: "https://calendar.google.com", ...x });
const SEED = [
  // today (the clock is 10:00 am Wed 25th): a plan at 9:30 am with a place, so its Commute suggestion (9:00 to 9:30) and the 9:00 to 9:30 Domestic are both over already (d68, d70)
  EV("ct1", "Early meeting", "2026-11-25T14:30:00Z", "2026-11-25T15:00:00Z", { location: "4 Early St, Toronto" }),
  // Thursday 26th
  EV("cs1", "Studio hour 1", "2026-11-26T13:00:00Z", "2026-11-26T14:00:00Z", { location: "9 Park Rd, Toronto" }),
  EV("cs2", "Studio hour 2", "2026-11-26T14:00:00Z", "2026-11-26T14:30:00Z", { location: "9 Park Rd, Toronto" }),   // same place as the plan before: none
  EV("cs3", "Dentist", "2026-11-26T15:00:00Z", "2026-11-26T16:00:00Z", { location: "50 King St W, Toronto" }),
  EV("cs4", "Choir", "2026-11-26T18:00:00Z", "2026-11-26T19:00:00Z"),   // no Location: the place taught for "Choir"
  EV("cs5", "Commute", "2026-11-26T19:30:00Z", "2026-11-26T20:00:00Z"),
  EV("cs6", "Tutoring", "2026-11-26T20:00:00Z", "2026-11-26T21:00:00Z", { location: "7 Hill St, Toronto" }),   // a Commute block is already before it: none
  EV("cs7", "Dinner at home", "2026-11-26T22:00:00Z", "2026-11-26T23:00:00Z", { location: "100 Queen St W, Toronto" }),   // Home: none
  EV("cs8", "Staff meeting", "2026-11-26T16:30:00Z", "2026-11-26T17:00:00Z", { calId: "staff", location: "1 Staff Way, Toronto" }),   // other people's time: none
  EV("cs9", "Caney lunch", "2026-11-26T17:00:00Z", "2026-11-26T17:20:00Z", { calId: "caney", location: "3 Elm St, Toronto" }),   // a read-only calendar: none
  // gym sessions
  EV("cg1", "Gym · Jack Woods", "2026-11-27T15:00:00Z", "2026-11-27T16:00:00Z"),
  EV("cg2c", "Commute", "2026-11-28T13:30:00Z", "2026-11-28T14:00:00Z"), EV("cg2", "Gym · Matthew I. Smith", "2026-11-28T14:00:00Z", "2026-11-28T15:00:00Z"),
  EV("cg3c", "Commute", "2026-11-29T13:30:00Z", "2026-11-29T14:00:00Z"), EV("cg3", "Gym · Zed Quick", "2026-11-29T14:00:00Z", "2026-11-29T15:00:00Z"),
];
const CALL = /\/quest\/commute\/(directions|places|place)\b|open-meteo|nominatim|googleapis|google\.com\/maps/i;

const browser = await launchTestBrowser(chromium);
const put = (place) => fetch(BASE + "/quest/places", { method: "POST", headers: KEY, body: JSON.stringify({ op: "put", place }) });
const serverEvents = async () => (await (await fetch(BASE + "/planner/events?from=2026-11-20T00:00:00Z&to=2026-12-05T00:00:00Z", { headers: KEY })).json()).events;
const serverPlaces = async () => (await (await fetch(BASE + "/quest/places", { headers: KEY })).json()).places;

try {
  const sizes = [
    ["computer", { viewport: { width: 1280, height: 860 } }],
    ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ];
  for (const [label, opts] of sizes) {
    if (process.env.ONLY && process.env.ONLY !== label) continue;
    const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
    await serverReady(server);
    try {
      const phone = label === "phone";
      // the dev server's own sample plans are set aside, so only the cases above are on the calendar
      const baseIds = new Set((await (await fetch(BASE + "/planner/events?from=2020-01-01T00:00:00Z&to=2031-01-01T00:00:00Z", { headers: KEY })).json()).events.map((e) => e.id));
      for (const e of SEED) await fetch(BASE + "/planner/event", { method: "POST", headers: KEY, body: JSON.stringify(e) });
      await put({ name: "Home", category: "home", address: "100 Queen St W, Toronto", lat: 43.6529, lng: -79.3849 });
      await put({ name: "Choir", category: "commute-for", list: "for:choir", address: "20 Choir Ln, Toronto", lat: 43.7, lng: -79.4, notes: "Where the Commute block before this event goes", savedBy: "Calendar" });

      const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
      const page = await ctx.newPage();
      await page.clock.install({ time: new Date(NOW) });
      const errors = [], reqs = []; let placesFail = false;
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => { if (!r.url().startsWith("data:")) reqs.push(r.method() + " " + r.url()); });
      await page.route("**/planner/events*", async (route) => {
        const res = await route.fetch(); const j = await res.json();
        await route.fulfill({ response: res, json: { ...j, events: (j.events || []).filter((e) => !baseIds.has(e.id)) } });
      });
      await page.route("**/quest/places", (route) => {
        if (placesFail && route.request().method() === "GET") return route.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "the server said no" }) });
        return route.continue();
      });
      stubOpenMeteo(page);
      await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
      const load = async () => { await page.goto(URL_); await page.waitForSelector(".ev", { state: "attached" }); await sleep(900); };
      const goDay = async (d) => { await page.evaluate((x) => goTo(x, false), d); await sleep(500); };
      const sugg = (day) => page.evaluate((d) => S.autoG.filter((g) => g.kind === "commute" && g.why !== "Home" && g.id.endsWith(":" + d)).map((g) => ({ id: g.id, why: g.why, s: g.s, e: g.e, calId: g.calId, title: g.title })), day);
      const homeSugg = (day) => page.evaluate((d) => S.autoG.filter((g) => g.kind === "commute" && g.why === "Home" && g.id.endsWith(":" + d)).map((g) => ({ id: g.id, s: g.s, e: g.e, calId: g.calId, title: g.title })), day);
      const whys = async (day) => (await sugg(day)).map((g) => g.why);
      const toastText = () => page.evaluate(() => document.querySelector("#toast")?.innerText || "");
      const tap = (sel) => page.locator(sel).first().click();   // click scrolls into view itself and finds the element again if the page repaints under it
      const openGhost = async (day, why) => {
        const g = (await sugg(day)).find((x) => x.why === why); if (!g) return null;
        await closeSheet(); await goDay(day);
        await tap(`.ev[data-key="g|${g.calId}|${g.id}"]`); await sleep(500); return g;
      };
      const openReal = async (title, day) => {
        await closeSheet(); await goDay(day);
        const sel = `.col[data-day="${day}"] .ev:not(.ghost):has-text("${title}")`;
        await tap(sel); await sleep(500);
        await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); await sleep(500);
      };
      const openSettings = async () => {
        if (phone && await page.evaluate(() => document.body.classList.contains("popen"))) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); }
        if (phone) await page.evaluate(() => document.querySelector("#panelBtn").click());
        await tap('[data-p="set"]'); await sleep(300);
      };
      const closeSheet = async () => { if (phone && await page.evaluate(() => document.body.classList.contains("popen"))) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); } };

      // 1. first paint: the suggestions, and nothing sent to Google
      await load();
      check(`${label}: Thursday has three suggestions (a Location, a place taught for the name, and one after another plan)`, JSON.stringify(await whys("2026-11-26")) === JSON.stringify(["To Studio hour 1", "To Dentist", "To Choir"]), JSON.stringify(await whys("2026-11-26")));
      const day = await sugg("2026-11-26"), den = day.find((g) => g.why === "To Dentist"), s1 = day.find((g) => g.why === "To Studio hour 1");
      check(`${label}: each is a Commute of 30 minutes ending when the plan starts, on Joint Plans`, day.every((g) => g.title === "Commute" && g.e - g.s === 30 * 60000 && g.calId === "joint") && den.e === Date.parse("2026-11-26T15:00:00Z") && s1.e === Date.parse("2026-11-26T13:00:00Z"));
      check(`${label}: none before the plan at the same place, after a Commute block, at Home, on a staff calendar or a read-only one`, !day.some((g) => /Studio hour 2|Tutoring|Dinner at home|Staff meeting|Caney lunch/.test(g.why)));
      await goDay("2026-11-26");
      const look = await page.evaluate((id) => { const el = document.querySelector(`.ev.ghost[data-key="g|joint|${id}"]`); if (!el) return null; const cs = getComputedStyle(el); return { dashed: cs.borderTopStyle, text: el.innerText.replace(/\s+/g, " ").trim(), icon: !!el.querySelector(".ei") && el.querySelector(".ei").innerText }; }, den.id);
      check(`${label}: it is drawn like the other suggestions: dashed, plain "Commute" (no "Suggested:"), with the Walk icon`, !!look && look.dashed === "dashed" && /Commute/.test(look.text) && !/Suggested/.test(look.text) && look.icon === "\u{1F6B6}", JSON.stringify(look));
      check(`${label}: the four routine suggestions still draw on a free day`, await page.evaluate(() => ["wind", "sleep", "morning", "domestic"].every((k) => S.autoG.some((g) => g.id === `auto:${k}:2026-11-27`))));
      await sleep(1500);
      const calls = reqs.filter((u) => CALL.test(u));
      check(`${label}: no directions, places-search, weather or Google request while suggestions are on screen`, calls.length === 0, calls.join(" | "));
      check(`${label}: the page's own GET /quest/places was asked exactly once`, reqs.filter((u) => u === "GET " + BASE + "/quest/places").length === 1, reqs.filter((u) => /quest\/places/.test(u)).join(" | "));

      // 1b. d68 and d70: today's earlier suggestions stay until the day ends
      const today = await sugg("2026-11-25");
      check(`${label}: d68: today's Commute suggestion before the 9:30 am plan is still shown at 10:00 am`, today.length === 1 && today[0].why === "To Early meeting" && today[0].e === Date.parse("2026-11-25T14:30:00Z") && today[0].e < Date.parse(NOW), JSON.stringify(today));
      const domToday = await page.evaluate(() => { const g = S.autoG.find((x) => x.id === "auto:domestic:2026-11-25"); return g && { s: g.s, e: g.e, why: g.why }; });
      check(`${label}: d70: today's Domestic is the earliest free 30 minutes (9:00 to 9:30 am), still shown after it has passed`, !!domToday && domToday.s === Date.parse("2026-11-25T14:00:00Z") && domToday.e === Date.parse("2026-11-25T14:30:00Z") && domToday.e < Date.parse(NOW) && domToday.why === "Your first free 30 min", JSON.stringify(domToday));

      // 2. a failed places load: quiet, Location-based ones still draw, name-based ones do not
      const p2 = await ctx.newPage(); placesFail = true;
      await p2.clock.install({ time: new Date(NOW) });
      await p2.route("**/planner/events*", async (route) => { const res = await route.fetch(); const j = await res.json(); await route.fulfill({ response: res, json: { ...j, events: (j.events || []).filter((e) => !baseIds.has(e.id)) } }); });
      await p2.route("**/quest/places", (route) => route.request().method() === "GET" ? route.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "the server said no" }) }) : route.continue());
      await p2.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
      await p2.goto(URL_); await p2.waitForSelector(".ev", { state: "attached" }); await sleep(900);
      const w2 = await p2.evaluate(() => S.autoG.filter((g) => g.kind === "commute" && g.why !== "Home" && g.id.endsWith(":2026-11-26")).map((g) => g.why));
      const bad2 = await p2.evaluate(() => !!document.querySelector("#toast.bad") || /places/i.test(document.querySelector("#toast")?.innerText || ""));
      check(`${label}: places server down: the Location-based suggestions still draw (Home is unknown, so the Home plan too), the name-based one does not, and no error toast`, JSON.stringify(w2) === JSON.stringify(["To Studio hour 1", "To Dentist", "To Dinner at home"]) && !bad2, JSON.stringify(w2));
      await p2.close(); placesFail = false;

      // 3. Accept: a real Commute block of the same times on Joint Plans; the suggestion is gone; its panel works as any Commute
      const dentist = await openGhost("2026-11-26", "To Dentist");
      check(`${label}: the suggestion opens with its why line`, !!dentist && /Suggested by the calendar: To Dentist/.test(flat(await page.evaluate(() => document.querySelector("#pbody").innerText))));
      const before = reqs.filter((u) => CALL.test(u)).length;
      await tap("#pAcc"); await sleep(1500);
      const mk = (await serverEvents()).find((e) => e.title === "Commute" && Date.parse(e.start) === den.s);
      check(`${label}: Accept wrote a Commute block of the same start and end to Joint Plans, kind commute`, !!mk && mk.calId === "joint" && Date.parse(mk.end) === den.e && mk.kind === "commute", JSON.stringify(mk));
      check(`${label}: ...and the suggestion before Dentist is gone`, !(await whys("2026-11-26")).includes("To Dentist") && (await whys("2026-11-26")).length === 2);
      check(`${label}: ...with no Google request made by the Accept itself`, reqs.filter((u) => CALL.test(u)).length === before);
      // open the new block specifically (the 14:30 one) through its key
      const newKey = `e|joint|${mk.id}`;
      await closeSheet(); await goDay("2026-11-26");
      check(`${label}: a real (solid) Commute block now sits in the day`, await page.evaluate((k) => { const el = document.querySelector(`.ev[data-key="${k}"]`); return !!el && !el.classList.contains("ghost") && el.classList.contains("k-commute"); }, newKey));
      await tap(`.ev[data-key="${newKey}"]`); await sleep(600);
      await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); await sleep(600);
      const toRow = flat(await page.evaluate(() => document.querySelector("#cmVto")?.innerText || ""));
      check(`${label}: the new block's panel works: To is the plan after it (Dentist, with its Location)`, /^Dentist 50 King St W, Toronto$/.test(toRow), toRow);
      check(`${label}: ...and only now is Google asked (directions for this block)`, reqs.filter((u) => /commute\/directions/.test(u)).length >= 1);
      const walk = await page.evaluate(() => document.querySelector('#cmBox .chip[data-v="commute"]')?.getAttribute("aria-pressed"));
      check(`${label}: it starts as Walk`, walk === "true", String(walk));
      await closeSheet();

      // 3b. d67: the trip home. Tutoring (away, ends 4 pm) is followed by Dinner at home at 5 pm: 4:00 to 4:30 pm, why "Home"
      const tripH = await homeSugg("2026-11-26");
      check(`${label}: Thursday has one trip home: 30 minutes from when Tutoring ends, before Dinner at home, why "Home"`, tripH.length === 1 && tripH[0].s === Date.parse("2026-11-26T21:00:00Z") && tripH[0].e === Date.parse("2026-11-26T21:30:00Z") && tripH[0].calId === "joint" && tripH[0].title === "Commute", JSON.stringify(tripH));
      await goDay("2026-11-26");
      check(`${label}: ...drawn dashed like the other suggestions`, await page.evaluate((id) => { const el = document.querySelector(`.ev.ghost[data-key="g|joint|${id}"]`); return !!el && getComputedStyle(el).borderTopStyle === "dashed"; }, tripH[0].id));
      const beforeHome = reqs.filter((u) => CALL.test(u)).length;
      await closeSheet(); await goDay("2026-11-26");
      await tap(`.ev[data-key="g|joint|${tripH[0].id}"]`); await sleep(500);
      check(`${label}: opening it says Suggested by the calendar: Home`, /Suggested by the calendar: Home/.test(flat(await page.evaluate(() => document.querySelector("#pbody").innerText))));
      await tap("#pAcc"); await sleep(1500);
      const mkH = (await serverEvents()).find((e) => e.title === "Commute" && Date.parse(e.start) === tripH[0].s);
      check(`${label}: Accept wrote a Commute block of the same times to Joint Plans, and the suggestion is gone`, !!mkH && mkH.calId === "joint" && Date.parse(mkH.end) === tripH[0].e && (await homeSugg("2026-11-26")).length === 0, JSON.stringify(mkH));
      await closeSheet(); await goDay("2026-11-26");
      await tap(`.ev[data-key="e|joint|${mkH.id}"]`); await sleep(600);
      await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); await sleep(600);
      const fromH = flat(await page.evaluate(() => document.querySelector("#cmVfrom")?.innerText || "")), toH = flat(await page.evaluate(() => document.querySelector("#cmVto")?.innerText || ""));
      check(`${label}: the trip home block's panel: From is the place he is leaving (Tutoring's), To is Home`, /7 Hill St, Toronto/.test(fromH) && /^Home\b/.test(toH), fromH + " | " + toH);
      await closeSheet();

      // 4. Skip: hides it, and it stays hidden after a reload
      const choir = await openGhost("2026-11-26", "To Choir");
      check(`${label}: the Choir suggestion opens`, !!choir);
      await tap("#pSkip"); await sleep(600);
      check(`${label}: Skip hides it`, !(await whys("2026-11-26")).includes("To Choir") && /Skipped/.test(await toastText()));
      await load();
      check(`${label}: ...and after a reload it stays hidden (kept in this browser)`, !(await whys("2026-11-26")).includes("To Choir") && (await whys("2026-11-26")).length === 1 && (await whys("2026-11-26"))[0] === "To Studio hour 1");
      check(`${label}: ...the skip is kept with the other suggestions' skips`, await page.evaluate((id) => !!JSON.parse(localStorage.getItem("cal-routine-skip") || "{}")[id], choir.id));

      // 5. the Settings switch
      await openSettings();
      const sw = await page.evaluate(() => { const r = document.querySelector("#cmSuggSw"), o = document.querySelector("#routineSw"); return r ? { on: r.checked, text: r.parentElement.innerText.trim(), below: !!(o.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING), same: o.closest(".field") === r.closest(".field") } : null; });
      check(`${label}: Settings under Daily blocks: "Suggest a Commute block before plans away from home", on by default, below the first switch`, !!sw && sw.on && sw.text === "Suggest a Commute block before plans away from home" && sw.below && sw.same, JSON.stringify(sw));
      const routineBefore = await page.evaluate(() => S.autoG.filter((g) => g.kind !== "commute").length);
      await tap("#cmSuggSw"); await sleep(500);
      const off = await page.evaluate(() => ({ commute: S.autoG.filter((g) => g.kind === "commute").length, others: S.autoG.filter((g) => g.kind !== "commute").length, dom: document.querySelectorAll('.ev.ghost[data-key*="auto:cm"]').length, key: localStorage.getItem("cal-commute-suggest") }));
      check(`${label}: off: no Commute suggestions anywhere, the other suggestions untouched, kept in this browser`, off.commute === 0 && off.dom === 0 && off.others === routineBefore && off.key === "0", JSON.stringify(off));
      await load(); await openSettings();
      check(`${label}: off stays off after a reload`, (await page.evaluate(() => document.querySelector("#cmSuggSw").checked)) === false && (await whys("2026-11-26")).length === 0);
      await tap("#cmSuggSw"); await sleep(500);
      check(`${label}: on again: the suggestions come back`, (await whys("2026-11-26")).join() === "To Studio hour 1" && (await page.evaluate(() => localStorage.getItem("cal-commute-suggest"))) === "1");
      await tap("#routineSw"); await sleep(400);
      check(`${label}: the first switch still governs only its four blocks (Commute suggestions stay)`, (await page.evaluate(() => S.autoG.filter((g) => g.kind !== "commute").length)) === 0 && (await whys("2026-11-26")).length === 1);
      await tap("#routineSw"); await sleep(400);
      await closeSheet();

      // 6. gym sessions: one place for every one, taught once
      check(`${label}: before the gym place is taught there is no suggestion before Gym · Jack Woods`, (await whys("2026-11-27")).length === 0);
      await openReal("Commute", "2026-11-28");
      const label1 = flat(await page.evaluate(() => document.querySelector("#cmRem")?.parentElement.innerText || ""));
      check(`${label}: the Remember switch reads: Remember for every gym session`, label1 === "Remember for every gym session", label1);
      await tap("#cmRem");
      await page.fill("#cmTo", "St. Lawrence"); await sleep(800);
      await tap('#cmSug [data-cm="sug"][data-pid="gp-slm"]'); await sleep(1300);
      check(`${label}: the toast: Remembered for every gym session`, (await toastText()) === "Remembered for every gym session", await toastText());
      let gymRows = (await serverPlaces()).filter((p) => p.list === "for:gym");
      check(`${label}: one row is saved under for:gym, holding the place's address and its name`, gymRows.length === 1 && gymRows[0].address === "93 Front St E, Toronto, ON M5E 1C3" && /^Place: St\. Lawrence Market$/m.test(gymRows[0].notes), JSON.stringify(gymRows));
      await closeSheet();
      const jack = await whys("2026-11-27");
      check(`${label}: now a suggestion shows before Gym · Jack Woods (and any other gym name)`, jack.join() === "To Gym · Jack Woods", JSON.stringify(jack));
      await openReal("Commute", "2026-11-29");
      await tap('#cmBox [data-cm="rowto"]'); await sleep(300);
      const label2 = flat(await page.evaluate(() => document.querySelector("#cmRem")?.parentElement.innerText || ""));
      check(`${label}: the second gym block (To already the taught place) offers the same switch`, label2 === "Remember for every gym session", label2);
      await tap("#cmRem");
      await page.fill("#cmTo", "St. James"); await sleep(800);
      await tap('#cmSug [data-cm="sug"][data-pid="gp-stj"]'); await sleep(1300);
      gymRows = (await serverPlaces()).filter((p) => p.list === "for:gym");
      check(`${label}: a second save replaces the row (still one row, the new place)`, gymRows.length === 1 && gymRows[0].address === "106 King St E, Toronto, ON M5C 1G6" && /Place: St\. James Cathedral/.test(gymRows[0].notes), JSON.stringify(gymRows));
      await closeSheet();
      const jackG = await openGhost("2026-11-27", "To Gym · Jack Woods");
      await tap("#pAcc"); await sleep(1500);
      const gk = (await serverEvents()).find((e) => e.title === "Commute" && jackG && Date.parse(e.start) === jackG.s);
      check(`${label}: accepting it writes a Commute block of the same times on Joint Plans`, !!gk && gk.calId === "joint" && Date.parse(gk.end) === jackG.e, JSON.stringify(gk));
      await closeSheet(); await goDay("2026-11-27"); await tap(`.ev[data-key="e|joint|${gk.id}"]`); await sleep(600);
      await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); await sleep(600);
      const gTo = flat(await page.evaluate(() => document.querySelector("#cmVto")?.innerText || "")), gWalk = await page.evaluate(() => document.querySelector('#cmBox .chip[data-v="commute"]')?.getAttribute("aria-pressed"));
      check(`${label}: the gym block is Walk and its To shows the place's name over its address (listed as that)`, gWalk === "true" && gTo === "St. James Cathedral 106 King St E, Toronto, ON M5C 1G6", gWalk + " | " + gTo);
      if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `commute-suggest-${label}-gym.png`) });
      await closeSheet();
      await goDay("2026-11-26");
      if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `commute-suggest-${label}-day.png`) });
      check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    } finally { server.kill(); }
  }
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
