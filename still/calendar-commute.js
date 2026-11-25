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
  /** (d48, 2026-11-25) Gym sessions share one place: any title with the whole word "gym" (any case) is looked up under "for:gym" when its own
      name has no row. Taught once ("Remember for every gym session"), it serves every "Gym · NAME" and any new name. */
  const isGym = (t) => /\bgym\b/i.test(String(t == null ? "" : t));
  const GYM_LIST = "for:gym";
  /** What the Remember switch calls the thing it remembers for: the title, or "gym session" for a gym. */
  const rememberName = (t) => (isGym(t) ? "gym session" : clean(t));
  /** The row remembered for an event's name: its exact "for:" + titleKey row first, then for a gym the shared "for:gym" row. A row with no address is no place. */
  function titleMemory(remembered, title) {
    const rows = Array.isArray(remembered) ? remembered.filter((p) => p && p.category === "commute-for" && clean(p.address)) : [];
    const key = titleKey(title), exact = key ? rows.find((p) => p.list === "for:" + key) : null;
    return exact || (isGym(title) ? rows.find((p) => p.list === GYM_LIST) || null : null);
  }
  /** The place name kept with a remembered row, in its notes (the server stores name, address, notes, url and list; the name column holds the
      event's title). "Place: NAME" gives NAME; a row from before this change has none. */
  const PLACE_LINE = /^Place: (.+)$/m;
  const placeNameOf = (row) => { const m = PLACE_LINE.exec(String((row && row.notes) || "")); return m ? clean(m[1]) : ""; };
  /** The place saved by "Remember for every <title>" (still-api /quest/places, own category so Trips never lists it). A gym title saves under
      "for:gym". placeName is the name of the place he picked (a club from the list), kept in notes so the To line can show it. */
  function rememberPlace({ title, address, lat, lng, placeName }) {
    const gym = isGym(title), key = gym ? "gym" : titleKey(title); if (!key || !clean(address)) return null;
    const pn = clean(placeName), showName = pn && pn.toLowerCase() !== clean(address).toLowerCase() ? pn : "";
    return { name: gym ? "Gym session" : clean(title).slice(0, 200), address: clean(address), lat: lat == null ? null : lat, lng: lng == null ? null : lng,
      category: "commute-for", list: "for:" + key, notes: (gym ? "Where the Commute block before a gym session goes" : "Where the Commute block before this event goes") + (showName ? "\nPlace: " + showName.slice(0, 300) : ""), savedBy: "Calendar" };
  }

  /** "Studio 509A" → "studio 509a": what "Remember this place" for a Location text matches on. Whole text only; numbers are kept
      (unlike titleKey), so "Studio 5" and "Studio 509A" are two texts. */
  function locationKey(t) {
    return clean(String(t == null ? "" : t).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " "));
  }
  /** Can this Location text be remembered? Its key is not empty (a text of only emoji or punctuation has none) and "loc:" + key fits the 120
      characters the server keeps of a place's list (still-api cuts it there; a longer key would be stored cut short and never found). */
  const LOC_LIST_MAX = 120;
  const canRememberLocation = (t) => { const k = locationKey(t); return !!k && ("loc:" + k).length <= LOC_LIST_MAX; };
  /** The place saved by "Remember <Location text> as this place" (same category as rememberPlace, key "loc:"; still-api stores both as free text). */
  function rememberLocation({ text, address, lat, lng }) {
    if (!canRememberLocation(text) || !clean(address)) return null;
    return { name: clean(text).slice(0, 200), address: clean(address), lat: lat == null ? null : lat, lng: lng == null ? null : lng,
      category: "commute-for", list: "loc:" + locationKey(text), notes: "Where the Commute block goes when an event's Location is this text", savedBy: "Calendar" };
  }
  /** The remembered "loc:" row for a Location text (whole text, same key), else null. Only these rows get a Forget link. */
  function locationMemory(remembered, text) {
    const k = locationKey(text);
    return k && Array.isArray(remembered) ? remembered.find((p) => p && p.category === "commute-for" && p.list === "loc:" + k && clean(p.address)) || null : null;
  }
  /** The line beside the Forget link in the To box. */
  const forgetLine = (row, text) => `"${clean(text)}" goes to ${clean(row && row.address)}`;
  /** The one message after the Remember switches. t and l are the results of the title save and the Location save: undefined when that
      switch was off, { ok: true } or { ok: false, error }. One switch keeps its own words; two give one message true for both. */
  function rememberToast({ title, text, t, l }) {
    const T = clean(title), L = '"' + clean(text) + '"';
    if (t && l) {
      if (t.ok && l.ok) return { text: `Remembered for every ${T} and ${L}`, bad: false };
      if (t.ok) return { text: `Remembered for every ${T}. Not remembered ${L}: ${l.error}`, bad: true };
      if (l.ok) return { text: `Remembered ${L}. Not remembered for every ${T}: ${t.error}`, bad: true };
      return { text: `Not remembered for every ${T} or ${L}: ${t.error === l.error ? t.error : t.error + " and " + l.error}`, bad: true };
    }
    const one = t || l; if (!one) return null;
    return one.ok ? { text: t ? "Remembered for every " + T : "Remembered " + L, bad: false } : { text: "Not remembered: " + one.error, bad: true };
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
    const locOf = clean(ev.location) || (next ? clean(next.location) : "");   // the Location text a To would come from, kept even when a typed place wins (the page offers to remember it)
    const own = isWebLink(ev.location) ? "" : clean(ev.location), nextLoc = next && !isWebLink(next.location) ? clean(next.location) : "";   // a web link or video call link is not a place (d48)
    const out = (source, o) => ({ source, address: clean(o.address), lat: o.lat == null ? null : o.lat, lng: o.lng == null ? null : o.lng, id: o.id || "", nextTitle, name: clean(o.name), locText: locOf });
    /** A remembered "loc:" row for this Location text (whole text, same key), else null. */
    const forText = (text) => locationMemory(remembered, text);
    if (typed && clean(typed.address)) return out("typed", typed);
    if (own) { const m = forText(ev.location); return m ? out("location", { ...m, name: clean(ev.location) }) : out("block", { address: ev.location }); }
    if (nextLoc) { const m = forText(next.location); return m ? out("location", { ...m, name: clean(next.location) }) : out("next", { address: next.location, name: next.title }); }
    const mem = next ? titleMemory(remembered, next.title) : null;
    if (mem) return out("remembered", { ...mem, name: placeNameOf(mem) });   // its saved name is the event title; the place's own name, when one was picked, is in its notes
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

  /* ---------- d48 (Junyan, 2026-11-25: "48 yes suggest commute blocks", "49yes"): suggested Commute blocks ----------
     A dashed Suggested Commute before each of his timed events that has a place away from Home: 30 minutes, ending when the event starts.
     Pure rules; the page (calendar.html autoGhosts) draws them with Accept and Skip and asks Google for nothing until a block is accepted. */
  const SUGG_MIN = 30, SUGG_FLOOR = 15;
  /** A web link or a video call link (Zoom, Meet, Teams, Webex...): not a place you can walk to. */
  const isWebLink = (t) => /^\s*(https?:\/\/|www\.)|\b(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|gotomeet\.me|skype\.com)\b/i.test(String(t == null ? "" : t));
  /** Where one event is: its Location text (as a remembered "loc:" place when one is, else as written), else the place remembered for its name.
      null when it has neither (an empty Location, or a web link with nothing remembered for the name). */
  function eventPlace(x, remembered) {
    const loc = clean(x && x.location);
    if (loc && !isWebLink(loc)) { const m = locationMemory(remembered, loc); return m ? { address: clean(m.address), id: m.id || "", text: loc } : { address: loc, id: "", text: loc }; }
    const mem = titleMemory(remembered, x && x.title);
    return mem ? { address: clean(mem.address), id: mem.id || "", text: "" } : null;
  }
  /** Is this place Home? Same address as Home by its words, or the Location text "Home". With no Home saved nothing is Home. */
  function isHome(place, home) {
    if (!place || !home || !(clean(home.address) || home.id)) return false;
    return samePlace(place, home) || (!!place.text && place.text.toLowerCase() === "home");
  }
  /** One short key per event, safe for the page's ^auto:(\w+):(.+)$ id pattern: "cm" and two 32 bit hashes of calendar and event id. */
  function suggestionKey(x) {
    const s = String(x.calId) + "|" + String(x.id);
    let a = 0x811c9dc5, b = 5381;
    for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 16777619) >>> 0; b = (Math.imul(b, 33) + s.charCodeAt(i)) >>> 0; }
    return "cm" + a.toString(36) + b.toString(36);
  }
  /** The Commute suggestions for one day. events: his own timed events (the page already left out other people's calendars), each with
      title, location, s, e (ms), allDay, ghost, k. remembered: the places rows. home: his Home place or null. now: ms. Returns
      [{key, kind: "commute", title: "Commute", s, e, why, forId}], earliest first. */
  function commuteSuggestions({ day, events, remembered = [], home = null, tz, now = 0 }) {
    const M = 60000, timed = (events || []).filter((x) => x && !x.allDay && !x.ghost && Number.isFinite(x.s) && Number.isFinite(x.e));
    const onDay = timed.filter((x) => C().wall(x.s, tz).day === day).sort((a, b) => a.s - b.s || a.e - b.e);
    const out = [];
    for (const ev of onDay) {
      if (ev.k === "commute" || ev.s <= now) continue;   // not for a Commute block itself, nor an event that has started
      const place = eventPlace(ev, remembered);
      if (!place || isHome(place, home)) continue;
      const before = onDay.filter((x) => x !== ev && x.s < ev.s), last = before[before.length - 1] || null;
      const winStart = ev.s - SUGG_MIN * M;
      if (last && last.k === "commute") continue;   // the last block before it is a Commute already
      if (before.some((x) => x.k === "commute" && x.e > winStart)) continue;   // a Commute runs into the 30 minutes before it
      const prevPlace = last ? eventPlace(last, remembered) : null;
      if (prevPlace && samePlace(prevPlace, place)) continue;   // already there
      const ends = before.map((x) => x.e).filter((e) => e > winStart && e <= ev.s);
      const s = Math.min(ends.length ? Math.max(...ends) : winStart, ev.s - SUGG_FLOOR * M);
      out.push({ key: suggestionKey(ev), kind: "commute", title: "Commute", s, e: ev.s, why: "To " + clean(ev.title), forId: ev.id });
    }
    return out;
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
  /** Whether the x may show on a chip (d34, Junyan, 2026-11-25): only a place kept from the From and To box (category "saved") with an id to send.
      Home never; a Trips place never (it belongs to a trip and is removed in the Travel tab); a remembered-for place is not a chip. */
  const removableChip = (p) => !!p && p.category === "saved" && !!p.id;
  /** The Edit link shows only when at least one chip of the list can be removed. */
  const anyRemovable = (chips) => Array.isArray(chips) && chips.some(removableChip);
  /** How a place reads on a From or To row: the name over its address (Home alone, a typed place once). */
  function rowText(o) {
    if (!o) return { main: "", sub: "" };
    const name = clean(o.name), addr = clean(o.address);
    if (name === "Home") return { main: "Home", sub: "" };
    if (name && addr && name !== addr) return { main: name, sub: addr };
    return { main: name || addr, sub: "" };
  }

  /* ---------- d31 B (Junyan, 2026-11-25: "31 B"): the weather box that replaces the small map ----------
     Open-Meteo (free, no key), asked from the page for the From place only. Field names read from open-meteo.com/en/docs and proven
     with one real call: hourly temperature_2m, apparent_temperature, precipitation_probability, weather_code; timeformat=unixtime gives
     each hour as seconds (so a daylight saving change cannot shift the hour); forecast_days=16 reaches the end of today plus 15 days. */
  const WX_FIELDS = "temperature_2m,apparent_temperature,precipitation_probability,weather_code";
  const WX_DAYS = 16;
  const WX_TEXT = { loading: "Checking the weather…", far: "No forecast yet for that day.", none: "Weather is not available right now." };
  /** Two decimals (about 1 km): all the page tells Open-Meteo about where he is. */
  const r2 = (n) => { const s = Number(n).toFixed(2); return s === "-0.00" ? "0.00" : s; };
  /** The rounded point of a place with coordinates, or null. */
  function weatherPlace(o) {
    if (!hasXY(o)) return null;
    return { lat: r2(o.lat), lng: r2(o.lng) };
  }
  /** The key one answer is kept under: the rounded point. "" with no pin. */
  function weatherKey(o) { const p = weatherPlace(o); return p ? p.lat + "," + p.lng : ""; }
  /** The Open-Meteo address: the rounded From point, the hourly fields, the time zone, the day count. Nothing else. "" with no pin. */
  function weatherUrl({ lat, lng, tz }) {
    const p = weatherPlace({ lat, lng}); if (!p) return "";
    return "https://api.open-meteo.com/v1/forecast?latitude=" + p.lat + "&longitude=" + p.lng + "&hourly=" + WX_FIELDS +
      "&timezone=" + encodeURIComponent(tz) + "&timeformat=unixtime&forecast_days=" + WX_DAYS;
  }
  /** WMO weather code (open-meteo.com/en/docs) to an icon and plain words. An unknown code keeps a plain icon and no words.
      The optional third entry marks the codes that mean rain or snow; the two lists below are read from it, not repeated. */
  const WX_CODES = {
    0: ["☀️", "clear"], 1: ["🌤️", "mostly clear"], 2: ["⛅", "partly cloudy"], 3: ["☁️", "overcast"], 45: ["🌫️", "fog"], 48: ["🌫️", "fog"],
    51: ["🌦️", "light drizzle", "rain"], 53: ["🌦️", "drizzle", "rain"], 55: ["🌦️", "heavy drizzle", "rain"], 56: ["🌧️", "freezing drizzle", "rain"], 57: ["🌧️", "freezing drizzle", "rain"],
    61: ["🌧️", "light rain", "rain"], 63: ["🌧️", "rain", "rain"], 65: ["🌧️", "heavy rain", "rain"], 66: ["🌧️", "freezing rain", "rain"], 67: ["🌧️", "freezing rain", "rain"],
    71: ["🌨️", "light snow", "snow"], 73: ["🌨️", "snow", "snow"], 75: ["🌨️", "heavy snow", "snow"], 77: ["🌨️", "snow grains", "snow"],
    80: ["🌦️", "light showers", "rain"], 81: ["🌦️", "showers", "rain"], 82: ["🌧️", "heavy showers", "rain"], 85: ["🌨️", "snow showers", "snow"], 86: ["🌨️", "heavy snow showers", "snow"],
    95: ["⛈️", "thunderstorm", "rain"], 96: ["⛈️", "thunderstorm with hail", "rain"], 97: ["⛈️", "thunderstorm", "rain"], 99: ["⛈️", "thunderstorm with hail", "rain"] };
  function weatherWords(code) { const x = WX_CODES[code]; return x ? { icon: x[0], words: x[1] } : { icon: "🌡️", words: "" }; }
  const HOUR = 3600000;
  /** The hour of the answer to read for instant `at`: the entry nearest to it, within half an hour (half past goes to the later hour). null when
      the answer has none (before its first hour or after its last) or is not the shape asked for. */
  function pickHour(res, at) {
    const h = res && res.hourly, t = h && h.time;
    if (!Array.isArray(t) || !Number.isFinite(at)) return null;
    let best = -1, gap = Infinity;
    t.forEach((s, i) => { const d = Math.abs(s * 1000 - at); if (Number.isFinite(d) && (d < gap || (d === gap && s * 1000 > t[best] * 1000))) { gap = d; best = i; } });
    if (best < 0 || gap > HOUR / 2) return null;
    const v = (k) => { const x = h[k] && h[k][best]; return Number.isFinite(x) ? x : null; };
    const temp = v("temperature_2m"); if (temp == null) return null;
    return { temp, feels: v("apparent_temperature"), pop: v("precipitation_probability"), code: v("weather_code") };
  }
  /** Why no hour could be read: "far" when the instant is after the last hour the answer holds, else "none". */
  function missingHour(res, at) {
    const t = res && res.hourly && res.hourly.time;
    return Array.isArray(t) && t.length && at > t[t.length - 1] * 1000 ? "far" : "none";
  }
  /** (d36) One rule for "the block is over": its end is known and is now or earlier. The directions and the weather both ask it. */
  const blockEnded = (end, now) => Number.isFinite(end) && end <= now;
  /** "ended": the block is over, so no box at all. "far": the day is past what the forecast reaches (today and 15 days more, on the calendar's
      clock). Otherwise "ok". */
  function weatherWindow({ at, end, now, tz }) {
    if (blockEnded(end, now)) return "ended";
    return C().wall(at, tz).day > C().addDays(C().wall(now, tz).day, WX_DAYS - 1) ? "far" : "ok";
  }
  /** How much of the trip is outside: the whole of a walk, the walking legs of transit, nothing said for a drive. null when none or no way. */
  function outsideMinutes(chip, way) {
    if (!usable(way)) return null;
    let n = null;
    if (chip === "commute") n = way.minutes;
    else if (chip === "transit") n = (way.steps || []).filter((x) => x && x.kind === "walk" && Number.isFinite(x.minutes)).reduce((a, x) => a + x.minutes, 0);
    return n > 0 ? Math.round(n) : null;
  }
  const codesOf = (kind) => new Set(Object.keys(WX_CODES).filter((c) => WX_CODES[c][2] === kind).map(Number));
  const RAIN = codesOf("rain"), SNOW = codesOf("snow");
  /** One tip line, or "": rain or snow is likely at that hour (the words say so, or the chance is 50 percent or more). The minutes outside
      ride on the tip and never stand alone. */
  function weatherTip(hr, outside) {
    if (!hr) return "";
    const snow = SNOW.has(hr.code), rain = RAIN.has(hr.code), likely = Number.isFinite(hr.pop) && hr.pop >= 50;
    let tip = "";
    if (snow || (!rain && likely && hr.temp <= 0)) tip = "Snow is likely. Dress for it.";
    else if (rain || likely) tip = "Bring an umbrella.";
    return tip && Number.isFinite(outside) && outside >= 1 ? tip + ` About ${Math.round(outside)} min of the trip is outside.` : tip;
  }
  const deg = (x) => { const r = Math.sign(x) * Math.round(Math.abs(x)); return (r === 0 ? 0 : r) + "°"; };
  /** What the box says: icon, big line "3° · light rain", the small words after it ("feels like 0° when you leave"), and the tip. */
  function weatherCard({ hr, leaving, outside }) {
    const w = weatherWords(hr.code), when = leaving ? "when you leave" : "when the block starts";
    return { icon: w.icon, big: deg(hr.temp) + (w.words ? " · " + w.words : ""),
      small: Number.isFinite(hr.feels) ? `feels like ${deg(hr.feels)} ${when}` : when,
      tip: weatherTip(hr, outside) };
  }
  /** An answer kept in memory is fresh for 30 minutes; a failed ask is remembered for 2 so a repaint does not ask again at once. */
  const wxFresh = (e, now) => !!e && now - e.at < (e.fail ? 2 : 30) * 60000;

  /* ---------- the tidy panel (Junyan, 2026-11-25, d36, d37, d40) ---------- */
  /** The one quiet line under Leave by: "Checked 10:45 am", or "Checked by itself 10:45 am" when the page's own check made the answer. */
  function checkedLine({ at, auto, fmt }) {
    const t = Number.isFinite(at) ? clean(fmt(at)) : "";
    return t ? `Checked ${auto ? "by itself " : ""}${t}` : "";
  }
  const lowerWords = (s) => clean(String(s || "").toLowerCase().replace(/[.,]/g, " ").replace(/[^a-z0-9\s]/g, " ")).split(" ").filter(Boolean)
    .map((w) => ({ st: "street", ave: "avenue", rd: "road", blvd: "boulevard", dr: "drive", hwy: "highway", pkwy: "parkway", cres: "crescent", ln: "lane", ct: "court", w: "west", e: "east", n: "north", s: "south" }[w] || w)).join(" ");
  /** A drive closure is on the route when the street it names is one of the roads of the chosen way (same words, abbreviations ignored).
      The server's closure title is "<road> is closed ...", and a way's roads come from the same directions answer. Nothing else is guessed. */
  function onRoute(alert, way, chip) {
    if (chip !== "drive" || !alert || alert.kind !== "closure" || !way || !Array.isArray(way.roads)) return false;
    const road = lowerWords(String(alert.title || "").replace(/\s+is closed\b.*$/i, ""));
    return !!road && way.roads.some((r) => lowerWords(r && r.road) === road);
  }
  /** What one Heads up alert shows: a short line (on your route, until when) and whether the long description waits behind a tap.
      A description that is already short is the line itself. */
  function alertLine(a, { onRoute: on = false } = {}) {
    const detail = clean(a && a.detail), until = /^(Until [^.]+)\./.exec(detail), rest = until ? clean(detail.slice(until[0].length)) : detail;
    const parts = [on ? "On your route" : "", until ? until[1] : ""].filter(Boolean);
    if (!parts.length && detail && detail.length <= 60) return { short: detail, expandable: false, detail: "" };
    const expandable = !!rest;
    return { short: parts.join(" · ") || (expandable ? "Tap for details" : ""), expandable, detail: expandable ? detail : "" };
  }
  const NO_ROUTE = "Google found no route.";
  /** (d37) The words for a way with no directions: when Google found no route and the To has no pin, say which place it cannot find. */
  function noRouteText({ err, to, noPin }) {
    const e = clean(err), name = clean(to);
    if (e === NO_ROUTE && noPin && name) return `Google cannot find "${name}". Tap To and pick the real place.`;
    return e || "No directions for this way.";
  }

  /* (d45, Junyan, 2026-11-25: "45 yes I want to be able to see it still") The directions he was using stay on screen once the block is
     over, and a re-check that comes back not ok never replaces a good answer for the same trip. Pure rules; the page only draws them. */
  const OVER_TEXT = "This block is over.";
  /** The ok answer the page holds for this same trip (same From, To and arrive time = same sig): the one in memory, else the one kept in
      this browser. {res, sig} or null. An answer that is not ok, or for another trip, is never returned. */
  function keptAnswer({ mem, stored, sig }) {
    const ok = (x) => !!sig && !!x && !!x.res && x.res.state === "ok" && x.sig === sig;
    return ok(mem) ? { res: mem.res, sig } : ok(stored) ? { res: stored.res, sig } : null;
  }
  /** What a block that is over shows: show "answer" with the kept directions, or "none" (only the quiet line). It never offers a Check again. */
  function endedView({ kept, fmt }) {
    const at = kept && kept.res ? kept.res.checkedAt : NaN, t = Number.isFinite(at) ? clean(fmt(at)) : "";
    return { show: kept ? "answer" : "none", over: OVER_TEXT, checked: kept && t ? "Checked " + t : "" };
  }
  /** Does a new answer replace the one held? Always, unless it is not ok and the held one is ok for the same trip (then the good one stays). */
  const replacesHeld = ({ held, heldSig, sig, res }) => !!res && (res.state === "ok" || !(held && held.state === "ok" && !!sig && heldSig === sig));
  /** The words for an answer that is not ok (the server's own message when it sent one). */
  const notOkText = (res) => (res && res.state === "no-key" ? "Directions need the Google key" : (res && res.message) || "Directions are not available.");

  root.CalCommute = { OVER_TEXT, keptAnswer, endedView, replacesHeld, notOkText, checkedLine, onRoute, alertLine, noRouteText, blockEnded, missingHour, RAIN_CODES: RAIN, SNOW_CODES: SNOW, arriveTarget, leaveBy, arriveLine, bestWay, quickerThan, alertsFor, groupAlerts, leaveShift, autoCheckDue, decodePolyline, WAY, CHIP, mapsLink, organicMapsLink, placesAskable, readSuggestions, readPlace, locationText, keepPlace, alreadyKept, savedChips, removableChip, anyRemovable, rowText, weatherUrl, weatherPlace, weatherKey, weatherWords, pickHour, weatherWindow, outsideMinutes, weatherTip, weatherCard, wxFresh, WX_TEXT, titleKey, rememberPlace, isGym, rememberName, titleMemory, placeNameOf, isWebLink, eventPlace, commuteSuggestions, locationKey, canRememberLocation, rememberLocation, locationMemory, forgetLine, rememberToast, nextEvent, target, needsAsk, samePlace, previousPlace, fromFor, stepDur, placeKey, fitSize, TRAVELMODE };
})(typeof window !== "undefined" ? window : globalThis);
