// The tidy Commute panel (Junyan, 2026-11-25: "36 yes 37 yes ... 39 yes", then "38 yes, 40 yes, 41 yes"), clicked in the test browser at
// computer width (1280) and phone width (390, touch), against the faked dev routes (calendar-dev.mjs) and the Open-Meteo stand-in:
//   the order (Going by, Leave by with the quiet "Checked ... Check again" line, From, To, weather, Heads up, The way there, map buttons),
//   the quiet line (Checking... while it runs, "by itself" for the page's own check, an error right under it), the slim weather row, the folds
//   (The way there closed, Heads up open, a long description only after a tap, real buttons with aria-expanded, the keyboard, repaints that keep
//   them, a new panel that resets them), the quicker row that stays visible, on your route, no Heads up with no alerts, and the d37 message.
// The clock is fixed (Nov 24 2026, 10:00 in Toronto). Not part of `node --test`: it needs playwright-core.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-commute-tidy.e2e.mjs
//   SHOTS=<folder> also saves a screenshot per size.
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
import { stubOpenMeteo } from "../helpers/open-meteo-stub.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8881);
const NOW = "2026-11-24T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const browser = await launchTestBrowser(chromium);

try {
  const sizes = [["computer", { viewport: { width: 1280, height: 860 } }], ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]];
  for (const [label, opts] of sizes) {
    if (process.env.ONLY && process.env.ONLY !== label) continue;
    const phone = label === "phone", port = PORT + (phone ? 1 : 0), base = `http://localhost:${port}`;
    const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(port)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
    await new Promise((ok) => server.stdout.once("data", ok));
    try {
      const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
      const page = await ctx.newPage(); page.setDefaultTimeout(8000);
      await page.clock.install({ time: new Date(NOW) });
      const errors = []; page.on("pageerror", (e) => errors.push(e.message));
      await page.route("https://nominatim.openstreetmap.org/**", (route) => {
        const q = decodeURIComponent(new URL(route.request().url()).searchParams.get("q") || "");
        const at = /nowhere/i.test(q) ? null : /queen/i.test(q) ? { lat: "43.6529", lon: "-79.3849" } : { lat: "43.6495", lon: "-79.4290" };
        route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(at ? [at] : []) });
      });
      const wx = stubOpenMeteo(page);
      await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
      await page.goto(`${base}/still/calendar.html?api=${encodeURIComponent(base)}`); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);
      const dev = (q) => page.evaluate(async ([b, q]) => (await (await fetch(b + "/__dev/directions" + q)).json()), [base, q]);
      const shown = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; }, sel);
      const tap = (sel) => (phone ? page.locator(sel).first().tap() : page.locator(sel).first().click());
      const box = (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height }; }, sel);
      const expanded = (sel) => page.getAttribute(sel, "aria-expanded");
      const bt = async () => flat(await page.evaluate(() => document.querySelector("#cmBox")?.innerText || ""));
      const WAY = '#cmBox [data-cm="fold"][data-v="way"]', HEADS = '#cmBox [data-cm="fold"][data-v="heads"]';
      const openEv = async (title, d) => {
        if (phone && await page.evaluate(() => document.body.classList.contains("popen"))) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); }
        const ok = await page.evaluate(([title, d]) => { const k = C.addDays(today(), d); const ev = eventsFor(k, k).find((e) => e.title === title && C.wall(e.s, S.tz).day === k); if (!ev) return false; panel("event", ev); return true; }, [title, d]);
        await sleep(400); await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); return ok;
      };
      const giveTo = async (text) => { if (await page.locator("#cmTo").count()) { await page.fill("#cmTo", text); await page.press("#cmTo", "Enter"); await sleep(700); } };
      const home = async () => { if (await page.locator("#cmHomeIn").count()) { await page.fill("#cmHomeIn", "100 Queen St W, Toronto"); await page.click('[data-cm="home"]'); await sleep(700); } };

      // ---- a Transit trip with directions ----
      check(`${label}: Transit (tomorrow) opens`, await openEv("Transit", 1)); await home(); await giveTo("Gladstone Hotel, Toronto");
      await page.waitForSelector("#cmBox .cmleave .big", { timeout: 8000 }); await page.waitForFunction(() => /\d+° · /.test(document.querySelector("#cmWx")?.innerText || ""), null, { timeout: 8000 });
      await sleep(300);
      let t = await bt();
      const order = ['#cmBox [data-cm="mode"]', "#cmBox .cmleave", '#cmBox [data-cm="rowfrom"]', '#cmBox [data-cm="rowto"]', "#cmWx", "#cmHeads", "#cmWay", "#cmLinks", "#cmBox .cmfile"];
      const tops = []; for (const sel of order) tops.push((await box(sel))?.top ?? null);
      check(`${label}: the order is Going by, Leave by, From, To, weather, Heads up, The way there, map buttons, photos`, tops.every((v, i) => v != null && (i === 0 || v > tops[i - 1])), JSON.stringify(tops));
      check(`${label}: the blue banner and the big Check now button are gone`, await page.locator(".cmchk").count() === 0 && !/Checked just now|Check now|Last checked/i.test(t) && await page.locator('#cmBox button.btn[data-cm="check"]').count() === 0, t.slice(0, 200));
      check(`${label}: Leave by shows the big time and the Arrive line, and under it one quiet line "Checked <time> · Check again"`,
        /Leave by \d{1,2}(:\d{2})? (am|pm) Arrive .*Checked \d{1,2}(:\d{2})? (am|pm) · Check again/i.test(flat(await page.evaluate(() => document.querySelector("#cmBox .cmleave").innerText))), flat(await page.evaluate(() => document.querySelector("#cmBox .cmleave").innerText)));
      check(`${label}: the quiet line is small, and Check again is a link-style button inside it`, await page.evaluate(() => { const l = document.querySelector("#cmBox .cmchecked"), b = l.querySelector("button.cmlink"); return parseFloat(getComputedStyle(l).fontSize) <= 13 && !!b && getComputedStyle(b).textDecorationLine.includes("underline"); }));
      check(`${label}: the sentence about checking once in the hour before leaving is not text, only the button's tooltip`, !/While this panel is open/.test(t) && /once in the hour before you leave/.test(await page.getAttribute('#cmBox [data-cm="check"]', "title")));

      // weather: one slim row, the tip as a second small line
      const wbox = await box("#cmWx");
      check(`${label}: weather is one slim row with a second small line for the tip`, wbox.h < 100 && /^\S* ?3° · light rain feels like 0° when you leave Bring an umbrella\./.test(flat(await page.evaluate(() => document.querySelector("#cmWx").innerText))) && (await box("#cmWx .wxtip")).top >= (await box("#cmWx .wxl")).bottom - 1, JSON.stringify(wbox));

      // folds at their start
      check(`${label}: Heads up is open at first, headed "Heads up · 2", with both alert titles and a button with aria-expanded=true`, await expanded(HEADS) === "true" && /Heads up · 2/.test(await page.innerText(HEADS)) && /Line 1: trains move slower/.test(t) && /Snow from 1 pm/.test(t));
      check(`${label}: The way there is closed at first: aria-expanded=false, header with minutes, no steps showing`, await expanded(WAY) === "false" && /The way there · 34 min/.test(await page.innerText(WAY)) && !(await shown("#cmBox .cmsteps")) && !/Walk to Dev Station North/.test(t));
      check(`${label}: both folds are real buttons`, await page.evaluate(() => [...document.querySelectorAll('#cmBox [data-cm="fold"]')].every((b) => b.tagName === "BUTTON" && b.type === "button" && b.hasAttribute("aria-expanded") && !!document.getElementById(b.getAttribute("aria-controls")))));
      // a long description stays hidden until that alert is tapped
      const TOG = '#cmBox [data-cm="alert"]';
      check(`${label}: an alert shows its title and one short line; its long description is hidden`, await page.locator(TOG).count() === 1 && /Tap for details/.test(await page.innerText(TOG)) && !(await shown("#cmBox .cmadet")) && !/Trains run every 8 minutes/.test(t));
      check(`${label}: a short description (Snow) is shown as its line, with nothing to tap`, /Roads and sidewalks may be slippery\./.test(t));
      await tap(TOG); await sleep(150);
      check(`${label}: tapping the alert shows the whole description as given`, await expanded(TOG) === "true" && flat(await page.evaluate(() => document.querySelector("#cmBox .cmadet").innerText)) === "Reduced speed zone, Dev Station North to Dev Junction. Trains run every 8 minutes instead of every 4 while crews repair the track near the junction.");
      await tap(TOG); await sleep(100);
      check(`${label}: tapping again hides it`, await expanded(TOG) === "false" && !(await shown("#cmBox .cmadet")));
      // keyboard: Enter and Space on a focused fold
      await page.focus(WAY); await page.keyboard.press("Enter"); await sleep(100);
      const openedByEnter = await expanded(WAY) === "true" && await shown("#cmBox .cmsteps");
      await page.keyboard.press("Space"); await sleep(100);
      check(`${label}: the keyboard works on a fold (Enter opens The way there, Space closes it)`, openedByEnter && await expanded(WAY) === "false");
      await tap(WAY); await sleep(150);
      t = await bt();
      check(`${label}: tapping The way there shows the same steps as before`, await expanded(WAY) === "true" && /Walk to Dev Station North/.test(t) && /Line 1 Dev Line toward Union/.test(t) && /5 stops/.test(t) && /3 min wait before it/.test(t) && /Walk to Dev Studio/.test(t));
      await tap(HEADS); await sleep(100);
      check(`${label}: Heads up can be closed; the alerts hide`, await expanded(HEADS) === "false" && !(await shown("#cmHeads .cmalert")));

      // repaints keep what he did
      const states = () => page.evaluate(() => [document.querySelector('[data-v="way"]')?.getAttribute("aria-expanded"), document.querySelector('[data-v="heads"]')?.getAttribute("aria-expanded")].join());
      await page.focus(WAY);
      await page.evaluate(() => cmPaint()); await sleep(100);
      check(`${label}: a plain repaint keeps the way open and Heads up closed, and keeps focus on the fold`, await states() === "true,false" && await page.evaluate(() => document.activeElement?.getAttribute("data-v") === "way"), await states());
      await dev("?next=1");
      await page.route("**/quest/commute/directions", async (r) => { await sleep(900); r.continue(); });
      await tap('#cmBox [data-cm="check"]'); await sleep(250);
      check(`${label}: while it checks, the link says Checking… and is disabled`, /Checked [\d:]+ (am|pm) · Checking…/.test(flat(await page.evaluate(() => document.querySelector("#cmBox .cmchecked").innerText))) && await page.locator('#cmBox [data-cm="check"]').isDisabled());
      check(`${label}: and the folds stay as they were through that repaint`, await states() === "true,false");
      await sleep(1100); await page.unroute("**/quest/commute/directions"); await sleep(300);
      t = await bt();
      check(`${label}: after the check: Checked <time> · Check again, 6 min earlier on the Leave by, folds unchanged`, /Checked \d{1,2}(:\d{2})? (am|pm) · Check again/.test(t) && /6 min earlier/.test(t) && !/Checked just now/.test(t) && await states() === "true,false", await states());
      check(`${label}: the quicker row is visible even with Heads up closed (and is not inside the fold)`, await shown("#cmBox .cmquick") && /Drive is quicker right now/.test(t) && await page.evaluate(() => !document.querySelector("#cmHeads").contains(document.querySelector(".cmquick"))));
      await tap(HEADS); await sleep(100);
      t = await bt();
      check(`${label}: Heads up reopened keeps its groups: New since, Still on, Cleared`, /Heads up · 2/.test(await page.innerText(HEADS)) && /New since \d{1,2}(:\d{2})? (am|pm)/i.test(t) && /Still on/i.test(t) && /Cleared/i.test(t) && /Line 2: delays of about 5 minutes/.test(t));
      // way change: Drive (closures, on your route)
      await tap('#cmBox [data-cm="mode"][data-v="drive"]'); await sleep(900);
      await page.waitForSelector("#cmHeads", { timeout: 4000 });
      t = await bt();
      check(`${label}: after switching the way the folds are as he left them (the way open, Heads up open)`, await states() === "true,true" && /The way there · 27 min · 8\.1 km/.test(t) && /Dev Avenue/.test(t), await states());
      const alertTexts = await page.evaluate(() => [...document.querySelectorAll("#cmHeads .cmalert")].map((a) => a.innerText.replace(/\s+/g, " ").trim()));
      const onTest = alertTexts.find((x) => /Test Street is closed/.test(x)) || "", onElse = alertTexts.find((x) => /Elsewhere Road is closed/.test(x)) || "";
      check(`${label}: "on your route" shows for a closure on a road of the drive, with Until, and not for another street`, /On your route · Until Nov 27/.test(onTest) && /Until Dec 2/.test(onElse) && !/On your route/.test(onElse), JSON.stringify(alertTexts));
      check(`${label}: a closure's long description waits behind a tap`, !/Water main repair/.test(onTest) && await page.locator('#cmBox [data-cm="alert"]').count() >= 2);
      if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `tidy-${label}-drive.png`) });
      await tap('#cmBox [data-cm="mode"][data-v="transit"]'); await sleep(900);

      // a failed re-check shows its error right under the quiet line
      await page.route("**/quest/commute/directions", (r) => r.abort());
      await tap('#cmBox [data-cm="check"]'); await sleep(500);
      const errBox = await page.evaluate(() => { const a = document.querySelector('#cmBox .cmleave [role="alert"]'), l = document.querySelector("#cmBox .cmchecked"); return a ? { text: a.innerText, below: a.getBoundingClientRect().top >= l.getBoundingClientRect().bottom - 1 } : null; });
      check(`${label}: a failed re-check shows its error (role=alert) right under the quiet line, and the link works again`, !!errBox && /Directions could not be loaded/.test(errBox.text) && errBox.below && !(await page.locator('#cmBox [data-cm="check"]').isDisabled()), JSON.stringify(errBox));
      await page.unroute("**/quest/commute/directions");

      // a panel that opens again starts over
      if (phone) { await page.evaluate(() => document.querySelector("#scrim").click()); await sleep(400); } else await page.evaluate(() => panel("now"));
      await openEv("Transit", 1); await page.waitForSelector("#cmBox .cmleave .big", { timeout: 8000 });
      check(`${label}: closing the panel and opening it again: The way there closed, Heads up open`, await states() === "false,true", await states());
      // another block: also starts over
      await tap(WAY);
      await openEv("Bus to studio", 1); await giveTo("Gladstone Hotel, Toronto"); await page.waitForSelector("#cmBox .cmleave .big", { timeout: 8000 }).catch(() => {});
      check(`${label}: another block opens with The way there closed too`, await expanded(WAY) === "false");

      // no alerts, nothing down: no Heads up block at all
      await dev("?state=quiet"); await dev("?reset=1"); await dev("?state=quiet");
      await openEv("Bus to studio", 1); await page.evaluate(() => { const ev = S.ev; delete CM.dir[keyOf(ev)]; cmDirections(ev); }); await page.waitForSelector("#cmBox .cmleave .big", { timeout: 8000 }); await sleep(300);
      t = await bt();
      check(`${label}: with no alerts and nothing down there is no Heads up block, and the way there still shows`, await page.locator("#cmHeads").count() === 0 && !/Heads up|No alerts on this trip/.test(t) && await page.locator("#cmWay").count() === 1);

      // d37: no route
      await dev("?reset=1"); await dev("?state=noroute");
      await openEv("Bus to studio", 1); await page.evaluate(() => { const ev = S.ev; delete CM.dir[keyOf(ev)]; cmDirections(ev); }); await sleep(900);
      await page.waitForSelector("#cmNoRoute", { timeout: 6000 });
      t = await bt();
      check(`${label}: no route and the To has a pin: "Google found no route." stays`, flat(await page.innerText("#cmNoRoute")) === "Google found no route.", flat(await page.innerText("#cmNoRoute")));
      check(`${label}: with no route the quiet Checked line still shows and there is no Leave by block`, /Checked \d{1,2}(:\d{2})? (am|pm) · Check again/.test(t) && await page.locator("#cmBox .cmleave .big").count() === 0 && !/Leave by/.test(t));
      await tap('#cmBox [data-cm="rowto"]'); await page.fill("#cmTo", 'Nowhere <b>Studio</b> 509A'); await page.press("#cmTo", "Enter"); await sleep(1200);
      await page.waitForFunction(() => /cannot find/.test(document.querySelector("#cmNoRoute")?.innerText || ""), null, { timeout: 6000 }).catch(() => {});
      const nr = flat(await page.innerText("#cmNoRoute").catch(() => ""));
      check(`${label}: no route and no pin for the To: Google cannot find "TEXT". Tap To and pick the real place. (escaped, no markup made)`, nr === 'Google cannot find "Nowhere <b>Studio</b> 509A". Tap To and pick the real place.' && await page.locator("#cmNoRoute b").count() === 0, nr);
      await tap('#cmBox [data-cm="rowto"]'); await page.fill("#cmTo", "Gladstone Hotel, Toronto"); await page.press("#cmTo", "Enter"); await sleep(1200);
      await page.waitForSelector("#cmNoRoute", { timeout: 6000 }); await sleep(600);
      check(`${label}: picking a real place brings back "Google found no route."`, flat(await page.innerText("#cmNoRoute")) === "Google found no route.", flat(await page.innerText("#cmNoRoute")));
      // the page's own check says "by itself"
      await dev("?reset=1");
      await openEv("Transit", 1); await page.evaluate(() => { const ev = S.ev; delete CM.dir[keyOf(ev)]; cmDirections(ev); }); await page.waitForSelector("#cmBox .cmleave .big", { timeout: 8000 });
      const calls0 = (await dev("")).calls.length;
      await page.clock.fastForward("22:30:00"); await sleep(1200);
      t = await bt();
      check(`${label}: the page's own check in the hour before leaving reads "Checked by itself <time> · Check again"`, /Checked by itself \d{1,2}(:\d{2})? (am|pm) · Check again/.test(t) && (await dev("")).calls.length > calls0, t.slice(0, 160));

      if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `tidy-${label}.png`) });
      check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    } finally { server.kill(); }
  }
  const bad = results.filter((r) => !r.ok); console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`); process.exitCode = bad.length ? 1 : 0;
} finally { await browser.close(); }
