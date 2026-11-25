// A local stand-in for still-api's /planner routes, plus the pages, on one port, so the calendar app can be
// opened and clicked through without touching Junyan's real calendars (2026-11-10, calendar shell).
//   node still/test/e2e/calendar-dev.mjs [port]     then open
//   http://localhost:8791/still/calendar.html?api=http://localhost:8791   and pair with the code "test".
// Nothing here is saved: writes answer OK and change the list in memory only.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* DEV_ROOT serves another copy of the pages (the trip read check serves main's copy beside this one, 2026-11-18) */
const ROOT = process.env.DEV_ROOT || fileURLToPath(new URL("../../..", import.meta.url));
const PORT = +(process.argv[2] || process.env.PORT || 8791);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
/* DEV_NO_BDAY=1 plays the old server: no Community Birthdays calendar in the list and none of its events (the page goes live before the server part does) */
const NO_BDAY = !!process.env.DEV_NO_BDAY;
const CALS = [
  { id: "joint", name: "Joint Plans", color: "#33c481", writable: true, ok: true },
  { id: "junyan", name: "Junyan", color: "#f6bf26", writable: true, ok: true },
  { id: "staff", name: "Staff Scheduling", color: "#ff8a3d", writable: true, ok: true },
  { id: "caney", name: "Caney", color: "#a98467", writable: false, ok: true },
  { id: "bday", name: "Community Birthdays", color: "#c77dff", writable: false, displayOnly: true, ok: true },
];
/* DEV_NOW pins the clock the days are counted from (the Commute check sets it, with TZ, so no test reads the real clock). DEV_TODAY=YYYY-MM-DD does the same by date (the birthdays checks). */
const day0 = process.env.DEV_TODAY ? new Date(process.env.DEV_TODAY + "T00:00:00") : new Date(process.env.DEV_NOW || Date.now()); day0.setHours(0, 0, 0, 0);
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
  E(1, 13, 15, 14, 45, "Zouk Training"), E(1, 15, 30, 17, 0, "Studio on-site · 527", "joint", { location: "527 Bloor St W, Toronto" }), E(1, 17, 50, 18, 15, "Need FBS · Elena", "staff"),
  E(2, 9, 30, 11, 0, "Work block"), E(2, 12, 0, 12, 30, "Close Scotia account"), E(2, 13, 0, 15, 0, "Packing & Errands"),
  A(3, 3, "Stay at FICTION"), A(3, 1, "Caney away", "caney"), A(3, 1, "Pay rent"), E(3, 10, 30, 17, 0, "Drive"), E(3, 17, 0, 17, 30, "Check-in"),
  E(4, 13, 0, 14, 30, "Zouk WS"), E(4, 14, 30, 16, 0, "Lambada WS"), E(4, 16, 0, 17, 0, "Solo Battle WS"),
  A(5, 1, "Caney's Birthday", "bday"), A(5, 1, "Ada's Birthday", "bday"), E(0, 15, 0, 16, 0, "Cake at the studio", "bday"), E(5, 9, 0, 10, 0, "Need FBS · Elena", "staff"), E(5, 14, 45, 15, 15, "Studio on-site · 527", "staff"), E(5, 12, 0, 13, 0, "Gym · Jack Woods"), E(5, 13, 0, 14, 30, "Lambada WS"), E(5, 16, 0, 17, 0, "Practica"), E(5, 17, 30, 19, 0, "Dinner w/ everyone?"),
  /* Commute blocks (2026-11-24): one with no address anywhere (asks), one whose next event has an address, one with its own */
  E(1, 9, 35, 10, 0, "Transit"), E(1, 15, 0, 15, 25, "Bus to studio"), E(2, 8, 30, 9, 15, "Subway to class", "joint", { location: "1 Yonge St, Toronto" }), E(2, 9, 15, 9, 30, "Commute"),
  E(-2, 12, 0, 13, 0, "Gym · Jack Woods"), E(20, 13, 15, 14, 45, "Zouk Training"), E(-20, 13, 15, 14, 45, "Zouk Training"),
];
for (let d = -30; d <= 45; d++) events.push(E(d, 18, 0, 19, 0, "Dinner", "joint", { recurringEventId: "dinner" }), E(d, 6, 45, 8, 0, "Morning Yoga"), E(d, 21, 45, 22, 30, "Wind down"));
let sugg = [{ id: "sg_1", status: "open", title: "Pack for FICTION stay", start: at(2, 19), end: at(2, 20), calId: "joint", by: "Desk Hand session", why: "You drive out at 10:30 Friday" }];
const tasks = [];
let places = [];
const commuteNotes = [], commuteFiles = {}, commuteRoutes = [];   // still-api /quest/commute/*, in memory
/* Slice 2: /quest/commute/directions, faked in still-api's answer shape (test/fake-routes.mjs there holds the same sample trip). The
   times come from the arrive-by the page sends, so nothing here reads a clock. GET /__dev/directions?state=ok|no-key|stopped and
   ?next=1 (the next answer is a later check: leave 6 min earlier, one alert new, one cleared, drive now quicker) steer it. */
