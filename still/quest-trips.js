/* Trips: Day Quest's desktop Trips section (Junyan, 2026-11-01; design "Layout A",
   artifact XGUE3DrhArW49V9nGJwQ4W).
   Desktop (768 px and wider): a left sidebar (Today, Calendar, Quests & XP, Skills,
   then one "Trips" item that opens the Trips page: Upcoming and Past tabs of trip
   cards and "+ New trip"; a card opens the trip page). A trip page is the itinerary on the
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
  // the local calendar day of a row: a time in UTC (or another offset) with a time zone
  // moves to that zone's day (23:30Z in Cairo is the next morning)
  function localDay(it) {
    const s = it.start || "";
    if (it.tz && /T\d\d:\d\d.*(Z|[+-]\d\d:?\d\d)$/.test(s)) {
      try { return new Date(s).toLocaleDateString("en-CA", { timeZone: it.tz }); } catch {}
    }
    return s.slice(0, 10);
  }
  // Itinerary days (Junyan 2026-11-01): each row once, on its (local) day; a stay or a
  // multi-day pass also shows as "staying" on the days after, up to the check-out day
  function dayPlan(list, tripStart, n) {
    const seen = new Set(), items = [];
    for (const it of list || []) { const k = it.id || it.name; if (seen.has(k)) continue; seen.add(k); items.push(it); }
    const days = Array.from({ length: n }, () => ({ on: [], staying: [], out: [] })), undated = [];
    for (const it of items) {
      const d = dayIndex(localDay(it), tripStart);
      if (d < 0 || d >= n) { undated.push(it); continue; }
      days[d].on.push(it);
      const last = it.end ? dayIndex(it.end, tripStart) : d;
      if (last > d + 1 || (last > d && !/T/.test(it.end))) for (let i = d + 1; i < Math.min(last, n); i++) days[i].staying.push(it);
      // a stay with a check-out time shows "Check-out" on its last day (d64)
      if (last > d && last < n && isStay(it)) days[last].out.push(it);
    }
    return { items, days, undated };
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
  /* how a card's status shows (Junyan 2026-11-02, replacing the faint pill): Booked or
     Prepaid a solid card with a green edge and a check; Need to Book an amber edge and
     a Book button; Unpaid a red edge; Maybe a dashed, dimmer card; else Planned. */
  function statusLook(status, planned) {
    if (planned) return { cls: "plan", icon: "•", label: "Planned", book: false };
    const p = pillOf(status), s = String(status || "").trim();
    if (p === "paid") return { cls: "paid", icon: "✓", label: s || "Booked", book: false };
    if (p === "need") return { cls: "need", icon: "!", label: "Need to book", book: true };
    if (p === "warn") return { cls: "warn", icon: "$", label: s, book: false };
    if (p === "idea") return { cls: "idea", icon: "?", label: s || "Maybe", book: false };
    return { cls: "plan", icon: "•", label: s || "Planned", book: false };
  }
  /* what a drag onto the timeline carries (Junyan d61): an image first, then a link
     (text/uri-list, or plain text that is one URL), then plain text */
  function dropPayload(d) {
    if (!d) return null;
    if (d.image) return { image: true };
    const uri = String(d.uri || "").split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
    if (uri && /^https?:\/\//i.test(uri)) return { url: uri };
    const t = String(d.text || "").trim();
    if (!t) return null;
    if (/^https?:\/\/\S+$/i.test(t)) return { url: t };
    return { text: t };
  }
  // the calendar date of trip day i (0 = the first day)
  function tripDate(start, i) {
    const d = new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10) + i));
    return d.toISOString().slice(0, 10);
  }
  // a hotel: its name, its Tags ("Accommodations" in Notion, which the old check missed and
  // so the DC Residence Inn read "Still on"), the 🏨 icon, or a select column such as Type.
  // Free-text columns are not read: a festival note saying "check-in" is not a stay.
  const STAY_RE = /\bstay|hotel|airbnb|accommodation|check-?in|check-?out|lodg|hostel|motel|\binn\b|resort|🏨/i;
  const isStay = (it) => {
    const sel = Object.values(it.fields || {}).filter((f) => f && /^(select|multi_select)$/.test(f.type)).map((f) => f.value).join(" ");
    return STAY_RE.test(`${it.name} ${it.tags || ""} ${it.kind || ""} ${it.icon || ""} ${sel}`);
  };
  // a day's "still going" list: hotels until check-out say Staying, other multi-day things Still on
  const stayLines = (xs) => ({ staying: (xs || []).filter(isStay), stillOn: (xs || []).filter((i) => !isStay(i)) });
  const isHike = (it) => it.kind === "hike" || /hike|trail|trek|🥾/i.test(`${it.name} ${it.tags} ${it.icon}`);
  function timeOf(iso) {
    const m = /T(\d\d):(\d\d)/.exec(iso || "");
    if (!m) return "";
    let h = +m[1]; const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12;
    return `${h}:${m[2]} ${ap}`;
  }
  // a stay's check-in / check-out time: the time in its dates, else the Notion text column
  function stayTime(it, which) {
    const t = timeOf(which === "in" ? it.start : it.end);
    if (t) return t;
    const f = (it.fields || {})[which === "in" ? "Departure / Check-in" : "Arrival / Check-out"];
    return f && f.value ? String(f.value).trim().slice(0, 30) : "";
  }
  function whenText(it) {
    if (isStay(it)) { const ci = stayTime(it, "in"), co = stayTime(it, "out"); if (ci || co) return [ci && "Check-in " + ci, co && "check-out " + co].filter(Boolean).join(" · "); }
    const a = timeOf(it.start), b = it.end && it.end.slice(0, 10) === (it.start || "").slice(0, 10) ? timeOf(it.end) : "";
    return a ? (b ? `${a} to ${b}` : a) : "";
  }

  /* ── fields, missing info, calendar copies (Junyan 2026-11-02, d64 d65) ───── */
  // a panel field reads the card's Notion column when it has one (any spelling below)
  const ALIAS = { "Cancel by": ["Cancellation Policy", "Cancel By", "Cancel by"], "Card": ["Credit Card", "Card"],
    "Confirmation #": ["Confirmation #", "Confirmation", "Confirmation Number"], "Address": ["Address", "Location"],
    "Check-in": ["Departure / Check-in", "Check-in"], "Check-out": ["Arrival / Check-out", "Check-out"] };
  const colFor = (it, k) => (ALIAS[k] || [k]).find((n) => it.fields && it.fields[n]);
  function fieldOf(it, k, extra) {
    const col = colFor(it, k);
    if (col && it.fields[col].value) return it.fields[col].value;
    if (k === "Address" && it.address) return it.address;
    return ((extra || {}).f || {})[k] || (col ? it.fields[col].value : "");
  }
  const TRANSPORT_RE = /flight|✈|🛫|train|🚆|🚄|\bbus\b|🚌|ferry|⛴|car rental|rental car|transfer|shuttle|taxi|uber|via rail|airline/i;
  const FOOD_RE = /restaurant|dinner|lunch|brunch|breakfast|café|cafe|bar\b|🍽|🍷|🍣|food|eat/i;
  function kindOf(it) {
    if (isStay(it)) return "stay";
    const sel = Object.values(it.fields || {}).filter((f) => f && /^(select|multi_select)$/.test(f.type)).map((f) => f.value).join(" ");
    if (TRANSPORT_RE.test(`${it.name} ${it.tags || ""} ${it.kind || ""} ${it.icon || ""} ${sel}`)) return "transport";
    return FOOD_RE.test(`${it.name} ${it.tags || ""} ${it.icon || ""}`) ? "food" : "activity";
  }
  // not booked yet: only Address is asked for; Cancelled asks for nothing
  const notBooked = (status) => /maybe|idea|need to book|not booked|to book/i.test(status || "");
  const hasTime = (iso) => /T\d\d:\d\d/.test(iso || "");
  const OWED_RE = /prepaid|paid|free|owing|owed|unpaid|balance|deposit|gas/i;
  /* what a card still needs (d65). Stays: address, check-in, check-out, confirmation #,
     a status that says paid or what is owed, cancellation policy. Restaurants and
     activities: address, time, booked or not. Flights and transport: times, confirmation #.
     Photos, benefits, credits and card never warn. */
  /* a booked card (Prepaid, Booked Unpaid, Taxes Still Owing, Free) with nothing in its Notion
     "Files & media" needs the confirmation dropped on it (2026-11-02). Only cards the server
     sent a files list for: calendar copies have no Notion page to hold a file. */
  const BOOKED_RE = /^(prepaid|booked unpaid|taxes still owing|free)$/i;
  const needsConfirmFile = (it) => Array.isArray(it.files) && !it.files.length && !it.seed && BOOKED_RE.test(String(it.status || "").trim());
  function missingInfo(it, extra) {
    const st = String(it.status || "").trim();
    if (/cancel/i.test(st)) return [];
    const out0 = missingFields(it, extra, st);
    if (needsConfirmFile(it)) out0.push("confirmation file");
    return out0;
  }
  function missingFields(it, extra, st) {
    const k = kindOf(it), v = (f) => String(fieldOf(it, f, extra) || "").trim(), out = [];
    if (k !== "transport" && !v("Address")) out.push("address");
    if (notBooked(st)) return out;
    if (k === "stay") {
      if (!v("Check-in") && !hasTime(it.start)) out.push("check-in");
      if (!v("Check-out") && !hasTime(it.end)) out.push("check-out");
      if (!v("Confirmation #")) out.push("confirmation #");
      if (!OWED_RE.test(st)) out.push("paid or owed");
      if (!v("Cancel by")) out.push("cancellation policy");
    } else if (k === "transport") {
      if (!hasTime(it.start) && !v("Check-in")) out.push("times");
      if (!v("Confirmation #")) out.push("confirmation #");
    } else {
      if (!hasTime(it.start)) out.push("time");
      if (!st) out.push("booked or not");
    }
    return out;
  }
  // the amber Missing line, and the drop hint when the confirmation file is what is missing
  function missLine(ms, style = "") {
    const rest = ms.filter((m) => m !== "confirmation file");
    return (rest.length ? `<div class="miss"${style}>Missing: ${esc(rest.join(", "))}</div>` : "") +
      (ms.length > rest.length ? `<div class="miss nofile"${style}>No confirmation file. Drop it here.</div>` : "");
  }
  // which panel field each warning points at
  const MISSING_FIELD = { "confirmation file": "Files", "address": "Address", "check-in": "Check-in", "check-out": "Check-out", "confirmation #": "Confirmation #",
    "cancellation policy": "Cancel by", "paid or owed": "Status", "booked or not": "Status", "time": "When", "times": "Check-in" };
  const dayOf = (s) => String(s || "").slice(0, 10);
  const overlaps = (a, b) => {
    const a0 = dayOf(a.start), a1 = dayOf(a.end) || a0, b0 = dayOf(b.start), b1 = dayOf(b.end) || b0;
    return !!(a0 && b0) && a0 <= b1 && b0 <= a1;
  };
  /* d64: a calendar copy (seed) is hidden when a real Notion card of the same kind
     overlaps its dates; the Notion card wins */
  function hideCopies(items) {
    const real = (items || []).filter((i) => !i.seed);
    return (items || []).filter((c) => !c.seed || !real.some((r) => kindOf(r) === kindOf(c) && overlaps(r, c) &&
      (kindOf(c) === "stay" || r.name.toLowerCase() === c.name.toLowerCase() || dayOf(r.start) === dayOf(c.start))));
  }

  // pasted text → one log entry: an optional "From: name" line, a Gmail link anywhere, the rest is the summary
  function pastedEntry(text, now = new Date()) {
    let t = String(text || "").trim();
    if (!t) return null;
    let from = "Me", link = "";
    const fm = /^from:\s*(.+)$/im.exec(t); if (fm) { from = fm[1].replace(/<[^>]*>/g, "").trim().slice(0, 80) || from; t = t.replace(fm[0], ""); }
    const lm = /https?:\/\/mail\.google\.com\/\S+/.exec(t); if (lm) { link = lm[0]; t = t.replace(lm[0], ""); }
    const summary = t.replace(/\s+/g, " ").trim().slice(0, 600);
    if (!summary) return null;
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return { date, from, summary, link };
  }

  /* ── the first trip, from the Joint Plans calendar (Nov 12 to 17 2026) ───── */
  // Junyan's trip naming rule (2026-11-02): Year Flag Place, the same in Notion and here
  const MTL = "2026 🇨🇦 Montreal Birthday";
  const P = { alliance: "Alliance Dance Company, 2529 Rue Ontario E, Montréal", piernas: "Las Piernas, 2019 Rue Moreau, Montréal",
    studio: "Studio 2790, 2790 Rue Hochelaga, Montréal" };
  const ev = (id, db, icon, name, start, end, status, address, extra = {}) => ({ id: "seed-" + id, db, icon, name, start, end,
    status, tags: "", address, fields: {}, seed: true, ...extra });
  const SEED = {
    name: MTL, start: "2026-11-12", end: "2026-11-17", icon: "🧳", who: "You + Caney",
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


  /* ── Trips home (Junyan 2026-11-01): one "Trips" item in the sidebar opens a page
     with Upcoming and Past tabs. The two Notion databases can spell one trip two ways
     ("2026 🇪🇬 Egypt" and "2026 Egypt"): those merge into one card here and Notion is
     left as it is. ─────────────────────────────────────────────────────────── */
  const tripKey = (name) => String(name || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|[️‍]/gu, " ")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function mergeTrips(list) {
    const by = new Map();
    for (const t of list || []) {
      const k = tripKey(t.name) || t.name;
      const g = by.get(k);
      if (!g) { by.set(k, { ...t, aliases: [t.name] }); continue; }
      if (!g.aliases.includes(t.name)) g.aliases.push(t.name);
      if (t.start && (!g.start || t.start < g.start)) g.start = t.start;
      if (t.end && (!g.end || t.end > g.end)) g.end = t.end;
      for (const f of ["count", "bookings", "need", "booked"]) if (t[f] != null) g[f] = (+g[f] || 0) + (+t[f] || 0);
      if (!g.place && t.place) g.place = t.place;
      if ((!g.icon || g.icon === "🧳") && t.icon && t.icon !== "🧳") g.icon = t.icon;
    }
    return [...by.values()];
  }
  const dnum = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
  // Toronto is home (its outings show on the Local tab) and "Home" is not a trip either
  const isHomeTrip = (name) => ["toronto", "home"].includes(tripKey(name));
  const yearOf = (name) => { const m = /\b(19|20)\d\d\b/.exec(String(name || "")); return m ? m[0] : ""; };
  function splitTrips(list, today) {
    const t0 = dnum(today), upcoming = [], past = [], needsDates = [];
    for (const t of list || []) {
      if (isHomeTrip(t.name)) continue;
      const s = (t.start || "").slice(0, 10), e = (t.end || t.start || "").slice(0, 10);
      if (!s) {
        // undated: never Upcoming; placed in Past by the year in its name, else Needs dates
        const y = yearOf(t.name);
        (y ? past : needsDates).push({ ...t, away: null, now: false, sortKey: y ? y + "-12-31" : "" });
        continue;
      }
      if (dnum(e) < t0) past.push({ ...t, ago: t0 - dnum(e), sortKey: e });
      else upcoming.push({ ...t, away: Math.max(0, dnum(s) - t0), now: dnum(s) <= t0 });
    }
    upcoming.sort((a, b) => (a.start || "9").localeCompare(b.start || "9"));
    past.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    needsDates.sort((a, b) => a.name.localeCompare(b.name));
    return { upcoming, past, needsDates };
  }
  // Local tab: Toronto-tagged outings and events from both databases, newest first, undated last
  function localItems(items) {
    return [...(items || [])].sort((a, b) => (b.start || "").slice(0, 16).localeCompare((a.start || "").slice(0, 16)));
  }
  function whenLabel(t) {
    if (t.now) return "Now";
    if (t.ago != null) return t.ago === 1 ? "Yesterday" : `${t.ago} days ago`;
    if (t.away == null) return "No dates yet";
    return t.away === 0 ? "Today" : t.away === 1 ? "Tomorrow" : `${t.away} days away`;
  }
  // where a trip is, for centring the map before it has pins: its Location, else its name
  // without the year, flags and words like "trip" ("2027 🇧🇷 Brazil Carnaval" → "Brazil Carnaval")
  function destOf(name, location) {
    if (location && String(location).trim()) return String(location).trim();
    return String(name || "").replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|[️‍]/gu, " ")
      .replace(/\b(19|20)\d\d\b/g, " ").replace(/\b(birthday|trip|vacation|holiday)\b/gi, " ")
      .replace(/\s+/g, " ").trim();
  }
  // how the map starts: fit the trip's own pins; else the geocoded destination; else the world
  function mapStart(places, dest, geo) {
    const pins = (places || []).filter((p) => p && p.lat != null && p.lng != null).map((p) => [p.lat, p.lng]);
    if (pins.length) return { pins };
    if (dest && geo && geo.lat != null) return { center: [geo.lat, geo.lng], zoom: 5 };
    return { world: true };
  }

  /* day planner in trip cards (Junyan, d39, d40): the plan sits in the card's Notion
     page body under "✨ Day plan"; still-api reads it back (GET/POST /quest/trips/plan).
     Hikes and trip days get the full plan, small outings the short one. */
  const SMALL = /dinner|lunch|brunch|breakfast|drinks?|coffee|caf[eé]|restaurant|movie|cinema|film|show|concert|bar\b/i;
  function planKind(it, tripName) {
    if (isHike(it)) return "full";
    if (isHomeTrip(tripName) || SMALL.test(`${it.name} ${it.tags || ""}`)) return "short";
    return "full";
  }
  function planTag(plan) {
    if (!plan || !plan.checked) return "";
    const d = new Date(plan.checked + "T12:00:00");
    return "✨ Planned by day planner · checked " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const cardLabel = (it, ex) => (ex && ex.plan ? "Planned" : it.status || "Planned");
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const EMPTY = `<div class="log">Not filled yet.</div>`;
  // done = must-dos ticked here (kept in our extras), on top of the ticks in Notion
  function planHtml(plan, done) {
    const S2 = plan.sections || {}, out = [], sec = (title, body, cls = "") => out.push(`<div class="psec"><h3 class="${cls}">${title}</h3>${body}</div>`);
    const rows = (a) => a.length ? a.map((r) => `<div class="prow"><span>${h(r.t)}</span>${h(r.text)}</div>`).join("") : EMPTY;
    if (S2.conditions) { const c = S2.conditions; sec("CONDITIONS", `<div class="pgrid"><div>Open<b>${h(c.open) || "?"}</b></div><div>Weather<b>${h(c.weather) || "?"}</b></div><div>Caney's mood<b>${h(c.mood) || "?"}</b></div></div>${c.note ? `<div class="log" style="margin-top:6px">${h(c.note)}</div>` : ""}`); }
    if (S2.getting) sec("GETTING THERE", rows(S2.getting));
    if (S2.day) sec("THE DAY", rows(S2.day));
    if (S2.must) sec("MUST-DOS", S2.must.length ? S2.must.map((m, i) => `<div class="chk ${m.done || (done || {})[m.text] ? "y" : ""}" data-m="${i}"><i></i>${h(m.text)}</div>`).join("") : EMPTY);
    if (S2.careful) sec("CAREFUL", S2.careful.length ? S2.careful.map((c) => `<div class="prow">${h(c)}</div>`).join("") : EMPTY, "pwarn");
    if (S2.after) { const a = S2.after; sec("AFTER THE DAY", `<div class="preview">⭐ Rating ${h(a.rating) || "___"} · What worked ${h(a.worked) || "___"} · Caney's energy ${h(a.energy) || "___"}</div>`); }
    return out.join("");
  }

  // Plan this needs the card's own Notion page; a calendar copy says how to get one
  const planGate = (it) => it.seed || String(it.id).startsWith("seed-")
    ? `Save this trip to Notion to plan days: press "⇪ Create in Notion" at the top of the trip.` : "";

  /* The page to open at load (Junyan, 2026-11-12, t9, "9 yes"): "#trips" is the Trips page, where the calendar's
     Travel tab sends you. */
  const startView = (hash) => (/^#trips$/i.test(String(hash || "")) ? "trips" : null);

  const api = { startView, pastedEntry, kindOf, missingInfo, needsConfirmFile, missLine, hideCopies, fieldOf, MISSING_FIELD, statusLook, dropPayload, tripDate, MTL, stayLines, planGate, planKind, planTag, cardLabel, planHtml, haversine, gpxPoints, gpxStats, dayIndex, localDay, dayPlan, pillOf, isStay, isHike, whenText, seedRows, SEED, fmtDur, tripKey, mergeTrips, splitTrips, isHomeTrip, localItems, whenLabel, destOf, mapStart };
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
  #tripView .planned{background:rgba(201,182,255,.2);color:#c9b6ff}
  #tripView .ptag{font-size:11px;color:#c9b6ff;border:1px solid rgba(201,182,255,.4);border-radius:999px;padding:2px 8px;display:inline-block;margin:8px 0 2px}
  #tripView .psec{border-top:1px solid rgba(255,255,255,.08);padding:9px 0}
  #tripView .psec h3{font-size:12px;letter-spacing:.4px;color:var(--ink-soft);margin:0 0 6px}#tripView .psec h3.pwarn{color:var(--warn)}
  #tripView .pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  #tripView .pgrid div{background:rgba(255,255,255,.07);border-radius:8px;padding:6px 8px;font-size:12px;color:var(--ink-faint)}#tripView .pgrid b{display:block;color:var(--ink);font-size:13px}
  #tripView .prow{display:flex;gap:8px;font-size:13px;padding:3px 0;color:var(--ink-soft)}#tripView .prow span{min-width:52px;color:var(--ink-faint);flex:none}#tripView .prow span:empty{display:none}
  #tripView .preview{background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.12);border-radius:10px;padding:10px;font-size:13px;color:var(--ink-faint)}
  #tripView .pbtn{font:inherit;font-size:13px;background:rgba(201,182,255,.18);color:var(--ink);border:1px solid rgba(201,182,255,.45);border-radius:8px;padding:6px 12px;cursor:pointer}
  #tripView .plan{background:rgba(156,200,255,.18);color:#9cc8ff}#tripView .idea{background:rgba(255,255,255,.1);color:var(--ink-soft)}
  #tripView .right{flex:1;display:flex;flex-direction:column;border-left:1px solid rgba(255,255,255,.12);min-width:0;position:relative;overflow:hidden}
  #tripView .mapbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.12);background:rgba(10,12,32,.5)}
  #tripView .mapbar .btn{flex:none}#tripView .mapbar .btn.pri{margin-left:auto}
  #tripView .seg{display:flex;flex:none;background:rgba(255,255,255,.07);border-radius:10px;padding:3px}
  #tripView .seg button{padding:6px 12px;border-radius:8px;font-size:13px;color:var(--ink-faint)}
  #tripView .seg button.on{background:rgba(255,255,255,.14);color:var(--ink);font-weight:600}
  #tripView .seg button:disabled{opacity:.35;cursor:not-allowed}
  #tripView .btn{padding:7px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.12);font-size:13px;color:var(--ink-soft);white-space:nowrap}
  #tripView .btn.pri{background:var(--zap);color:#2a2453;border:0;font-weight:700}
  #tripView .mapwrap{flex:1;position:relative;overflow:hidden;background:#151a40}
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
  #tripView .item .miss{color:var(--warn);font-size:11.5px;margin-top:3px}#tripView .item.fileover,#tvDrawer.fileover{outline:2px dashed var(--warn);outline-offset:-2px}#tripView .kv>.need{color:var(--warn);font-weight:700}#tripView .kv>div.need{outline:1px solid var(--warn);border-radius:5px;background:rgba(255,190,90,.08);min-height:18px}
  #tripView .msgs .m{font-size:12.5px;padding:6px 0;border-top:1px solid rgba(255,255,255,.08)}#tripView .msgs .m b{color:var(--ink)}#tripView .msgs .m small{color:var(--ink-faint)}#tripView .msgs textarea{width:100%;min-height:54px;font:inherit;font-size:12.5px;background:#2a2f63;color:var(--ink);border:1px solid rgba(255,255,255,.2);border-radius:6px;box-sizing:border-box}
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
  body.trips-home #app{display:none}
  body.gym-home #app{display:none}
  #gymHome{position:fixed;left:210px;top:0;right:0;bottom:0;z-index:30;display:none;overflow:auto;padding:28px 32px;font-family:var(--font);color:var(--ink);background:rgba(0,0,0,.18)}
  body.gym-home #gymHome{display:block}
  body.gym-home .scrim,body.trips-home .scrim{z-index:40}
  body.gym-home .sheet,body.trips-home .sheet{z-index:41}
  #tripHome{position:fixed;left:210px;top:0;right:0;bottom:0;z-index:30;display:none;overflow:auto;padding:28px 32px;font-family:var(--font);color:var(--ink);background:rgba(0,0,0,.18)}
  body.trips-home #tripHome{display:block}
  #tripHome button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}
  #tripHome .hd{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  #tripHome h1{font-size:26px;font-weight:700;margin:0;flex:1}
  #tripHome .btn{flex:none;width:auto;padding:8px 14px;border-radius:10px;background:var(--zap);color:#2a2453;font-weight:700;font-size:14px}
  #tripHome .tabs{display:flex;gap:22px;border-bottom:1px solid rgba(255,255,255,.12);margin:10px 0 18px}
  #tripHome .tabs button{padding:10px 0;font-size:14px;color:var(--ink-faint);border-bottom:2px solid transparent;margin-bottom:-1px}
  #tripHome .tabs button.on{color:var(--ink);border-color:var(--zap);font-weight:600}
  #tripHome .n{font-size:11px;color:var(--ink-faint);margin-left:4px}
  #tripHome .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
  #tripHome .card{width:auto;text-align:left;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:6px}
  #tripHome .card:hover{border-color:var(--zap)}
  #tripHome .card .t{font-size:17px;font-weight:600}
  #tripHome .card .s{font-size:13px;color:var(--ink-soft)}
  #tripHome .card .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
  #tripHome .chip{padding:3px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:12px;color:var(--ink-soft)}
  #tripHome .chip.now{background:var(--good);color:#12321f;border:0;font-weight:700}
  #tripHome .chip.need{border-color:rgba(255,194,122,.5);color:var(--warn)}
  #tripHome .chip.paid{border-color:rgba(143,227,176,.5);color:var(--good)}
  #tripHome .empty{color:var(--ink-faint);font-size:14px}
  #tripHome .sub{font-size:11px;letter-spacing:2px;color:var(--ink-faint);margin:24px 0 10px}
  #tripHome .local{display:flex;gap:16px;align-items:flex-start}
  #tripHome .llist{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
  #tripHome .lrow{width:100%;text-align:left;display:flex;gap:10px;align-items:baseline;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 14px}
  #tripHome .lrow:hover{border-color:var(--zap)}
  #tripHome .lrow .d{flex:none;width:96px;font-size:12px;color:var(--ink-faint)}
  #tripHome .lrow .w{font-size:12px;color:var(--ink-soft)}
  #tripHome #thMap{flex:1;min-width:0;height:70vh;position:sticky;top:0;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.12)}
  #tripView .back{display:inline-block;font-size:13px;color:var(--ink-faint);margin-bottom:10px}
  #tripView .back:hover{color:var(--zap)}
  /* status at a glance (2026-11-02) */
  #tripView .item{border-left-width:5px}
  #tripView .item .stl{font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;display:flex;align-items:center;gap:5px;margin-bottom:2px}
  #tripView .item .stl i{font-style:normal;width:16px;height:16px;border-radius:50%;display:inline-grid;place-items:center;font-size:10px;font-weight:900}
  #tripView .item.st-paid{background:rgba(143,227,176,.13);border-color:rgba(143,227,176,.4);border-left-color:var(--good)}
  #tripView .item.st-paid .stl{color:var(--good)}#tripView .item.st-paid .stl i{background:var(--good);color:#12321f}
  #tripView .item.st-need{background:rgba(255,194,122,.09);border-color:rgba(255,194,122,.35);border-left-color:var(--warn)}
  #tripView .item.st-need .stl{color:var(--warn)}#tripView .item.st-need .stl i{background:var(--warn);color:#3a2500}
  #tripView .item.st-warn{border-left-color:var(--bad)}#tripView .item.st-warn .stl{color:var(--bad)}#tripView .item.st-warn .stl i{background:var(--bad);color:#3a0d0d}
  #tripView .item.st-plan{border-left-color:#9cc8ff}#tripView .item.st-plan .stl{color:#9cc8ff}#tripView .item.st-plan .stl i{display:none}
  #tripView .item.st-idea{border-style:dashed;border-left-width:2px;border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.025);opacity:.72}
  #tripView .item.st-idea:hover{opacity:1}#tripView .item.st-idea .stl{color:var(--ink-faint)}#tripView .item.st-idea .stl i{border:1.5px dashed var(--ink-faint)}
  #tripView .bookbtn{background:var(--warn);color:#3a2500 !important;font-weight:800 !important;border-radius:9px;padding:7px 14px;font-size:13px}
  #tripView .bookbtn:hover{filter:brightness(1.08)}
  #tripView .item[draggable=true]{cursor:grab}#tripView .item.dragging{opacity:.35}
  /* drag and drop onto days (d61) */
  #tripView .maybe{border:1px dashed rgba(255,255,255,.22);border-radius:16px;padding:10px 12px 4px;margin:6px 0 4px;background:rgba(255,255,255,.03)}
  #tripView .maybe .mh{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;font-weight:600;font-size:15px;margin-bottom:8px}
  #tripView .maybe .mh small{font-weight:400;color:var(--ink-faint);font-size:12px}
  #tripView .maybe .item{margin-left:0}#tripView .maybe .item .ic{position:static;flex:none}
  #tripView .addbox{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}
  #tripView .addbox input{flex:1 1 150px;min-width:0;font:inherit;font-size:13px;color:var(--ink);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:9px;padding:7px 10px}
  #tripView .addbox .btn{flex:none;width:auto}
  #tripView .addbox select{font:inherit;font-size:13px;color:var(--ink);background:#2a2f63;border:1px solid rgba(255,255,255,.15);border-radius:9px;padding:0 6px;max-width:110px}
  #tripView .gap{height:0;overflow:hidden;border-radius:12px;transition:height .15s,margin .15s;font-size:12px;color:var(--ink-faint);display:grid;place-items:center}
  body.trip-drag #tripView .gap{height:34px;margin:0 0 9px;border:2px dashed rgba(201,182,255,.45)}
  body.trip-drag #tripView .gap:before{content:"Drop here"}
  body.trip-drag #tripView [data-drop].over .gap{border-color:var(--zap);background:rgba(201,182,255,.14);color:var(--ink)}
  body.trip-drag #tripView .maybe.over{border-color:var(--zap);background:rgba(201,182,255,.1)}
  body.trip-drag #tripView .rail{padding-top:4px;padding-bottom:4px}
  #tripView .shot{max-width:100%;border-radius:10px;margin:8px 0;border:1px solid rgba(255,255,255,.12)}
  .trip-pin{width:26px;height:26px;border-radius:50%;background:#2a2f63;border:2px solid var(--zap);display:grid;place-items:center;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.5)}
  .trip-pin.on{border-color:var(--gold);transform:scale(1.25)}`;
  document.head.appendChild(css);

  const side = document.createElement("aside");
  side.id = "tripSide";
  const view = document.createElement("section");
  view.id = "tripView";
  view.innerHTML = `<div class="left" id="tvLeft"></div><div class="right"><div class="mapbar"><div class="seg"><button class="on" id="tvMapBtn">🗺 Map</button><button id="tvHikeBtn" disabled title="Pick a hike card">🥾 Hike map</button></div>
    <span style="flex:1 1 0"></span><button class="btn" id="tvImport" title="Import a Google list (Google Takeout, Saved, one CSV per list)">⬆ Import list</button><button class="btn pri" id="tvAddPlace">＋ Add place</button></div>
    <div class="mapwrap"><div id="tripMap"></div><div id="tvHike"></div></div></div><div class="drawer" id="tvDrawer"></div><input type="file" id="tvFile" hidden>`;
  document.body.appendChild(side);
  document.body.appendChild(view);
  const home = document.createElement("section");
  home.id = "tripHome";
  document.body.appendChild(home);
  const gymHome = document.createElement("section");
  gymHome.id = "gymHome";
  document.body.appendChild(gymHome);
  document.body.classList.add("has-side");

  const S = { trips: [], local: null, homeTab: "Upcoming", cur: null, tab: "Itinerary", day: -1, sel: null, mode: "map", live: false, note: "" };
  const extrasOf = (id) => (S.cur.extras[id] = S.cur.extras[id] || {});

  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; view.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  /* sidebar: Today, Calendar, Quests & XP, Skills, Trips (one item; the trips list lives on the Trips page) */
  let navOn = "today";
  function drawSide(active) {
    navOn = active || navOn;
    const navs = [["today", "☀ Today"], ["cal", "▦ Calendar"], ["quests", "★ Quests &amp; XP"], ["skills", "◆ Skills"], ["trips", "✈ Trips"], ["gym", "🏋 Gym"]];
    side.innerHTML = `<div class="brand"><div class="logo">★</div><div><b>DAY <span>QUEST</span></b><small>STILLNESS</small></div></div>` +
      navs.map(([k, l]) => `<button class="nav ${active === k ? "on" : ""}" data-nav="${k}">${l}</button>`).join("");
    side.querySelectorAll("[data-nav]").forEach((b) => b.onclick = () => go(b.dataset.nav));
  }
  function go(k) {
    if (k === "new") return newTrip();
    if (k === "trips") return showHome();
    document.body.classList.remove("trip-open", "trips-home", "gym-home");
    if (window.QuestGymPage) window.QuestGymPage.close();
    if (k === "gym") return showGym();
    drawSide(k);
    const el = k === "cal" ? document.querySelector(".cal-head") : k === "quests" ? document.getElementById("main") : k === "skills" ? document.getElementById("skillsRow") : null;
    if (k === "skills") { const b = document.getElementById("skillsBtn"); if (b) b.click(); }
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); else window.scrollTo({ top: 0, behavior: "smooth" });
  }
  /* Trips home: Upcoming (now and future, soonest first) and Past (newest first) */
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  /* Gym page (2026-11-09): the coach for each move (week, video prep, minute-by-minute clock), drawn by quest.html */
  function showGym() {
    document.body.classList.add("gym-home");
    drawSide("gym");
    if (window.QuestGymPage) window.QuestGymPage.open(gymHome); else gymHome.innerHTML = `<div class="empty">The gym page is still loading.</div>`;
  }
  function showHome() {
    document.body.classList.remove("trip-open", "gym-home");
    if (window.QuestGymPage) window.QuestGymPage.close();
    document.body.classList.add("trips-home");
    drawSide("trips");
    const { upcoming, past, needsDates } = splitTrips(S.trips, today());
    const list = S.homeTab === "Past" ? past : upcoming;
    const fmt = (x) => x ? new Date(x.slice(0, 10) + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "";
    const card = (t) => {
      const chips = t.start ? [`<span class="chip ${t.now ? "now" : ""}">${esc(whenLabel(t))}</span>`] : [];
      if (t.need) chips.push(`<span class="chip need">${t.need} to book</span>`);
      if (t.booked) chips.push(`<span class="chip paid">${t.booked} booked</span>`);
      if (t.bookings != null) chips.push(`<span class="chip">${t.bookings} booking${t.bookings === 1 ? "" : "s"}</span>`);
      return `<button class="card" data-trip="${esc(t.name)}"><div class="t">${esc(t.icon || "🧳")} ${esc(t.name)}</div>
        <div class="s">${t.start ? `${fmt(t.start)}${t.end && t.end !== t.start ? " to " + fmt(t.end) : ""}` : "No dates yet"}</div><div class="row">${chips.join("")}</div></button>`;
    };
    const tabs = [["Upcoming", upcoming.length], ["Past", past.length + needsDates.length], ["Local", S.local ? S.local.items.length : ""]];
    let body;
    if (S.homeTab === "Local") {
      const L0 = S.local;
      body = !L0 ? `<div class="empty">Loading Toronto outings…</div>` : !L0.items.length ? `<div class="empty">No Toronto outings yet. Tag a Notion row with the Toronto trip and it shows here.</div>` :
        `<div class="local"><div class="llist">${L0.items.map((it) => `<button class="lrow" data-lurl="${esc(it.url || "")}"><span class="d">${esc(it.start ? fmt(it.start) : "No date")}</span>
          <span style="flex:1;min-width:0"><b>${esc(it.icon || "📍")} ${esc(it.name)}</b>${localWhere(it) ? `<div class="w">${esc(localWhere(it))}</div>` : ""}</span></button>`).join("")}</div><div id="thMap"></div></div>`;
    } else {
      body = (list.length ? `<div class="grid">${list.map(card).join("")}</div>` : `<div class="empty">${S.homeTab === "Past" ? (needsDates.length ? "" : "No past trips yet.") : "Nothing coming up. Start one with + New trip."}</div>`) +
        (S.homeTab === "Past" && needsDates.length ? `<div class="sub">NEEDS DATES</div><div class="grid">${needsDates.map(card).join("")}</div>` : "");
    }
    home.innerHTML = `<div class="hd"><h1>✈ Trips</h1><button class="btn" id="thNew">＋ New trip</button></div>
      <div class="tabs">${tabs.map(([k, n]) => `<button class="${S.homeTab === k ? "on" : ""}" data-ht="${k}">${k}<span class="n">${n}</span></button>`).join("")}</div>
      ${body}
      ${S.live || S.loading ? "" : `<div class="empty" style="margin-top:18px;font-size:12px">Notion is not reachable right now${S.note ? " (" + esc(S.note) + ")" : ""}, so only the saved copy shows.</div>`}`;
    home.querySelectorAll("[data-lurl]").forEach((b) => b.onclick = () => b.dataset.lurl && window.open(b.dataset.lurl, "_blank", "noopener"));
    if (S.homeTab === "Local") { if (!S.local) loadLocal(); else if (S.local.items.length || S.local.places.length) drawLocalMap(); }
    home.querySelectorAll("[data-ht]").forEach((b) => b.onclick = () => { S.homeTab = b.dataset.ht; showHome(); });
    home.querySelectorAll("[data-trip]").forEach((b) => b.onclick = () => openTrip(b.dataset.trip));
    home.querySelector("#thNew").onclick = newTrip;
  }
  /* Local tab: Toronto is home, so its rows are a list of outings with pins, not a trip */
  const localWhere = (it) => ((it.fields || {}).Location || (it.fields || {}).Address || (it.fields || {}).Venue || {}).value || it.address || "";
  async function loadLocal() {
    const names = new Set(["Toronto"]);
    for (const t of S.trips) if (tripKey(t.name) === "toronto") for (const a of t.aliases || [t.name]) names.add(a);
    const items = [], places = [], seen = new Set();
    for (const nm of names) {
      try {
        const d = await call("/quest/trips/one?name=" + encodeURIComponent(nm)); S.live = true;
        for (const it of d.items || []) if (!seen.has(it.id)) { seen.add(it.id); items.push(it); }
        places.push(...(d.places || []));
      } catch (e) { S.note = e.message; }
    }
    S.local = { items: localItems(items), places };
    if (S.homeTab === "Local" && document.body.classList.contains("trips-home")) showHome();
  }
  const GEO_KEY = "quest-local-geo";
  async function drawLocalMap() {
    let Lf; try { Lf = await leaflet(); } catch { return; }
    const el = document.getElementById("thMap"); if (!el) return;
    const m = Lf.map(el, { zoomControl: true }); Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(m);
    m.setView([43.6532, -79.3832], 12);
    const pts = [];
    const pin = (lat, lng, html) => { Lf.marker([lat, lng], { icon: Lf.divIcon({ className: "", html: `<div class="trip-pin">📍</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(m).bindPopup(html); pts.push([lat, lng]); };
    for (const p of S.local.places) if (p.lat != null) pin(p.lat, p.lng, `<b>${esc(p.name)}</b><br>${esc(p.address || "")}`);
    // rows with a Location get a pin: geocoded once (about one a second) and remembered on this device
    let geo = {}; try { geo = JSON.parse(localStorage.getItem(GEO_KEY) || "{}"); } catch {}
    for (const it of S.local.items.slice(0, 40)) {
      const q = localWhere(it); if (!q) continue;
      if (!(q in geo)) {
        if (!document.getElementById("thMap")) return;
        try { const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q + ", Toronto"));
          const d = await r.json(); geo[q] = d[0] ? [Number(d[0].lat), Number(d[0].lon)] : null; } catch { geo[q] = null; }
        try { localStorage.setItem(GEO_KEY, JSON.stringify(geo)); } catch {}
        await new Promise((r) => setTimeout(r, 1100));
      }
      if (geo[q]) { pin(geo[q][0], geo[q][1], `<b>${esc(it.name)}</b><br>${esc(q)}`); m.fitBounds(pts, { padding: [30, 30], maxZoom: 14 }); }
    }
    if (pts.length) m.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
  }
  async function newTrip() {
    const name = (prompt("Trip name (for example: Lisbon spring trip)") || "").trim();
    if (!name) return;
    const dates = (prompt("Dates, first and last day (YYYY-MM-DD YYYY-MM-DD)") || "").trim().split(/\s+/);
    try {
      await call("/quest/trips/create", { db: "planner", trip: name, rows: [{ name: name + " (overview)", icon: "🧳",
        props: { "Date (Timezone)": dates[0] ? dates[0] + (dates[1] ? " → " + dates[1] : "") : "", Status: "Need to Book" } }] });
      S.trips.unshift({ name, start: dates[0] || "", end: dates[1] || dates[0] || "", icon: "🧳", aliases: [name] });
      openTrip(name);
    } catch (e) { alert("Could not save the trip to Notion: " + e.message); }
  }

  /* loading */
  async function loadTrips() {
    S.trips = [{ name: MTL, start: SEED.start, end: SEED.end, icon: "🧳" }];
    S.loading = true;   // no "Notion is not reachable" note while the first answer is on its way
    try {
      const d = await call("/quest/trips");
      S.live = true;
      S.trips = mergeTrips([...S.trips, ...(d.trips || []).map((t) => ({ ...t, icon: "🧳" }))]);
    } catch (e) { S.note = e.message; S.trips = mergeTrips(S.trips); }
    S.loading = false;
    drawSide(document.body.classList.contains("trips-home") ? "trips" : navOn);
    if (document.body.classList.contains("trips-home")) showHome();
  }
  async function openTrip(name) {
    const meta = S.trips.find((t) => t.name === name || (t.aliases || []).includes(name)) || { name };
    S.cur = { name, start: meta.start, end: meta.end, icon: meta.icon || "🧳", who: "", items: [], extras: {}, places: [], seeded: false,
      place: meta.place || "", aliases: meta.aliases || [name] };
    S.tab = "Itinerary"; S.day = -1; S.sel = null; S.mode = "map";
    document.body.classList.remove("trips-home");
    document.body.classList.add("trip-open");
    drawSide("trips");
    // a trip spelled two ways in Notion ("2026 🇪🇬 Egypt", "2026 Egypt") reads both
    for (const nm of S.cur.aliases) {
      let d = null;
      try { d = await call("/quest/trips/one?name=" + encodeURIComponent(nm)); S.live = true; } catch (e) { S.note = e.message; }
      if (d) { S.cur.items.push(...(d.items || []).filter((it) => !S.cur.items.some((x) => x.id === it.id))); Object.assign(S.cur.extras, d.extras || {}); S.cur.places.push(...(d.places || [])); }
    }
    if (name === MTL) {
      S.cur.who = SEED.who; S.cur.start = S.cur.start || SEED.start; S.cur.end = SEED.end;
      // show the calendar copy for anything Notion does not have yet
      const have = new Set(S.cur.items.map((i) => i.name.toLowerCase()));
      const missing = SEED.items.filter((i) => !have.has(i.name.toLowerCase()));
      if (missing.length) S.cur.items.push(...missing.map((i) => ({ ...i })));
      S.cur.items = hideCopies(S.cur.items);   // d64: a Notion card of the same kind on those dates wins
      S.cur.seeded = S.cur.items.some((i) => i.seed);
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
  const label = (it) => cardLabel(it, S.cur && S.cur.extras[it.id]);
  const pillCls = (it) => (S.cur && (S.cur.extras[it.id] || {}).plan ? "planned" : pillOf(it.status));
  const lookOf = (it) => statusLook(it.status, !!(S.cur && (S.cur.extras[it.id] || {}).plan));
  function card(it) {
    const ad = fieldVal(it, "Address"), where = ad ? " · " + esc(ad.split(",")[0]) : "";
    const w = whenText(it), lk = lookOf(it);
    return `<div class="item st-${lk.cls} ${S.sel === it.id ? "sel" : ""}" data-id="${esc(it.id)}" draggable="true"><div class="ic">${esc(it.icon || (isStay(it) ? "🏨" : isHike(it) ? "🥾" : "📍"))}</div>
      <div style="min-width:0"><div class="stl"><i>${lk.icon}</i>${esc(lk.label)}</div><div class="t">${esc(it.name)}</div><div class="s">${esc(w)}${where}${(S.cur.extras[it.id] || {}).plan ? " · Planned by day planner" : ""}${it.seed ? " · calendar copy" : ""}</div>${missLine(missingInfo(it, S.cur.extras[it.id]))}</div>
      <div class="r">${lk.book ? `<button class="bookbtn" data-book="${esc(it.id)}" title="Find where to book this">Book</button>` : ""}</div></div>`;
  }
  // where Book goes: the card's own link if it has one, else a search for it near the trip
  function bookUrl(it) {
    const link = Object.values(it.fields || {}).find((f) => f && f.type === "url" && f.value);
    if (link) return link.value;
    const f = (extrasOf(it.id).files || [])[0];
    if (f) return f;
    return "https://www.google.com/search?q=" + encodeURIComponent(`${it.name} ${destOf(S.cur.name, S.cur.place)} book`);
  }
  function drawLeft() {
    const c = S.cur, D = days();
    const need = c.items.filter((i) => pillOf(i.status) === "need");
    const ideas = c.items.filter((i) => pillOf(i.status) === "idea");
    const away = c.start ? Math.round((new Date(c.start + "T00:00:00") - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
    const fmt = (s) => s ? new Date(s + "T12:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }) : "";
    let h = `<a href="#" class="back" id="tvBack">← All trips</a><h1>${esc(c.icon)} ${esc(c.name)}</h1><div class="meta">${c.start ? `<span class="chip">${fmt(c.start)} to ${fmt(c.end)}</span>` : ""}
      ${c.who ? `<span class="chip">${esc(c.who)}</span>` : ""}${away != null && away >= 0 ? `<span class="chip">${away} days away</span>` : ""}
      ${need.map((i) => `<span class="chip warn">${esc(isStay(i) ? "Hotel" : i.name.replace(/ Day$/, ""))} not booked</span>`).join("")}
      ${c.seeded ? `<span class="chip act" id="tvSync" title="Writes the calendar copy into your Notion Travel Planner and Travel Activities Planner">⇪ Create in Notion</span>` : ""}</div>
      <div class="tabs">${TABS.map((t) => { const n = t === "Bookings" ? c.items.filter((i) => i.db === "planner").length : t === "Ideas" ? ideas.length : 0;
        return `<button class="${t === S.tab ? "on" : ""}" data-t="${t}">${t}${n ? `<span class="n">${n}</span>` : ""}</button>`; }).join("")}</div>`;
    if (S.tab === "Itinerary") {
      h += `<div class="daychips"><button class="${S.day < 0 ? "on" : ""}" data-d="-1">All</button>${D.map((d, i) => `<button class="${S.day === i ? "on" : ""}" data-d="${i}">${d}</button>`).join("")}</div>`;
      const plan = dayPlan(c.items, c.start, D.length);
      // Maybe (d61): cards with no date sit above the days; a date outside the trip stays at the bottom
      const maybe = plan.undated.filter((i) => !i.start), outside = plan.undated.filter((i) => i.start);
      h += `<div class="maybe" data-drop="maybe"><div class="mh">💭 Maybe<small>${maybe.length ? maybe.length + " · drag one onto a day to give it a date" : "drop a link, text or screenshot here, or onto a day"}</small></div>
        <form class="addbox" id="tvAdd"><input id="tvAddText" placeholder="Type a few words or paste a link" autocomplete="off">
        <select id="tvAddDay"><option value="">Maybe</option>${D.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select><button class="btn" type="submit">Add</button></form>
        ${maybe.map(card).join("")}<div class="gap"></div></div>`;
      (S.day < 0 ? D.map((_, i) => i) : [S.day]).forEach((d) => {
        const its = plan.days[d].on, stay = plan.days[d].staying;
        const sl = (xs, w) => xs.length ? `<div class="log">${w}: ${xs.map((i) => esc(i.name)).join(", ")}</div>` : "";
        const L = stayLines(stay), out = plan.days[d].out || [];
        const st = (out.length ? `<div class="log">Check-out: ${out.map((i) => esc(i.name) + (stayTime(i, "out") ? " by " + esc(stayTime(i, "out")) : "")).join(", ")}</div>` : "") + sl(L.staying, "Staying") + sl(L.stillOn, "Still on");
        h += `<div data-drop="${d}"><div class="day">${D[d]}<small></small></div><div class="rail"><div class="gap"></div>${its.map((it) => card(it) + `<div class="gap"></div>`).join("") || (st ? "" : `<div class="log nothing">Nothing planned yet.</div><div class="gap"></div>`)}${st}</div></div>`;
      });
      if (S.day < 0 && outside.length) h += `<div class="day">Outside the trip dates</div><div class="rail">${outside.map(card).join("")}</div>`;
    }
    if (S.tab === "Bookings") {
      const rows = c.items.filter((i) => i.db === "planner");
      const cols = ["Booked Through", "Points / Cash", "Credit Card", "Cancellation Policy"];
      h += `<table><tr><th>Name</th><th>Dates</th><th>Status</th>${cols.map((k) => `<th>${k === "Cancellation Policy" ? "Cancel by" : k}</th>`).join("")}</tr>` +
        rows.map((it) => `<tr data-id="${esc(it.id)}"><td style="cursor:pointer" data-open>${esc(it.icon || "")} ${esc(it.name)}</td><td>${esc((it.start || "").slice(5, 10))}${it.end ? " to " + esc(it.end.slice(5, 10)) : ""}</td>
          <td><span class="pill ${pillCls(it)}">${esc(label(it))}</span></td>${cols.map((k) => `<td contenteditable data-f="${esc(k)}">${esc(fieldVal(it, k))}</td>`).join("")}</tr>`).join("") +
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
    L.querySelector("#tvBack").onclick = (e) => { e.preventDefault(); closeDrawer(true); showHome(); };
    L.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => { S.tab = b.dataset.t; drawLeft(); });
    L.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => { S.day = +b.dataset.d; drawLeft(); });
    L.querySelectorAll(".item[data-id]").forEach((b) => b.onclick = (e) => { if (!e.target.closest("[data-book]")) openItem(b.dataset.id); });
    L.querySelectorAll("[data-book]").forEach((b) => b.onclick = () => { const it = S.cur.items.find((i) => i.id === b.dataset.book); if (it) window.open(bookUrl(it), "_blank", "noopener"); });
    const add = L.querySelector("#tvAdd");
    if (add) add.onsubmit = (e) => {
      e.preventDefault();
      const v = L.querySelector("#tvAddText").value, d = L.querySelector("#tvAddDay").value;
      const pl = dropPayload({ text: v });
      if (pl) dropOn(d === "" ? "maybe" : d, pl);
    };
    wireDrag(L);
    L.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openItem(b.closest("tr").dataset.id));
    L.querySelectorAll(".item[data-place]").forEach((b) => b.onclick = (e) => { if (e.target.tagName !== "A") focusPlace(b.dataset.place); });
    L.querySelectorAll("td[data-f]").forEach((td) => td.onblur = () => saveField(td.closest("tr").dataset.id, td.dataset.f, td.textContent));
    const sync = document.getElementById("tvSync"); if (sync) sync.onclick = syncSeed;
    const nb = document.getElementById("tvNewBooking"); if (nb) nb.onclick = newBooking;
    const nm = document.getElementById("tvNewMust"); if (nm) nm.onclick = () => { saveMusts(true); };
    const mt = document.getElementById("tvMusts"); if (mt) mt.querySelectorAll("td[contenteditable]").forEach((td) => td.onblur = () => saveMusts(false));
  }
  /* ── drag and drop onto the day timeline (Junyan d61, 2026-11-02) ──────────
     While something is dragged over the trip, the days open drop gaps. A link, text or
     screenshot dropped on a day becomes a Travel Planner card on that day (POST
     /quest/trips/drop); on Maybe, an undated card. A card dragged onto a day takes that
     date; onto Maybe, it loses its date. */
  const CARD_MIME = "application/x-trip-card";
  let dragDepth = 0;
  const endDrag = () => { dragDepth = 0; document.body.classList.remove("trip-drag"); view.querySelectorAll(".over").forEach((x) => x.classList.remove("over")); };
  const canDrop = () => document.body.classList.contains("trip-open") && S.tab === "Itinerary";
  view.addEventListener("dragenter", (e) => { if (!canDrop()) return; dragDepth++; document.body.classList.add("trip-drag"); });
  view.addEventListener("dragleave", () => { if (--dragDepth <= 0) endDrag(); });
  // a drop that misses a day must not make the browser open the link or image in place of the app
  addEventListener("dragover", (e) => { if (document.body.classList.contains("trip-open")) e.preventDefault(); });
  addEventListener("drop", (e) => { if (document.body.classList.contains("trip-open")) { e.preventDefault(); endDrag(); } });
  addEventListener("dragend", endDrag);
  function wireDrag(L) {
    L.querySelectorAll(".item[data-id][draggable]").forEach((el) => {
      el.ondragstart = (e) => { e.dataTransfer.setData(CARD_MIME, el.dataset.id); e.dataTransfer.effectAllowed = "move"; el.classList.add("dragging"); };
      el.ondragend = () => el.classList.remove("dragging");
    });
    L.querySelectorAll(".item[data-id]").forEach((el) => fileTarget(el, () => el.dataset.id));
    L.querySelectorAll("[data-drop]").forEach((z) => {
      z.ondragover = (e) => { e.preventDefault(); L.querySelectorAll(".over").forEach((x) => x !== z && x.classList.remove("over")); z.classList.add("over"); };
      z.ondrop = (e) => {
        e.preventDefault(); e.stopPropagation();
        const dt = e.dataTransfer, where = z.dataset.drop;
        endDrag();
        const id = dt.getData(CARD_MIME);
        if (id) return moveCard(id, where);
        const file = [...(dt.files || [])].find((f) => /^image\//.test(f.type));
        const pl = dropPayload({ image: !!file, uri: dt.getData("text/uri-list"), text: dt.getData("text/plain") });
        if (pl) dropOn(where, pl, file);
      };
    });
  }
  /* a confirmation PDF or image dropped on a card or its panel goes to that Notion page's
     "Files & media", renamed by the server to Junyan's convention (2026-11-02) */
  const CONF_FILE_RE = /^(application\/pdf|image\/(png|jpe?g|webp|gif|heic))$/i;
  const fileOf = (dt) => [...((dt && dt.files) || [])].find((f) => CONF_FILE_RE.test(f.type));
  const hasFiles = (dt) => !!dt && [...(dt.types || [])].includes("Files");
  function fileTarget(el, idOf) {
    const ok = () => { const it = S.cur && S.cur.items.find((i) => i.id === idOf()); return it && Array.isArray(it.files) && !it.seed ? it : null; };
    el.addEventListener("dragover", (e) => { if (hasFiles(e.dataTransfer) && ok()) { e.preventDefault(); e.stopPropagation(); el.classList.add("fileover"); } });
    el.addEventListener("dragleave", () => el.classList.remove("fileover"));
    el.addEventListener("drop", (e) => {
      el.classList.remove("fileover");
      const it = ok(), file = fileOf(e.dataTransfer);
      if (!it || !hasFiles(e.dataTransfer)) return;
      e.preventDefault(); e.stopPropagation(); endDrag();
      if (!file) return toast("Only a PDF or an image");
      uploadConfirm(it, file);
    });
  }
  async function uploadConfirm(it, file) {
    if (file.size > 15e6) return toast("File over 15 MB");
    toast("Uploading to Notion…");
    try {
      const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(file); });
      const d = await call("/quest/trips/file", { id: it.id, db: it.db, filename: file.name, data });
      Object.assign(it, d.item, { db: it.db });
      toast("Saved as " + d.name);
      drawLeft(); if (S.sel === it.id) openItem(it.id);
    } catch (err) { toast("Not saved: " + err.message); }
  }
  // a screenshot is shrunk to at most 1400 px and saved as JPEG so it stays small on the server
  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      for (const [max, q] of [[1400, 0.78], [1000, 0.7], [700, 0.6]]) {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const d = c.toDataURL("image/jpeg", q);
        if (d.length < 880000) return d;
      }
      return "";
    } finally { URL.revokeObjectURL(url); }
  }
  async function dropOn(where, pl, file) {
    const date = where === "maybe" || !S.cur.start ? "" : tripDate(S.cur.start, +where);
    const body = { trip: S.cur.name, date };
    if (pl.image) { body.image = file ? await shrink(file).catch(() => "") : ""; if (!body.image) return toast("Could not read that image"); }
    else if (pl.url) body.url = pl.url; else body.text = pl.text;
    toast(date ? "Adding to " + days()[+where] + "…" : "Adding to Maybe…");
    try {
      const d = await call("/quest/trips/drop", body);
      S.cur.items.push(d.item);
      if (d.extra) S.cur.extras[d.item.id] = d.extra;
      S.cur.items.sort((a, b) => (a.start || "9").localeCompare(b.start || "9"));
      drawLeft(); toast(`Saved "${d.item.name}" to the Travel Planner`);
    } catch (e) { toast("Not saved: " + e.message); }
  }
  async function moveCard(id, where) {
    const it = S.cur.items.find((i) => i.id === id);
    if (!it) return;
    const date = where === "maybe" || !S.cur.start ? "" : tripDate(S.cur.start, +where);
    // keep the time of day when a timed card moves to another day
    const t = /T[\d:.]+([+-]\d\d:\d\d|Z)?$/.exec(it.start || "");
    const val = date ? date + (t ? t[0] : "") : "";
    if ((it.start || "") === val) return;
    const before = { start: it.start, end: it.end };
    // a stay keeps its length: the end moves by the same number of days
    let end = "";
    if (date && it.end && it.start) { const shift = dayIndex(date, it.start.slice(0, 10)); end = tripDate(it.end.slice(0, 10), shift) + it.end.slice(10); }
    it.start = val; it.end = end;
    drawLeft();
    if (it.seed || String(id).startsWith("seed-")) return toast("Moved on this screen (calendar copy, not in Notion yet)");
    const col = Object.keys(it.fields || {}).find((k) => /^(Date \(Timezone\)|Scheduled Date|Date)$/.test(k) && it.fields[k].type === "date")
      || Object.keys(it.fields || {}).find((k) => it.fields[k].type === "date") || (it.db === "activities" ? "Scheduled Date" : "Date (Timezone)");
    try {
      const d = await call("/quest/trips/item", { id, db: it.db, props: { [col]: val ? val + (end ? " → " + end : "") : "" } });
      Object.assign(it, d.item, { db: it.db });
      drawLeft(); toast(date ? "Moved to " + days()[+where] : "Moved to Maybe");
    } catch (e) { Object.assign(it, before); drawLeft(); toast("Not moved: " + e.message); }
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
  const fieldVal = (it, k) => fieldOf(it, k, extrasOf(it.id));
  async function saveField(id, k, value) {
    const it = S.cur.items.find((i) => i.id === id);
    if (!it) return;
    value = String(value || "").trim();
    if (fieldVal(it, k) === value) return;
    const col = colFor(it, k);
    if (col && !it.seed) {
      try { const d = await call("/quest/trips/item", { id, db: it.db, props: { [col]: value } }); Object.assign(it, d.item, { db: it.db }); toast("Saved to Notion"); drawLeft(); }
      catch (e) { toast("Not saved: " + e.message); }
    } else {
      const ex = extrasOf(id); ex.f = { ...(ex.f || {}), [k]: value };
      if (k === "Address") it.address = value;
      saveExtra(id); drawLeft();
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
    const need = new Set(missingInfo(it, ex).map((m) => MISSING_FIELD[m]));
    const kv = (k, editable = true, lab = k) => { const n = need.has(k) ? "need" : ""; return `<span class="${n}">${lab}</span><div class="${n}" ${editable ? `contenteditable data-k="${esc(k)}"` : ""}>${esc(fieldVal(it, k))}</div>`; };
    const kind = kindOf(it);
    const times = kind === "stay" ? kv("Check-in", true, "Check-in") + kv("Check-out", true, "Check-out")
      : kind === "transport" ? kv("Check-in", true, "Departs") + kv("Check-out", true, "Arrives") : "";
    const STATUSES = it.db === "planner" ? ["Need to Book", "Maybe", "Free", "Taxes Still Owing", "Booked Unpaid", "Prepaid", "Gas", "Cancelled"]
      : ["Need to Book", "Booked Unpaid", "Prepaid", "Planned", "Idea", "Maybe"];
    const addr = fieldVal(it, "Address");
    const stay = isStay(it) ? `<div class="blk"><h3>CHECKLIST (same as your Notion cards)</h3>${CHECK.map((c, i) => `<div class="chk ${(ex.check || {})[i] ? "y" : ""}" data-c="${i}"><i></i>${esc(c)}</div>`).join("")}</div>` +
      [["benefits", "🏨 STAY BENEFITS", "Breakfast, upgrade, early check-in, late checkout, status."], ["credits", "💳 CREDITS TO USE", "Any hotel or card credit, with its deadline."],
       ["gym", "🏋️ GYM PLAN", "Hotel gym, plus the nearest full gym with walking directions."]]
        .map(([k, t, ph]) => `<div class="blk"><h3>${t}</h3><div contenteditable class="log" data-x="${k}" data-ph="${esc(ph)}">${esc(ex[k] || "")}</div></div>`).join("") : "";
    const hike = isHike(it) ? `<div class="blk"><h3>🥾 TRAIL (GPX)</h3><div class="log">${ex.gpxName ? "Attached: " + esc(ex.gpxName) + " · " : ""}<a href="#" id="tvGpx">${ex.gpxName ? "Replace" : "＋ Attach"} GPX file</a></div></div>` : "";
    const files = (ex.files || []).map((f, i) => `<div><a href="${esc(f)}" target="_blank" rel="noopener">${esc(f.replace(/^https?:\/\//, "").slice(0, 40))} ↗</a> <a href="#" data-rmf="${i}" style="color:var(--ink-faint)">×</a></div>`).join("");
    const notionFiles = (it.files || []).map((f) => `<div>📎 ${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)} ↗</a>` : esc(f.name)}</div>`).join("");
    const D = document.getElementById("tvDrawer");
    D.innerHTML = `<button class="x" id="tvClose">×</button><div style="font-size:12px;color:var(--ink-faint)">${esc(d)} ${esc((it.start || "").slice(0, 4))}</div>
      <h2>${esc(it.icon || "")} ${esc(it.name)}</h2><span class="pill ${pillCls(it)}">${esc(label(it))}</span>
      <div class="kv"><span class="${need.has("When") ? "need" : ""}">When</span><div class="${need.has("When") ? "need" : ""}">${esc(whenText(it) || "No time yet")}</div>
      ${times}<span class="${need.has("Status") ? "need" : ""}">Status</span><div><select id="tvStatus" style="font:inherit;background:#2a2f63;color:var(--ink);border:1px solid rgba(255,255,255,.2);border-radius:6px">
        ${STATUSES.concat(it.status && !STATUSES.includes(it.status) ? [it.status] : []).concat(it.status ? [] : [""]).map((s) => `<option ${s === it.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
      ${kv("Address")}<span>Google Maps</span><div>${addr ? `<a href="${gmaps(addr)}" target="_blank" rel="noopener">Open ↗</a> · <a href="${gdir({ address: addr })}" target="_blank" rel="noopener">Directions ↗</a>` : `<span style="color:var(--ink-faint)">add an address</span>`}</div>
      ${kv("Booked Through")}${kv("Points / Cash")}${kv("Card")}${kv("Cancel by")}${kv("Confirmation #")}
      <span class="${need.has("Files") ? "need" : ""}">Files</span><div id="tvFiles">${notionFiles}${files}<a href="#" id="tvAddFile">＋ add link</a>${Array.isArray(it.files) && !it.seed ? ` <span style="color:var(--ink-faint)">· drop a PDF or image on this panel</span>` : ""}</div></div>
      ${stay}${hike}${ex.img ? `<div class="blk"><h3>🖼 SCREENSHOT</h3><div class="log" id="tvShot">Loading…</div></div>` : ""}
      ${need.size ? `<div class="blk">${missLine(missingInfo(it, ex), ' style="color:var(--warn);font-size:12.5px"')}</div>` : ""}
      <div class="blk msgs" id="tvMsgs"><h3>📬 MESSAGES AND CHANGES</h3><div class="log" id="tvMsgList">${planGate(it) ? "Save this trip to Notion to keep messages." : "Checking Notion…"}</div>
        ${planGate(it) ? "" : `<textarea id="tvMsgText" placeholder="Paste a host message or a change. First line can be: From: name"></textarea><button class="btn" id="tvMsgAdd" type="button">Add entry</button>`}</div>
      <div class="blk" id="tvPlan"><h3>✨ DAY PLAN</h3><div class="log">Checking Notion…</div></div>
      <div class="blk"><h3>NOTES</h3><div contenteditable class="log" data-x="notes" style="min-height:40px">${esc(ex.notes || "")}</div></div>
      <div class="blk">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">Open in Notion ↗</a>` : `<span class="log">Not in Notion yet: use "Create in Notion" at the top.</span>`}</div>`;
    D.classList.add("open");
    if (!D.dataset.files) { D.dataset.files = "1"; fileTarget(D, () => S.sel); }
    document.getElementById("tvClose").onclick = () => closeDrawer();
    if (ex.img) call("/quest/trips/img?id=" + encodeURIComponent(id)).then((r) => { const el = document.getElementById("tvShot"); if (el && S.sel === id) el.innerHTML = r.image ? `<img class="shot" alt="Screenshot" src="${esc(r.image)}">` : "Not found on the server."; }).catch(() => {});
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
    drawPlan(it);
    drawMsgs(it);
    const g = document.getElementById("tvGpx");
    if (g) g.onclick = (e) => { e.preventDefault(); pickFile(".gpx,application/gpx+xml", async (name, text) => {
      if (!gpxStats(text)) return toast("That file has no track points");
      ex.gpxName = name; ex.gpxLocal = String(it.id).startsWith("seed-") ? text : undefined;
      if (!String(it.id).startsWith("seed-")) { try { await call("/quest/trips/gpx", { id, gpx: text }); } catch (er) { return toast("Not saved: " + er.message); } }
      S.gpx = { id, text }; saveExtra(id); openItem(id); S.mode = "hike"; drawMap();
    }); };
  }
  /* day planner: "Plan this" writes the empty template into the card's own Notion page
     (still-api never makes a new page); the Activity Day Planner skill or Junyan fills it. */
  const plans = {};
  async function drawPlan(it) {
    const box = () => S.sel === it.id && document.getElementById("tvPlan");
    const ex = extrasOf(it.id), kind = planKind(it, S.cur.name);
    const paint = (plan, note = "") => {
      const b = box(); if (!b) return;
      if (!plan) {
        b.innerHTML = `<h3>✨ DAY PLAN</h3>${note}<button class="pbtn" id="tvPlanGo">Plan this</button>
          <div class="log" style="margin-top:6px">${kind === "full" ? "Full plan: conditions, getting there, the day, must-dos, careful, after the day." : "Short plan: getting there and must-dos."} Saved in this card's Notion page.</div>`;
        document.getElementById("tvPlanGo").onclick = async (e) => {
          e.target.disabled = true; e.target.textContent = "Writing to Notion…";
          try { const d = await call("/quest/trips/plan", { id: it.id, kind, item: { name: it.name, start: it.start } }); keep(d.plan); toast(d.created ? "Plan added to the Notion page" : "This card already had a plan"); }
          catch (err) { toast("Not saved: " + err.message); paint(null); }
        };
        return;
      }
      const empty = !JSON.stringify(plan.sections).match(/"(text|open|weather|mood|rating|worked|energy|note)":"[^"]/) && !(plan.sections.careful || []).length;
      b.innerHTML = `<span class="ptag">${esc(planTag(plan))}</span>${planHtml(plan, ex.mustDone)}
        <div class="log" style="margin-top:6px">${empty ? "Empty plan: ask the Activity Day Planner skill in Notion to fill it, or type in the Notion page. " : ""}<a href="#" id="tvPlanRe">↻ Refresh from Notion</a></div>`;
      b.querySelectorAll("[data-m]").forEach((el) => el.onclick = () => {
        const m = plan.sections.must[+el.dataset.m]; if (m.done) return;
        ex.mustDone = { ...(ex.mustDone || {}), [m.text]: !(ex.mustDone || {})[m.text] }; el.classList.toggle("y"); saveExtra(it.id);
      });
      document.getElementById("tvPlanRe").onclick = (e) => { e.preventDefault(); load(); };
    };
    const keep = (plan) => {
      plans[it.id] = plan;
      const was = JSON.stringify(ex.plan || null), now = plan ? { checked: plan.checked, kind: plan.kind } : undefined;
      if (now) ex.plan = now; else delete ex.plan;
      if (was !== JSON.stringify(now || null)) { saveExtra(it.id); drawLeft(); }
      paint(plan);
    };
    const load = async () => { try { keep((await call("/quest/trips/plan?id=" + encodeURIComponent(it.id))).plan); } catch (err) { paint(plans[it.id] || null, `<div class="log">Could not read Notion: ${esc(err.message)}</div>`); } };
    if (planGate(it)) {
      const b = box(); if (!b) return;
      b.innerHTML = `<h3>✨ DAY PLAN</h3><div class="log">${esc(planGate(it))}</div>${document.getElementById("tvSync") ? `<button class="pbtn" id="tvPlanSync" style="margin-top:6px">⇪ Create in Notion</button>` : ""}`;
      const go = document.getElementById("tvPlanSync"); if (go) go.onclick = () => syncSeed();
      return;
    }
    if (plans[it.id]) paint(plans[it.id]);
    load();
  }
  /* messages and changes (stored in the card's Notion page under "📬 Messages and changes") */
  function drawMsgs(it) {
    const list = () => S.sel === it.id && document.getElementById("tvMsgList");
    if (planGate(it)) return;
    const paint = (entries) => { const el = list(); if (!el) return;
      el.innerHTML = entries.length ? entries.map((e) => `<div class="m"><small>${esc(e.date)}${e.from ? " · " + esc(e.from) : ""}</small><div>${esc(e.summary)}${e.link ? ` · <a href="${esc(e.link)}" target="_blank" rel="noopener">Gmail thread ↗</a>` : ""}</div></div>`).join("") : "Nothing logged yet."; };
    call("/quest/trips/log?id=" + encodeURIComponent(it.id)).then((r) => paint(r.entries || [])).catch((e) => { const el = list(); if (el) el.textContent = "Could not read: " + e.message; });
    const btn = document.getElementById("tvMsgAdd");
    if (btn) btn.onclick = async () => {
      const entry = pastedEntry(document.getElementById("tvMsgText").value);
      if (!entry) return toast("Paste some text first");
      btn.disabled = true;
      try { const r = await call("/quest/trips/log", { id: it.id, entry }); paint(r.entries || []); document.getElementById("tvMsgText").value = ""; toast("Saved to the Notion page"); }
      catch (e) { toast("Not saved: " + e.message); }
      btn.disabled = false;
    };
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
      map.setView([20, 0], 2);   // never a default city (the Carnaval trip opened on Montreal)
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
    if (!pts.length) centreOnDest();
  }
  // no pins yet: centre on the trip's destination (its Location, else its name), else the world
  const geoCache = {};
  async function centreOnDest() {
    const cur = S.cur, dest = destOf(cur.name, cur.place);
    let geo = null;
    if (dest) {
      if (!(dest in geoCache)) {
        geoCache[dest] = null;
        try { const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(dest));
          const d = r.ok ? await r.json() : []; if (d[0]) geoCache[dest] = { lat: +d[0].lat, lng: +d[0].lon }; } catch {}
      }
      geo = geoCache[dest];
    }
    if (S.cur !== cur || !map) return;   // another trip opened meanwhile
    const st = mapStart([], dest, geo);
    if (st.center) map.setView(st.center, st.zoom); else map.setView([20, 0], 2);
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
    try { const d = await call("/quest/places/import", { trip: S.cur.name, list, csv, near: destOf(S.cur.name) });
      toast(`Added ${d.added} places, ${d.located} with a pin`); openTrip(S.cur.name); }
    catch (e) { toast("Import failed: " + e.message); }
  });

  drawSide("today");   // at once: the trips list only fills the Trips page, it never held up the sidebar (2026-11-09)
  loadTrips();   // puts the saved Montreal copy in at once, then redraws when Notion answers
  if (startView(location.hash) === "trips") showHome();   // from the calendar's Travel tab
})(typeof globalThis !== "undefined" ? globalThis : this);
