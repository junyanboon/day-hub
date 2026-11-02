/* Trips: Day Quest's desktop Trips section (Junyan, 2026-11-01; design "Layout A",
   artifact XGUE3DrhArW49V9nGJwQ4W).
   Desktop (768 px and wider): a left sidebar (Today, Calendar, Quests & XP, Skills,
   then TRIPS with each trip and "+ New trip"). A trip page is the itinerary on the
   left half (title, chips, tabs Itinerary / Bookings / Must-haves / Ideas, day chips,
   day rail of cards) and our own map on the right (Leaflet + OpenStreetMap
   tiles, no key needed). A card opens a side panel modelled on the Notion Travel Planner
   cards. Hike cards can carry a GPX file: the "Hike map" tab draws it with distance,
   climb, time and an elevation profile.
   Phone (under 768 px): this file does nothing and the app stays as it was.

   Data: still-api /quest/trips* reads and writes the Notion Travel Planner and Travel
   Activities Planner (the token lives on the server); /quest/places is our own place
   store (Google Maps is only a Directions link); /quest/places/import loads a Google
   Takeout "Saved" CSV. Until the server answers, the Montreal trip shows from the copy
   below (taken from the Joint Plans calendar) and "Create in Notion" writes it there.
   Pure helpers are on QuestTrips for still/test/trips.test.mjs.                      */
