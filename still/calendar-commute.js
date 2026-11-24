/* Commute blocks, slice 1 (Junyan, 2026-11-24: "1 yes, 2 A, 3 yes, 4 A"). The rules behind the Commute panel in
   calendar.html, with no page in them: still/test/commute.test.mjs.
   Where a block is going, when to ask, the Google Maps link, how a photo is shrunk and which place a photo note belongs to.
   Slice 2 (the way there step by step, the time to go, alerts) is not here and not drawn: no made-up times and no
   alerts. */
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
  /** Where the block goes. A place he picked or typed for this block wins; then the block's own location, the next event's
      location, and the place saved for that event's title. source "none" means ask. */
  function target({ ev, events, tz, remembered = [], typed = null }) {
    const next = nextEvent(ev, events || [], tz), nextTitle = next ? next.title : "";
    const out = (source, o) => ({ source, address: clean(o.address), lat: o.lat == null ? null : o.lat, lng: o.lng == null ? null : o.lng, id: o.id || "", nextTitle, name: clean(o.name) });
    if (typed && clean(typed.address)) return out("typed", typed);
    if (clean(ev.location)) return out("block", { address: ev.location });
    if (next && clean(next.location)) return out("next", { address: next.location, name: next.title });
    const key = next ? titleKey(next.title) : "";
    const mem = key && remembered.find((p) => p.category === "commute-for" && p.list === "for:" + key);
    if (mem) return out("remembered", { ...mem, name: "" });   // its saved name is the event title, not a place name
    return out("none", {});
  }
  const needsAsk = (t) => !t || t.source === "none";

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

  root.CalCommute = { mapsLink, titleKey, rememberPlace, nextEvent, target, needsAsk, placeKey, fitSize, TRAVELMODE };
})(typeof window !== "undefined" ? window : globalThis);
