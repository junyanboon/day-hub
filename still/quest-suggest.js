/* Day Quest: practice blocks the calendar is missing, for today and tomorrow (Junyan, 2026-10-19, d13 d14).
   Plain rules, no AI. A suggestion shows only when that day has no such block yet; he taps Add (a real event on his
   Junyan calendar) or Skip (hidden for that day). Times are wall-clock times where he is that day (the plan's tz).
     Morning Yoga: 45 min between waking (bio clock 6:30 AM) and the day's first meal (10 AM with no meal).
     Wind down: 45 min ending at bed (bio clock 10:30 PM), or the latest free room after 8 PM.
     Domestics: 30 min in the first free gap after the first meal (9 AM with no meal), before 8 PM.
   Pure, so it can be tested (node --test still/test). */
(function (root) {
  "use strict";
  const MIN = 60000;
  const WAKE = [6, 30], BED = [22, 30];
  const RULES = [
    { id:"yoga", t:"Morning Yoga", min:45, least:30 },
    { id:"winddown", t:"Wind down", min:45, least:30 },
    { id:"domestics", t:"Domestics", min:30, least:30 },
  ];
  // which suggestion a block already covers (its basic id from quest-basics.js, groom counts as Domestics)
  const covers = (id) => (id === "groom" ? "domestics" : id);

  // minutes east of UTC for a time zone at a moment
  function offsetOf(tz, ms) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MIN);
  }
  // a wall-clock time on day "YYYY-MM-DD" in tz, as ms
  function at(day, h, m, tz) {
    const [y, mo, d] = day.split("-").map(Number), guess = Date.UTC(y, mo - 1, d, h, m);
    const o1 = offsetOf(tz, guess), first = guess - o1 * MIN, o2 = offsetOf(tz, first);
    return guess - o2 * MIN;
  }
  // free stretches [s, e] inside [lo, hi] around the busy blocks
  function free(busy, lo, hi) {
    const out = []; let cur = lo;
    busy.filter((b) => b.e > lo && b.s < hi).sort((a, b) => a.s - b.s).forEach((b) => {
      if (b.s > cur) out.push([cur, Math.min(b.s, hi)]);
      cur = Math.max(cur, b.e);
    });
    if (cur < hi) out.push([cur, hi]);
    return out.filter(([s, e]) => e > s);
  }
  const round5 = (ms, up) => (up ? Math.ceil : Math.floor)(ms / (5 * MIN)) * 5 * MIN;

  /* o: { day, tz, now (ms), blocks:[{ t, s, e (ms), free, meal, basic }], skip:{ id:true } }. free = open space or a
     break (not busy); basic = the checklist id a block opens (yoga, domestics, groom, winddown) or null.
     Returns [{ id, t, s, e }] (ms), at most one of each. */
  function suggest(o) {
    const tz = o.tz, day = o.day, now = +o.now || 0, skip = o.skip || {};
    // a booking (a car rental, a stay) is not a block of his time; booking comes from the page's shared rule
    // (QuestAgenda.isBooking: over 12 hours by the calendar's own times, or all-day), else over 12 hours here
    const blocks = o.blocks || [], busy = blocks.filter((b) => !b.free && !(b.booking ?? b.e - b.s > 12 * 60 * MIN));
    const have = new Set(blocks.map((b) => b.basic && covers(b.basic)).filter(Boolean));
    const meals = blocks.filter((b) => b.meal).sort((a, b) => a.s - b.s);
    const wake = at(day, WAKE[0], WAKE[1], tz), bed = at(day, BED[0], BED[1], tz);
    const firstMeal = meals.find((m) => m.s >= wake);
    const soon = round5(now + 5 * MIN, true);
    const out = [];
    for (const r of RULES) {
      if (have.has(r.id) || skip[r.id]) continue;
      let lo, hi, last = false;
      if (r.id === "yoga") { lo = wake; hi = firstMeal ? firstMeal.s : at(day, 10, 0, tz); }
      else if (r.id === "winddown") { lo = at(day, 20, 0, tz); hi = bed; last = true; }
      else { lo = firstMeal ? firstMeal.e : at(day, 9, 0, tz); hi = at(day, 20, 0, tz); }
      lo = Math.max(lo, soon);
      const room = free(busy, lo, hi).map(([s, e]) => [round5(s, true), round5(e, false)]).filter(([s, e]) => e - s >= r.least * MIN);
      const g = last ? room[room.length - 1] : room[0];
      if (!g) continue;
      const len = Math.min(r.min * MIN, g[1] - g[0]);
      const s = last ? g[1] - len : g[0];
      out.push({ id: r.id, t: r.t, s, e: s + len });
    }
    return out.sort((a, b) => a.s - b.s);
  }

  root.QuestSuggest = { RULES, WAKE, BED, offsetOf, at, free, suggest };
})(typeof window !== "undefined" ? window : globalThis);