(function (root) {
  "use strict";

  /* ── pure helpers ─────────────────────────────────────────────────── */
  const R_EARTH = 6371000;
  function haversine(a, b) {
    const toR = (d) => d * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // GPX text → points [{lat,lng,ele,t}] (track points first, then route points)
  function gpxPoints(text) {
    const s = String(text || ""), pts = [];
    const re = /<(trkpt|rtept)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
    let m;
    while ((m = re.exec(s))) {
      const lat = /lat\s*=\s*["']([-\d.]+)/.exec(m[2]), lon = /lon\s*=\s*["']([-\d.]+)/.exec(m[2]);
      if (!lat || !lon) continue;
      const inner = m[4] || "";
      const ele = /<ele>\s*([-\d.]+)\s*<\/ele>/.exec(inner), t = /<time>\s*([^<]+?)\s*<\/time>/.exec(inner);
      pts.push({ lat: +lat[1], lng: +lon[1], ele: ele ? +ele[1] : null, t: t ? Date.parse(t[1]) : null, kind: m[1] });
    }
    const trk = pts.filter((p) => p.kind === "trkpt");
    return trk.length ? trk : pts;
  }
  /* Distance, climb (ignoring wiggles under 3 m), time (from timestamps when the file
     has them, else Naismith: 5 km/h plus 1 hour per 600 m of climb) and a profile. */
  function gpxStats(text) {
    const pts = gpxPoints(text);
    if (pts.length < 2) return null;
    let dist = 0, climb = 0, descent = 0, ref = null, lo = Infinity, hi = -Infinity;
    const profile = [[0, pts[0].ele]];
    for (let i = 0; i < pts.length; i++) {
      if (i) { dist += haversine(pts[i - 1], pts[i]); profile.push([dist, pts[i].ele]); }
      const e = pts[i].ele;
      if (e == null) continue;
      lo = Math.min(lo, e); hi = Math.max(hi, e);
      if (ref == null) ref = e;
      else if (e - ref >= 3) { climb += e - ref; ref = e; }
      else if (ref - e >= 3) { descent += ref - e; ref = e; }
    }
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const timed = t0 && t1 && t1 > t0;
    const secs = timed ? (t1 - t0) / 1000 : (dist / 1000 / 5 + climb / 600) * 3600;
    return { km: dist / 1000, climb: Math.round(climb), descent: Math.round(descent), secs: Math.round(secs), timed: !!timed,
      lo: lo === Infinity ? null : Math.round(lo), hi: hi === -Infinity ? null : Math.round(hi),
      profile: profile.filter((p) => p[1] != null), line: pts.map((p) => [p.lat, p.lng]) };
  }
  const fmtDur = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
  // "2026-11-13T17:00:00-05:00" → day number from the trip's first day (local date part)
  function dayIndex(start, tripStart) {
    if (!start || !tripStart) return -1;
    const d = Date.UTC(...start.slice(0, 10).split("-").map((x, i) => +x - (i === 1 ? 1 : 0)));
    const t = Date.UTC(...tripStart.slice(0, 10).split("-").map((x, i) => +x - (i === 1 ? 1 : 0)));
    return Math.round((d - t) / 86400000);
  }
  function pillOf(status) {
    const s = String(status || "").toLowerCase();
    if (!s) return "plan";
    if (/need to book|not booked|to book/.test(s)) return "need";
    if (/unpaid|balance|deposit/.test(s)) return "warn";
    if (/prepaid|paid|booked|confirmed|done/.test(s)) return "paid";
    if (/idea|maybe|option|pick|check/.test(s)) return "idea";
    return "plan";
  }
  const isStay = (it) => /stay|hotel|airbnb|check-?in|check-?out|lodg|hostel/i.test(`${it.name} ${it.tags} ${it.kind || ""}`);
  const isHike = (it) => it.kind === "hike" || /hike|trail|trek|🥾/i.test(`${it.name} ${it.tags} ${it.icon}`);
  function timeOf(iso) {
    const m = /T(\d\d):(\d\d)/.exec(iso || "");
    if (!m) return "";
    let h = +m[1]; const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12;
    return `${h}:${m[2]} ${ap}`;
  }
  function whenText(it) {
    const a = timeOf(it.start), b = it.end && it.end.slice(0, 10) === (it.start || "").slice(0, 10) ? timeOf(it.end) : "";
    return a ? (b ? `${a} to ${b}` : a) : "";
  }

  /* ── the first trip, from the Joint Plans calendar (Nov 12 to 17 2026) ───── */
  const MTL = "Montreal birthday trip";
  const P = { alliance: "Alliance Dance Company, 2529 Rue Ontario E, Montréal", piernas: "Las Piernas, 2019 Rue Moreau, Montréal",
    studio: "Studio 2790, 2790 Rue Hochelaga, Montréal" };
  const ev = (id, db, icon, name, start, end, status, address, extra = {}) => ({ id: "seed-" + id, db, icon, name, start, end,
    status, tags: "", address, fields: {}, seed: true, ...extra });
  const SEED = {
    name: MTL, start: "2026-11-12", end: "2026-11-17", icon: "🎂", who: "You + Caney",
    items: [
      ev("preparty", "activities", "💃", "Pre-Party?", "2026-11-12T20:30:00-05:00", "2026-11-12T23:00:00-05:00", "Maybe", P.studio),
      ev("stay", "planner", "🏨", "Montreal stay", "2026-11-13T17:00:00-05:00", "2026-11-17T10:30:00-05:00", "Need to Book", "", { kind: "stay", tags: "Hotel" }),
      ev("fri-lambada", "activities", "💃", "Lambada workshop", "2026-11-13T21:00:00-05:00", "", "Planned", P.alliance),
      ev("fri-social", "activities", "🎶", "Social", "2026-11-13T22:00:00-05:00", "2026-11-14T02:00:00-05:00", "Planned", P.alliance),
      ev("sat-ws", "activities", "💃", "Zouk, Lambada, Solo Battle workshops", "2026-11-14T13:00:00-05:00", "2026-11-14T17:00:00-05:00", "Planned", P.alliance),
      ev("sat-piernas", "activities", "💃", "Zouk workshop + Social", "2026-11-14T21:00:00-05:00", "2026-11-15T02:00:00-05:00", "Planned", P.piernas),
      ev("sun-ws", "activities", "💃", "Lambada, Zouk workshops + Practica", "2026-11-15T13:00:00-05:00", "2026-11-15T17:00:00-05:00", "Planned", P.alliance),
      ev("sun-dinner", "activities", "🍽", "Dinner with everyone?", "2026-11-15T17:30:00-05:00", "2026-11-15T20:00:00-05:00", "Maybe", ""),
      ev("mon-hike", "activities", "🥾", "Mount Royal walk", "2026-11-16T09:00:00-05:00", "", "Idea", "Mount Royal, Montréal", { kind: "hike" }),
      ev("spa", "planner", "♨", "Spa & Recovery Day", "2026-11-16T11:00:00-05:00", "2026-11-16T17:30:00-05:00", "Need to Book", "", { tags: "Spa" }),
      ev("mon-dinner", "activities", "🎂", "Dinner with Montreal friends?", "2026-11-16T18:30:00-05:00", "2026-11-16T21:00:00-05:00", "Maybe", ""),
    ],
    places: [
      { id: "seed-alliance", name: "Alliance Dance Company", address: "2529 Rue Ontario E, Montréal", lat: 45.5341, lng: -73.5523, category: "dance" },
      { id: "seed-piernas", name: "Las Piernas", address: "2019 Rue Moreau, Montréal", lat: 45.5418, lng: -73.5437, category: "dance" },
      { id: "seed-studio", name: "Studio 2790", address: "2790 Rue Hochelaga, Montréal", lat: 45.5446, lng: -73.5437, category: "dance" },
      { id: "seed-royal", name: "Mount Royal lookout", address: "Kondiaronk Belvedere, Montréal", lat: 45.5039, lng: -73.5874, category: "hike" },
    ].map((p) => ({ ...p, trip: MTL, savedBy: "Junyan", notes: "", seed: true })),
  };
  // what "Create in Notion" writes for the Montreal trip
  function seedRows(trip) {
    const rows = { planner: [], activities: [] };
    for (const it of trip.items) {
      const dates = it.start ? it.start + (it.end ? " → " + it.end : "") : "";
      const props = { "Date (Timezone)": dates, Date: dates };
      if (it.db === "planner") Object.assign(props, { Status: it.status, "Departure / Check-in": it.start, "Arrival / Check-out": it.end });
      else if (it.address) Object.assign(props, { Address: it.address, Location: it.address });
      rows[it.db].push({ name: it.name, icon: it.icon, props });
    }
    return rows;
  }

  const api = { haversine, gpxPoints, gpxStats, dayIndex, pillOf, isStay, isHike, whenText, seedRows, SEED, fmtDur };
  root.QuestTrips = api;
  if (typeof document === "undefined" || typeof window === "undefined") return;

  /* ── page wiring (desktop only) ───────────────────────────────────── */
  const WIDE = window.matchMedia("(min-width: 768px)");
  if (!WIDE.matches) { WIDE.addEventListener && WIDE.addEventListener("change", (e) => e.matches && location.reload()); return; }
  WIDE.addEventListener && WIDE.addEventListener("change", (e) => !e.matches && location.reload());

  const API = new URLSearchParams(location.search).get("api") || "https://still.srv1948070.hstgr.cloud";
  const key = () => { try { return localStorage.getItem("quest-key") || ""; } catch { return ""; } };
  async function call(path, body) {
    const r = await fetch(API + path, { method: body ? "POST" : "GET", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Quest-Key": key() }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
    return d;
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gmaps = (q) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  const gdir = (p) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(p.lat != null ? `${p.lat},${p.lng}` : p.address || p.name);

  const css = document.createElement("style");
  css.textContent = `
  body.has-side{padding-left:210px}
  #tripSide{position:fixed;left:0;top:0;bottom:0;width:210px;z-index:40;background:rgba(10,12,32,.6);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    border-right:1px solid rgba(255,255,255,.12);padding:20px 12px;display:flex;flex-direction:column;gap:2px;overflow:auto;font-family:var(--font)}
  #tripSide .brand{display:flex;gap:10px;align-items:center;padding:0 8px 18px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,.12)}
  #tripSide .logo{width:36px;height:36px;border-radius:10px;background:var(--zap);display:grid;place-items:center;color:#2a2453;font-weight:800}
  #tripSide .brand b{font-size:17px;color:var(--ink)}#tripSide .brand b span{color:var(--zap)}#tripSide .brand small{display:block;color:var(--ink-faint);font-size:10px;letter-spacing:2px}
  #tripSide .nav{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:12px;color:var(--ink-soft);font:inherit;font-size:15px;text-align:left;width:100%;background:none;border:0;cursor:pointer}
  #tripSide .nav:hover{background:rgba(255,255,255,.07)}
  #tripSide .nav.on{background:rgba(255,255,255,.14);color:var(--zap);font-weight:600}
  #tripSide .sec{font-size:10px;letter-spacing:2px;color:var(--ink-faint);padding:16px 12px 6px}
  body.trip-open #app{display:none}
  #tripView{position:fixed;left:210px;top:0;right:0;bottom:0;z-index:30;display:none;font-family:var(--font);color:var(--ink)}
  body.trip-open #tripView{display:flex}
  #tripView button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}
  #tripView a{color:var(--zap);text-decoration:none}
  #tripView .left{width:50%;flex:none;overflow:auto;padding:22px 24px;background:rgba(0,0,0,.18)}
  #tripView h1{font-size:26px;font-weight:700;margin:0}
  #tripView .meta{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 14px}
  #tripView .chip{padding:4px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:12px;color:var(--ink-soft)}
  #tripView .chip.warn{border-color:rgba(255,194,122,.5);color:var(--warn)}
  #tripView .chip.act{cursor:pointer;border-color:rgba(201,182,255,.5);color:var(--zap)}
  #tripView .tabs{display:flex;gap:22px;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:14px}
  #tripView .tabs button{padding:10px 0;font-size:14px;color:var(--ink-faint);border-bottom:2px solid transparent;margin-bottom:-1px}
  #tripView .tabs button.on{color:var(--ink);border-color:var(--zap);font-weight:600}
  #tripView .n{font-size:11px;color:var(--ink-faint);margin-left:4px}
  #tripView .daychips{display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap}
  #tripView .daychips button{padding:6px 13px;border:1px solid rgba(255,255,255,.12);border-radius:999px;font-size:13px;color:var(--ink-soft)}
  #tripView .daychips button.on{border-color:var(--ink);color:var(--ink);font-weight:600}
  #tripView .day{font-size:16px;font-weight:600;margin:18px 0 10px;display:flex;justify-content:space-between;align-items:baseline}
  #tripView .day small{color:var(--ink-faint);font-weight:400;font-size:12px}
  #tripView .rail{position:relative;padding-left:34px}
  #tripView .rail:before{content:"";position:absolute;left:13px;top:6px;bottom:6px;width:2px;background:rgba(255,255,255,.12)}
  #tripView .item{position:relative;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:11px 14px;margin-bottom:9px;display:flex;gap:12px;align-items:center;cursor:pointer}
  #tripView .item:hover{border-color:rgba(255,255,255,.25)}
  #tripView .item.sel{border-color:var(--zap);background:rgba(201,182,255,.1)}
  #tripView .item .ic{position:absolute;left:-34px;top:11px;width:28px;height:28px;border-radius:50%;background:#2a2f63;border:1px solid rgba(255,255,255,.12);display:grid;place-items:center;font-size:14px}
  #tripView .item .t{font-weight:600;font-size:14px}#tripView .item .s{color:var(--ink-faint);font-size:12px;margin-top:2px}
  #tripView .item .r{margin-left:auto;text-align:right;font-size:12px;color:var(--ink-soft);white-space:nowrap}
  #tripView .pill{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600}
  #tripView .need{background:rgba(255,194,122,.18);color:var(--warn)}#tripView .paid{background:rgba(143,227,176,.18);color:var(--good)}
  #tripView .warn{background:rgba(255,156,156,.16);color:var(--bad)}
  #tripView .plan{background:rgba(156,200,255,.18);color:#9cc8ff}#tripView .idea{background:rgba(255,255,255,.1);color:var(--ink-soft)}
  #tripView .right{flex:1;display:flex;flex-direction:column;border-left:1px solid rgba(255,255,255,.12);min-width:0;position:relative}
  #tripView .mapbar{display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.12);background:rgba(10,12,32,.5)}
  #tripView .seg{display:flex;background:rgba(255,255,255,.07);border-radius:10px;padding:3px}
  #tripView .seg button{padding:6px 12px;border-radius:8px;font-size:13px;color:var(--ink-faint)}
  #tripView .seg button.on{background:rgba(255,255,255,.14);color:var(--ink);font-weight:600}
  #tripView .seg button:disabled{opacity:.35;cursor:not-allowed}
  #tripView .btn{padding:7px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.12);font-size:13px;color:var(--ink-soft);white-space:nowrap}
  #tripView .btn.pri{background:var(--zap);color:#2a2453;border:0;font-weight:700}
  #tripView .mapwrap{flex:1;position:relative;background:#151a40}
  #tripMap{position:absolute;inset:0}
  #tripView .leaflet-container{background:#151a40;font-family:var(--font)}
  #tripView .hikebox{position:absolute;left:12px;right:12px;bottom:12px;z-index:500;background:rgba(23,48,31,.92);border-radius:14px;padding:14px 16px;border:1px solid rgba(255,255,255,.12)}
  #tripView .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
  #tripView .stats div{background:rgba(255,255,255,.07);border-radius:10px;padding:8px 10px;font-size:12px;color:var(--ink-faint)}
  #tripView .stats b{display:block;color:var(--ink);font-size:16px}
  #tripView .hikebox svg{width:100%;height:110px;display:block}
  #tripView .drawer{position:absolute;top:0;right:0;bottom:0;width:440px;max-width:100%;z-index:900;background:#1b2050;border-left:1px solid rgba(255,255,255,.12);box-shadow:-20px 0 40px rgba(0,0,0,.4);overflow:auto;padding:20px 22px;transform:translateX(105%);transition:transform .25s}
  #tripView .drawer.open{transform:none}
  #tripView .drawer h2{font-size:20px;margin:4px 0 8px;text-transform:none;letter-spacing:0;display:block}
  #tripView .x{position:absolute;top:14px;right:14px;font-size:20px;color:var(--ink-faint)}
  #tripView .kv{display:grid;grid-template-columns:120px 1fr;gap:8px 12px;font-size:13px;margin:14px 0}
  #tripView .kv>span{color:var(--ink-faint)}
  #tripView [contenteditable]{min-height:18px;border-radius:4px;padding:1px 3px;background:rgba(255,255,255,.04)}
  #tripView [contenteditable]:focus{outline:2px solid var(--zap)}
  #tripView .blk{border-top:1px solid rgba(255,255,255,.12);padding:12px 0}
  #tripView .blk h3{font-size:13px;color:var(--ink-soft);margin:0 0 8px;letter-spacing:.3px}
  #tripView .chk{display:flex;gap:9px;font-size:13px;padding:4px 0;color:var(--ink-soft);cursor:pointer}
  #tripView .chk i{width:15px;height:15px;border-radius:4px;border:1.5px solid var(--ink-faint);flex:none;margin-top:1px}
  #tripView .chk.y i{background:var(--good);border-color:var(--good)}
  #tripView .chk.y{color:var(--ink-faint);text-decoration:line-through}
  #tripView .log{font-size:12px;color:var(--ink-faint);line-height:1.5}
  #tripView table{width:100%;border-collapse:collapse;font-size:13px}
  #tripView th{text-align:left;color:var(--ink-faint);font-weight:500;font-size:12px;padding:8px;border-bottom:1px solid rgba(255,255,255,.12)}
  #tripView td{padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.12)}
  #tripView .toast{position:absolute;left:24px;bottom:18px;z-index:950;background:#2a2f63;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:8px 12px;font-size:13px}
  #tripView .src{font-size:11px;color:var(--ink-faint);margin-top:18px}
  .trip-pin{width:26px;height:26px;border-radius:50%;background:#2a2f63;border:2px solid var(--zap);display:grid;place-items:center;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.5)}
  .trip-pin.on{border-color:var(--gold);transform:scale(1.25)}`;
  document.head.appendChild(css);

  const side = document.createElement("aside");
  side.id = "tripSide";
  const view = document.createElement("section");
  view.id = "tripView";
  view.innerHTML = `<div class="left" id="tvLeft"></div><div class="right"><div class="mapbar"><div class="seg"><button class="on" id="tvMapBtn">🗺 Map</button><button id="tvHikeBtn" disabled title="Pick a hike card">🥾 Hike map</button></div>
    <span style="flex:1"></span><button class="btn" id="tvImport" title="Google Takeout, Saved, one CSV per list">⬆ Import Google list</button><button class="btn pri" id="tvAddPlace">＋ Add place</button></div>
    <div class="mapwrap"><div id="tripMap"></div><div id="tvHike"></div></div></div><div class="drawer" id="tvDrawer"></div><input type="file" id="tvFile" hidden>`;
  document.body.appendChild(side);
  document.body.appendChild(view);
  document.body.classList.add("has-side");

  const S = { trips: [], cur: null, tab: "Itinerary", day: -1, sel: null, mode: "map", live: false, note: "" };
  const extrasOf = (id) => (S.cur.extras[id] = S.cur.extras[id] || {});

  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; view.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  /* sidebar */
  function drawSide(active) {
    const navs = [["today", "☀ Today"], ["cal", "▦ Calendar"], ["quests", "★ Quests &amp; XP"], ["skills", "◆ Skills"]];
    side.innerHTML = `<div class="brand"><div class="logo">★</div><div><b>DAY <span>QUEST</span></b><small>STILLNESS</small></div></div>` +
      navs.map(([k, l]) => `<button class="nav ${active === k ? "on" : ""}" data-nav="${k}">${l}</button>`).join("") +
      `<div class="sec">TRIPS</div>` +
      S.trips.map((t) => `<button class="nav ${active === "trip:" + t.name ? "on" : ""}" data-trip="${esc(t.name)}">${esc(t.icon || "🧳")} ${esc(t.name.replace(/ trip$/i, ""))}</button>`).join("") +
      `<button class="nav" data-nav="new" style="color:var(--ink-faint)">＋ New trip</button>`;
    side.querySelectorAll("[data-nav]").forEach((b) => b.onclick = () => go(b.dataset.nav));
    side.querySelectorAll("[data-trip]").forEach((b) => b.onclick = () => openTrip(b.dataset.trip));
  }
  function go(k) {
    if (k === "new") return newTrip();
    document.body.classList.remove("trip-open");
    drawSide(k);
    const el = k === "cal" ? document.querySelector(".cal-h") : k === "quests" ? document.getElementById("main") : k === "skills" ? document.getElementById("skillsRow") : null;
    if (k === "skills") { const b = document.getElementById("skillsBtn"); if (b) b.click(); }
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); else window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function newTrip() {
    const name = (prompt("Trip name (for example: Lisbon spring trip)") || "").trim();
    if (!name) return;
    const dates = (prompt("Dates, first and last day (YYYY-MM-DD YYYY-MM-DD)") || "").trim().split(/\s+/);
    try {
      await call("/quest/trips/create", { db: "planner", trip: name, rows: [{ name: name + " (overview)", icon: "🧳",
        props: { "Date (Timezone)": dates[0] ? dates[0] + (dates[1] ? " → " + dates[1] : "") : "", Status: "Need to Book" } }] });
      S.trips.unshift({ name, start: dates[0] || "", end: dates[1] || dates[0] || "", icon: "🧳" });
      openTrip(name);
    } catch (e) { alert("Could not save the trip to Notion: " + e.message); }
  }

  /* loading */
  async function loadTrips() {
    S.trips = [{ name: MTL, start: SEED.start, end: SEED.end, icon: "🎂" }];
    try {
      const d = await call("/quest/trips");
      S.live = true;
      for (const t of d.trips || []) if (!S.trips.some((x) => x.name === t.name)) S.trips.push({ ...t, icon: "🧳" });
    } catch (e) { S.note = e.message; }
    drawSide("today");
  }
  async function openTrip(name) {
    const meta = S.trips.find((t) => t.name === name) || { name };
    S.cur = { name, start: meta.start, end: meta.end, icon: meta.icon || "🧳", who: "", items: [], extras: {}, places: [], seeded: false };
    S.tab = "Itinerary"; S.day = -1; S.sel = null; S.mode = "map";
    document.body.classList.add("trip-open");
    drawSide("trip:" + name);
    let d = null;
    try { d = await call("/quest/trips/one?name=" + encodeURIComponent(name)); S.live = true; } catch (e) { S.note = e.message; }
    if (d) { S.cur.items = d.items || []; S.cur.extras = d.extras || {}; S.cur.places = d.places || []; }
    if (name === MTL) {
      S.cur.who = SEED.who; S.cur.start = S.cur.start || SEED.start; S.cur.end = SEED.end;
      // show the calendar copy for anything Notion does not have yet
      const have = new Set(S.cur.items.map((i) => i.name.toLowerCase()));
      const missing = SEED.items.filter((i) => !have.has(i.name.toLowerCase()));
      if (missing.length) { S.cur.items.push(...missing.map((i) => ({ ...i }))); S.cur.seeded = true; }
      if (!S.cur.places.length) S.cur.places = SEED.places.map((p) => ({ ...p }));
      try { const ex = JSON.parse(localStorage.getItem("quest-trip-seed-extras") || "{}"); for (const k in ex) S.cur.extras[k] = S.cur.extras[k] || ex[k]; } catch {}
      for (const it of S.cur.items) if (it.seed && (S.cur.extras[it.id] || {}).status) it.status = S.cur.extras[it.id].status;
    }
    if (!S.cur.start) {
      const ds = S.cur.items.map((i) => (i.start || "").slice(0, 10)).filter(Boolean).sort();
      S.cur.start = ds[0] || ""; S.cur.end = S.cur.end || ds[ds.length - 1] || "";
    }
    S.cur.items.sort((a, b) => (a.start || "9").localeCompare(b.start || "9"));
    drawLeft(); drawMap(); closeDrawer(true);
  }

  /* left half */
  const TABS = ["Itinerary", "Bookings", "Must-haves", "Ideas"];
  function days() {
    const out = [];
    if (!S.cur.start) return out;
    const n = Math.max(0, dayIndex(S.cur.end || S.cur.start, S.cur.start));
    for (let i = 0; i <= Math.min(n, 30); i++) {
      const d = new Date(S.cur.start + "T12:00:00");
      d.setDate(d.getDate() + i);
      out.push(d.toLocaleDateString("en-CA", { weekday: "short" }) + " " + d.getDate());
    }
    return out;
  }
  const label = (it) => it.status || "Planned";
  function card(it) {
    const where = it.address ? " · " + esc(it.address.split(",")[0]) : "";
    const w = whenText(it);
    return `<div class="item ${S.sel === it.id ? "sel" : ""}" data-id="${esc(it.id)}"><div class="ic">${esc(it.icon || (isStay(it) ? "🏨" : isHike(it) ? "🥾" : "📍"))}</div>
      <div><div class="t">${esc(it.name)}</div><div class="s">${esc(w)}${where}</div></div>
      <div class="r"><span class="pill ${pillOf(it.status)}">${esc(label(it))}</span>${it.seed ? `<div class="log" style="margin-top:4px">calendar copy</div>` : ""}</div></div>`;
  }
  function drawLeft() {
    const c = S.cur, D = days();
    const need = c.items.filter((i) => pillOf(i.status) === "need");
    const ideas = c.items.filter((i) => pillOf(i.status) === "idea");
    const away = c.start ? Math.round((new Date(c.start + "T00:00:00") - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
    const fmt = (s) => s ? new Date(s + "T12:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }) : "";
    let h = `<h1>${esc(c.icon)} ${esc(c.name)}</h1><div class="meta">${c.start ? `<span class="chip">${fmt(c.start)} to ${fmt(c.end)}</span>` : ""}
      ${c.who ? `<span class="chip">${esc(c.who)}</span>` : ""}${away != null && away >= 0 ? `<span class="chip">${away} days away</span>` : ""}
      ${need.map((i) => `<span class="chip warn">${esc(isStay(i) ? "Hotel" : i.name.replace(/ Day$/, ""))} not booked</span>`).join("")}
      ${c.seeded ? `<span class="chip act" id="tvSync" title="Writes the calendar copy into your Notion Travel Planner and Travel Activities Planner">⇪ Create in Notion</span>` : ""}</div>
      <div class="tabs">${TABS.map((t) => { const n = t === "Bookings" ? c.items.filter((i) => i.db === "planner").length : t === "Ideas" ? ideas.length : 0;
        return `<button class="${t === S.tab ? "on" : ""}" data-t="${t}">${t}${n ? `<span class="n">${n}</span>` : ""}</button>`; }).join("")}</div>`;
    if (S.tab === "Itinerary") {
      h += `<div class="daychips"><button class="${S.day < 0 ? "on" : ""}" data-d="-1">All</button>${D.map((d, i) => `<button class="${S.day === i ? "on" : ""}" data-d="${i}">${d}</button>`).join("")}</div>`;
      const undated = c.items.filter((i) => dayIndex(i.start, c.start) < 0 || dayIndex(i.start, c.start) >= D.length);
      (S.day < 0 ? D.map((_, i) => i) : [S.day]).forEach((d) => {
        const its = c.items.filter((i) => dayIndex(i.start, c.start) === d);
        h += `<div class="day">${D[d]}<small></small></div><div class="rail">${its.map(card).join("") || `<div class="log">Nothing planned yet.</div>`}</div>`;
      });
      if (S.day < 0 && undated.length) h += `<div class="day">No date yet</div><div class="rail">${undated.map(card).join("")}</div>`;
    }
    if (S.tab === "Bookings") {
      const rows = c.items.filter((i) => i.db === "planner");
      const cols = ["Booked Through", "Points / Cash", "Credit Card", "Cancellation Policy"];
      h += `<table><tr><th>Name</th><th>Dates</th><th>Status</th>${cols.map((k) => `<th>${k === "Cancellation Policy" ? "Cancel by" : k}</th>`).join("")}</tr>` +
        rows.map((it) => `<tr data-id="${esc(it.id)}"><td style="cursor:pointer" data-open>${esc(it.icon || "")} ${esc(it.name)}</td><td>${esc((it.start || "").slice(5, 10))}${it.end ? " to " + esc(it.end.slice(5, 10)) : ""}</td>
          <td><span class="pill ${pillOf(it.status)}">${esc(label(it))}</span></td>${cols.map((k) => `<td contenteditable data-f="${esc(k)}">${esc(fieldVal(it, k))}</td>`).join("")}</tr>`).join("") +
        `<tr><td colspan="7" style="color:var(--ink-faint);cursor:pointer" id="tvNewBooking">＋ New booking (saves to the Notion Travel Planner)</td></tr></table>`;
    }
    if (S.tab === "Must-haves") {
      const list = (c.extras["trip:" + c.name] || {}).musts || [{ name: "🪪 IDs", notes: "" }, { name: "👟 Dance shoes + outfits", notes: "" }, { name: "🏠 Studio cover", notes: "Who watches the studios while away" }];
      h += `<table id="tvMusts"><tr><th>Name</th><th>Notes</th></tr>${list.map((m) => `<tr><td contenteditable>${esc(m.name)}</td><td contenteditable>${esc(m.notes)}</td></tr>`).join("")}
        <tr><td colspan="2" style="color:var(--ink-faint);cursor:pointer" id="tvNewMust">＋ New row</td></tr></table>`;
    }
    if (S.tab === "Ideas") h += `<div class="rail">${ideas.map(card).join("") || `<div class="log">No ideas yet.</div>`}</div>
      <div class="day">Saved places<small>${c.places.length}</small></div><div class="rail">${c.places.map((p) => `<div class="item" data-place="${esc(p.id)}"><div class="ic">📍</div><div><div class="t">${esc(p.name)}</div><div class="s">${esc(p.category)}${p.address ? " · " + esc(p.address.split(",")[0]) : ""}</div></div><div class="r"><a href="${gdir(p)}" target="_blank" rel="noopener">Directions ↗</a></div></div>`).join("")}</div>`;
    h += `<div class="src">${S.live ? "Live from Notion through the Still server." : "Server not reachable (" + esc(S.note || "offline") + "): showing the calendar copy; changes stay on this screen."}</div>`;
    const L = document.getElementById("tvLeft"); L.innerHTML = h;
    L.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => { S.tab = b.dataset.t; drawLeft(); });
    L.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => { S.day = +b.dataset.d; drawLeft(); });
    L.querySelectorAll(".item[data-id]").forEach((b) => b.onclick = () => openItem(b.dataset.id));
    L.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openItem(b.closest("tr").dataset.id));
    L.querySelectorAll(".item[data-place]").forEach((b) => b.onclick = (e) => { if (e.target.tagName !== "A") focusPlace(b.dataset.place); });
    L.querySelectorAll("td[data-f]").forEach((td) => td.onblur = () => saveField(td.closest("tr").dataset.id, td.dataset.f, td.textContent));
    const sync = document.getElementById("tvSync"); if (sync) sync.onclick = syncSeed;
    const nb = document.getElementById("tvNewBooking"); if (nb) nb.onclick = newBooking;
    const nm = document.getElementById("tvNewMust"); if (nm) nm.onclick = () => { saveMusts(true); };
    const mt = document.getElementById("tvMusts"); if (mt) mt.querySelectorAll("td[contenteditable]").forEach((td) => td.onblur = () => saveMusts(false));
  }
  function saveMusts(addRow) {
    const rows = [...document.querySelectorAll("#tvMusts tr")].slice(1).filter((r) => r.querySelectorAll("td[contenteditable]").length)
      .map((r) => { const t = r.querySelectorAll("td"); return { name: t[0].textContent.trim(), notes: t[1].textContent.trim() }; }).filter((m) => m.name || m.notes);
    if (addRow) rows.push({ name: "", notes: "" });
    const k = "trip:" + S.cur.name;
    S.cur.extras[k] = { ...(S.cur.extras[k] || {}), musts: rows };
    saveExtra(k.replace(/[^a-z0-9-]/gi, "-").slice(0, 60), k);
    if (addRow) drawLeft();
  }
  async function newBooking() {
    const name = (prompt("What is the booking? (for example: Train to Montreal)") || "").trim();
    if (!name) return;
    try {
      const d = await call("/quest/trips/create", { db: "planner", trip: S.cur.name, rows: [{ name, props: { Status: "Need to Book" } }] });
      S.cur.items.push(...(d.made || []));
      drawLeft(); toast("Saved to the Notion Travel Planner");
    } catch (e) { toast("Not saved: " + e.message); }
  }
  async function syncSeed() {
    if (!confirm("Write the Montreal trip into Notion now? It adds the cards Notion does not have yet (stay and spa as Need to Book) and does not touch other trips.")) return;
    const rows = seedRows({ items: S.cur.items.filter((i) => i.seed) });
    try {
      let made = 0;
      for (const db of ["planner", "activities"]) if (rows[db].length) made += ((await call("/quest/trips/create", { db, trip: S.cur.name, rows: rows[db] })).made || []).length;
      for (const p of S.cur.places.filter((p) => p.seed)) await call("/quest/places", { op: "put", place: { ...p, id: p.id.replace(/^seed-/, "mtl-") } });
      toast(`Created ${made} cards in Notion`);
      openTrip(S.cur.name);
    } catch (e) { toast("Notion said: " + e.message); }
  }

  /* fields: a Notion column when the card has one, else our extras */
  const ALIAS = { "Cancel by": ["Cancellation Policy", "Cancel By", "Cancel by"], "Card": ["Credit Card", "Card"],
    "Confirmation #": ["Confirmation #", "Confirmation", "Confirmation Number"], "Address": ["Address", "Location"] };
  const colFor = (it, k) => (ALIAS[k] || [k]).find((n) => it.fields && it.fields[n]);
  function fieldVal(it, k) {
    const col = colFor(it, k);
    if (col) return it.fields[col].value;
    if (k === "Address" && it.address) return it.address;
    return (extrasOf(it.id).f || {})[k] || "";
  }
  async function saveField(id, k, value) {
    const it = S.cur.items.find((i) => i.id === id);
    if (!it) return;
    value = String(value || "").trim();
    if (fieldVal(it, k) === value) return;
    const col = colFor(it, k);
    if (col && !it.seed) {
      try { const d = await call("/quest/trips/item", { id, db: it.db, props: { [col]: value } }); Object.assign(it, d.item, { db: it.db }); toast("Saved to Notion"); }
      catch (e) { toast("Not saved: " + e.message); }
    } else {
      const ex = extrasOf(id); ex.f = { ...(ex.f || {}), [k]: value };
      if (k === "Address") it.address = value;
      saveExtra(id);
    }
  }
  async function saveExtra(id, k = id) {
    const extra = S.cur.extras[k] || {};
    if (String(id).startsWith("seed-")) {
      try { const all = JSON.parse(localStorage.getItem("quest-trip-seed-extras") || "{}"); all[id] = extra; localStorage.setItem("quest-trip-seed-extras", JSON.stringify(all)); } catch {}
      return;
    }
    try { await call("/quest/trips/extra", { id, extra }); } catch (e) { toast("Not saved: " + e.message); }
  }

  /* side panel */
  const CHECK = ["Research and pick the place", "Upload confirmation #", "Cancellation policy", "Address (opens in Google Maps)", "Pay outstanding balance", "Pictures of the room & amenities"];
  function openItem(id) {
    const it = S.cur.items.find((i) => i.id === id);
    if (!it) return;
    S.sel = id; drawLeft(); drawMap();
    const ex = extrasOf(id), d = days()[dayIndex(it.start, S.cur.start)] || "";
    const kv = (k, editable = true) => `<span>${k}</span><div ${editable ? `contenteditable data-k="${esc(k)}"` : ""}>${esc(fieldVal(it, k))}</div>`;
    const addr = fieldVal(it, "Address");
    const stay = isStay(it) ? `<div class="blk"><h3>CHECKLIST (same as your Notion cards)</h3>${CHECK.map((c, i) => `<div class="chk ${(ex.check || {})[i] ? "y" : ""}" data-c="${i}"><i></i>${esc(c)}</div>`).join("")}</div>` +
      [["benefits", "🏨 STAY BENEFITS", "Breakfast, upgrade, early check-in, late checkout, status."], ["credits", "💳 CREDITS TO USE", "Any hotel or card credit, with its deadline."],
       ["gym", "🏋️ GYM PLAN", "Hotel gym, plus the nearest full gym with walking directions."], ["emails", "📬 EMAILS", "Booking emails and confirmation numbers."]]
        .map(([k, t, ph]) => `<div class="blk"><h3>${t}</h3><div contenteditable class="log" data-x="${k}" data-ph="${esc(ph)}">${esc(ex[k] || "")}</div></div>`).join("") : "";
    const hike = isHike(it) ? `<div class="blk"><h3>🥾 TRAIL (GPX)</h3><div class="log">${ex.gpxName ? "Attached: " + esc(ex.gpxName) + " · " : ""}<a href="#" id="tvGpx">${ex.gpxName ? "Replace" : "＋ Attach"} GPX file</a></div></div>` : "";
    const files = (ex.files || []).map((f, i) => `<div><a href="${esc(f)}" target="_blank" rel="noopener">${esc(f.replace(/^https?:\/\//, "").slice(0, 40))} ↗</a> <a href="#" data-rmf="${i}" style="color:var(--ink-faint)">×</a></div>`).join("");
    const D = document.getElementById("tvDrawer");
    D.innerHTML = `<button class="x" id="tvClose">×</button><div style="font-size:12px;color:var(--ink-faint)">${esc(d)} ${esc((it.start || "").slice(0, 4))}</div>
      <h2>${esc(it.icon || "")} ${esc(it.name)}</h2><span class="pill ${pillOf(it.status)}">${esc(label(it))}</span>
      <div class="kv"><span>When</span><div>${esc(whenText(it) || "No time yet")}</div>
      <span>Status</span><div><select id="tvStatus" style="font:inherit;background:#2a2f63;color:var(--ink);border:1px solid rgba(255,255,255,.2);border-radius:6px">
        ${["Need to Book", "Booked Unpaid", "Prepaid", "Planned", "Idea", "Maybe"].concat(it.status && !["Need to Book", "Booked Unpaid", "Prepaid", "Planned", "Idea", "Maybe"].includes(it.status) ? [it.status] : []).map((s) => `<option ${s === it.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
      ${kv("Address")}<span>Google Maps</span><div>${addr ? `<a href="${gmaps(addr)}" target="_blank" rel="noopener">Open ↗</a> · <a href="${gdir({ address: addr })}" target="_blank" rel="noopener">Directions ↗</a>` : `<span style="color:var(--ink-faint)">add an address</span>`}</div>
      ${kv("Booked Through")}${kv("Points / Cash")}${kv("Card")}${kv("Cancel by")}${kv("Confirmation #")}
      <span>Files</span><div>${files}<a href="#" id="tvAddFile">＋ add link</a></div></div>
      ${stay}${hike}
      <div class="blk"><h3>NOTES</h3><div contenteditable class="log" data-x="notes" style="min-height:40px">${esc(ex.notes || "")}</div></div>
      <div class="blk">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">Open in Notion ↗</a>` : `<span class="log">Not in Notion yet: use "Create in Notion" at the top.</span>`}</div>`;
    D.classList.add("open");
    document.getElementById("tvClose").onclick = () => closeDrawer();
    D.querySelectorAll("[data-k]").forEach((el) => el.onblur = () => saveField(id, el.dataset.k, el.textContent));
    D.querySelectorAll("[data-x]").forEach((el) => el.onblur = () => { const v = el.textContent.trim(); if ((ex[el.dataset.x] || "") !== v) { ex[el.dataset.x] = v; saveExtra(id); } });
    D.querySelectorAll("[data-c]").forEach((el) => el.onclick = () => { ex.check = { ...(ex.check || {}), [el.dataset.c]: !(ex.check || {})[el.dataset.c] }; el.classList.toggle("y"); saveExtra(id); });
    D.querySelectorAll("[data-rmf]").forEach((el) => el.onclick = (e) => { e.preventDefault(); ex.files.splice(+el.dataset.rmf, 1); saveExtra(id); openItem(id); });
    document.getElementById("tvAddFile").onclick = (e) => { e.preventDefault(); const u = (prompt("Link to the file (Drive, Dropbox, the booking page)") || "").trim(); if (/^https?:\/\//.test(u)) { ex.files = [...(ex.files || []), u]; saveExtra(id); openItem(id); } };
    document.getElementById("tvStatus").onchange = async (e) => {
      const v = e.target.value;
      if (it.seed || !colFor(it, "Status")) { it.status = v; ex.status = v; saveExtra(id); drawLeft(); return; }
      try { const d2 = await call("/quest/trips/item", { id, db: it.db, props: { Status: v } }); Object.assign(it, d2.item, { db: it.db }); toast("Saved to Notion"); drawLeft(); }
      catch (err) { toast("Not saved: " + err.message); }
    };
    const g = document.getElementById("tvGpx");
    if (g) g.onclick = (e) => { e.preventDefault(); pickFile(".gpx,application/gpx+xml", async (name, text) => {
      if (!gpxStats(text)) return toast("That file has no track points");
      ex.gpxName = name; ex.gpxLocal = String(it.id).startsWith("seed-") ? text : undefined;
      if (!String(it.id).startsWith("seed-")) { try { await call("/quest/trips/gpx", { id, gpx: text }); } catch (er) { return toast("Not saved: " + er.message); } }
      S.gpx = { id, text }; saveExtra(id); openItem(id); S.mode = "hike"; drawMap();
    }); };
  }
  function closeDrawer(quiet) {
    document.getElementById("tvDrawer").classList.remove("open");
    if (!quiet) { S.sel = null; S.mode = "map"; drawLeft(); drawMap(); }
  }
  function pickFile(accept, cb) {
    const f = document.getElementById("tvFile");
    f.accept = accept; f.value = "";
    f.onchange = () => { const file = f.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => cb(file.name, String(r.result)); r.readAsText(file); };
    f.click();
  }

  /* map: Leaflet, loaded the first time a trip opens */
  let L = null, map = null, layer = null;
  function leaflet() {
    if (root.L) return Promise.resolve(root.L);
    return new Promise((ok, no) => {
      const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(l);
      const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload = () => ok(root.L); s.onerror = no; document.head.appendChild(s);
    });
  }
  async function drawMap() {
    try { L = await leaflet(); } catch { document.getElementById("tripMap").innerHTML = `<div class="log" style="padding:20px">The map could not load (no connection to the map library).</div>`; return; }
    if (!map) {
      map = L.map("tripMap", { zoomControl: true, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
      map.setView([45.52, -73.57], 12);
    }
    setTimeout(() => map.invalidateSize(), 50);
    if (layer) layer.remove();
    layer = L.layerGroup().addTo(map);
    const it = S.cur.items.find((i) => i.id === S.sel);
    const hikeBtn = document.getElementById("tvHikeBtn"), mapBtn = document.getElementById("tvMapBtn");
    hikeBtn.disabled = !(it && isHike(it));
    hikeBtn.title = hikeBtn.disabled ? "Pick a hike card" : "Draw the GPX track";
    if (!(it && isHike(it))) S.mode = "map";
    hikeBtn.classList.toggle("on", S.mode === "hike"); mapBtn.classList.toggle("on", S.mode === "map");
    const box = document.getElementById("tvHike"); box.innerHTML = "";
    if (S.mode === "hike") return drawHike(it, box);
    const pts = [];
    const selAddr = it ? fieldVal(it, "Address").toLowerCase() : "";
    for (const p of S.cur.places) {
      if (p.lat == null) continue;
      const on = !!selAddr && (selAddr.includes(p.name.toLowerCase()) || (p.address && selAddr.includes(p.address.split(",")[0].toLowerCase())));
      const icon = L.divIcon({ className: "", html: `<div class="trip-pin ${on ? "on" : ""}">${p.category === "hike" ? "🥾" : p.category === "dance" ? "💃" : /food|eat|restaurant|cafe/i.test(p.category) ? "🍜" : "📍"}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker([p.lat, p.lng], { icon }).addTo(layer).bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.address || "")}${p.notes ? "<br><i>" + esc(p.notes) + "</i>" : ""}<br><a href="${gdir(p)}" target="_blank" rel="noopener">Directions in Google Maps ↗</a>`);
      pts.push([p.lat, p.lng]);
      if (on) map.setView([p.lat, p.lng], 15);
    }
    if (pts.length && !(it && selAddr && pts.length)) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
  }
  async function drawHike(it, box) {
    const ex = extrasOf(it.id);
    let text = S.gpx && S.gpx.id === it.id ? S.gpx.text : ex.gpxLocal || "";
    if (!text && ex.gpxName && !String(it.id).startsWith("seed-")) { try { text = (await call("/quest/trips/gpx?id=" + encodeURIComponent(it.id))).gpx; S.gpx = { id: it.id, text }; } catch {} }
    const st = text && gpxStats(text);
    if (!st) { box.innerHTML = `<div class="hikebox"><b>🥾 ${esc(it.name)}</b><div class="log" style="margin-top:6px">No trail file yet. Attach a GPX file in the card (AllTrails, Komoot, Strava and Gaia all export one) to see the track, distance, climb, time and the elevation profile.</div></div>`; return; }
    L.polyline(st.line, { color: "#ffd479", weight: 4 }).addTo(layer);
    L.circleMarker(st.line[0], { radius: 7, color: "#8fe3b0", fillOpacity: 1 }).addTo(layer).bindTooltip("Start");
    map.fitBounds(st.line, { padding: [30, 30], maxZoom: 16 });
    const W = 400, H = 110, P2 = st.profile, maxD = P2.length ? P2[P2.length - 1][0] : 1;
    const lo = st.lo ?? 0, hi = Math.max((st.hi ?? 1), lo + 10);
    const path = P2.map(([d, e], i) => `${i ? "L" : "M"}${(d / maxD * W).toFixed(1)} ${(H - 8 - (e - lo) / (hi - lo) * (H - 20)).toFixed(1)}`).join(" ");
    box.innerHTML = `<div class="hikebox"><b>🥾 ${esc(it.name)}</b> <span class="log">${esc(ex.gpxName || "")}</span>
      <div class="stats"><div>Distance<b>${st.km.toFixed(1)} km</b></div><div>Climb<b>${st.climb} m</b></div><div>Time<b>${fmtDur(st.secs)}</b></div><div>High point<b>${st.hi ?? "?"} m</b></div></div>
      ${P2.length > 1 ? `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${path} L${W} ${H} L0 ${H} Z" fill="rgba(255,212,121,.18)"/><path d="${path}" stroke="#ffd479" stroke-width="2" fill="none"/></svg>` : `<div class="log">No elevation in this file.</div>`}
      <div class="log">${st.timed ? "Time from the file's own timestamps." : "Time estimated: 5 km/h plus 1 hour per 600 m of climb."}</div></div>`;
  }
  function focusPlace(id) {
    const p = S.cur.places.find((x) => x.id === id);
    if (p && p.lat != null && map) { S.mode = "map"; map.setView([p.lat, p.lng], 16); }
  }
  document.getElementById("tvMapBtn").onclick = () => { S.mode = "map"; drawMap(); };
  document.getElementById("tvHikeBtn").onclick = () => { S.mode = "hike"; drawMap(); };
  document.getElementById("tvAddPlace").onclick = async () => {
    const name = (prompt("Place name") || "").trim(); if (!name) return;
    const address = (prompt("Address (used to put the pin on the map)") || "").trim();
    const category = (prompt("Category (food, dance, hike, sight, stay...)", "food") || "place").trim();
    try { const d = await call("/quest/places", { op: "put", place: { name, address, category, trip: S.cur.name, savedBy: "Junyan" } });
      S.cur.places.push(d.place); drawMap(); drawLeft(); toast(d.place.lat == null ? "Saved, but no pin: the address was not found" : "Place saved"); }
    catch (e) { toast("Not saved: " + e.message); }
  };
  document.getElementById("tvImport").onclick = () => pickFile(".csv,text/csv", async (name, csv) => {
    const list = name.replace(/\.csv$/i, "");
    toast(`Importing ${list}… (about a second per place without coordinates)`);
    try { const d = await call("/quest/places/import", { trip: S.cur.name, list, csv, near: S.cur.name.replace(/ (birthday )?trip$/i, "") });
      toast(`Added ${d.added} places, ${d.located} with a pin`); openTrip(S.cur.name); }
    catch (e) { toast("Import failed: " + e.message); }
  });

  loadTrips();
})(typeof globalThis !== "undefined" ? globalThis : this);
