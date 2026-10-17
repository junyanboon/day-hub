// Day Quest offline check in a real browser (Junyan, 2026-10-17, Madrid: "when the internet is down it doesn't work").
// Not part of `node --test still/test/*.test.mjs`: it needs playwright-core and Google Chrome.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/offline.e2e.mjs [scenario...]
// The page and a fake still-api each run on their own localhost port. "Offline" means both servers are shut
// (connections refused, as with no internet) and the browser is told it is offline. Nothing reaches his server.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));   // the day-hub folder
const PAGE_PORT = +(process.env.PAGE_PORT || 8799), API_PORT = +(process.env.API_PORT || 8798);
const API = `http://localhost:${API_PORT}`, PAGE = `http://localhost:${PAGE_PORT}/still/quest.html?api=${encodeURIComponent(API)}`;
const TZ = "Europe/Madrid";

/* ---------- the fake still-api ---------- */
const api = { ops:{}, posts:[], state:{ xp:0, day:null }, delay:0 };
const madrid = (ymd, hm) => {   // ymd + "HH:MM" in Madrid (CEST, +02:00, in October before the 25th)
  return `${ymd}T${hm}:00+02:00`;
};
const planFor = ymd => ({ generated:new Date().toISOString(), label:ymd, tz:TZ, where:{ place:"Madrid", tz:TZ, from:"test" },
  blocks:[
    { s:madrid(ymd, "08:00"), e:madrid(ymd, "09:00"), t:`Pages ${ymd.slice(5)}`, type:"task", cal:"Junyan" },
    { s:madrid(ymd, "09:00"), e:madrid(ymd, "13:00"), t:"Open space", type:"focus", cal:"Junyan" },
    { s:madrid(ymd, "13:00"), e:madrid(ymd, "14:00"), t:`Lunch ${ymd.slice(5)}`, type:"task", cal:"Junyan" },
    { s:madrid(ymd, "14:00"), e:madrid(ymd, "19:00"), t:"Open space", type:"focus", cal:"Junyan" },
    { s:madrid(ymd, "19:00"), e:madrid(ymd, "20:00"), t:`Dance ${ymd.slice(5)}`, type:"task", cal:"Junyan" },
  ] });
function apiHandler(req, res){
  const url = new URL(req.url, API);
  const send = (code, body) => { res.writeHead(code, { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"Content-Type, X-Quest-Key", "Access-Control-Allow-Methods":"GET, POST, OPTIONS" }); res.end(JSON.stringify(body)); };
  if (req.method === "OPTIONS") return send(204, {});
  let raw = ""; req.on("data", c => raw += c); req.on("end", () => setTimeout(() => {
    const body = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
    if (req.method === "POST") api.posts.push({ path:url.pathname, body, at:Date.now() });
    if (url.pathname === "/plan") return send(200, planFor(url.searchParams.get("date")));
    if (url.pathname === "/ops" && req.method === "GET") return send(200, api.ops[url.searchParams.get("d")] || {});
    if (url.pathname === "/ops" && req.method === "POST") {
      const prev = api.ops[body.date];
      if (prev && prev.ts >= body.ts) return send(200, { ok:true, kept:"server", server:prev });
      api.ops[body.date] = body; return send(200, { ok:true, kept:"client" });
    }
    if (url.pathname === "/tasks") return send(200, { tasks:[{ id:"t1", task:"Book the Toledo train", priority:"High", estimate:30, type:"Task", done:false }] });
    if (url.pathname === "/quest/state" && req.method === "GET") return send(200, api.state);
    if (url.pathname === "/quest/state" && req.method === "POST") { api.state = { ...body }; return send(200, { ok:true, state:api.state }); }
    if (url.pathname === "/tasks/done") return send(200, { ok:true, was:"Not started" });
    return send(200, {});
  }, req.method === "GET" ? api.delay : 0));
}

/* ---------- the page's files ---------- */
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".css":"text/css", ".webp":"image/webp", ".png":"image/png",
  ".svg":"image/svg+xml", ".woff2":"font/woff2", ".webmanifest":"application/manifest+json", ".json":"application/json" };
