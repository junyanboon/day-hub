// Day Quest "Plan my gym sessions" switch in a real browser (Junyan, 2026-11-25: "the gym auto-populates right now and I want
// that turned off"). Not part of `node --test still/test/*.test.mjs`: it needs playwright-core and the test browser.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/quest-gym-switch.e2e.mjs
// The page and a fake still-api each run on their own localhost port. Nothing reaches his server or his calendar.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
import { launchTestBrowser } from "../helpers/test-browser.mjs";
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const PAGE_PORT = +(process.env.PAGE_PORT || 8789), API_PORT = +(process.env.API_PORT || 8788);
const API = `http://localhost:${API_PORT}`, PAGE = `http://localhost:${PAGE_PORT}/still/quest.html?api=${encodeURIComponent(API)}`;
const TZ = "America/Toronto";
const TODAY = "2026-11-23";   // a Monday; the clock is pinned, so the test never reads the real one

let api;
const reset = state => { api = { ops:{}, posts:[], state:state || { xp:0, day:null } }; };
const iso = (ymd, hm) => `${ymd}T${hm}:00-05:00`;   // November in Toronto is EST: test data only
const planFor = ymd => ({ generated:new Date().toISOString(), label:ymd, tz:TZ, where:{ place:"Toronto", tz:TZ, from:"test" },
  blocks:[
    { s:iso(ymd, "09:00"), e:iso(ymd, "10:00"), t:`Pages ${ymd.slice(5)}`, type:"task", cal:"Junyan" },
    { s:iso(ymd, "12:00"), e:iso(ymd, "13:00"), t:"Lunch", type:"task", cal:"Junyan" },
  ] });
function apiHandler(req, res){
  const url = new URL(req.url, API);
  const send = (code, body) => { res.writeHead(code, { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"Content-Type, X-Quest-Key", "Access-Control-Allow-Methods":"GET, POST, OPTIONS" }); res.end(JSON.stringify(body)); };
  if (req.method === "OPTIONS") return send(204, {});
  let raw = ""; req.on("data", c => raw += c); req.on("end", () => {
    const body = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
    if (req.method === "POST") api.posts.push({ path:url.pathname, body, at:Date.now() });
    if (url.pathname === "/plan") return send(200, planFor(url.searchParams.get("date")));
    if (url.pathname === "/ops" && req.method === "GET") return send(200, api.ops[url.searchParams.get("d")] || {});
    if (url.pathname === "/ops" && req.method === "POST") { api.ops[body.date] = body; return send(200, { ok:true, kept:"client" }); }
    if (url.pathname === "/tasks") return send(200, { tasks:[] });
    if (url.pathname === "/quest/state" && req.method === "GET") return send(200, api.state);
    if (url.pathname === "/quest/state" && req.method === "POST") { api.state = { ...api.state, ...body }; return send(200, { ok:true, state:api.state }); }
    return send(200, {});
  });
}
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".css":"text/css", ".webp":"image/webp", ".png":"image/png",
  ".svg":"image/svg+xml", ".woff2":"font/woff2", ".webmanifest":"application/manifest+json", ".json":"application/json" };
