// The calendar app (still/calendar.html) in a real browser with a fake still-api holding a crowded week like
// Junyan's real Nov 2 to 8, 2026 (screenshot 2026-11-06: "unreadable"). Not part of `node --test`: needs
// playwright-core and Google Chrome. Nothing reaches his server.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar.e2e.mjs [shot.png]
//   DAYHUB=<another day-hub folder> runs the same week against that copy (used for the "before" screenshot).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const ROOT = process.env.DAYHUB || fileURLToPath(new URL("../../..", import.meta.url));
const PAGE_PORT = 8797, API_PORT = 8796, API = `http://localhost:${API_PORT}`;
const PAGE = `http://localhost:${PAGE_PORT}/still/calendar.html?api=${encodeURIComponent(API)}`;
const W = +(process.env.W || 1280), Hh = +(process.env.H || 800);

/* ---------- a crowded week (Toronto, EST -05:00) ---------- */
const CALS = [
  { id: "jun", name: "Junyan", color: "#7dd3c0", writable: true, ok: true },
  { id: "joint", name: "Joint Plans", color: "#ffd479", writable: true, ok: true },
  { id: "caney", name: "Caney", color: "#f4a6c8", writable: false, ok: true },
  { id: "staff", name: "Staff scheduling", color: "#ff9f6b", writable: false, ok: true },
];
const t = (day, hm) => `2026-11-${String(day).padStart(2, "0")}T${hm}:00-05:00`;
let n = 0;
const ev = (calId, title, day, s, e) => ({ id: "e" + n++, calId, title, start: t(day, s), end: t(day, e) });
const events = [{ id: "ad1", calId: "jun", title: "Ekadashi fast", allDay: true, start: "2026-11-04", end: "2026-11-05" }];
for (let d = 2; d <= 8; d++) {
  // Staff scheduling: dozens of short overlapping "Need ..." shifts, heaviest in the evening
  const slots = ["11:30", "12:00", "12:15", "13:00", "13:30", "15:00", "16:00", "16:30", "17:00", "17:15", "18:00", "19:30", "20:00", "20:00", "20:30", "21:00", "21:00", "21:30", "22:00", "22:00", "23:00", "23:00"];
  slots.forEach((s, i) => { if ((i + d) % 3 !== 0 || d >= 6) { const [h, m] = s.split(":").map(Number); const em = h * 60 + m + 30 + (i % 2) * 15; events.push(ev("staff", i % 2 ? "Need cover: Studio B front desk" : "Need opener Studio A", d, s, `${String(Math.floor(em / 60) % 24).padStart(2, "0")}:${String(em % 60).padStart(2, "0")}`.replace(/^00:/, "23:").replace(/^23:(\d\d)$/, (x) => (em >= 1440 ? "23:59" : x)))); } });
}
events.push(
  ev("jun", "Studio cleaning and reset", 2, "13:00", "15:00"), ev("jun", "Call Anita about the lease", 2, "16:00", "16:30"),
  ev("joint", "Dinner at Gaia with Caney", 2, "18:00", "19:00"), ev("jun", "Gym legs", 2, "19:15", "20:30"), ev("jun", "Fold laundry", 2, "20:45", "21:15"),
  ev("jun", "Hike at Rattlesnake Point", 3, "13:00", "15:00"), ev("joint", "Dinner", 3, "18:00", "19:00"), ev("jun", "Gym push day", 3, "19:15", "20:30"), ev("jun", "Read today's pages", 3, "20:45", "21:15"),
  ev("jun", "Climbing at Basecamp", 4, "13:30", "15:00"), ev("jun", "Nutty Pudding prep", 4, "15:45", "16:15"), ev("joint", "Dinner", 4, "18:00", "19:00"), ev("jun", "Gym pull day", 4, "19:15", "20:30"), ev("jun", "Read today's pages", 4, "20:45", "21:15"),
  ev("jun", "Zouk class with Caney", 5, "13:15", "14:45"), ev("jun", "Nutty Pudding prep", 5, "16:30", "17:00"), ev("caney", "DM Anita re: costumes", 5, "18:30", "20:00"), ev("jun", "Read today's pages", 5, "20:45", "21:15"),
  ev("jun", "Nutty Pudding prep", 6, "14:30", "15:00"), ev("jun", "Drive to Caney's", 6, "15:00", "15:30"), ev("joint", "The Chiller with Caney", 6, "15:30", "16:00"), ev("joint", "Hot pot with friends", 6, "16:00", "16:30"), ev("caney", "Caney rehearsal", 6, "16:45", "19:00"), ev("jun", "Read today's pages", 6, "19:15", "19:45"),
  ev("joint", "Supper club", 7, "18:00", "19:30"), ev("jun", "Late snack and stretch", 7, "20:30", "22:30"), ev("caney", "Caney samba practice", 7, "13:00", "15:30"),
  ev("jun", "Sunday brunch", 8, "11:00", "12:30"), ev("joint", "Movie night", 8, "19:00", "21:00"),
);
const tasks = [
  { id: "t1", title: "Choose which overlapping Rio stays to keep through February 7", priority: "🔴 High", estimate: "90 min+", due: "2027-01-04", url: "#" },
  { id: "t2", title: "Get printed boarding passes for IB1904 at the Iberia desk, Cairo Terminal 2", priority: "🔴 High", estimate: "30 min", due: "2026-10-15T17:25:00.000+00:00", url: "#" },
  { id: "t3", title: "Call Chase about the Ink Business Unlimited application", priority: "🔴 High", estimate: "30 min", due: "2026-09-09", url: "#" },
  { id: "t4", title: "Resolve Madrid airport transfers and confirm AC shuttle", priority: "🔴 High", due: "2026-09-25", url: "#" },
  { id: "t5", title: "Pay the studio hydro bill", priority: "🔴 High", estimate: "10 min", due: "2026-11-09", url: "#" },
  { id: "t6", title: "Book flu shot", priority: "🟡 Medium", due: "2026-11-05", url: "#" },
  { id: "t7", title: "Sort winter clothes", priority: "🟢 Low", url: "#" },
];