let dirState = "ok", dirNext = false, dirCalls = [];
const encPoly = (pts) => { let la = 0, lo = 0, o = ""; const e = (v) => { v = v < 0 ? ~(v << 1) : v << 1; let t = ""; while (v >= 32) { t += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; } return t + String.fromCharCode(v + 63); }; for (const [a, b] of pts) { const x = Math.round(a * 1e5), y = Math.round(b * 1e5); o += e(x - la) + e(y - lo); la = x; lo = y; } return o; };
function dirAnswer(b, later) {
  const arrive = Date.parse(b.arriveBy), M = 60000, f = (b.from && b.from.lat) ?? 45.52, g = (b.from && b.from.lng) ?? -73.58, t = (b.to && b.to.lat) ?? 45.5364, h = (b.to && b.to.lng) ?? -73.6148;
  const line = encPoly([[f, g], [(f + t) / 2 + 0.004, (g + h) / 2 - 0.004], [t, h]]);
  const tm = later ? 40 : 34, dm = 27, arriveT = arrive - 1 * M, leaveT = arriveT - tm * M;
  const ride = (label, headsign, from, to, stops, dep, min, wait) => ({ kind: "transit", vehicle: "SUBWAY", line: label.slice(-1), label, headsign, stops, from, to, departsAt: dep, arriveAt: dep + min * M, minutes: min, wait });
  const transit = { mode: "transit", minutes: tm, km: 9, leaveAt: leaveT, arriveAt: arriveT, polyline: line, roads: [], trafficMinutes: 0, steps: [
    { kind: "walk", text: "Walk to Dev Station North", minutes: 6, meters: 450 },
    ride("Line 1 Dev Line", "Union", "Dev Station North", "Dev Junction", 5, leaveT + 6 * M, 12, 0),
    ride("Line 2 Test Line", "Kipling", "Dev Junction", "Dev Station East", 2, leaveT + 21 * M, 7, 3),
    { kind: "walk", text: "Walk to Dev Studio", minutes: 4, meters: 300 }] };
  const drive = { mode: "drive", minutes: dm, km: 8.1, leaveAt: null, arriveAt: null, polyline: line, steps: [], trafficMinutes: later ? 0 : 5, roads: [{ road: "Dev Avenue", km: 3.2, minutes: 10 }, { road: "Test Street", km: 2.2, minutes: 7 }, { road: "Sample Road", km: 2.7, minutes: 8 }] };
  const walk = { mode: "walk", tooFar: true, km: 9 };
  const alerts = [{ id: "ttc:t1", kind: "ttc", mode: "transit", title: "Line 1: trains move slower than usual", detail: "Reduced speed zone, Dev Station North to Dev Junction." }, { id: "wx:snow", kind: "weather", mode: "any", title: "Snow from 1 pm, 2°C", detail: "Roads and sidewalks may be slippery." }];
  const alerts2 = [{ id: "ttc:t3", kind: "ttc", mode: "transit", title: "Line 2: delays of about 5 minutes", detail: "" }, { id: "wx:snow", kind: "weather", mode: "any", title: "Snow from 1 pm, 2°C", detail: "Roads and sidewalks may be slippery." }, { id: "road:c1", kind: "closure", mode: "drive", title: "Dev Avenue closed near Test Street", detail: "Watermain repair." }];
  return { state: "ok", checkedAt: new Date(process.env.DEV_NOW || Date.now()).getTime() + (later ? 3 * 60000 : 0), ways: { walk, transit, drive }, errors: {}, alerts: later ? alerts2 : alerts, sourcesDown: b.fresh && later ? ["roads"] : [], cached: {} };
}
let routesDown = false;   // GET /__dev/routes?down=1 makes the route calls fail, to check the browser-copy fallback
const uploads = [];   // reservation files the trip page sent (the e2e reads the request log, this keeps the server honest)
const FOUND = { "schwartz's deli": { lat: 45.5163, lng: -73.5776 }, "jean-talon market": { lat: 45.5364, lng: -73.6148 } };