let serveRoot = ROOT;   // OLD_ROOT=<a checkout of the live version> adds the update check
function pageHandler(req, res){
  const ROOT = serveRoot;
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end("no"); }
  const st = fs.statSync(p);
  res.writeHead(200, { "Content-Type":TYPES[path.extname(p)] || "application/octet-stream", "Last-Modified":st.mtime.toUTCString(),
    "Date":new Date().toUTCString(), "Cache-Control":"no-cache" });
  res.end(req.method === "HEAD" ? undefined : fs.readFileSync(p));
}

/* ---------- the internet switch ---------- */
let servers = [], isUp = false;
const sockets = new Set();
function up(){
  if (isUp) return Promise.resolve();
  isUp = true;
  servers = [[pageHandler, PAGE_PORT], [apiHandler, API_PORT]].map(([h, port]) => {
    const s = http.createServer(h); s.keepAliveTimeout = 1; s.on("connection", c => { sockets.add(c); c.on("close", () => sockets.delete(c)); });
    s.listen(port, "localhost"); return s; });
  return new Promise(r => setTimeout(r, 100));
}
function down(){
  if (!isUp) return Promise.resolve();
  isUp = false;
  for (const c of sockets) c.destroy();
  return Promise.all(servers.map(s => new Promise(r => s.close(r))));
}
async function goOffline(ctx){ await down(); await ctx.setOffline(true); }
async function goOnline(ctx){ await up(); await ctx.setOffline(false); }

