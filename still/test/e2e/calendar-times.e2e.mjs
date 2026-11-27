// The computer panel's Starts and Ends (Junyan, 2026-11-27, d6: "6 yes"): change start and end on an ordinary event and on an
// overnight block, Save, the block moves; Length and Ends stay in step; Starts moves the end with it. Desktop width.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-times.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
import { serverReady } from "../helpers/dev-server.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8830), BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const hm = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] }); await serverReady(server);
const browser = await launchTestBrowser(chromium);
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "America/Toronto" }), page = await ctx.newPage(), errors = [], sent = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (/\/planner\/event(\?|$)/.test(r.url()) && r.method() === "PATCH") sent.push(JSON.parse(r.postData() || "{}")); });
  await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", "3"); });
  await page.goto(`${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`); await page.waitForSelector(".ev"); await sleep(600);
  const openEv = async (title, d) => { const ok = await page.evaluate(([title, d]) => { const k = C.addDays(today(), d); const ev = eventsFor(k, k).find((e) => e.title === title && !e.allDay && C.wall(e.s, S.tz).day === k); if (ev) panel("event", ev); return !!ev; }, [title, d]); await sleep(400); return ok; };
  const vals = () => page.evaluate(() => [document.querySelector("#pStart")?.value, document.querySelector("#pEnd")?.value, document.querySelector(".lenrow")?.innerText.replace(/\s+/g, " ")]);
  const setT = async (sel, v) => { await page.fill(sel, v); await page.dispatchEvent(sel, "change"); await sleep(200); };

  check("Work block opens in the computer panel (no sheet)", await openEv("Work block", 2) && await page.evaluate(() => !document.querySelector(".sheet") && !!document.querySelector("#pStart")));
  const labels = await page.evaluate(() => [...document.querySelectorAll("#pbody .field > .lbl")].map((x) => x.textContent));
  check("labels run Location, Starts, Ends, Length, Calendar", labels.join() === "Location,Starts,Ends,Length,Calendar", labels.join());
  const rowsOneLine = await page.evaluate(() => ["#pStart", "#pEnd"].every((s) => { const f = document.querySelector(s).closest(".field"), l = f.querySelector("label").getBoundingClientRect(), i = document.querySelector(s).getBoundingClientRect(); return Math.abs((l.top + l.height / 2) - (i.top + i.height / 2)) < 12; }));
  check("Starts and Ends are one line each", rowsOneLine);
  await page.screenshot({ path: process.env.SHOT || "/tmp/times.png", clip: { x: 880, y: 0, width: 400, height: 900 }, scale: "css" }).catch(() => {});
  let v = await vals();
  check("opens at 9:30 to 11:00, 1h 30m", v[0] === "09:30" && v[1] === "11:00" && /1 h 30|1h 30|1:30|90/.test(v[2]), v.join(" | "));
  await setT("#pStart", "10:00"); v = await vals();
  check("Starts 10:00 moves Ends with it (11:30), length stays", v[0] === "10:00" && v[1] === "11:30" && /ends 11:30 am/.test(v[2]), v.join(" | "));
  await setT("#pEnd", "12:00"); v = await vals();
  check("Ends 12:00 makes it 2 hours", v[1] === "12:00" && /ends 12 pm/.test(v[2]), v.join(" | "));
  await page.click('[data-lenstep="1"]'); v = await vals();
  check("Length + moves Ends to 12:15", v[1] === "12:15" && /ends 12:15 pm/.test(v[2]), v.join(" | "));
  await page.click("#pSave"); await sleep(700);
  let p = sent.at(-1);
  check("Save sent 10:00 to 12:15", !!p && hm(p.start) === "10:00" && hm(p.end) === "12:15", JSON.stringify(p));
  const moved = await page.evaluate((id) => { const k = C.wall(Date.now() + 2 * 86400000, S.tz).day; const e = eventsFor(k, k).find((e) => e.id === id); return e ? [C.wall(e.s, S.tz).min, C.wall(e.e, S.tz).min] : null; }, p.id);
  check("the block is now at 10:00 to 12:15", !!moved && moved[0] === 600 && moved[1] === 735, JSON.stringify(moved));

  /* overnight: an ordinary block set to 11 pm to 7 am (Sleep's shape) */
  await openEv("Close Scotia account", 2);
  await setT("#pStart", "23:00"); await setT("#pEnd", "07:00"); v = await vals();
  check("Ends earlier than Starts reads as next day: 8 h, ends 7:00 am", v[0] === "23:00" && v[1] === "07:00" && /8 h|8h/.test(v[2]) && /ends 7 am/.test(v[2]), v.join(" | "));
  await page.click("#pSave"); await sleep(700); p = sent.at(-1);
  const hours = p ? (Date.parse(p.end) - Date.parse(p.start)) / 3600000 : 0;
  check("Save sent 23:00 to 07:00 the next day (8 hours)", !!p && hm(p.start) === "23:00" && hm(p.end) === "07:00" && hours === 8, JSON.stringify(p));
  /* and the saved overnight block opens right, a start change keeps its 8 hours */
  await page.evaluate(() => { const k = C.addDays(today(), 2); const e = eventsFor(k, k).find((e) => e.title === "Close Scotia account"); panel("event", e); });
  await sleep(400); v = await vals();
  check("reopened: 23:00 to 07:00, 8 h", v[0] === "23:00" && v[1] === "07:00" && /8 h|8h/.test(v[2]), v.join(" | "));
  await setT("#pStart", "22:00"); v = await vals();
  check("Starts 22:00 on the overnight block: Ends 06:00", v[1] === "06:00", v.join(" | "));
  check("no page errors", !errors.length, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); server.kill(); }
const failed = results.filter((r) => !r.ok); console.log(`\n${results.length - failed.length}/${results.length} passed`); process.exit(failed.length ? 1 : 0);