function pageHandler(req, res){
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "Content-Type":TYPES[path.extname(p)] || "application/octet-stream", "Cache-Control":"no-cache" });
  res.end(fs.readFileSync(p));
}
const servers = [[pageHandler, PAGE_PORT], [apiHandler, API_PORT]].map(([h, port]) => { const s = http.createServer(h); s.listen(port, "localhost"); return s; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 200){
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn().catch(() => null); if (v) return v; await sleep(step); }
  return null;
}
const results = [];
function check(name, ok, detail){ results.push({ name, ok }); console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); }
async function fresh(){
  const browser = await launchTestBrowser(chromium);
  const ctx = await browser.newContext({ timezoneId:TZ, viewport:{ width:390, height:844 }, serviceWorkers:"block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("quest-key", "test-key"); localStorage.setItem("quest-synced", "test-key"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log("    pageerror:", e.message));
  await page.clock.install({ time:new Date(`${TODAY}T10:00:00-05:00`) });
  return { browser, page };
}
const events = () => api.posts.filter(p => p.path === "/cal/event");
const loaded = page => waitFor(() => page.evaluate(() => document.body.innerText.includes("Pages 11-23")), 20000);
async function openSettings(page){
  await page.locator("#gear").click();
  return waitFor(() => page.locator("#gymAuto").count().then(n => n > 0));
}

const S = {
  async "off by default: page load and the Plan screen place nothing"(){
    reset();
    const { browser, page } = await fresh();
    try {
      await page.goto(PAGE);
      check("the day shows", !!(await loaded(page)));
      await page.clock.runFor(10000); await sleep(1500);
      if (await page.locator("#bMorning").count()) { await page.locator("#bMorning").click(); await page.clock.runFor(5000); await sleep(1500); }
      check("no gym block was written to the calendar", events().length === 0, `${events().length} writes`);
      check("no gym slot was saved in his state", !api.posts.some(p => p.path === "/quest/state" && p.body && p.body.gymPlan && Object.keys(p.body.gymPlan).length));
      await page.keyboard.press("Escape");
      await page.evaluate(() => { const c = document.querySelector("#sheet .actions .btn.ghost, #sClose"); if (c) c.click(); });
      check("the switch exists, labelled Plan my gym sessions, and is off", await openSettings(page)
        && (await page.locator("#gymAuto").innerText()).startsWith("Plan my gym sessions")
        && (await page.locator("#gymAuto").getAttribute("aria-checked")) === "false"
        && (await page.locator("#gymAuto").getAttribute("role")) === "switch");
    } finally { await browser.close(); }
  },
  async "turning it on plans as before, and the choice is saved to his state"(){
    reset();
    const { browser, page } = await fresh();
    try {
      await page.goto(PAGE);
      await loaded(page); await page.clock.runFor(5000);
      check("nothing yet", events().length === 0);
      check("settings open", !!(await openSettings(page)));
      await page.locator("#gymAuto").click();
      check("the switch reads on", (await page.locator("#gymAuto").getAttribute("aria-checked")) === "true");
      const wrote = await waitFor(async () => { await page.clock.runFor(2000); return events().length > 0; }, 20000);
      check("gym sessions are written to the calendar (positive control)", !!wrote, `${events().length} writes`);
      check("every write is a Gym block", events().every(e => /^Gym/.test(e.body.title)), events().map(e => e.body.title).join(", "));
      const saved = await waitFor(async () => { await page.clock.runFor(2000); return api.posts.some(p => p.path === "/quest/state" && p.body.gymAuto === true); }, 15000);
      check("gymAuto: true reaches his saved state (follows him across devices)", !!saved);
    } finally { await browser.close(); }
  },
  async "another device that turned it on: this one plans on load; turning it off flips the switch and the saved state"(){
    reset({ xp:5, day:null, ts:Date.parse(`${TODAY}T09:00:00-05:00`), gymAuto:true });
    const { browser, page } = await fresh();
    try {
      await page.goto(PAGE);
      await loaded(page);
      const wrote = await waitFor(async () => { await page.clock.runFor(2000); return events().length > 0; }, 25000);
      check("on from his saved state: it plans on load", !!wrote, `${events().length} writes`);
      check("settings open", !!(await openSettings(page)));
      check("the switch reads on", (await page.locator("#gymAuto").getAttribute("aria-checked")) === "true");
      const n = events().length;
      await page.locator("#gymAuto").click();
      check("the switch reads off", (await page.locator("#gymAuto").getAttribute("aria-checked")) === "false");
      const off = await waitFor(async () => { await page.clock.runFor(2000); return api.posts.some(p => p.path === "/quest/state" && p.body.gymAuto === false); }, 15000);
      check("gymAuto: false is saved", !!off);
      check("turning it off writes nothing more to the calendar", events().length === n);
      check("turning it off deletes nothing", !api.posts.some(p => /event/.test(p.path) && p.path !== "/cal/event"));
    } finally { await browser.close(); }
  },
};

const pick = process.argv.slice(2);
for (const [name, fn] of Object.entries(S)) {
  if (pick.length && !pick.some(p => name.includes(p))) continue;
  console.log(name);
  try { await fn(); } catch (e) { check(name + " ran", false, e.message); }
}
servers.forEach(s => s.close());
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
