// A local stand-in for still-api's /planner routes, plus the pages, on one port, so the calendar app can be
// opened and clicked through without touching Junyan's real calendars (2026-11-10, calendar shell).
//   node still/test/e2e/calendar-dev.mjs [port]     then open
//   http://localhost:8791/still/calendar.html?api=http://localhost:8791   and pair with the code "test".
// Nothing here is saved: writes answer OK and change the list in memory only.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const PORT = +(process.argv[2] || process.env.PORT || 8791);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const CALS = [
  { id: "joint", name: "Joint Plans", color: "#33c481", writable: true, ok: true },
  { id: "junyan", name: "Junyan", color: "#f6bf26", writable: true, ok: true },
  { id: "staff", name: "Staff Scheduling", color: "#ff8a3d", writable: true, ok: true },
  { id: "caney", name: "Caney", color: "#a98467", writable: false, ok: true },
  { id: "bday", name: "Community Birthdays", color: "#c77dff", writable: false, ok: true },
];
const day0 = new Date(); day0.setHours(0, 0, 0, 0);
const at = (d, h, m = 0) => new Date(day0.getTime() + d * 86400000 + (h * 60 + m) * 60000).toISOString();
const ymd = (d) => { const x = new Date(day0.getTime() + d * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
let n = 0;
const E = (d, h1, m1, h2, m2, title, calId = "joint", x = {}) => ({ id: "e" + (++n), calId, title, start: at(d, h1, m1), end: at(d, h2, m2), allDay: false, htmlLink: "https://calendar.google.com", ...x });
const A = (d, span, title, calId = "joint") => ({ id: "e" + (++n), calId, title, start: ymd(d), end: ymd(d + span), allDay: true });
let events = [
  E(-1, 10, 30, 11, 30, "Super Veggie"), E(-1, 13, 15, 14, 45, "Zouk Training"), E(-1, 15, 45, 16, 15, "Prep focaccia"),
  E(0, 8, 30, 9, 0, "Cancel BMO card at the branch", "junyan"), E(0, 9, 0, 10, 15, "Work block · 🎯 0/2", "junyan"),
  E(0, 10, 45, 11, 15, "Need FBS · Elena", "staff"), E(0, 11, 30, 12, 10, "Drive"), E(0, 12, 15, 12, 40, "Accounting: month end", "staff"),
  E(0, 12, 30, 15, 0, "Visit Mom"), E(0, 15, 30, 15, 50, "Isha Kriya"), E(0, 16, 15, 16, 40, "Team meeting", "staff"),
  A(1, 1, "Remembrance Day", "bday"), E(1, 8, 30, 9, 30, "901 Bell Internet will expire Nov 24", "staff"), E(1, 10, 0, 11, 30, "Work block"),
  E(1, 13, 15, 14, 45, "Zouk Training"), E(1, 15, 30, 17, 0, "Studio on-site · 527"), E(1, 17, 50, 18, 15, "Need FBS · Elena", "staff"),
  E(2, 9, 30, 11, 0, "Work block"), E(2, 12, 0, 12, 30, "Close Scotia account"), E(2, 13, 0, 15, 0, "Packing & Errands"),
  A(3, 3, "Stay at FICTION"), A(3, 1, "Caney away", "caney"), A(3, 1, "Pay rent"), E(3, 10, 30, 17, 0, "Drive"), E(3, 17, 0, 17, 30, "Check-in"),
  E(4, 13, 0, 14, 30, "Zouk WS"), E(4, 14, 30, 16, 0, "Lambada WS"), E(4, 16, 0, 17, 0, "Solo Battle WS"),
  A(5, 1, "Caney's Birthday", "bday"), E(5, 12, 0, 13, 0, "Gym · Jack Woods"), E(5, 13, 0, 14, 30, "Lambada WS"), E(5, 16, 0, 17, 0, "Practica"), E(5, 17, 30, 19, 0, "Dinner w/ everyone?"),
  E(-2, 12, 0, 13, 0, "Gym · Jack Woods"), E(20, 13, 15, 14, 45, "Zouk Training"), E(-20, 13, 15, 14, 45, "Zouk Training"),
];
for (let d = -30; d <= 45; d++) events.push(E(d, 18, 0, 19, 0, "Dinner", "joint", { recurringEventId: "dinner" }), E(d, 6, 45, 8, 0, "Morning Yoga"), E(d, 21, 45, 22, 30, "Wind down"));
let sugg = [{ id: "sg_1", status: "open", title: "Pack for FICTION stay", start: at(2, 19), end: at(2, 20), calId: "joint", by: "Desk Hand session", why: "You drive out at 10:30 Friday" }];
const tasks = [];

const send = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok) => { let s = ""; req.on("data", (c) => s += c); req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch { ok({}); } }); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") return send(res, 200, {});
  /* still-api's trip list as Day Quest's Trips view and the calendar's Trips page read it (fixed dates, no Notion) */
  if (u.pathname === "/quest/trips") {
    if (req.headers["x-quest-key"] !== "test") return send(res, 401, { error: "wrong pairing code (the dev server's code is: test)" });
    return send(res, 200, { trips: [
      { name: "2026 Montreal Birthday", start: "2026-11-12", end: "2026-11-17" },
      { name: "2027 🇧🇷 Brazil Carnaval", start: "2027-02-12", end: "2027-02-20" },
      { name: "2025 Egypt", start: "2025-03-01", end: "2025-03-09" },
    ] });
  }
  if (u.pathname.startsWith("/planner/")) {
    if (req.headers["x-quest-key"] !== "test") return send(res, 401, { error: "wrong pairing code (the dev server's code is: test)" });
    const b = req.method === "GET" || req.method === "DELETE" ? {} : await readBody(req);
    if (u.pathname === "/planner/calendars") return send(res, 200, { calendars: CALS });
    if (u.pathname === "/planner/events") { const f = Date.parse(u.searchParams.get("from")), t = Date.parse(u.searchParams.get("to")); return send(res, 200, { events: events.filter((e) => { const s = Date.parse(e.start), x = Date.parse(e.end); return x > f && s < t; }) }); }
    if (u.pathname === "/planner/suggestions" && req.method === "GET") return send(res, 200, { suggestions: sugg });
    if (u.pathname === "/planner/suggestions/accept") { const g = sugg.find((x) => x.id === b.id); sugg = sugg.filter((x) => x !== g); events.push({ id: "e" + (++n), calId: b.calId || g.calId, title: b.title || g.title, start: g.start, end: g.end, allDay: false }); return send(res, 200, { suggestion: { eventCalId: b.calId || g.calId } }); }
    if (u.pathname === "/planner/suggestions/skip") { sugg = sugg.filter((x) => x.id !== b.id); return send(res, 200, { ok: true }); }
    if (u.pathname === "/planner/tasks" && req.method === "POST") { tasks.push(b.title); console.log("task:", b.title); return send(res, 200, { task: { id: "t" + tasks.length, title: b.title } }); }
    if (u.pathname === "/planner/event" && req.method === "POST") { const ev = { id: "e" + (++n), allDay: false, ...b }; events.push(ev); return send(res, 200, { event: ev }); }
    if (u.pathname === "/planner/event" && req.method === "PATCH") { const ev = events.find((x) => x.id === b.id); if (!ev) return send(res, 404, { error: "no such event" }); const { toCalId, id, calId, scope, seriesId, originalStart, ...f } = b; Object.assign(ev, f, toCalId ? { calId: toCalId } : {}); return send(res, 200, { event: ev }); }
    if (u.pathname === "/planner/event" && req.method === "DELETE") { events = events.filter((x) => x.id !== u.searchParams.get("id")); return send(res, 200, { ok: true }); }
    return send(res, 404, { error: "not in the dev server" });
  }
  const file = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`calendar dev server on http://localhost:${PORT}/still/calendar.html?api=http://localhost:${PORT}  (pairing code: test)`));
