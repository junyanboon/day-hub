/* Calendar app logic with no page in it (still/calendar.html, 2026-11-03), so node can test it:
   still/test/calendar-core.test.mjs.

   Days are "YYYY-MM-DD" strings (a date on the wall, no zone). Instants are epoch ms. A zone is an
   IANA name, and every wall time goes through Intl, so a day can be 23 or 25 hours long (DST). */
(function (root) {
  "use strict";
  const DAY = 86400000;
  const fmts = new Map();
  function fmt(tz) {
    if (!fmts.has(tz)) fmts.set(tz, new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }));
    return fmts.get(tz);
  }
  const DOWS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /** The wall clock in tz at instant ms: {day, min (minutes after midnight), dow (0 Sunday)}. */
  function wall(ms, tz) {
    const p = {};
    for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
    return { day: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, dow: DOWS[p.weekday] };
  }
  const civil = (day) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const dayOf = (utc) => new Date(utc).toISOString().slice(0, 10);
  /** How far tz's wall clock is ahead of UTC at instant ms, in ms. */
  function offset(ms, tz) { const w = wall(ms, tz); return civil(w.day) + w.min * 60000 - Math.floor(ms / 60000) * 60000; }
  /** The instant when tz's wall clock reads `min` minutes after midnight on `day`. */
  function instant(day, min, tz) {
    const guess = civil(day) + min * 60000;
    let t = guess - offset(guess, tz);
    const o2 = offset(t, tz);
    if (guess - o2 !== t) t = guess - o2;
    return t;
  }
  const addDays = (day, n) => dayOf(civil(day) + n * DAY);
  const dowOf = (day) => new Date(civil(day)).getUTCDay();
  const weekStart = (day) => addDays(day, -((dowOf(day) + 6) % 7));
  function isoWeek(day) {
    const thu = addDays(day, 3 - ((dowOf(day) + 6) % 7));
    const jan4 = thu.slice(0, 4) + "-01-04";
    return 1 + Math.round((civil(weekStart(thu)) - civil(weekStart(jan4))) / (7 * DAY));
  }
  function addMonths(day, n) {
    const [y, m] = day.split("-").map(Number);
    return dayOf(Date.UTC(y, m - 1 + n, 1));
  }
  const monthKey = (day) => day.slice(0, 7);
  function monthsFor(fromDay, toDay) {
    const out = [];
    for (let d = fromDay.slice(0, 7) + "-01"; d <= toDay; d = addMonths(d, 1)) out.push(monthKey(d));
    return out;
  }

  /* ---- block types (2026-11-10, one-system ticket 026): eleven kinds of block, each with its own colour,
     helper and page, plus "other". Guessed from the title, first match wins; a hand-set kind wins over the guess. ---- */
  const KINDS = [["deep", "Deep Work"], ["studio", "Studio On-Site"], ["yoga", "Yoga"], ["gym", "Gym"], ["dance", "Dance"],
    ["cook", "Culinary"], ["travel", "Travel"], ["social", "Social"], ["errand", "Errands"], ["wind", "Wind Down"],
    ["rest", "Rest"], ["other", "Other"]];
  /* Hand-set kinds saved before the eleven types (ex, food, out, work). "ex" is guessed again: gym or dance. */
  const OLD_KIND = { food: "cook", out: "travel", work: "studio" };
  const RX = [
    ["deep", /\b(work block|deep work|focus block|focus time)\b/i],
    ["wind", /\b(wind.?down|bedtime)\b/i],
    ["rest", /\b(isha kriya|yoga nidra|nidra|nsdr)\b/i],
    ["yoga", /\b(yoga|sadhana|shambhavi|mahamudra|kriya|angamardana|yogasanas?|surya|bhuta shuddhi|nadi shuddhi|hatha)\b/i],
    ["dance", /\b(zouk|lambada|samba|salsa|bachata|kizomba|forr[oó]|practica|dance|dancing|ws|workshop|battle|hip hop)\b/i],
    ["gym", /\b(gym|workout|climb\w*|run|running|swim\w*|bike|cycling|pilates|stretch\w*|hike|boxing|tennis|squash|cardio|training)\b/i],
    ["studio", /\b(studio|viewing|renter|booking|payroll|team check-?in|on-?site|fbs)\b/i],
    ["social", /\b(birthday|party|wedding|visit|mom|dad|friends?|everyone|date night|hang ?out)\b/i],
    ["travel", /\b(train|trip|flight|fly|airport|bus|drive|hotel|check-?in|check-?out|travel|stay at|airbnb|ferry|festival|carnaval|carnival)\b/i],
    ["errand", /\b(errands?|bank|branch|scotia|bmo|pharmacy|post office|pick ?up|drop ?off|return|dentist|doctor|clinic|appointment|appt|haircut|ikea|passport)\b/i],
    ["cook", /\b(dinner|lunch|brunch|breakfast|groceries|grocery|market|gaia|hot pot|cook\w*|meal|prep|eat|restaurant|coffee|caf[eé]|snack|picnic|potluck|veggie|pudding|focaccia)\b/i],
    ["rest", /\b(nap|rest|sauna|cold plunge|massage|walk)\b/i],
  ];
  function guessKind(title, calName) {
    const t = String(title || "");
    for (const [k, rx] of RX) if (rx.test(t)) return k;
    return /staff/i.test(calName || "") ? "studio" : "other";
  }
  /** {title, calName?, kind?} → one of KINDS. A hand-set kind wins. */
  function kindOf(ev) {
    if (ev.kind && KINDS.some(([k]) => k === ev.kind)) return ev.kind;
    if (OLD_KIND[ev.kind]) return OLD_KIND[ev.kind];
    const g = guessKind(ev.title, ev.calName);
    return ev.kind === "ex" && g !== "dance" ? "gym" : g;
  }

  /** Side-by-side columns for overlapping timed pieces [{id, s, e}] (minutes). Adds col and cols. */
  function layout(items) {
    const list = items.slice().sort((a, b) => a.s - b.s || b.e - a.e);
    const out = [];
    let cluster = [], colsEnd = [], clusterEnd = -Infinity;
    const flush = () => { for (const x of cluster) x.cols = colsEnd.length; out.push(...cluster); cluster = []; colsEnd = []; };
    for (const it of list) {
      const x = { ...it };
      if (x.s >= clusterEnd && cluster.length) flush();
      let c = colsEnd.findIndex((end) => end <= x.s);
      if (c < 0) { c = colsEnd.length; colsEnd.push(x.e); } else colsEnd[c] = x.e;
      x.col = c; cluster.push(x);
      clusterEnd = Math.max(clusterEnd === -Infinity ? x.e : clusterEnd, x.e);
      if (cluster.length === 1) clusterEnd = x.e;
    }
    if (cluster.length) flush();
    return out;
  }

  /** A timed event {start, end} (ms) cut into one piece per shown day: {day, top, bottom} in minutes. */
  function pieces(ev, days, tz) {
    const out = [];
    for (const day of days) {
      const d0 = instant(day, 0, tz), d1 = instant(addDays(day, 1), 0, tz);
      if (ev.end <= d0 || ev.start >= d1) continue;
      const s = Math.max(ev.start, d0), e = Math.min(ev.end, d1);
      const top = s === d0 ? 0 : wall(s, tz).min;
      const bottom = e === d1 ? 1440 : wall(e, tz).min;
      out.push({ day, top, bottom: Math.max(bottom, top + 1) });
    }
    return out;
  }
  /** An all-day event {start, end: "YYYY-MM-DD", end exclusive} covers day? */
  const coversDay = (ev, day) => ev.start <= day && day < ev.end;

  /* ---- tasks ---- */
  function orderBetween(prev, next) {
    if (prev == null && next == null) return 1;
    if (prev == null) return next - 1;
    if (next == null) return prev + 1;
    return (prev + next) / 2;
  }
  /** Shown order inside a group: Order first (nulls last); a stable sort keeps the server's order otherwise. */
  const groupOf = (tasks, priority, skipId) => tasks.filter((t) => (t.priority || "") === (priority || "") && t.id !== skipId)
    .map((t, i) => [t, i]).sort((a, b) => ((a[0].order ?? Infinity) - (b[0].order ?? Infinity)) || a[1] - b[1]).map((x) => x[0]);
  /** Drop task `id` into group `priority`, before task `beforeId` (null: at the end) → {priority, order, renumber}.
      When a neighbour has no Order yet, the whole group is numbered 1..n in its shown order (renumber lists the
      other tasks whose Order changes), so the task lands exactly where it was dropped. */
  function dropTask(tasks, id, priority, beforeId) {
    const g = groupOf(tasks, priority, id);
    let i = beforeId ? g.findIndex((t) => t.id === beforeId) : g.length;
    if (i < 0) i = g.length;
    const prev = i > 0 ? g[i - 1].order : null, next = i < g.length ? g[i].order : null;
    const gapOk = prev != null && next != null && next - prev > 1e-6;
    if (gapOk || (prev != null && i === g.length) || (next != null && i === 0)) {
      return { priority: priority || "", order: orderBetween(prev, next), renumber: [] };
    }
    const renumber = [];
    let n = 1, order = 1;
    for (let k = 0; k <= g.length; k++) {
      if (k === i) order = n++;
      if (k < g.length) { const o = n++; if (g[k].order !== o) renumber.push({ id: g[k].id, order: o }); }
    }
    return { priority: priority || "", order, renumber };
  }
  const blockMinutes = (task) => (task.estMin ? Math.max(15, Math.ceil(task.estMin / 15) * 15) : 30);

  /* ---- a finger swipe between days (Junyan, 2026-11-11: "it changes days when I'm in the day view very easily").
     The strip used to be one native scroller in both directions with x snapping, so a scroll that drifted
     sideways snapped to the next day. Now a finger moves days only through these two rules. ---- */
  const SWIPE = { lockPx: 10, minPx: 70, maxPx: 110, widthShare: 0.2, ratio: 2, flickPxPerMs: 0.5, flickMinPx: 30 };
  /** Which way a touch is going after it has moved dx, dy px: null (not yet 10 px), "x" (more sideways
      than up/down) or "y" (a scroll; it never changes the day). Decided once, in the first 10 px. */
  function swipeLock(dx, dy) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < SWIPE.lockPx) return null;
    return ax > ay ? "x" : "y";
  }
  /** At the end of a sideways-locked touch: +1 (to later days), -1 (to earlier days) or 0 (stay).
      {dx, dy} is the whole move in px, vx the finger speed in px/ms over its last moment, width the strip's
      width. A day change needs sideways travel at least twice the up/down travel, and either a long
      enough move (a fifth of the width, 70 to 110 px) or a fast deliberate flick. */
  function swipeCommit({ dx, dy, vx = 0 }, width) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < SWIPE.ratio * ay) return 0;
    const need = Math.min(SWIPE.maxPx, Math.max(SWIPE.minPx, (width || 0) * SWIPE.widthShare));
    const far = ax >= need;
    const flick = ax >= SWIPE.flickMinPx && Math.abs(vx) >= SWIPE.flickPxPerMs && Math.sign(vx) === Math.sign(dx);
    if (!far && !flick) return 0;
    return dx < 0 ? 1 : -1;
  }

  /* ---- looks (Junyan, 2026-11-11: "Can you give me three more colour schemes. Make it really inspirational for a
     dancer and business owner"). Ink is the default and the plain :root palette in calendar.html; each other look is
     one :root[data-look="<id>"] block of variables there. This table only feeds the swatches in the menu sheet and
     the theme-color tag (theme is the header bar colour); still/test/calendar-look.test.mjs checks it matches the CSS.
     The choice is kept per device in localStorage "cal-look" and put on in the page head, before the first paint. ---- */
  const LOOKS = [
    { id: "ink", name: "Ink", bg: "#0e1015", theme: "#14171e", accent: "#ff4f5e", ink: "#f2f4f8", gels: ["#fbbf24", "#22d3ee", "#f472b6"], scheme: "dark" },
    { id: "stage", name: "Stage Lights", bg: "#120d1a", theme: "#1d1529", accent: "#ffc857", ink: "#f7f1fb", gels: ["#e08000", "#2ee0e8", "#ff4fae"], scheme: "dark" },
    { id: "morning", name: "Studio Morning", bg: "#faf6ef", theme: "#fffdf9", accent: "#d24a22", ink: "#1f1b16", gels: ["#9a7d00", "#0e8fa3", "#c7317f"], scheme: "light" },
    { id: "velvet", name: "Velvet & Brass", bg: "#0b1a17", theme: "#11251f", accent: "#c8a46a", ink: "#f3ead8", gels: ["#f5cc1f", "#3cc6c0", "#d9668f"], scheme: "dark" },
  ];
  /** A saved look name → a known look id ("ink" for anything else). */
  const lookId = (saved) => (LOOKS.some((l) => l.id === saved) ? saved : "ink");

  /* ---- words ---- */
  function hm(min) {
    const h = Math.floor(min / 60) % 24, m = min % 60;
    return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "am" : "pm"}`;
  }
  function dur(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
  }

  root.CalCore = { wall, instant, offset, addDays, dowOf, weekStart, isoWeek, addMonths, monthKey, monthsFor,
    KINDS, kindOf, layout, pieces, coversDay, orderBetween, groupOf, dropTask, blockMinutes, hm, dur, SWIPE, swipeLock, swipeCommit, LOOKS, lookId };
})(typeof window !== "undefined" ? window : globalThis);
