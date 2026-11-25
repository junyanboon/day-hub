// Taking a kept place off Saved places (Junyan, 2026-11-25, d34: "34 yes"): the Edit link, the x, Done, the toasts, the failure.
// Clicks every control this change adds in the test browser at computer and phone widths, against the faked dev routes
// (calendar-dev.mjs, in memory). The clock is fixed, so no test reads the real one. Not part of `node --test`: it needs playwright-core.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-saved-remove.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
import { stubOpenMeteo } from "../helpers/open-meteo-stub.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8871), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const NOW = "2026-11-24T15:00:00Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const browser = await launchTestBrowser(chromium);

try {
  const sizes = [
    ["computer", { viewport: { width: 1280, height: 860 } }],
    ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ];
  for (const [label, opts] of sizes) {
    if (process.env.ONLY && process.env.ONLY !== label) continue;
    const phone = label === "phone";
    const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, DEV_NOW: NOW, TZ: "America/Toronto" } });
    await new Promise((ok) => server.stdout.once("data", ok));
    const ctx = await browser.newContext({ ...opts, timezoneId: "America/Toronto" });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    await page.clock.install({ time: new Date(NOW) });
    const errors = [], routeWrites = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => { if (/\/quest\/commute\/route$/.test(r.url()) && r.method() === "POST") routeWrites.push(r.postData()); });
    await page.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([{ lat: "43.6529", lon: "-79.3849" }]) }));
    stubOpenMeteo(page);
    await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); });
    await page.goto(URL_); await page.waitForSelector(".ev", { state: "attached" }); await sleep(500);

    const put = (place) => page.evaluate(async ([b, place]) => (await (await fetch(b + "/quest/places", { method: "POST", headers: { "X-Quest-Key": "test", "content-type": "application/json" }, body: JSON.stringify({ op: "put", place }) })).json()).place, [BASE, place]);
    const onServer = () => page.evaluate(async (b) => (await (await fetch(b + "/quest/places", { headers: { "X-Quest-Key": "test" } })).json()).places.map((p) => p.name), BASE);
    const tap = async (sel) => {
      if (!phone) { await page.click(sel); await sleep(300); return; }
      const r = await page.locator(sel).first().boundingBox(), [x, y] = [r.x + r.width / 2, r.y + r.height / 2];
      await page.touchscreen.tap(x, y); await sleep(300);
    };
    const chips = () => page.evaluate(() => [...document.querySelectorAll("#cmBox .cmask .chips > .chip")].map((c) => (c.querySelector("span") ? c.querySelector("span").textContent : c.textContent).trim()));
    const xs = () => page.evaluate(() => [...document.querySelectorAll("#cmBox .cmx")].map((b) => b.getAttribute("aria-label")));
    const edit = () => page.evaluate(() => { const b = document.querySelector('#cmBox [data-cm="rmmode"]'); return b ? b.textContent.trim() : null; });
    const text = (sel) => page.evaluate((s) => (document.querySelector(s)?.innerText || "").replace(/\s+/g, " ").trim(), sel);
    const toastNow = () => page.evaluate(() => { const t = document.querySelector("#toast"); return t.classList.contains("on") ? t.textContent : ""; });
    const open = async () => {
      for (let i = 0; i < 6; i++) {
        const el = page.locator('.ev:has-text("Transit")').first();
        if (await el.count() && await el.isVisible()) { await el.click(); await sleep(400); await page.waitForFunction(() => !/Looking up/.test(document.querySelector("#cmBox")?.innerText || "x"), null, { timeout: 5000 }).catch(() => {}); return true; }
        await page.click("#next"); await sleep(300);
      }
      return false;
    };

    // three kept places and one Trips place on the server before the page first loads its places
    await put({ name: "Saigon Lotus", address: "1 Queen St W, Toronto", lat: 43.6529, lng: -79.3849, category: "saved", savedBy: "Calendar", list: "" });
    await put({ name: "Cafe Nero", address: "2 King St W, Toronto", lat: 43.6489, lng: -79.3815, category: "saved", savedBy: "Calendar", list: "" });
    await put({ name: "Pho Pasteur", address: "3 Dundas St W, Toronto", lat: 43.6560, lng: -79.3800, category: "saved", savedBy: "Calendar", list: "" });
    await put({ name: "Mount Royal Lookout", address: "Montreal", lat: 45.5, lng: -73.59, category: "place", trip: "Montreal Birthday", savedBy: "Junyan", list: "" });
    check(`${label}: Transit opens`, await open());
    await page.fill("#cmHomeIn", "100 Queen St W, Toronto"); await page.click('[data-cm="home"]'); await sleep(800);

    // From: Edit is there, off by default; chips pick as before
    await tap('#cmBox [data-cm="rowfrom"]');
    check(`${label}: the From box has Saved places with the link Edit beside it, and no x yet`, await edit() === "Edit" && (await xs()).length === 0 && /Saved places\s*Edit/i.test(await text("#cmFromAsk")), String(await edit()));
    const ch = await chips();
    check(`${label}: chips are Home, the kept places, then the Trips place`, JSON.stringify(ch) === JSON.stringify(["Home", "Saigon Lotus", "Cafe Nero", "Pho Pasteur", "Mount Royal Lookout"]), JSON.stringify(ch));
    await tap('#cmFromAsk .chip:has-text("Cafe Nero")'); await sleep(600);
    check(`${label}: outside remove mode a chip still picks (From reads Cafe Nero)`, /Cafe Nero/.test(await text("#cmVfrom")), await text("#cmVfrom"));

    // To: pick Saigon Lotus as the To of this block
    await tap('#cmBox [data-cm="rowto"]');
    await page.waitForSelector("#cmTo");
    await tap('#cmAsk .chip:has-text("Saigon Lotus")'); await sleep(700);
    check(`${label}: the To reads Saigon Lotus`, /Saigon Lotus/.test(await text("#cmVto")), await text("#cmVto"));
    const writesBefore = routeWrites.length;

    // open the To box again and turn on the remove mode
    await tap('#cmBox [data-cm="rowto"]'); await page.waitForSelector("#cmTo");
    check(`${label}: it is off every time the box opens (reads Edit, no x)`, await edit() === "Edit" && (await xs()).length === 0);
    await tap('#cmBox [data-cm="rmmode"]');
    check(`${label}: Edit turns into Done`, await edit() === "Done");
    const labels = await xs();
    check(`${label}: an x on each kept place only, each with its own name`, JSON.stringify(labels) === JSON.stringify(["Remove Saigon Lotus from Saved places", "Remove Cafe Nero from Saved places", "Remove Pho Pasteur from Saved places"]), JSON.stringify(labels));
    check(`${label}: Home and the Trips place have no x`, !labels.some((l) => /Home|Mount Royal/.test(l)) && (await chips()).includes("Home") && (await chips()).includes("Mount Royal Lookout"));
    const size = await page.evaluate(() => { const bs = [...document.querySelectorAll("#cmBox .cmx")].map((b) => b.getBoundingClientRect()); const e = document.querySelector('#cmBox [data-cm="rmmode"]').getBoundingClientRect(); const gaps = bs.slice(1).map((r, i) => Math.round(Math.min(Math.abs(r.top - bs[i].bottom), Math.abs(r.left - bs[i].right)))); return { min: Math.min(...bs.map((r) => Math.min(r.width, r.height))), edit: e.height, gaps }; });
    check(`${label}: each x is at least 32 px square and the Edit link at least 32 px tall`, size.min >= 32 && size.edit >= 32, JSON.stringify(size));

    // a tap on a name does nothing in the mode
    await tap('#cmAsk .chip.rm:has-text("Pho Pasteur") > span'); await sleep(500);
    check(`${label}: tapping a name in remove mode picks nothing (no route write, box still open, To unchanged)`, routeWrites.length === writesBefore && await page.locator("#cmTo").count() === 1 && await edit() === "Done");
    await tap('#cmAsk .chip.off'); await sleep(300);
    check(`${label}: tapping Home or a Trips place in remove mode picks nothing either`, routeWrites.length === writesBefore && await page.locator("#cmTo").count() === 1);

    // removal keeps what he typed and the box open
    await page.focus("#cmTo"); await page.keyboard.type("Qu", { delay: 20 }); await sleep(100);
    await tap('[data-cm="rmplace"][aria-label="Remove Saigon Lotus from Saved places"]'); await sleep(500);
    check(`${label}: x on Saigon Lotus: the chip is gone, the box stays open, the typed text stays`, !(await chips()).includes("Saigon Lotus") && await page.locator("#cmTo").count() === 1 && await page.inputValue("#cmTo") === "Qu", JSON.stringify(await chips()));
    check(`${label}: and the toast says Removed from Saved places`, /Removed from Saved places/.test(await toastNow()), await toastNow());
    check(`${label}: still in remove mode (Done), the other two keep their x`, await edit() === "Done" && (await xs()).length === 2);
    check(`${label}: the place is gone from the server, Home and the Trips place are still there`, !(await onServer()).includes("Saigon Lotus") && (await onServer()).includes("Mount Royal Lookout") && (await onServer()).includes("Home"), JSON.stringify(await onServer()));
    check(`${label}: no route write happened (a block's From and To are not touched)`, routeWrites.length === writesBefore);

    // a failed removal
    await page.route(BASE + "/quest/places", (route) => route.request().method() === "POST" ? route.abort() : route.continue());
    await tap('[data-cm="rmplace"][aria-label="Remove Cafe Nero from Saved places"]'); await sleep(500);
    check(`${label}: a failed removal: the chip stays and the toast says Not removed. Try again in a moment.`, (await chips()).includes("Cafe Nero") && /^Not removed\. Try again in a moment\.$/.test(await toastNow()), await toastNow());
    check(`${label}: and the place is still on the server`, (await onServer()).includes("Cafe Nero"));
    await page.unroute(BASE + "/quest/places");

    // Done, Cancel and reopening turn the mode off
    await tap('#cmBox [data-cm="rmmode"]');
    check(`${label}: Done turns the x marks off and the chips pick again`, await edit() === "Edit" && (await xs()).length === 0 && await page.locator('#cmAsk .chip[data-cm="pickto"]').count() === 4);
    await tap('#cmBox [data-cm="rmmode"]'); await tap('#cmBox [data-cm="cancel"]');
    check(`${label}: Cancel closes the box`, await page.locator("#cmTo").count() === 0);
    await tap('#cmBox [data-cm="rowto"]'); await page.waitForSelector("#cmTo");
    check(`${label}: reopened, the mode is off`, await edit() === "Edit" && (await xs()).length === 0);
    await tap('#cmBox [data-cm="rmmode"]'); await tap('#cmBox [data-cm="cancel"]'); await tap('#cmBox [data-cm="rowfrom"]'); await page.waitForSelector("#cmFromIn");
    check(`${label}: and the From box opens with it off too`, await edit() === "Edit" && (await xs()).length === 0);

    // the block keeps its own To and From after the place is removed
    check(`${label}: the block's To still reads Saigon Lotus though the place is gone`, await (async () => { await tap('#cmBox [data-cm="cancelfrom"]'); return /Saigon Lotus/.test(await text("#cmVto")) && /Cafe Nero/.test(await text("#cmVfrom")); })(), `${await text("#cmVto")} | ${await text("#cmVfrom")}`);

    // remove the rest: the Edit link goes when nothing can be removed
    await tap('#cmBox [data-cm="rowto"]'); await page.waitForSelector("#cmTo"); await tap('#cmBox [data-cm="rmmode"]');
    await tap('[data-cm="rmplace"][aria-label="Remove Cafe Nero from Saved places"]'); await sleep(400);
    await tap('[data-cm="rmplace"][aria-label="Remove Pho Pasteur from Saved places"]'); await sleep(400);
    check(`${label}: with no kept place left the Edit link is gone, the mode is off and Home and the Trips place pick`, await edit() === null && (await xs()).length === 0 && JSON.stringify(await chips()) === JSON.stringify(["Home", "Mount Royal Lookout"]) && await page.locator('#cmAsk .chip[data-cm="pickto"]').count() === 2, JSON.stringify(await chips()));
    check(`${label}: the server holds no kept place and the Trips place is untouched`, JSON.stringify((await onServer()).filter((n) => n !== "Home")) === JSON.stringify(["Mount Royal Lookout"]), JSON.stringify(await onServer()));
    check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
    await ctx.close(); server.kill();
  }
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