const send = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok) => { let s = ""; req.on("data", (c) => s += c); req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch { ok({}); } }); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") return send(res, 200, {});
  /* still-api's trip list as Day Quest's Trips view and the calendar's Trips page read it (fixed dates, no Notion) */
  if (u.pathname === "/quest/trips") {
    if (req.headers["x-quest-key"] !== "test") return send(res, 401, { error: "wrong pairing code (the dev server's code is: test)" });
    return send(res, 200, { trips: [
      { name: "2026 Montreal Birthday", start: "2026-11-12", end: "2026-11-17", need: 3, booked: 7, bookings: 43 },
      { name: "2027 🇧🇷 Brazil Carnaval", start: "2027-01-02", end: "2027-02-07", booked: 13, bookings: 14 },
      { name: "2025 Egypt", start: "2025-03-01", end: "2025-03-09", bookings: 6 },
    ] });
  }
  /* one trip and its saved places (slice 04, the trip map): still-api's /quest/trips/one and /quest/places, in memory.
     Montreal Birthday has one Notion card of its own, the stay, at an address that is not a saved place (a plain dot).
     Slice 05 (read a trip) gave the stay Day Quest's ticks and a note, a Notion page and Booked through, and added one
     plan with no date (a Maybe) and one after the trip (Outside the trip dates).
     A new place is "found" only for the names in FOUND, as the server's lookup would; anything else has no pin. */
  /* a reservation file dropped on a plan's card (2026-11-18): still-api's POST /quest/trips/file, faked. The server
     names it Ref.<Confirmation #>_<name>_confirmation.<ext> and adds it to the card's Files & media. */
  if (u.pathname === "/quest/trips/file" && req.method === "POST") {
    if (req.headers["x-quest-key"] !== "test") return send(res, 401, { error: "wrong pairing code (the dev server's code is: test)" });
    const b = await readBody(req);
    if (!/^data:(application\/pdf|image\/[a-z]+);base64,./.test(b.data || "")) return send(res, 400, { error: "send a PDF or an image" });
    const nm = `Ref._Montreal stay_confirmation.${/pdf/.test(b.data.slice(0, 30)) ? "pdf" : "png"}`;
    uploads.push({ id: b.id, filename: b.filename });
    return send(res, 200, { ok: true, name: nm, item: { id: b.id, files: [{ name: nm, url: "https://files.example/" + encodeURIComponent(nm) }] } });
  }
  /* photo notes of Commute blocks (slice 1): still-api's /quest/commute/photo and /quest/commute/photos, faked */
  if (u.pathname === "/__dev/routes") { routesDown = u.searchParams.get("down") === "1"; return send(res, 200, { routesDown }); }
  if (u.pathname === "/__dev/directions") { if (u.searchParams.get("state")) dirState = u.searchParams.get("state"); if (u.searchParams.get("next")) dirNext = true; if (u.searchParams.get("reset")) { dirNext = false; dirCalls = []; dirState = "ok"; } return send(res, 200, { dirState, dirNext, calls: dirCalls }); }
  if (u.pathname === "/quest/commute/directions") {
    if (req.headers["x-quest-key"] !== "test") return send(res, 401, { error: "wrong pairing code (the dev server's code is: test)" });
    const b = await readBody(req); dirCalls.push({ fresh: b.fresh === true, arriveBy: b.arriveBy, from: b.from && b.from.address, to: b.to && b.to.address });
    if (dirState === "no-key") return send(res, 200, { state: "no-key", message: "Directions need the Google key" });
    if (dirState === "stopped") return send(res, 200, { state: "stopped", message: "Directions are off for the rest of this month. They come back on the 1st." });
    const later = dirNext && b.fresh === true; return send(res, 200, dirAnswer(b, later));
  }
  if (u.pathname.startsWith("/quest/commute/")) {
    if (req.headers["x-quest-key"] !== "test") return send(res, 401, { error: "wrong pairing code (the dev server's code is: test)" });
    /* d9: a block's typed To and changed From, kept by block key (still-api /quest/commute/route), faked the way the server does it */
    if (u.pathname === "/quest/commute/route") {
      if (routesDown) return send(res, 503, { error: "dev: the server is down" });
      if (req.method === "GET") return send(res, 200, { route: commuteRoutes.find((x) => x.block === u.searchParams.get("block")) || null });
      const b = await readBody(req);
      const cur = commuteRoutes.find((x) => x.block === b.block) || { block: b.block, to: null, from: null };
      for (const side of ["to", "from"]) if (b[side] !== undefined && !(b.onlyIfEmpty && cur[side])) cur[side] = b[side];
      if (!commuteRoutes.includes(cur)) commuteRoutes.push(cur);
      return send(res, 200, { ok: true, route: cur.to || cur.from ? cur : null });
    }
    if (u.pathname === "/quest/commute/photos") {
      const pl = u.searchParams.get("place"), bl = u.searchParams.get("block");
      return send(res, 200, { notes: commuteNotes.filter((x) => (pl ? x.place === pl && x.withPlace : x.block === bl)).sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at)) });
    }
    if (u.pathname === "/quest/commute/photo" && req.method === "GET") { const id = u.searchParams.get("id"); return commuteFiles[id] ? send(res, 200, { data: commuteFiles[id] }) : send(res, 404, { error: "no such photo" }); }
    const b = await readBody(req);
    if (!b.note && !b.data) return send(res, 400, { error: "send a note or a photo" });
    const note = { id: "cp-" + (++n), place: b.place || "", placeName: b.placeName || "", block: b.block || "", date: b.date || "", note: b.note || "", withPlace: !!b.withPlace && !!b.place, hasFile: !!b.data, at: String(n).padStart(6, "0") };
    if (b.data) commuteFiles[note.id] = b.data;
    commuteNotes.push(note); return send(res, 200, { ok: true, note });
  }
  if (u.pathname === "/quest/trips/one" || u.pathname === "/quest/places") {
    if (req.headers["x-quest-key"] !== "test") return send(res, 401, { error: "wrong pairing code (the dev server's code is: test)" });
    const name = u.searchParams.get("name") || u.searchParams.get("trip") || "";
    if (u.pathname === "/quest/trips/one") {
      const mtl = /montreal birthday/i.test(name) && !/🇨🇦/u.test(name);
      return send(res, 200, { name, places: places.filter((p) => p.trip === name),
        extras: mtl ? { "notion-stay": { check: { 0: true, 3: true }, notes: "Late check-in is fine, call the desk" } } : {}, items: mtl ? [
        { id: "notion-stay", db: "planner", icon: "🏨", name: "Montreal stay", start: "2026-11-13T17:00:00-05:00", end: "2026-11-17T10:30:00-05:00", status: "Prepaid", tags: "Hotel",
          url: "https://www.notion.so/montreal-stay", fields: { Address: { type: "rich_text", value: "1255 Rue Jeanne-Mance, Montréal" }, "Booked Through": { type: "select", value: "Airbnb" } }, files: [], trips: [name] },
        { id: "notion-poutine", db: "planner", icon: "🍟", name: "Poutine crawl", start: "", status: "Idea", fields: {}, files: [], trips: [name] },
        { id: "notion-brunch", db: "planner", icon: "🥞", name: "Goodbye brunch", start: "2026-11-18T11:00:00-05:00", end: "2026-11-18T12:30:00-05:00", status: "Planned", fields: {}, files: [], trips: [name] }] : [] });
    }
    if (req.method === "GET") return send(res, 200, { places: name ? places.filter((p) => p.trip === name) : places });
    const b = await readBody(req);
    if (b.op === "del") { const k = places.length; places = places.filter((p) => p.id !== b.id); return send(res, 200, { ok: true, removed: k - places.length }); }
    if (!b.place || !String(b.place.name || "").trim()) return send(res, 400, { error: "a place needs a name" });
    const f = FOUND[String(b.place.name).toLowerCase().replace(/’/g, "'")];
    const pl = { category: "place", notes: "", savedBy: "Junyan", lat: null, lng: null, ...b.place, id: b.place.id || "pl" + (++n), ...(b.place.lat == null && f ? f : {}) };
    const i = places.findIndex((p) => p.id === pl.id); if (i >= 0) places[i] = pl; else places.push(pl);
    return send(res, 200, { ok: true, place: pl });
  }
  if (u.pathname.startsWith("/planner/")) {
    if (req.headers["x-quest-key"] !== "test") return send(res, 401, { error: "wrong pairing code (the dev server's code is: test)" });
    const b = req.method === "GET" || req.method === "DELETE" ? {} : await readBody(req);
    if (u.pathname === "/planner/calendars") return send(res, 200, { calendars: NO_BDAY ? CALS.filter((c) => c.id !== "bday") : CALS });
    if (u.pathname === "/planner/events") { const f = Date.parse(u.searchParams.get("from")), t = Date.parse(u.searchParams.get("to")); return send(res, 200, { events: events.filter((e) => !(NO_BDAY && e.calId === "bday")).filter((e) => { const s = Date.parse(e.start), x = Date.parse(e.end); return x > f && s < t; }).map((e) => (e.calId === "bday" ? { ...e, displayOnly: true } : e)) }); }
    /* still-api refuses every write to Community Birthdays (displayOnly), whatever Google says */
    if (u.pathname === "/planner/event" && req.method !== "GET" && (b.calId === "bday" || b.toCalId === "bday" || u.searchParams.get("calId") === "bday")) return send(res, 403, { error: "Community Birthdays is read-only here (display only)" });
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
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store", "Referrer-Policy": "same-origin" });   // the live site sends this header (still-api src/site.mjs): a tile request then carries no Referer unless the tile layer asks for one
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`calendar dev server on http://localhost:${PORT}/still/calendar.html?api=http://localhost:${PORT}  (pairing code: test)`));
