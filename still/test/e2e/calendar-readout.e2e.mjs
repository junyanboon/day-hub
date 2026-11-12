// The hidden readout on the calendar (Junyan, 2026-11-12, d18: "18 yes"; d17: "17 doesn't hold"). On his iPhone the
// Home Screen app still changed the day on an up/down scroll after PR 130, though a Safari tab did not. The readout
// shows which copy is running and logs every day change with what caused it, so a screenshot from his phone says why.
// Not part of `node --test`: it needs playwright-core and Google Chrome.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-readout.e2e.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8802), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const BUILD = fs.readFileSync(path.join(here, "../../calendar.html"), "utf8").match(/const BUILD = "([^"]+)"/)?.[1] || "(no BUILD in calendar.html)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const scripts = []; page.on("request", (r) => { if (r.url().includes("calendar-readout")) scripts.push(r.url()); });
  const cdp = await ctx.newCDPSession(page);
  async function drag(x0, y0, x1, y1, ms = 350, steps = 14) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await sleep(ms / steps);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(900);
  }
  /** Tap the middle of an element with a finger (Playwright's own tap waits on a "visible" check the title fails). */
  const tapEl = async (sel) => { const b = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); await page.touchscreen.tap(b.x, b.y); };
  const taps = async (n) => { for (let i = 0; i < n; i++) { await tapEl("#title"); await sleep(120); } await sleep(400); };
  const box = () => page.evaluate(() => { const b = document.querySelector("#readout"); return b && !b.hidden ? b.innerText : null; });

  await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", "1"); });
  await page.goto(URL_);
  await page.waitForSelector(".ev");
  await sleep(600);

  /* ---- off by default, and costs nothing: no box, and its script is not even fetched ---- */
  check("off by default: no readout box", (await box()) === null);
  check("off by default: the readout script is not loaded", scripts.length === 0, scripts.join(" "));

  /* ---- four taps do nothing; five quick taps on the month name open it ---- */
  await taps(4);
  check("four taps on the month name do not open it", (await box()) === null);
  await sleep(2500);   // the four taps go stale
  await taps(5);
  let text = await box();
  check("five quick taps on the month name open the readout", text !== null);
  check("the readout shows this build's id", !!text && text.includes(BUILD), BUILD);
  check("the readout shows TOUCH, standalone and the service worker", !!text && /TOUCH true/.test(text) && /standalone/.test(text) && /sw /.test(text), (text || "").split("\n").slice(0, 4).join(" / "));
  check("the readout shows the geometry lines", !!text && /inner 390x844/.test(text) && /safe t/.test(text) && /\.bar/.test(text) && /\.dhead/.test(text));
  check("opening it leaves the month picker closed", !(await page.evaluate(() => document.body.classList.contains("month"))));
  const rect = await page.evaluate(() => ({ box: document.querySelector("#readout").getBoundingClientRect().top, bar: document.querySelector(".bar").getBoundingClientRect().bottom }));
  check("the box does not cover the header", rect.box >= rect.bar, JSON.stringify(rect));

  /* ---- a day change logs the old day, the new day and what caused it ---- */
  const d0 = await page.evaluate(() => S.cur);
  await page.evaluate(() => document.querySelector("#next").click());   // the arrow (hidden at phone width)
  await sleep(500);
  const d1 = await page.evaluate(() => S.cur);
  text = await box();
  check("an arrow press logs the day change with step as the cause", !!text && text.includes(`DAY ${d0}>${d1}`) && /DAY [^\n]*step/.test(text), (text || "").split("\n").find((l) => l.includes("DAY")) || "");
  await page.evaluate(() => document.querySelector("#todayBtn").click());
  await sleep(500);
  text = await box();
  check("the Today button logs goToday as the cause", !!text && /DAY [^\n]*goToday/.test(text));
  const y = 260;   // above the readout box, which takes the lower half
  await drag(330, y, 60, y + 4);
  text = await box();
  check("a swipe logs its lock decision", !!text && /LOCK [^\n]*x/.test(text), (text || "").split("\n").slice(-12).join(" / "));
  check("a swipe's day change names the swipe end", !!text && /DAY [^\n]*swipeEnd/.test(text), (text || "").split("\n").find((l) => l.includes("DAY")) || "");
  await drag(200, 440, 202, 140);
  text = await box();
  check("an up/down drag logs a y lock and scroll lines", !!text && /LOCK [^\n]*y/.test(text) && /SC /.test(text));

  /* ---- Pause freezes the log; five taps close it ---- */
  await tapEl("#readoutPause");
  const frozen = await page.evaluate(() => document.querySelector("#readoutLog").innerText);
  await page.evaluate(() => document.querySelector("#next").click());
  await sleep(500);
  check("Pause freezes the log", (await page.evaluate(() => document.querySelector("#readoutLog").innerText)) === frozen);
  await tapEl("#readoutPause");
  await sleep(2500);
  await taps(5);
  check("five more taps close it", (await box()) === null);
  await taps(5);
  check("five taps open it again", (await box()) !== null);
  await tapEl("#readoutClose");
  await sleep(200);
  check("the close button closes it", (await box()) === null);
  check("no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
} finally {
  await browser.close(); server.kill();
}
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} pass, ${bad} fail`);
process.exit(bad ? 1 : 0);
