/* Commute blocks, slice 1 (Junyan, 2026-11-24: "1 yes, 2 A, 3 yes, 4 A"). The rules behind the Commute panel in
   calendar.html, with no page in them: still/test/commute.test.mjs.
   Where a block is going, when to ask, the Google Maps link, how a photo is shrunk and which place a photo note belongs to.
   Slice 2 (Junyan, 2026-11-24, d1 to d9): the time to leave, the quickest way, Heads up grouping and the once-only check
   before leaving. Every number here comes from the server's directions answer (still-api /quest/commute/directions);
   nothing is made up, and with no answer the panel shows none of it. */
(function (root) {
  "use strict";
  const C = () => root.CalCore;
  const TRAVELMODE = { transit: "transit", drive: "driving", commute: "walking" };
  const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

  /** The "Open in Google Maps" address. No From: Google starts from where he is. No To: no link. */
  function mapsLink({ from, to, mode }) {
    const dest = clean(to); if (!dest) return "";
    const o = clean(from);
    return "https://www.google.com/maps/dir/?api=1" + (o ? "&origin=" + encodeURIComponent(o) : "") +
      "&destination=" + encodeURIComponent(dest) + "&travelmode=" + (TRAVELMODE[mode] || "walking");
  }

  /** "🎯 DM  Advanced Training · 0/2" → "dm advanced training": what "Remember for every ..." matches on. */
  function titleKey(t) {
    return clean(String(t || "").toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\b\d+\b/g, " "));
  }
  /** The place saved by "Remember for every <title>" (still-api /quest/places, own category so Trips never lists it). */
  function rememberPlace({ title, address, lat, lng }) {
    const key = titleKey(title); if (!key || !clean(address)) return null;
    return { name: clean(title).slice(0, 200), address: clean(address), lat: lat == null ? null : lat, lng: lng == null ? null : lng,
      category: "commute-for", list: "for:" + key, notes: "Where the Commute block before this event goes", savedBy: "Calendar" };
  }

  /** The next timed event on the block's day that begins when the block ends or later (not all-day, not a suggestion,
      not another Commute block). */
  function nextEvent(ev, events, tz) {
    const day = C().wall(ev.s, tz).day;
    return events.filter((x) => x.id !== ev.id && !x.allDay && !x.ghost && x.k !== "commute" && x.s >= ev.e && C().wall(x.s, tz).day === day)
      .sort((a, b) => a.s - b.s)[0] || null;
  }
  /** The same place: the same address by its words, else the same saved place id. */
  function samePlace(a, b) {
    const x = placeKey(a), y = placeKey(b);
    return !!x && !!y && x === y;
  }
  /** Where the block goes. A place he picked or typed for this block wins; then the block's own location, the next event's
      location, and the place saved for that event's title. With none of those, Home (shown as Home), unless the trip would
      start at Home too: then source "none" means ask. With no Home saved, "none" as before. */
  function target({ ev, events, tz, remembered = [], typed = null, home = null, from = null }) {
    const next = nextEvent(ev, events || [], tz), nextTitle = next ? next.title : "";
    const out = (source, o) => ({ source, address: clean(o.address), lat: o.lat == null ? null : o.lat, lng: o.lng == null ? null : o.lng, id: o.id || "", nextTitle, name: clean(o.name) });
    if (typed && clean(typed.address)) return out("typed", typed);
    if (clean(ev.location)) return out("block", { address: ev.location });
    if (next && clean(next.location)) return out("next", { address: next.location, name: next.title });
    const key = next ? titleKey(next.title) : "";
    const mem = key && remembered.find((p) => p.category === "commute-for" && p.list === "for:" + key);
    if (mem) return out("remembered", { ...mem, name: "" });   // its saved name is the event title, not a place name
    if (home && (clean(home.address) || home.id) && !samePlace(from, home)) return out("home", { ...home, name: "Home" });
    return out("none", {});
  }
  const needsAsk = (t) => !t || t.source === "none";

  /** Where the trip starts when he did not pick it: the place of the block before it that day. Walk back through that day's
      earlier timed events (not all-day, not a suggestion), take the first with a place: a Commute block gives its To
      (targetOf), any other block its location. null when nothing before it has one. */
  function previousPlace({ ev, events, tz, targetOf }) {
    const day = C().wall(ev.s, tz).day;
    const before = (events || []).filter((x) => x.id !== ev.id && !x.allDay && !x.ghost && x.s < ev.s && C().wall(x.s, tz).day === day)
      .sort((a, b) => b.s - a.s || b.e - a.e);
    for (const x of before) {
      if (x.k === "commute") {
        const t = targetOf ? targetOf(x) : null;
        if (t && !needsAsk(t) && clean(t.address)) return { name: clean(t.name), address: clean(t.address), lat: t.lat == null ? null : t.lat, lng: t.lng == null ? null : t.lng, id: t.id || "", title: x.title };
      } else if (clean(x.location)) return { name: "", address: clean(x.location), lat: null, lng: null, id: "", title: x.title };
    }
    return null;
  }
  /** The From of a block: the one he picked for it, else where the block before it ended, else Home, else null ("Where you are"). */
  function fromFor({ ev, events, tz, targetOf, picked = null, home = null }) {
    if (picked) return picked;
    const prev = previousPlace({ ev, events, tz, targetOf });
    if (prev) return prev;
    return home && (clean(home.address) || home.id) ? { name: "Home", address: home.address || "", lat: home.lat == null ? null : home.lat, lng: home.lng == null ? null : home.lng, id: home.id || "" } : null;
  }
  /** Length: one tap of minus or plus moves the end by 15 minutes, never under 15. */
  const stepDur = (min, dir) => Math.max(15, Math.round(min) + (dir < 0 ? -15 : 15));

  /** The key a photo note is kept under: an address by its words (so a saved place and the same address typed by hand are one place), else a saved place by its id. */
  function placeKey(p) {
    const a = clean(p && p.address).toLowerCase();
    return a ? "a:" + a : p && p.id ? "p:" + p.id : "";
  }
  /** A photo's size after shrinking to a long side of max, same shape, never enlarged. */
  function fitSize(w, h, max) {
    const k = Math.min(1, max / Math.max(w, h));
    return { w: Math.round(w * k), h: Math.round(h * k) };
  }

  /* ---------- slice 2 ---------- */
  const BUFFER_MIN = 5, MIN = 60000;
  /** The chip names a way as C.MODES does (commute is the walk); the server names it walk. */
  const WAY = { commute: "walk", transit: "transit", drive: "drive" };
  const CHIP = { walk: "commute", transit: "transit", drive: "drive" };
  /** When he has to be there: 5 minutes before the next event that day, else the end of the block. */
  function arriveTarget(ev, events, tz) {
    const next = nextEvent(ev, events || [], tz);
    return next ? { at: next.s - BUFFER_MIN * MIN, nextTitle: next.title, buffer: BUFFER_MIN } : { at: ev.e, nextTitle: "", buffer: 0 };
  }
  const usable = (w) => !!w && !w.tooFar && Number.isFinite(w.minutes);
  /** When to leave: the server's own time for a transit trip (it is a real departure), else the arrive-by time minus the minutes. */
  function leaveBy(way, arriveAt) {
    if (!usable(way)) return null;
    if (Number.isFinite(way.leaveAt)) return way.leaveAt;
    return Math.floor(arriveAt / MIN) * MIN - way.minutes * MIN;
  }
  /** "Arrive 1:09 pm, 6 min before Zouk Training" (the minutes are what is really left between arriving and the next start). */
  function arriveLine(way, target, fmt) {
    if (!usable(way)) return "";
    const arrive = Number.isFinite(way.arriveAt) ? way.arriveAt : target.at;
    if (!target.nextTitle) return `Arrive ${fmt(arrive)}, when the block ends`;
    const spare = Math.round((target.at + target.buffer * MIN - arrive) / MIN);
    return spare >= 0 ? `Arrive ${fmt(arrive)}, ${spare} min before ${target.nextTitle}` : `Arrive ${fmt(arrive)}, ${-spare} min after ${target.nextTitle} starts`;
  }
  /** The chip of the quickest way (ties go to walking, then transit), or "" when no way has minutes. */
  function bestWay(ways) {
    let best = "", min = Infinity;
    for (const m of ["walk", "transit", "drive"]) { const w = ways && ways[m]; if (usable(w) && w.minutes < min) { min = w.minutes; best = m; } }
    return best ? CHIP[best] : "";
  }
  /** When another way beats the chosen one by at least 3 minutes: {chip, by}. */
  function quickerThan(ways, chip, margin = 3) {
    const cur = ways && ways[WAY[chip]]; if (!usable(cur)) return null;
    const b = bestWay(ways); if (!b || b === chip) return null;
    const by = cur.minutes - ways[WAY[b]].minutes;
    return by >= margin ? { chip: b, by } : null;
  }
  /** Alerts for one way: a TTC alert only for transit, a road closure only for driving, the weather for every way. */
  function alertsFor(alerts, chip) {
    const w = WAY[chip];
    return (alerts || []).filter((a) => a.mode === "any" || a.mode === w);
  }
  /** Compare two checks by alert id: New (in the latest only), Still on (in both), Cleared (in the earlier only). With no earlier check nothing is "new". */
  function groupAlerts(prev, cur) {
    cur = cur || [];
    if (!prev) return { added: [], still: cur, cleared: [], compared: false };
    const had = new Set(prev.map((a) => a.id)), has = new Set(cur.map((a) => a.id));
    return { added: cur.filter((a) => !had.has(a.id)), still: cur.filter((a) => had.has(a.id)), cleared: prev.filter((a) => !has.has(a.id)), compared: true };
  }
  /** "6 min earlier" / "4 min later" / "" when the leave-by time did not move (whole minutes). */
  function leaveShift(before, after) {
    if (!Number.isFinite(before) || !Number.isFinite(after)) return "";
    const d = Math.round((before - after) / MIN);
    return d > 0 ? `${d} min earlier` : d < 0 ? `${-d} min later` : "";
  }
  /** The page checks by itself only while it is open, once, in the hour before leaving. */
  function autoCheckDue({ now, leaveAt, done }) {
    return !done && Number.isFinite(leaveAt) && now >= leaveAt - 60 * MIN && now < leaveAt;
  }
  /** Google's encoded polyline to [[lat, lng], ...]. */
  function decodePolyline(str) {
    const out = []; let i = 0, lat = 0, lng = 0; str = String(str || "");
    const next = () => { let r = 0, sh = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32 && i <= str.length); return r & 1 ? ~(r >> 1) : r >> 1; };
    while (i < str.length) { lat += next(); lng += next(); out.push([lat / 1e5, lng / 1e5]); }
    return out;
  }

  /* ---------- d24 to d27 (Junyan, 2026-11-24, "Yes to all four") ---------- */
  /** Organic Maps' own link format (source: omaps.app/api, "om://route" and "om://map"; the https://omaps.app/route and
      /map forms take the same parameters and open the app, or a web page when it is not installed). Both ends with
      coordinates: the trip in the picked way. Only the To with coordinates: that spot. No To coordinates: no link. */
  const OM_TYPE = { transit: "transit", drive: "vehicle", commute: "pedestrian" };
  const hasXY = (o) => !!o && typeof o.lat === "number" && typeof o.lng === "number" && Number.isFinite(o.lat) && Number.isFinite(o.lng);
  const omName = (o) => clean(o && o.name) || clean(o && o.address);
  function organicMapsLink({ from, to, mode }) {
    if (!hasXY(to)) return "";
    if (hasXY(from)) {
      return "https://omaps.app/route?sll=" + from.lat + "," + from.lng + "&saddr=" + encodeURIComponent(omName(from)) +
        "&dll=" + to.lat + "," + to.lng + "&daddr=" + encodeURIComponent(omName(to)) + "&type=" + (OM_TYPE[mode] || "pedestrian");
    }
    return "https://omaps.app/map?v=1&ll=" + to.lat + "," + to.lng + (omName(to) ? "&n=" + encodeURIComponent(omName(to)) : "");
  }
  /** The places list starts at 3 characters. */
  const placesAskable = (q) => clean(q).length >= 3;
  /** The server's /quest/commute/places answer as the list to draw: up to 5 rows with an id and a name. Only "ok" gives rows;
      "stopped" is flagged (one soft line); no-key, error and anything odd give nothing and say nothing. */
  function readSuggestions(res) {
    if (!res || typeof res !== "object") return { items: [], stopped: false };
    if (res.state === "stopped") return { items: [], stopped: true };
    if (res.state !== "ok" || !Array.isArray(res.suggestions)) return { items: [], stopped: false };
    const items = res.suggestions.filter((x) => x && clean(x.id) && clean(x.name)).slice(0, 5).map((x) => ({ id: String(x.id), name: clean(x.name), sub: clean(x.sub) }));
    return { items, stopped: false };
  }
  /** The server's /quest/commute/place answer as a place to save, or null (it needs coordinates and something to call it). */
  function readPlace(res) {
    const p = res && res.state === "ok" && res.place;
    if (!p || !hasXY(p) || !(clean(p.name) || clean(p.address))) return null;
    return { name: clean(p.name), address: clean(p.address), lat: p.lat, lng: p.lng };
  }
  /** What a picked place puts into an event's Location: "Name, full address", or just the address when it already starts with the
      name, or the name alone with no address. With the answer failed, the row's own words go in as {name, address: sub}. */
  function locationText(o) {
    if (!o) return "";
    const name = clean(o.name), addr = clean(o.address);
    if (!addr) return name;
    if (!name || addr.toLowerCase() === name.toLowerCase() || addr.toLowerCase().startsWith(name.toLowerCase())) return addr;
    return name + ", " + addr;
  }
  const keyText = (s) => clean(s).toLowerCase().replace(/\s+/g, "");
  /** The place to save for "Keep in Saved places" (still-api cleanPlace's shape, a category of its own so Trips never lists it),
      or null: it needs coordinates and something to call it. */
  function keepPlace(o) {
    if (!o) return null;
    const name = clean(o.name) || clean(o.address);
    if (!name || !hasXY(o)) return null;
    return { name: name.slice(0, 200), address: clean(o.address).slice(0, 300), lat: o.lat, lng: o.lng, category: "saved", savedBy: "Calendar", list: "", notes: "Kept from the Commute box" };
  }
  /** Already among the saved places: the same name and address, ignoring case and spaces. */
  function alreadyKept(places, o) {
    if (!o || !Array.isArray(places)) return false;
    const n = keyText(o.name || o.address), a = keyText(o.address);
    return places.some((p) => p && keyText(p.name) === n && keyText(p.address) === a);
  }
  /** The Saved places chips of a From or To box: Home first, then the places kept from here, then the Trips places as before
      (the Trips places keep their 12). Remembered-for places, the Home card itself and places with no address and no pin stay out. */
  function savedChips(places, home) {
    const all = (Array.isArray(places) ? places : []).filter((p) => p && p.category !== "commute-for" && p.category !== "home" && p !== home && (p.address || p.lat != null));
    const rest = [...all.filter((p) => p.category === "saved"), ...all.filter((p) => p.category !== "saved").slice(0, 12)];
    return [...(home ? [{ id: home.id, name: "Home" }] : []), ...rest];
  }
  /** How a place reads on a From or To row: the name over its address (Home alone, a typed place once). */
  function rowText(o) {
    if (!o) return { main: "", sub: "" };
    const name = clean(o.name), addr = clean(o.address);
    if (name === "Home") return { main: "Home", sub: "" };
    if (name && addr && name !== addr) return { main: name, sub: addr };
    return { main: name || addr, sub: "" };
  }

  root.CalCommute = { arriveTarget, leaveBy, arriveLine, bestWay, quickerThan, alertsFor, groupAlerts, leaveShift, autoCheckDue, decodePolyline, WAY, CHIP, mapsLink, organicMapsLink, placesAskable, readSuggestions, readPlace, locationText, keepPlace, alreadyKept, savedChips, rowText, titleKey, rememberPlace, nextEvent, target, needsAsk, samePlace, previousPlace, fromFor, stepDur, placeKey, fitSize, TRAVELMODE };
})(typeof window !== "undefined" ? window : globalThis);