/* ---------- servers ---------- */
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
const apiSrv = http.createServer((q, r) => {
  if (q.method === "OPTIONS") { r.writeHead(204, cors); return r.end(); }
  const u = new URL(q.url, API), send = (o) => { r.writeHead(200, { ...cors, "Content-Type": "application/json" }); r.end(JSON.stringify(o)); };
  if (u.pathname === "/planner/calendars") return send({ calendars: CALS });
  if (u.pathname === "/planner/events") return send({ events });
  if (u.pathname === "/planner/tasks") return send({ tasks });
  if (u.pathname === "/planner/suggestions") return send({ suggestions: [] });
  send({});
});
const pageSrv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname));
  fs.readFile(f, (err, b) => { if (err) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": f.endsWith(".js") ? "text/javascript" : "text/html" }); r.end(b); });
});
await new Promise((ok) => apiSrv.listen(API_PORT, ok));
await new Promise((ok) => pageSrv.listen(PAGE_PORT, ok));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const fails = [];
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: Hh }, deviceScaleFactor: 2, timezoneId: "America/Toronto" });
  await ctx.addInitScript(() => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-view", "week"); });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-11-06T23:10:00-05:00"));
  await page.goto(PAGE);
  await page.waitForSelector(".ev");
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector("#view").scrollTop = 11.5 * 56; });
  const shot = process.argv[2];
  if (shot) await page.screenshot({ path: shot });
  const r = await page.evaluate(() => {
    const view = document.querySelector("#view").getBoundingClientRect();
    const cols = [...document.querySelectorAll(".col")];
    const sun = cols[6].getBoundingClientRect();
    const own = [...document.querySelectorAll(".ev:not(.staff)")].map((e) => ({ t: e.textContent.trim(), w: e.getBoundingClientRect().width }));
    const lefts = cols.map((c) => new Set([...c.querySelectorAll(".ev")].map((e) => Math.round(e.getBoundingClientRect().left))).size);
    const cal = Object.fromEntries([...document.querySelectorAll("#cals label")].map((l) => [l.textContent.replace("read-only", "").trim(), getComputedStyle(l).getPropertyValue("--c").trim()]));
    const tasks = document.querySelector("#tasks").textContent;
    return { sunVisible: sun.right <= view.right + 1 && sun.left >= view.left, own, maxLefts: Math.max(...lefts), cal, tasks };
  });
  if (!r.sunVisible) fails.push("Sunday column is cut off at " + W + "px");
  const narrow = r.own.filter((x) => x.w < 60);
  if (narrow.length) fails.push(`${narrow.length} of Junyan's own events are narrower than 60px: ` + narrow.slice(0, 4).map((x) => x.t).join(" | "));
  if (r.maxLefts > 4) fails.push(`a day splits into ${r.maxLefts} lanes`);
  const want = { Junyan: "#ffd479", "Joint Plans": "#8fe3b0", Caney: "#d9b48f", "Staff scheduling": "#ff9f6b" };
  for (const [k, v] of Object.entries(want)) if ((r.cal[k] || "").toLowerCase() !== v) fails.push(`${k} colour is ${r.cal[k]}, want ${v}`);
  if (/\d{4}-\d\d-\d\dT/.test(r.tasks) || /due 20\d\d-/.test(r.tasks)) fails.push("Tasks panel shows raw ISO dates");
  if (!/overdue/.test(r.tasks)) fails.push("Tasks panel does not say what is overdue");
} finally { await browser.close(); apiSrv.close(); pageSrv.close(); }
if (fails.length) { console.log("FAIL\n- " + fails.join("\n- ")); process.exit(1); }
console.log("PASS calendar readable at " + W + "x" + Hh);