/* ---------- helpers ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 200){
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn().catch(() => null); if (v) return v; await sleep(step); }
  return null;
}
const statusText = page => page.locator("#statusL").innerText();
const bodyHas = (page, s) => page.evaluate(x => document.body.innerText.includes(x), s);
const calHas = (page, s) => page.evaluate(x => (document.querySelector("#calBody") ? document.querySelector("#calBody").innerText : "").includes(x), s);
async function fresh(clockAt){
  const browser = await chromium.launch({ channel:"chrome", headless:process.env.HEADED ? false : true });
  const ctx = await browser.newContext({ timezoneId:TZ, viewport:{ width:390, height:844 }, serviceWorkers:"allow" });
  await ctx.addInitScript(() => { try { localStorage.setItem("quest-key", "test-key"); localStorage.setItem("quest-synced", "test-key"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log("    pageerror:", e.message));
  if (clockAt) await page.clock.install({ time:new Date(clockAt) });
  return { browser, ctx, page };
}
// one online visit: the plan shows, the service worker controls the page, the saved day is written
async function onlineVisit(page, ymd, opens = 2){
  await page.goto(PAGE);
  for (let i = 1; i < opens; i++) {   // he has opened it before: a second open runs under the service worker
    await waitFor(() => page.evaluate(() => !!navigator.serviceWorker.controller));
    await page.reload();
  }
  const ok = await waitFor(() => bodyHas(page, `Pages ${ymd.slice(5)}`), 20000);
  if (!ok) throw new Error("online visit never showed the plan: " + await statusText(page));
  await waitFor(() => page.evaluate(() => !!navigator.serviceWorker.controller));
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload(); await waitFor(() => bodyHas(page, `Pages ${ymd.slice(5)}`)); }
  await waitFor(() => page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("quest-snap"))));
  await sleep(1500);   // let the agenda days land and be saved
}
const results = [];
function check(name, ok, detail){ results.push({ name, ok }); console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); }

/* ---------- scenarios ---------- */
const TODAY = "2026-10-17", TOMORROW = "2026-10-18";
const S = {
  async "offline after only one online visit (the files are saved when the app is installed)"(){
    const { browser, ctx, page } = await fresh(`${TODAY}T15:00:00+02:00`);
    try {
      await onlineVisit(page, TODAY, 1);
      await sleep(3000);   // the service worker's install finishes saving
      await goOffline(ctx);
      const errs = []; page.on("pageerror", e => errs.push(e.message));
      await page.reload();
      const shows = await waitFor(() => bodyHas(page, "Pages 10-17"), 8000);
      check("opens and shows today's calendar", !!shows, await statusText(page));
      check("no script is missing", !errs.length, errs.join("; "));
    } finally { await browser.close(); await up().catch(() => {}); }
  },
  async "updating from the live version, then offline"(){
    if (!process.env.OLD_ROOT) { console.log("  skipped: set OLD_ROOT to a checkout of the live version"); return; }
    const { browser, ctx, page } = await fresh(`${TODAY}T15:00:00+02:00`);
    try {
      serveRoot = path.resolve(process.env.OLD_ROOT);
      await onlineVisit(page, TODAY);   // the live version, opened twice
      serveRoot = ROOT;
      await page.reload();   // GitHub has the new page: the new worker installs
      await waitFor(() => page.evaluate(async () => (await caches.keys()).includes("dq-shell-v3")), 15000);
      await sleep(3000);
      await page.reload();   // the next open runs the new page under the new worker
      await waitFor(() => bodyHas(page, "Pages 10-17"), 15000);
      await sleep(2000);
      await goOffline(ctx);
      const errs = []; page.on("pageerror", e => errs.push(e.message));
      await page.reload();
      const shows = await waitFor(() => bodyHas(page, "Pages 10-17"), 8000);
      const st = await statusText(page);
      check("opens offline after the update", !!shows && !errs.length, st + (errs.length ? " / " + errs.join("; ") : ""));
      check("says it is offline", /offline/i.test(st), st);
      check("the old page cache is gone", !(await page.evaluate(async () => (await caches.keys()).includes("dq-shell-v2"))));
    } finally { serveRoot = ROOT; await browser.close(); await up().catch(() => {}); }
  },
  async "a slow line (answers after 5 s) is not called offline"(){
    const { browser, ctx, page } = await fresh(`${TODAY}T15:00:00+02:00`);
    try {
      await onlineVisit(page, TODAY);
      api.delay = 5000;
      await page.reload();
      await waitFor(() => bodyHas(page, "Pages 10-17"), 8000);
      await sleep(7000);
      const st = await statusText(page);
      check("status is the normal one, not offline", !/offline/i.test(st) && /Madrid/.test(st), st);
    } finally { api.delay = 0; await browser.close(); await up().catch(() => {}); }
  },
  async "offline right after an online visit"(){
    const { browser, ctx, page } = await fresh(`${TODAY}T15:00:00+02:00`);
    try {
      await onlineVisit(page, TODAY);
      await goOffline(ctx);
      await page.reload();
      const shows = await waitFor(() => bodyHas(page, `Pages 10-17`), 8000);
      const st = await statusText(page);
      check("opens and shows today's calendar", !!shows, st);
      check("says it is offline and how old the calendar is", /offline/i.test(st) && /saved|from/i.test(st), st);
    } finally { await browser.close(); await up().catch(() => {}); }
  },
  async "offline more than 3 hours after the last online visit"(){
    const { browser, ctx, page } = await fresh(`${TODAY}T15:30:00+02:00`);
    try {
      await onlineVisit(page, TODAY);
      await goOffline(ctx);
      // 4.5 hours later, same day. The service worker runs on the real clock, so the saved copies are made older
      // instead of moving the page's clock: the saved day and every saved still-api answer
      await page.evaluate(async () => {
        const old = Date.now() - 4.5 * 3600000;
        for (const k of Object.keys(localStorage)) if (k.startsWith("quest-snap")) {
          const s = JSON.parse(localStorage.getItem(k)); s.at = old; localStorage.setItem(k, JSON.stringify(s)); }
        const c = await caches.open("dq-data-v1");
        for (const req of await c.keys()) {
          const res = await c.match(req), h = new Headers(res.headers); h.set("x-dq-at", String(old));
          await c.put(req, new Response(await res.blob(), { status:res.status, headers:h }));
        }
      });
      await page.reload();
      const shows = await waitFor(() => bodyHas(page, `Pages 10-17`), 8000);
      const st = await statusText(page);
      check("opens with the saved calendar after 4.5 h offline", !!shows, st);
      check("status gives the calendar's age", /offline/i.test(st) && /4 hr/.test(st), st);
    } finally { await browser.close(); await up().catch(() => {}); }
  },
  async "offline after 4.5 hours with the service worker's saved data gone (only the saved day is left)"(){
    const { browser, ctx, page } = await fresh(`${TODAY}T15:30:00+02:00`);
    try {
      await onlineVisit(page, TODAY);
      await goOffline(ctx);
      await page.evaluate(async () => {
        for (const k of Object.keys(localStorage)) if (k.startsWith("quest-snap")) {
          const s = JSON.parse(localStorage.getItem(k)); s.at = Date.now() - 4.5 * 3600000; localStorage.setItem(k, JSON.stringify(s)); }
        await caches.delete("dq-data-v1");
      });
      await page.reload();
      const shows = await waitFor(() => bodyHas(page, "Pages 10-17"), 8000);
      const st = await statusText(page);
      check("opens with the saved day", !!shows, st);
      check("status says offline and 4 hr", /offline/i.test(st) && /4 hr/.test(st), st);
    } finally { await browser.close(); await up().catch(() => {}); }
  },
  async "offline on a new date"(){
    const { browser, ctx, page } = await fresh(`${TODAY}T21:00:00+02:00`);
    try {
      await onlineVisit(page, TODAY);
      await goOffline(ctx);
      await page.clock.setSystemTime(new Date(`${TOMORROW}T10:00:00+02:00`));
      await page.reload();
      const shows = await waitFor(async () => await bodyHas(page, "Dance 10-18")
        && /OCT 18/i.test(await page.locator("#calDay").innerText()) && !/Loading/.test(await statusText(page)), 8000);
      const st = await statusText(page);
      check("opens on tomorrow's calendar from the saved agenda", !!shows, st);
      check("status says offline", /offline/i.test(st), st);
    } finally { await browser.close(); await up().catch(() => {}); }
  },
  async "a change made offline reaches the server when the internet is back"(){
    const { browser, ctx, page } = await fresh(`${TODAY}T15:00:00+02:00`);
    try {
      await onlineVisit(page, TODAY);
      await goOffline(ctx);
      await page.reload();
      await waitFor(() => bodyHas(page, `Pages 10-17`), 8000);
      api.posts = [];
      // a prana tick (game state) and a Your move pick (today's edit layer), the two kinds of save the page queues
      const prana = () => page.evaluate(() => (JSON.parse(localStorage.getItem("quest-v1") || "{}").day || {}).prana || 0);
      const before = await prana();
      await page.getByText("250 ml water").first().click();
      await sleep(800);
      // a Notion task ticked done offline (side quest, then Complete)
      const dialogs = []; page.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
      await page.locator('[data-side="t1"]').click();
      await sleep(500);
      await page.locator("#sDone").click();
      await sleep(800);
      check("ticking a Notion task done offline shows no error", !dialogs.length, dialogs.join("; "));
      await page.getByText("Upa Yoga").first().click();
      await sleep(2500);
      const after = await prana();
      check("prana from the ticks is kept on the phone while offline", after > before, `${before} -> ${after}`);
      check("the picked block shows on the calendar offline", await calHas(page, "Upa Yoga"));
      await page.reload();   // closing and reopening while still offline keeps them
      await waitFor(() => bodyHas(page, "Pages 10-17"), 8000);
      await sleep(1500);
      check("the picked block is still there after a reopen offline", await calHas(page, "Upa Yoga"));
      check("the prana is still there after a reopen offline", (await prana()) >= after, String(await prana()));
      await goOnline(ctx);
      const gotOps = await waitFor(async () => api.posts.find(p => p.path === "/ops" && (p.body.adds || []).some(a => a.t === "Upa Yoga")), 20000);
      const gotXp = await waitFor(async () => api.posts.find(p => p.path === "/quest/state" && ((p.body.day || {}).prana || 0) >= after), 20000);
      check("the block edit reaches the server by itself", !!gotOps);
      check("the prana reaches the server by itself", !!gotXp);
      const gotTask = await waitFor(async () => api.posts.find(p => p.path === "/tasks/done" && p.body.id === "t1" && p.body.done === true), 20000);
      check("the task tick reaches the server by itself", !!gotTask);
      const st = await waitFor(async () => { const s = await statusText(page); return /offline/i.test(s) ? null : s; }, 20000);
      check("the offline note goes away by itself", !!st, st || await statusText(page));
    } finally { await browser.close(); await up().catch(() => {}); }
  },
};

await up();
if (process.argv[2] === "--serve") { console.log("serving " + PAGE); await new Promise(() => {}); }
const pick = process.argv.slice(2);
for (const [name, fn] of Object.entries(S)) {
  if (pick.length && !pick.some(p => name.includes(p))) continue;
  console.log(name);
  try { await fn(); } catch (e) { check(name + " ran", false, e.message); }
}
await down();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
