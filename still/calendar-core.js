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
    ["cook", "Culinary"], ["travel", "Travel"], ["pack", "Packing"], ["social", "Social"], ["errand", "Errands"], ["wind", "Wind Down"],
    ["rest", "Rest"], ["home", "Domestic"], ["other", "Other"]];
  /* Hand-set kinds saved before the eleven types (ex, food, out, work). "ex" is guessed again: gym or dance. */
  const OLD_KIND = { food: "cook", out: "travel", work: "studio" };
  /* Packing (slice 02, Junyan 2026-11-16, d23: "p1 yes"): "pack" anywhere in the title, any case, so "Pack for FICTION
     stay", "Unpack", and also "backpack" and "Packers". First, so "Pack for the trip" is Packing, not Travel. */
  const RX = [
    ["pack", /pack/i],
    ["deep", /\b(work block|deep work|focus block|focus time)\b/i],
    ["wind", /\b(wind.?down|bedtime)\b/i],
    /* Domestic (Junyan, 2026-11-21, d62: "give it a more exciting colour"): its own type and colour, no page of its own */
    ["home", /\b(domestic|chores?|cleaning|clean up|laundry|tidy(ing)?|housework|vacuum\w*|dishes)\b/i],
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
  /* A day's first and last instant, kept: the strip asks for the same 36 days once per event, and working them out
     each time made every key press take about 0.4 s with ~600 events (Junyan, 2026-11-21, "shortcuts too slow"). */
  const bounds = new Map();
  function dayBounds(day, tz) {
    const k = day + "|" + tz;
    let b = bounds.get(k);
    if (!b) { if (bounds.size > 4000) bounds.clear(); b = [instant(day, 0, tz), instant(addDays(day, 1), 0, tz)]; bounds.set(k, b); }
    return b;
  }
  function pieces(ev, days, tz) {
    const out = [];
    for (const day of days) {
      const [d0, d1] = dayBounds(day, tz);
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

  /* ---- the day's own blocks: Domestic, and Wind Down, Sleep, Morning Routine back to back ----
     (Junyan, 2026-11-21: "suggestions in the day for a Domestic block (1 hr if possible but less if necessary) a Wind
     Down + Sleep + Morning Routine (3 connected) blocks.") */
  const ROUTINE = { domestic: 60, domesticMin: 30, wind: 60, windMin: 30, sleep: 8 * 60, morning: 60,
    morningBy: 9 * 60, morningLatest: 10 * 60, dayFrom: 9 * 60 };
  const RX_DOMESTIC = /\b(domestic|chores?|clean(ing)?|laundry|tidy(ing)?|housework)\b/i;
  const RX_WIND = /\b(wind.?down|bedtime)\b/i, RX_SLEEP = /\bsleep\b/i, RX_MORNING = /\bmorning routine\b/i;
  /** Suggested blocks for one day. events: his own timed events {title, s, e} in ms (no all-day, no studio shifts, no
      suggestions), covering the day and the next morning. now (ms) cuts today's Domestic search short.
      Returns [{key, kind, title, s, e, why}]; a block he already has (by title) is left out, the rest keep their times. */
  function routineBlocks(day, events, tz, now = 0) {
    const R = ROUTINE, M = 60000, next = addDays(day, 1), [d0, d1] = dayBounds(day, tz), [, n1] = dayBounds(next, tz);
    const own = (e) => RX_WIND.test(e.title) || RX_SLEEP.test(e.title) || RX_MORNING.test(e.title) || RX_DOMESTIC.test(e.title);
    const busy = events.filter((e) => e.e > e.s && !own(e)).sort((a, b) => a.s - b.s);
    // the morning: an hour, ending at the next day's first plan (after 4 am), else 9 am, and never after 10 am
    const first = busy.find((e) => e.s >= instant(next, 4 * 60, tz) && e.s < n1);
    const mEnd = first ? Math.min(first.s, instant(next, R.morningLatest, tz)) : instant(next, R.morningBy, tz);
    const mStart = mEnd - R.morning * M, sleepEnd = mStart;
    // the night: 8 hours of sleep and an hour to wind down before it, moved later (and shorter) when the evening runs late
    let windStart = sleepEnd - (R.sleep + R.wind) * M, sleepStart = sleepEnd - R.sleep * M;
    const late = busy.filter((e) => e.s < sleepEnd && e.e > windStart && e.s >= instant(day, 12 * 60, tz)).reduce((m, e) => Math.max(m, e.e), 0);
    if (late > windStart) { windStart = late; sleepStart = Math.max(sleepStart, windStart + R.windMin * M); }
    // his own wind down that night: sleep starts when it ends
    const myWind = events.filter((e) => RX_WIND.test(e.title) && e.s >= instant(day, 12 * 60, tz) && e.s < sleepEnd).sort((a, b) => b.e - a.e)[0];
    if (myWind && myWind.e > sleepStart) sleepStart = Math.min(myWind.e, sleepEnd);
    const h = (ms) => dur(Math.round(ms / M));
    const out = [], night = sleepStart < sleepEnd;   // a plan that runs into the morning leaves no night to suggest
    const has = (rx, a, b) => events.some((e) => rx.test(e.title) && e.s < b && e.e > a);
    if (night && !has(RX_WIND, d0 + 12 * 60 * M, d1 + 6 * 60 * M)) out.push({ key: "wind", kind: "wind", title: "Wind Down", s: windStart, e: sleepStart,
      why: late > sleepEnd - (R.sleep + R.wind) * M ? "Starts when your evening ends" : "An hour before sleep" });
    if (night && !has(RX_SLEEP, sleepStart, sleepEnd)) out.push({ key: "sleep", kind: "wind", title: "Sleep", s: sleepStart, e: sleepEnd,
      why: sleepEnd - sleepStart < R.sleep * M ? `${h(sleepEnd - sleepStart)}, the evening runs late` : "8 hours" });
    if (!has(RX_MORNING, d1, n1)) out.push({ key: "morning", kind: "yoga", title: "Morning Routine", s: mStart, e: mEnd,
      why: first ? `Before ${first.title}` : "Before your day starts" });
    // Domestic: the first free hour between 9 am (or now) and wind down; else the longest free stretch of 30 min or more
    if (!has(RX_DOMESTIC, d0, d1)) {
      const q = 15 * M, from = Math.ceil(Math.max(instant(day, R.dayFrom, tz), now) / q) * q, to = Math.min(windStart, d1);
      const gaps = []; let at = from;
      for (const e of busy) { if (e.e <= at || e.s >= to) continue; if (e.s > at) gaps.push([at, e.s]); at = Math.max(at, e.e); }
      if (to > at) gaps.push([at, to]);
      const fits = gaps.find(([a, b]) => b - a >= R.domestic * M);
      const best = fits || gaps.filter(([a, b]) => b - a >= R.domesticMin * M).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
      if (best) {
        const len = fits ? R.domestic * M : Math.floor((best[1] - best[0]) / q) * q;
        out.push({ key: "domestic", kind: "home", title: "Domestic", s: best[0], e: best[0] + len,
          why: fits ? "Your first free hour" : `Only ${h(len)} free today` });
      }
    }
    return out;
  }

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
  const SWIPE = { lockPx: 10, lockRatio: 1.5, minPx: 70, maxPx: 110, widthShare: 0.2, ratio: 2, flickPxPerMs: 0.5, flickMinPx: 30 };
  /** Which way a touch is going after it has moved dx, dy px: null (not yet 10 px), "x" (sideways at least
      1.5 times the up/down move) or "y" (a scroll; it never changes the day). Decided once, in the first 10 px.
      A thumb scroll arcs, so its start can lean sideways; that is still a scroll (Junyan, 2026-11-11: "calendar
      mobile app changed dates when swiping up and down"). */
  function swipeLock(dx, dy) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < SWIPE.lockPx) return null;
    return ax >= SWIPE.lockRatio * ay ? "x" : "y";
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

  /* ---- pinch stretches the hours (Junyan, 2026-11-12, d1 "1 yes ... all I care about is having a very smooth
     functional exprience"). Two fingers on the day grid stretch or squeeze the hour rows on a phone, from the whole day
     on one screen up to three times today's 56px an hour. The page draws every time-based position as a calc() on one
     CSS variable (--H), so a pinch changes that one value and rebuilds nothing. ---- */
  const HOUR = { start: 56, max: 168 };
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  /** The hour height for fingers now `d` px apart, when they were `d0` apart at height h0, kept within [min, max]. */
  function pinchHeight(h0, d0, d, min, max) {
    if (!(d0 > 0)) return clamp(h0, min, max);
    return clamp(h0 * d / d0, min, max);
  }
  /** The smallest hour height: the 24 hours fit the day view's `viewH` px between its day header (`head` px) and the
      bottom bar laid over it (`foot` px). Never above today's 56, never under 8. */
  const hourMin = (viewH, head, foot) => clamp((viewH - head - foot) / 24, 8, HOUR.start);
  /** The minute of the day under a point `y` px below the top of the day view, scrolled `scrollTop`, with a `head` px
      day header and hours `h` px tall. Kept within the day (0 to 1440). */
  const pinchMinute = (scrollTop, y, head, h) => clamp((scrollTop + y - head) / h * 60, 0, 1440);
  /** The scroll position that puts `minute` back `y` px below the top of the view once the hours are `h` px tall,
      kept within 0 and `maxScroll`. */
  const pinchScroll = (minute, y, head, h, maxScroll) => clamp(head + minute / 60 * h - y, 0, Math.max(0, maxScroll));
  /** How much a card of `mins` minutes shows at `h` px an hour: "sm" (title only) under 36px, "tall" (start and end on
      the phone) at 54px or more, else "" (title and start time). A card is never drawn under 19px. */
  function cardFit(mins, h) {
    const ht = Math.max(mins / 60 * h, 19);
    return ht < 36 ? "sm" : ht >= 54 ? "tall" : "";
  }
  /** A tall card's time on the phone: "1:45 to 2:15 pm", the am or pm said once when both ends share it. */
  function cardTime(s, e) {
    const a = hm(s), b = hm(e), pa = a.slice(-2), pb = b.slice(-2);
    return (pa === pb ? a.slice(0, -3) : a) + " to " + b;
  }
  /** The hour height a page starts with: a phone's saved `cal-hour`, kept within 8 and 168; 56 on a desktop, or when
      nothing usable is saved. */
  function startHour(store, touch) {
    if (!touch) return HOUR.start;
    let v;
    try { v = parseFloat(store.getItem("cal-hour")); } catch (_) { return HOUR.start; }
    return v > 0 ? clamp(v, 8, HOUR.max) : HOUR.start;
  }

  /* ---- looks (Junyan, 2026-11-11: "Can you give me three more colour schemes. Make it really inspirational for a
     dancer and business owner"). Ink is the plain :root palette in calendar.html; each other look (or half of a
     look) is one :root[data-look="<face>"] block of variables there. This table only feeds the swatches in the menu
     sheet and the theme-color tag (theme is the header bar colour); still/test/calendar-look.test.mjs checks it
     matches the CSS. The choice is kept per device in localStorage "cal-look" and put on in the page head, before
     the first paint. ---- */
  /* Studio (Junyan, 2026-11-11: "Let's go wtih the calendar mode with the night mode for when it's night") is the
     default since then: the light Studio Morning look from sunrise to sunset and a charcoal night look from sunset
     to sunrise. Its two halves are two CSS blocks, data-look="studio-day" and "studio-night"; lookFace picks one. */
  const LOOKS = [
    { id: "studio", name: "Studio",
      day: { face: "studio-day", bg: "#faf6ef", theme: "#fffdf9", accent: "#d24a22", ink: "#1f1b16", gels: ["#9a7d00", "#0e8fa3", "#c7317f"], scheme: "light" },
      night: { face: "studio-night", bg: "#1c1c1c", theme: "#262626", accent: "#ff7a59", ink: "#e6e6e6", gels: ["#fbbf24", "#22d3ee", "#f472b6"], scheme: "dark" } },
    { id: "ink", name: "Ink", bg: "#0e1015", theme: "#14171e", accent: "#ff4f5e", ink: "#f2f4f8", gels: ["#fbbf24", "#22d3ee", "#f472b6"], scheme: "dark" },
    { id: "stage", name: "Stage Lights", bg: "#120d1a", theme: "#1d1529", accent: "#ffc857", ink: "#f7f1fb", gels: ["#e08000", "#2ee0e8", "#ff4fae"], scheme: "dark" },
    { id: "velvet", name: "Velvet & Brass", bg: "#0b1a17", theme: "#11251f", accent: "#c8a46a", ink: "#f3ead8", gels: ["#f5cc1f", "#3cc6c0", "#d9668f"], scheme: "dark" },
  ];
  const DEFAULT_LOOK = "studio";
  /** Looks that were replaced, by the look that took their place: Studio Morning (light) and Studio Evening (dark)
      are now the two halves of Studio. */
  const LOOK_RENAMED = { morning: "studio", evening: "studio" };
  /** A saved look name → a known look id (Studio for anything else, and for no saved choice). */
  const lookId = (saved) => { const id = Object.hasOwn(LOOK_RENAMED, saved) ? LOOK_RENAMED[saved] : saved; return LOOKS.some((l) => l.id === id) ? id : DEFAULT_LOOK; };
  /** Junyan picked Studio on 2026-11-11, so every device forgets the look it saved while he tried them, once; his
      taps after that are kept. `storage` is localStorage (or a stand-in with getItem, setItem and removeItem).
      Returns the look id to show. */
  const LOOK_RESET = "2026-11-11-studio";
  function startLook(storage) {
    if (storage.getItem("cal-look-reset") !== LOOK_RESET) { storage.removeItem("cal-look"); storage.setItem("cal-look-reset", LOOK_RESET); }
    return lookId(storage.getItem("cal-look"));
  }

  /* ---- sunrise and sunset, worked out on the device: no location permission and no network call. The calendar's
     time zone picks the city (Toronto when it is not one we know). The sunrise equation in NOAA's low-precision
     form (about a minute out), with the sun's top edge on the horizon and the usual refraction (-0.833 degrees). */
  const ZONE_PLACE = { "America/Toronto": [43.65, -79.38], "America/Vancouver": [49.28, -123.12], "America/Sao_Paulo": [-23.55, -46.63],
    "Europe/London": [51.51, -0.13], "Europe/Lisbon": [38.72, -9.14], "Asia/Tokyo": [35.68, 139.69], "Asia/Kuala_Lumpur": [3.14, 101.69] };
  /** [latitude, longitude] for a time zone; Toronto for any zone not in the table. */
  const placeOf = (tz) => ZONE_PLACE[tz] || ZONE_PLACE["America/Toronto"];
  /** Sunrise and sunset on `day` ("YYYY-MM-DD") at [lat, lon], as epoch ms: {rise, set}. Where the sun never sets
      that day both are null and up is true; where it never rises both are null and up is false. */
  function sunTimes(day, [lat, lon]) {
    const r = Math.PI / 180, n = civil(day) / DAY - 10957;
    const J = n - lon / 360, M = (357.5291 + 0.98560028 * J) % 360;
    const Cn = 1.9148 * Math.sin(M * r) + 0.02 * Math.sin(2 * M * r) + 0.0003 * Math.sin(3 * M * r);
    const L = (M + Cn + 180 + 102.9372) % 360;
    const transit = 2451545 + J + 0.0053 * Math.sin(M * r) - 0.0069 * Math.sin(2 * L * r);
    const dec = Math.asin(Math.sin(L * r) * Math.sin(23.4397 * r));
    const cosW = (Math.sin(-0.833 * r) - Math.sin(lat * r) * Math.sin(dec)) / (Math.cos(lat * r) * Math.cos(dec));
    if (cosW < -1 || cosW > 1) return { rise: null, set: null, up: cosW < -1 };
    const w = Math.acos(cosW) / r / 360, ms = (j) => Math.round((j - 2440587.5) * DAY);
    return { rise: ms(transit - w), set: ms(transit + w) };
  }
  /** "day" between sunrise and sunset in tz's city on tz's date, "night" otherwise. */
  function sunHalf(ms, tz) {
    const s = sunTimes(wall(ms, tz).day, placeOf(tz));
    if (s.rise == null) return s.up ? "day" : "night";
    return ms >= s.rise && ms < s.set ? "day" : "night";
  }
  /** What to put on the page for look `id` at instant ms in zone tz: {face (the data-look value; null for Ink, the
      plain page), theme (the theme-color), scheme (light or dark)}. */
  function lookFace(id, ms, tz) {
    const L = LOOKS.find((x) => x.id === lookId(id)), f = L.day ? L[sunHalf(ms, tz)] : L;
    return { face: L.day ? f.face : L.id === "ink" ? null : L.id, theme: f.theme, scheme: f.scheme };
  }

  /* ---- the iPhone home screen app's short page (2026-11-12). In a home screen app iOS 26 can lay the page out one
     top inset shorter than the screen (his phone: inner 812 on an 874 screen, top inset 62) while drawing it from the
     very top, so the bottom strip shows nothing (WebKit bug 301994).
     homeFit says how far to stretch the page ({gap} in CSS px, 0 for none) and which top to use ({top}: "clear",
     the default since d23, "close", or null outside a home screen app on touch, without a top inset, or on a screen bigger than a phone). fill is his switch: "auto" (default) stretches only when the
     gap is the top inset, "on" any gap up to FILL_MAX, "off" never. iOS keeps screen.width/height upright, so the
     screen's height is its long side when the window is taller than wide. */
  const FILL_MAX = 80, PHONE_MAX = 600;
  /* docHeight (2026-11-12h) is document.documentElement.clientHeight, the height iOS laid the page out at. The gap is
     measured from it, not from innerHeight: on iOS 26 a stretched html also grows innerHeight (812 to 874 on his phone)
     while docH stays 812, so a second measure after the stretch still finds gap 62. Missing or 0: innerHeight. */
  function homeFit({ standalone, touch, innerWidth, innerHeight, docHeight, screenWidth, screenHeight, safeTop, fill = "auto", top = "clear" }) {
    if (!standalone || !touch) return { gap: 0, top: null };
    const viewH = docHeight > 0 ? docHeight : innerHeight;
    const tall = viewH >= innerWidth, screenH = tall ? Math.max(screenWidth, screenHeight) : Math.min(screenWidth, screenHeight);
    const short = Math.round(screenH - viewH);
    let gap = 0;
    if (fill === "on") gap = short > 0 && short <= FILL_MAX ? short : 0;
    else if (fill !== "off") gap = short > 0 && safeTop > 0 && Math.abs(short - safeTop) <= 2 ? short : 0;
    /* The header gap is for a phone with a top inset only (reviewer, 2026-11-12): an Android installed app with no
       inset, an iPad home screen app and a touch laptop keep the plain tab's header. Phone sized = the screen's short
       side is PHONE_MAX or less. */
    const phoneTop = safeTop > 0 && Math.min(screenWidth, screenHeight) <= PHONE_MAX;
    return { gap, top: !phoneTop ? null : top === "close" ? "close" : "clear", screenH };
  }
  /* homeShift (2026-11-12h): how far the bottom-pinned boxes (.drop, .toast, .panel, .modal) still have to move down
     once the page is stretched. pinnedBottom is where a position:fixed;bottom:0 box really ends, measured after the
     stretch. On iOS 26 the fixed layer grows with the window, so it ends at the screen's bottom and the shift is 0;
     where the window stays short (Chrome, an older iOS) it ends gap px early and the shift is the gap. Clamped 0..gap. */
  function homeShift({ gap, screenH, pinnedBottom }) {
    if (!(gap > 0)) return 0;
    return Math.min(gap, Math.max(0, Math.round(screenH - pinnedBottom)));
  }

  /* ---- words ---- */
  function hm(min) {
    const h = Math.floor(min / 60) % 24, m = min % 60;
    return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "am" : "pm"}`;
  }
  function dur(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
  }

  /* The Trips page (Junyan, 2026-11-13: "I want it to stay on the calendar app", replacing t9's jump to Day Quest),
     drawn as look A (d3: "3A"): one card per trip with Day Quest's own chips. split is Day Quest's own
     QuestTrips.splitTrips(...) and when is its whenLabel, so the calendar shows the trips, counts and chips Day Quest's
     Trips view does. A card is {name, title, dates, chips: [{cls, text}]}; name is the trip's Notion name, kept so a
     card can open its trip later without a change here. cls is "now", "need", "paid" or "" (grey). */
  const TRIP_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function tripCard(t, when) {
    const day = (d) => `${TRIP_MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}, ${d.slice(0, 4)}`;
    const s = String(t.start || "").slice(0, 10), e = String(t.end || t.start || "").slice(0, 10);
    const chips = [];
    if (s && when) chips.push({ cls: t.now ? "now" : "", text: when(t) });
    if (+t.need) chips.push({ cls: "need", text: `${+t.need} to book` });
    if (+t.booked) chips.push({ cls: "paid", text: `${+t.booked} booked` });
    if (t.bookings != null) chips.push({ cls: "", text: `${+t.bookings} booking${+t.bookings === 1 ? "" : "s"}` });
    return { name: t.name, title: `${t.icon || "🧳"} ${t.name}`, dates: !s ? "No dates yet" : e === s ? day(s) : `${day(s)} to ${day(e)}`, chips };
  }
  function tripCards(split, when) {
    const sp = split || {}, card = (t) => tripCard(t, when);
    const upcoming = (sp.upcoming || []).map(card), past = (sp.past || []).map(card), needsDates = (sp.needsDates || []).map(card);
    return { upcoming, past, needsDates, counts: { upcoming: upcoming.length, past: past.length + needsDates.length } };
  }
  /* Local and + New trip stay in Day Quest (Junyan, 2026-11-13, d4: "4 no"): plain links to its Local tab and its
     new-trip flow (QuestTrips.startView reads the hash). search is the calendar's location.search, so ?api= goes along. */
  const tripLinks = (search) => ({ local: `quest.html${search || ""}#trips-local`, add: `quest.html${search || ""}#trips-new` });

  /* ---- the event sheet on the phone (slice 02, Junyan 2026-11-12, d2 and d6: "the event sheet as editable rows").
     The sheet keeps a form: {title, calId, kind, location, description, allDay, day, start, end, days, endDay}.
     day is the start day ("YYYY-MM-DD"), start and end are wall times "HH:MM" in the calendar's main zone, days is
     whole extra days beyond the next-day rule (0 for nearly every event), endDay is an all-day event's last day
     (inclusive). An end at or before the start means the next day. Save sends sheetPatch: only what changed. ---- */
  const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ""); return m ? (+m[1] % 24) * 60 + +m[2] : null; };
  const toHHMM = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  const daysBetween = (a, b) => Math.round((civil(b) - civil(a)) / DAY);
  /** An event as the calendar holds it → the sheet's form. */
  function sheetForm(ev, tz) {
    const f = { sheet: true, title: ev.title || "", calId: ev.calId, kind: ev.kind || "", location: ev.location || "",
      description: ev.description || "", allDay: !!ev.allDay };
    if (ev.allDay) {
      const last = addDays(ev.end, -1);
      return { ...f, day: ev.start, endDay: last < ev.start ? ev.start : last, start: "09:00", end: "10:00", days: 0 };
    }
    const a = wall(ev.s ?? Date.parse(ev.start), tz), b = wall(ev.e ?? Date.parse(ev.end), tz);
    const days = Math.max(0, daysBetween(a.day, b.day) - (b.min <= a.min ? 1 : 0));
    return { ...f, day: a.day, endDay: a.day, start: toHHMM(a.min), end: toHHMM(b.min), days };
  }
  /** A timed form's length in wall minutes (an end at or before the start is the next day). */
  function sheetLength(f) {
    const s = toMin(f.start), e = toMin(f.end);
    return ((f.days || 0) + (e <= s ? 1 : 0)) * 1440 + e - s;
  }
  /** Starts changed to hhmm: the end moves with it so the length stays. A blank or broken time changes nothing. */
  function sheetStart(f, hhmm) {
    const ns = toMin(hhmm); if (ns == null) return f;
    const tot = ns + sheetLength(f), em = tot % 1440;
    return { ...f, start: toHHMM(ns), end: toHHMM(em), days: Math.max(0, Math.floor(tot / 1440) - (em <= ns ? 1 : 0)) };
  }
  const isDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day || "");
  /** Ends changed to hhmm, on its own. */
  function sheetEnd(f, hhmm) { const ne = toMin(hhmm); return ne == null ? f : { ...f, end: toHHMM(ne) }; }
  /** Day changed: a timed event keeps its wall times; an all-day event keeps how many days it spans. */
  function sheetDay(f, day) {
    if (!isDay(day)) return f;
    return { ...f, day, endDay: f.allDay ? addDays(f.endDay, daysBetween(f.day, day)) : day };
  }
  /** An all-day event's last day changed (never before its first day). */
  function sheetEndDay(f, day) { return isDay(day) ? { ...f, endDay: day < f.day ? f.day : day } : f; }
  /** All-day on: the start day, one day long. Off: 9:00 AM for one hour, ready to change. */
  function sheetAllDay(f, on) {
    return on ? { ...f, allDay: true, endDay: f.day } : { ...f, allDay: false, start: "09:00", end: "10:00", days: 0, endDay: f.day };
  }
  /** The form's time fields → {allDay, start, end} as the backend takes them (all-day end is the day after). */
  function sheetWhen(f, tz) {
    if (f.allDay) return { allDay: true, start: f.day, end: addDays(f.endDay > f.day ? f.endDay : f.day, 1) };
    const s = toMin(f.start), e = toMin(f.end);
    const endDay = addDays(f.day, (f.days || 0) + (e <= s ? 1 : 0));
    return { allDay: false, start: new Date(instant(f.day, s, tz)).toISOString(), end: new Date(instant(endDay, e, tz)).toISOString() };
  }
  /** Only what the form changed on the event, as PATCH fields (title, start, end, allDay, location, description,
      toCalId, kind). {} when nothing changed. */
  function sheetPatch(ev, f, tz) {
    const out = {}, t = (f.title || "").trim();
    if (t && t !== ev.title) out.title = t;
    if (f.calId && f.calId !== ev.calId) out.toCalId = f.calId;
    if ((f.kind || "") !== (ev.kind || "")) out.kind = f.kind || "";
    const loc = (f.location || "").trim();
    if (loc !== (ev.location || "").trim()) out.location = loc;
    if ((f.description || "") !== (ev.description || "")) out.description = f.description || "";
    const w = sheetWhen(f, tz);
    if (w.allDay !== !!ev.allDay) Object.assign(out, w);
    else if (w.allDay) { if (w.start !== ev.start || w.end !== ev.end) Object.assign(out, w); }
    else if (Date.parse(w.start) !== Date.parse(ev.start) || Date.parse(w.end) !== Date.parse(ev.end)) { out.start = w.start; out.end = w.end; }
    return out;
  }

  /** Notes that carry Google's formatting (HTML tags): shown read-only, so nothing is flattened. */
  const notesRich = (s) => /<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(s || "");
  /** Formatted notes as plain text to read. */
  function notesText(html) {
    const ent = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
    return String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(p|div|li|h\d)\b[^>]*>/gi, "\n").replace(/<[^>]*>/g, "")
      .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, k) => ent[k]).replace(/\n{3,}/g, "\n\n").trim();
  }
  const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  /** "2026-11-13" → "Fri, Nov 13" (the sheet's Day row). */
  const dayText = (day) => `${DOW3[dowOf(day)]}, ${MON3[+day.slice(5, 7) - 1]} ${+day.slice(8, 10)}`;
  /** Minutes after midnight → "1:45 PM" (the sheet's Starts and Ends rows). */
  const clock = (min) => { const h = Math.floor(min / 60) % 24; return `${h % 12 || 12}:${String(min % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

  root.CalCore = { wall, instant, offset, addDays, dowOf, weekStart, isoWeek, addMonths, monthKey, monthsFor,
    KINDS, guessKind, kindOf, layout, pieces, coversDay, routineBlocks, ROUTINE, orderBetween, groupOf, dropTask, blockMinutes, hm, dur, SWIPE, swipeLock, swipeCommit, HOUR, pinchHeight, hourMin, pinchMinute, pinchScroll, cardFit, cardTime, startHour, LOOKS, lookId, startLook, LOOK_RESET, placeOf, sunTimes, sunHalf, lookFace, tripCards, tripLinks, homeFit, homeShift,
    sheetForm, sheetWhen, sheetPatch, sheetLength, sheetStart, sheetEnd, sheetDay, sheetEndDay, sheetAllDay, notesRich, notesText, dayText, clock, toMin };
})(typeof window !== "undefined" ? window : globalThis);

/* The Packing page's rules (slice 01, Junyan 2026-11-13, d22: "22 yes"), with no page in them: still/test/packing.test.mjs.
   His Notion Packing List is copied in once (seed); after that this copy is the list, and nothing here writes to
   Notion (d10). Everything is kept through the store passed in ({get(key) → text or null, set(key, text)}), today the
   browser (d16), so a server copy can take its place later without a change to the page.
   A list id is "all", "brazil", "road" or "ski" (My lists: what a new trip starts from), or "t:" + the trip's key
   (Day Quest's tripKey of its name) for a trip's own list and ticks. A bag and a when belong to the item, the same
   on every trip. The trip rules themselves (which trips, coming up or past, "51 days away") are Day Quest's own,
   passed in as trips (quest-trips.js: tripKey, mergeTrips, splitTrips, whenLabel). */
(function (root) {
  "use strict";
  const KEY = "packing-v1", SEEN = "packing-trips-v1";
  const MINE = [["all", "All items", "🌍"], ["brazil", "Brazil", "🌴"], ["road", "Road Trip", "🚗"], ["ski", "Skiing", "⛷️"]];
  const BAGS = [["away", "Away Carry-on", "🧳"], ["nomatic", "Nomatic Travel Pack", "🎒"], ["sling", "Sling / On my Person", "👝"]];
  const WHEN = [["week", "Week before"], ["day", "Day before"], ["leave", "On leaving"], ["none", "No time yet"]];
  const PILL = { week: "Week before", day: "Day before", leave: "On leaving", none: "When?" };
  const ORDER = { week: 0, day: 1, leave: 2, none: 3 };
  /* First guesses at where his Notion tags and places go; he fixes the rest by dragging. */
  const BAGMAP = { "Carry-On": "away", "Backpack": "nomatic", "Worn": "sling" };
  const WHENMAP = { "1 Week Before": "week", "1 Day Before": "day", "Upon Departure": "leave" };
  const TAG = { brazil: "International", road: "Travel", ski: "Skiing" };
  const EMOJI = /\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?)*/u;
  const LEAD = new RegExp("^(" + EMOJI.source + ")\\s*(.*)$", "u"), EMOJIS = new RegExp(EMOJI.source, "gu");
  const YEAR = /\b(19|20)\d\d\b/;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /** A trip's dates in his words: "Nov 12 to 17", "Jan 3 to Feb 7, 2027" (the year only when it is not this year),
      "Dec 21, 2024" for one day, the year alone for an undated trip filed by the year in its name. */
  function dates(t, today) {
    const s = String(t.start || "").slice(0, 10), e = String(t.end || t.start || "").slice(0, 10);
    if (!s) return t.sortKey ? t.sortKey.slice(0, 4) : "No dates yet";
    const a = s.split("-").map(Number), b = e.split("-").map(Number), yr = b[0] === +String(today).slice(0, 4) ? "" : ", " + b[0];
    if (s === e) return `${MON[a[1] - 1]} ${a[2]}${yr}`;
    return `${MON[a[1] - 1]} ${a[2]} to ${a[1] === b[1] && a[0] === b[0] ? "" : MON[b[1] - 1] + " "}${b[2]}${yr}`;
  }

  function packing({ store, trips }) {
    let D = null;
    try { const v = JSON.parse(store.get(KEY) || "null"); if (v && Array.isArray(v.items) && v.mine && v.trips) D = v; } catch (e) {}
    let seen = null;   // the trip list as last read, kept so the page opens with no network
    try { const v = JSON.parse(store.get(SEEN) || "null"); if (Array.isArray(v)) seen = v; } catch (e) {}
    /* A browser that blocks storage still gets a working page for this visit. */
    const save = () => { try { store.set(KEY, JSON.stringify(D)); } catch (e) {} };
    const ready = () => !!D;

    /** First load: the Notion copy becomes his items and My lists. Does nothing once a copy is kept. */
    function seed(rows, today) {
      if (D) return false;
      D = { v: 1, next: 1, items: [], mine: { brazil: {}, road: {}, ski: {} }, trips: {} };
      (rows || []).forEach((r, i) => {
        const id = "n" + i, m = LEAD.exec(String(r.name || "").trim());
        D.items.push({ id, i: m ? m[1] : "", n: m ? m[2] : String(r.name || "").trim(), q: String(r.qty || "1"), bag: BAGMAP[r.loc] || "", when: WHENMAP[r.when] || "none" });
        for (const k in TAG) if ((r.types || []).includes(TAG[k])) D.mine[k][id] = 1;
      });
      save();
      if (today) first(today);
      return true;
    }
    /** Once, when both his items and his trips are in: the trip he is on starts from the Road Trip list, so he lands
        on a full board. Every other trip waits for him to pick what it starts from. */
    function first(today) {
      if (!D || !seen || D.first) return;
      D.first = 1;
      const now = split(today).up.find((t) => t.now);
      if (now && !tripOf(tripId(now))) start(tripId(now), "road"); else save();
    }

    /** His trips as just read (Day Quest's saved copy and still-api's list): remembered as the last good list. */
    function sync(list, today) {
      seen = (list || []).map((t) => ({ name: t.name, start: t.start || "", end: t.end || "", icon: t.icon || "" }));
      try { store.set(SEEN, JSON.stringify(seen)); } catch (e) {}
      first(today);
    }
    const tripId = (t) => "t:" + (trips.tripKey(t.name) || t.name);
    /** Coming up and Past by Day Quest's own rules; a trip with no dates and no year in its name closes Past. */
    function split(today) {
      const sp = trips.splitTrips(trips.mergeTrips(seen || []), today);
      return { up: [...sp.upcoming], past: [...sp.past, ...sp.needsDates] };
    }
    /** One trip card: its flag or icon (from its name; a suitcase when it has none) and its name without the year. */
    function card(t, coming, today) {
      let icon = "";
      for (const n of t.aliases || [t.name]) { const m = EMOJI.exec(n); if (m) { icon = m[0]; break; } }
      const id = tripId(t), c = count(id);
      return { id, icon: icon || t.icon || "🧳", name: shortName(t), dates: dates(t, today),
        label: coming ? trips.whenLabel(t) : "", now: !!(coming && t.now), has: !!tripOf(id), done: c.done, total: c.total,
        packed: tripOf(id) ? `${c.done} of ${c.total} packed` : "No list yet" };
    }
    /** A trip's name without its flag or year: "2026 🇪🇬 Egypt" is "Egypt". */
    function shortName(t) { return String(t.name).replace(EMOJIS, " ").replace(YEAR, " ").replace(/\s+/g, " ").trim() || String(t.name); }
    /** The short name of the trip behind a list id, or "" when no trip read has that key. */
    const nameOf = (list) => { const t = trips.mergeTrips(seen || []).find((x) => tripId(x) === list); return t ? shortName(t) : ""; };
    const cards = (today) => { const sp = split(today); return { up: sp.up.map((t) => card(t, true, today)), past: sp.past.map((t) => card(t, false, today)) }; };
    const cardOf = (list, today) => { const c = cards(today); return c.up.concat(c.past).find((x) => x.id === list) || null; };

    const isMine = (list) => MINE.some((m) => m[0] === list);
    const mineName = (list) => (MINE.find((m) => m[0] === list) || [])[1] || "";
    /** A trip's own list: {on, ticks, from, fromName}, or null while it has none. */
    const tripOf = (list) => (D && String(list).slice(0, 2) === "t:" && D.trips[String(list).slice(2)]) || null;
    const onOf = (list) => (isMine(list) ? D.mine[list] : (tripOf(list) || {}).on) || {};
    const on = (list) => (!D ? [] : list === "all" ? D.items : D.items.filter((o) => onOf(list)[o.id]));
    const ticksOf = (list) => (tripOf(list) || {}).ticks || {};
    const count = (list) => { const arr = on(list), t = ticksOf(list); return { total: arr.length, done: arr.filter((o) => t[o.id]).length }; };

    /** Starts a trip's list (or starts it over) from one of My lists, another trip's list, or empty: a copy of what
        is on the source at this moment, with no ticks. After that the trip's list is its own. */
    function start(list, src) {
      if (!D || String(list).slice(0, 2) !== "t:") return;
      const copy = {};
      if (src === "all") D.items.forEach((o) => { copy[o.id] = 1; });
      else if (src !== "empty") Object.assign(copy, onOf(src));
      const rec = { on: copy, ticks: {}, from: src, fromName: isMine(src) || src === "empty" ? "" : nameOf(src) };
      if (src === "road" && D.food) rec.food = foodCopy();
      D.trips[list.slice(2)] = rec;
      save();
    }
    const fromLabel = (rec) => rec.from === "all" ? "all your items" : rec.from === "empty" ? "an empty list"
      : isMine(rec.from) ? `your ${mineName(rec.from)} list` : nameOf(rec.from) || rec.fromName || "another trip";

    const items = (n) => `${n} ${n === 1 ? "item" : "items"}`;
    /** Which of My lists a new trip most likely starts from: Brazil in its name, a ski icon or a ski place. */
    const guess = (c) => /bra[sz]il/i.test(c.name) ? "brazil" : (c.icon.indexOf("⛷") === 0 || /ski|tremblant|massif|killington/i.test(c.name)) ? "ski" : "";
    /** What a trip's list can start from (or start over from): My lists, then every other trip that has a list. */
    function choices(list, today) {
      const c = cards(today), all = c.up.concat(c.past), me = all.find((x) => x.id === list) || { name: "", icon: "" };
      const has = !!tripOf(list), best = has ? "" : guess(me);
      return {
        title: `Start the ${me.name} list${has ? " over" : ""}`,
        sub: has ? `This swaps its ${items(count(list).total)} and clears its ticks.` : "Pick what it starts from. You can add or leave out items after.",
        lists: MINE.slice(1).concat([MINE[0]]).map(([id, name, icon]) => ({ id, icon, name: id === "all" ? name : `${name} list`, count: items(on(id).length), best: id === best })),
        trips: all.filter((x) => x.id !== list && x.has).map((x) => ({ id: x.id, icon: x.icon, name: x.name, count: items(x.total) })),
        keep: has,
      };
    }

    /** The one line under the cards that names the picked list. */
    function head(list, today) {
      if (list === "all") return { title: "All items", sub: "Everything you pack with.", has: true, kind: "all" };
      if (isMine(list)) return { title: `${mineName(list)} list`, sub: "New trips can start from this list.", has: true, kind: "mine" };
      const c = cardOf(list, today) || { name: "", dates: "", label: "" }, rec = tripOf(list);
      return { title: c.name, sub: [c.dates, c.label, rec && rec.from ? "started from " + fromLabel(rec) : ""].filter(Boolean).join(" · "), has: !!rec, kind: "trip" };
    }

    /** The trip picker: Coming up, Past (the newest 8 until he asks for all, or picks one further back) and My lists,
        and where the page opens: the trip he is on, else the next one coming up, else All items. */
    function picker({ today, picked, allPast }) {
      const { up, past } = cards(today), CUT = 8;
      const all = !!allPast || past.length <= CUT || past.findIndex((c) => c.id === picked) >= CUT;
      const mine = MINE.map(([id, name, icon]) => ({ id, icon, name, total: on(id).length, size: items(on(id).length) }));
      return { up, past: all ? past : past.slice(0, CUT), more: !all, mine, counts: { up: up.length, past: past.length, mine: mine.length },
        open: up.length ? { list: up[0].id, tab: "up" } : { list: "all", tab: "mine" } };
    }

    /** The board for one list: the filter row with whole counts, To place (newest first), the three bags in
        packing order, and what is left out. `when` narrows every list to one time; `hide` drops packed items. */
    function board(list, opts) {
      const { when = "any", hide = false } = opts || {};
      const mine = on(list), rec = tripOf(list), ticks = rec ? rec.ticks : {};
      const row = (o) => ({ id: o.id, icon: o.i, name: o.n, qty: o.q, edit: o.n + (o.q !== "1" ? " x" + o.q : ""), when: o.when, pill: PILL[o.when], done: !!ticks[o.id] });
      const vis = (arr) => arr.filter((o) => (when === "any" || o.when === when) && !(hide && ticks[o.id]));
      const top = mine.filter((o) => !o.bag), topRows = vis(top);
      return {
        ticks: !!rec,
        chips: [{ id: "any", label: "Everything", n: mine.length }].concat(WHEN.map(([id, label]) => ({ id, label, n: mine.filter((o) => o.when === id).length }))),
        top: { total: top.length, rows: topRows.map(row), hint: topRows.length ? "" : top.length ? "Nothing here for this filter." : "Nothing waiting. Everything has a bag." },
        bags: BAGS.map(([id, name, icon]) => {
          const arr = mine.filter((o) => o.bag === id), done = arr.filter((o) => ticks[o.id]).length;
          const rows = vis(arr).map((o, i) => [o, i]).sort((x, y) => (ORDER[x[0].when] - ORDER[y[0].when]) || (x[1] - y[1])).map((x) => row(x[0]));
          return { id, icon, name, total: arr.length, done, count: rec ? `${done} of ${arr.length}` : String(arr.length), rows,
            hint: rows.length ? "" : !arr.length ? "Drag items here." : hide && when === "any" ? "All packed." : "Nothing here for this filter." };
        }),
        out: list === "all" ? [] : D.items.filter((o) => !onOf(list)[o.id]).map((o) => ({ id: o.id, icon: o.i, name: o.n })),
      };
    }

    const byId = (id) => (D ? D.items.find((o) => o.id === id) : null);
    /** A drop. "out" leaves the item out of this list (never out of All items). A bag id, or "top" for To place,
        puts it there for every trip, brings it onto this list, and moves it to the top of To place's order. */
    function move(list, id, target) {
      const o = byId(id); if (!o || !(isMine(list) || tripOf(list))) return;
      if (target === "out") { if (list !== "all") delete onOf(list)[id]; }
      else {
        o.bag = target === "top" ? "" : target;
        if (list !== "all") onOf(list)[id] = 1;
        D.items = [o].concat(D.items.filter((x) => x !== o));
      }
      save();
    }
    /** A click in the side panel: the item is on this list again, in the bag it had. */
    function bring(list, id) { if (byId(id) && list !== "all" && (isMine(list) || tripOf(list))) { onOf(list)[id] = 1; save(); } }

    /** A tick on a trip's list. Ticks are that trip's own; My lists have none. */
    function tick(list, id, packed) {
      const rec = tripOf(list); if (!rec || !byId(id)) return;
      if (packed) rec.ticks[id] = 1; else delete rec.ticks[id];
      save();
    }
    /** When to pack an item: one per item, the same on every trip. */
    /** The when after this one on a pill: Week before, Day before, On leaving, When?, then round again. */
    const nextWhen = (when) => WHEN[(WHEN.findIndex((w) => w[0] === when) + 1) % WHEN.length][0];
    function setWhen(id, when) { const o = byId(id); if (o && when in ORDER) { o.when = when; save(); } }
    /** One click on a Bags pill moves it to the next when: Week before, Day before, On leaving, When?, then round
        again (Junyan, d30: the same as Food). Still one per item, the same on every trip. */
    function cycleWhen(id) {
      const o = byId(id); if (o) setWhen(id, nextWhen(o.when));
    }

    /** Starts a trip's ticks again; the items stay. */
    function untickAll(list) { const rec = tripOf(list); if (rec) { rec.ticks = {}; save(); } }

    /** One line of text as an item: an emoji in front is its icon, "x3" or "×3" at the end is its count. */
    function parse(text) {
      let t = String(text || "").trim(), i = "";
      const lead = LEAD.exec(t); if (lead) { i = lead[1]; t = lead[2].trim(); }
      const m = /^(.*?)\s+[x×]\s?(\d+)$/i.exec(t);
      return m ? { i, n: m[1].trim(), q: String(+m[2] || 1) } : { i, n: t, q: "1" };
    }
    /** The add box: the item lands at the top of To place, on this list (and in All items). On All items it is in
        All items only. Gives its id, or null when nothing was added. */
    function add(list, text) {
      if (!D || !(list === "all" || isMine(list) || tripOf(list))) return null;
      const p = parse(text); if (!p.n) return null;
      const id = "a" + (D.next || 1); D.next = (D.next || 1) + 1;
      D.items.unshift({ id, i: p.i, n: p.n, q: p.q, bag: "", when: "none" });
      if (list !== "all") onOf(list)[id] = 1;
      save();
      return id;
    }
    /** A new name, with the same count rule. An empty name keeps the old one; a new emoji in front changes the icon. */
    function rename(id, text) {
      const o = byId(id), p = parse(text); if (!o || !p.n) return;
      o.n = p.n; o.q = p.q; if (p.i) o.i = p.i;
      save();
    }
    /** Delete for good (from All items): the item leaves every list and every trip, ticks included. */
    function remove(id) {
      if (!byId(id)) return;
      D.items = D.items.filter((o) => o.id !== id);
      for (const k in D.mine) delete D.mine[k][id];
      for (const k in D.trips) { delete D.trips[k].on[id]; delete D.trips[k].ticks[id]; }
      save();
    }
    /** Find an item: the ids of the left-out items whose name holds the text, whatever the case. */
    function found(list, text) {
      if (!D || list === "all") return [];
      const q = String(text || "").trim().toLowerCase();
      return D.items.filter((o) => !onOf(list)[o.id] && o.n.toLowerCase().includes(q)).map((o) => o.id);
    }

    /** Where a Packing block opens the page (slice 02, d23): the trip whose dates hold the block's day, else the next
        trip coming up after it, by Day Quest's own rules (the home trip and undated trips never count). The tab is
        that trip's tab as of today. null when no trip fits or none was read yet: the page opens as it does today. */
    function openFor(day, today) {
      if (!seen || !/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return null;
      const t = trips.splitTrips(trips.mergeTrips(seen), day).upcoming[0];
      if (!t) return null;
      const list = tripId(t);
      return { list, tab: split(today).up.some((x) => tripId(x) === list) ? "up" : "past" };
    }
    /* ---------- Road trip food (slice 03, Junyan 2026-11-17, "26 yes, 27 yes", restyled to mock v5 on "29 yes"; tests:
       still/test/packing-food.test.mjs). Food is its own list (his words: "Just make it it's own list"), never in the
       bags. The Road Trip list holds the template (D.food); a trip started from it gets its own copy (rec.food), with
       its own ticks and pills. No amounts anywhere ("I'll decide the quantities"): a name is kept as typed. */
    /* Each group's id, title and icon tile. Mock v5 (d29, "three column design in the same way as the bags"): no
       subtitles ("random words ... that are no necessary"). */
    const FOODS = [["steps", "Before you go", "📝"], ["every", "Every road trip", "🥣"], ["trip", "This trip", "🍚"],
      ["gear", "Kitchen gear", "🍳"], ["buy", "Buy on arrival", "🛒"], ["cooler", "Cooler", "🧊"]];
    const FOODIDS = FOODS.map((g) => g[0]);
    /* The Food count on the switch: what gets packed. Before you go are steps and Buy on arrival is bought there. */
    const COUNTED = ["every", "trip", "gear", "cooler"];
    /* d27: an add here also goes onto the Road Trip template, so future road trips start with it. */
    const CARRY = ["steps", "every", "gear"];
    const foodReady = () => !!(D && D.food);
    const fid = () => { const id = "f" + (D.fnext || 1); D.fnext = (D.fnext || 1) + 1; return id; };
    /** A copy of the template for one trip: same names and pills, new ids, nothing ticked. */
    const foodCopy = () => { const o = {}; FOODIDS.forEach((g) => { o[g] = (D.food[g] || []).map((x) => ({ id: fid(), n: x.n, w: x.w })); }); return o; };

    /** First load of the food template onto the Road Trip list. Does nothing once there is one. */
    function seedFood(json) {
      if (!D || D.food) return false;
      D.food = {};
      FOODIDS.forEach((g) => { D.food[g] = ((json || {})[g] || []).map((x) => ({ id: fid(), n: String(x.n || "").trim(), w: g === "buy" ? "" : (x.w in ORDER ? x.w : "none") })).filter((x) => x.n); });
      save();
      return true;
    }
    /** The food list a page shows for this list: the template on the Road Trip list, a trip's own copy, or null
        (no Food switch) for any other list or a trip not started from the Road Trip list. */
    const roadTrip = (list) => { const rec = tripOf(list); return rec && rec.from === "road" ? rec : null; };
    const foodOf = (list) => (!foodReady() ? null : list === "road" ? D.food : (roadTrip(list) || {}).food || null);

    /** The Food view: six groups as mock v5 draws them, each with "N of M" on a trip and its size on the template. */
    function food(list) {
      if (!foodReady() || !(list === "road" || roadTrip(list))) return null;
      const F = foodOf(list), ticks = list !== "road";
      if (!F) return { started: false, ticks, count: 0, groups: [], button: "Start food from your Road Trip list" };
      const groups = FOODS.map(([id, title, icon]) => {
        const arr = F[id] || [], done = ticks ? arr.filter((x) => x.d).length : 0;
        return { id, title, icon, pill: id !== "buy", total: arr.length, done, count: ticks ? `${done} of ${arr.length}` : String(arr.length),
          empty: id === "cooler" ? "Empty. No ice packs." : "Nothing yet.",
          rows: arr.map((x) => ({ id: x.id, name: x.n, when: id === "buy" ? "" : x.w, pill: id === "buy" ? "" : PILL[x.w] || PILL.none, done: ticks && !!x.d })) };
      });
      return { started: true, ticks, count: COUNTED.reduce((n, g) => n + (F[g] || []).length, 0), groups };
    }
    /** The button on a Road Trip trip that had its bags before food existed: food from the template, bags untouched. */
    function startFood(list) { const rec = roadTrip(list); if (rec && foodReady() && !rec.food) { rec.food = foodCopy(); save(); } }
    /** Where an item is in a list's food: {F, g, i} (the list, its group, its index), or null. */
    const foodAt = (list, id) => {
      const F = foodOf(list); if (!F) return null;
      for (const g of FOODIDS) { const i = (F[g] || []).findIndex((x) => x.id === id); if (i >= 0) return { F, g, i }; }
      return null;
    };

    /** "+ Add, then Enter": to the end of that group, Day before as in the mock (Buy on arrival has no pill). On a
        trip, an add to Every road trip, Kitchen gear or Before you go also goes onto the template (d27), once. */
    function foodAdd(list, group, text) {
      const F = foodOf(list), n = String(text || "").trim();
      if (!F || !FOODIDS.includes(group) || !n) return null;
      const w = group === "buy" ? "" : "day", id = fid();
      (F[group] = F[group] || []).push({ id, n, w });
      if (F !== D.food && CARRY.includes(group)) {
        const T = (D.food[group] = D.food[group] || []);
        if (!T.some((x) => x.n.toLowerCase() === n.toLowerCase())) T.push({ id: fid(), n, w });
      }
      save();
      return id;
    }
    /** ×: off this list only. On a trip the template keeps it; on the Road Trip list it leaves the template. */
    function foodRemove(list, id) { const at = foodAt(list, id); if (at) { at.F[at.g].splice(at.i, 1); save(); } }
    /** A tick: that trip's own. The template has none. */
    function foodTick(list, id, done) {
      const at = list === "road" ? null : foodAt(list, id); if (!at) return;
      const x = at.F[at.g][at.i]; if (done) x.d = 1; else delete x.d;
      save();
    }
    /** A pill: when to do it, on this list only. Buy on arrival takes none. */
    function foodWhen(list, id, when) {
      const at = foodAt(list, id); if (!at || at.g === "buy" || !(when in ORDER)) return;
      at.F[at.g][at.i].w = when; save();
    }
    /** One click on a pill moves it to the next when: Week before, Day before, On leaving, When?, then round again
        (Junyan after mock v5: "I just click it and it changes the pill"). This list only. */
    function foodCycle(list, id) {
      const at = foodAt(list, id); if (!at || at.g === "buy") return;
      foodWhen(list, id, nextWhen(at.F[at.g][at.i].w));
    }

    return { ready, seed, sync, openFor, picker, head, choices, board, start, move, bring, tick, setWhen, cycleWhen, untickAll, add, rename, remove, found,
      foodReady, seedFood, food, startFood, foodAdd, foodRemove, foodTick, foodWhen, foodCycle };
  }

  root.CalCore.packing = packing;
})(typeof window !== "undefined" ? window : globalThis);

/* The trip map and saved places (slice 04, Junyan 2026-11-17: "31 yes, 32 yes, 33 no, 34 later", then "35 yes, 36 yes":
   mock https://claude.ai/artifact/BQLvpC1YQjAUDhuBJefsRi as drawn). No page in here: still/test/trip-map.test.mjs.
   mapStart, gdir and the pin match rule are Day Quest's own (quest-trips.js: mapStart, gdir, drawMap), copied here so
   the calendar keeps them once Day Quest is retired. Day Quest's helpers (fieldOf, isStay, destOf, tripKey, SEED, MTL)
   are passed in as T, as the Packing page does. Saved places live in still-api /quest/places (the server finds the
   pin); plan addresses are read from Notion and looked up on the map in the page (spots), never written back (d10). */
(function (root) {
  "use strict";
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const low = (s) => String(s || "").toLowerCase().trim();
  const street = (addr) => String(addr || "").split(",")[0].trim();

  /** Day Quest's pin match: a plan sits on a saved place when its address names the place or the place's street. */
  function pinMatch(addr, place) {
    const a = low(addr), nm = low(place && place.name), st = low(street(place && place.address));
    return !!a && ((!!nm && a.includes(nm)) || (!!st && a.includes(st)));
  }
  /** How the map starts: fitted to the pins; else on the trip's destination; else the whole world. */
  function mapStart(places, dest, geo) {
    const pins = (places || []).filter((p) => p && p.lat != null && p.lng != null).map((p) => [p.lat, p.lng]);
    if (pins.length) return { pins };
    if (dest && geo && geo.lat != null) return { center: [geo.lat, geo.lng], zoom: 5 };
    return { world: true };
  }
  /** Google Maps directions to the pin, else the address, else the name. */
  const gdir = (p) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(p.lat != null ? `${p.lat},${p.lng}` : p.address || p.name);
  /** The tile of a saved place: 💃 dance, 🥾 hike, 🍜 food, 📍 anything else (Day Quest's rule; a new place is 📍). */
  const emojiOf = (cat) => cat === "hike" ? "🥾" : cat === "dance" ? "💃" : /food|eat|restaurant|cafe/i.test(cat || "") ? "🍜" : "📍";

  /** "2026-11-13T21:00:00-05:00" → {day: "2026-11-13", time: "9:00 PM"}: the plan's own wall clock, as Notion holds it. */
  function when(iso) {
    const s = String(iso || ""), day = s.slice(0, 10), m = /T(\d\d):(\d\d)/.exec(s);
    if (!m) return { day, time: "" };
    const h = +m[1];
    return { day, time: `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}` };
  }
  const dowOf = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay();
  const dayLabel = (d) => `${DOW[dowOf(d)]} ${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;

  /** One trip's map: {pins, days, places, lookups, card(id)}.
      items are the trip's plans (Day Quest's items), places its saved places, spots the plan addresses already found
      on the map ({lowercased address: {lat, lng}}). A plan whose address is not a saved place pins on a plain dot once
      its address is found; lookups are the plan addresses still to look up. */
  function tripMap({ items, places, spots, T }) {
    const saved = (places || []).map((p) => ({ ...p, emoji: emojiOf(p.category) }));
    const dots = new Map(), byAt = new Map(), lookups = [];
    const plans = (items || []).filter((it) => it && it.name).map((it) => {
      const addr = String(T.fieldOf(it, "Address") || "").trim(), w = when(it.start);
      const name = T.isStay(it) ? "Check in: " + it.name : it.name;
      let at = "";
      const sp = addr && saved.find((p) => p.lat != null && p.lng != null && pinMatch(addr, p));   // Day Quest skips a place with no pin
      if (sp) at = sp.id;
      else if (addr) {
        const key = low(addr); at = "plan:" + key;
        if (!dots.has(at)) {
          const g = (spots || {})[key];
          dots.set(at, { id: at, plan: true, name: it.name, address: addr, lat: g ? g.lat : null, lng: g ? g.lng : null });
          if (!g && !(spots && key in spots)) lookups.push(addr);
        }
      }
      const p = { id: it.id, day: w.day, time: w.time, name, at, start: String(it.start || "") };
      if (at) byAt.set(at, [...(byAt.get(at) || []), p]);
      return p;
    });
    const count = (id) => (byAt.get(id) || []).length;
    const pins = [
      ...saved.filter((p) => p.lat != null && p.lng != null).map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, lat: p.lat, lng: p.lng, count: count(p.id), plan: false })),
      ...[...dots.values()].filter((d) => d.lat != null).map((d) => ({ id: d.id, name: d.name, lat: d.lat, lng: d.lng, count: count(d.id), plan: true })),
    ];
    const spotOf = (id) => saved.find((p) => p.id === id) || dots.get(id) || null;
    const days = [];
    for (const p of [...plans].filter((x) => x.day).sort((a, b) => a.start.localeCompare(b.start))) {
      const sp = p.at && spotOf(p.at);
      const row = { id: p.id, time: p.time, name: p.name, at: p.at, where: sp ? "📍 " + sp.name : "No place yet" };
      const last = days[days.length - 1];
      if (last && last.day === p.day) last.plans.push(row); else days.push({ day: p.day, label: dayLabel(p.day), plans: [row] });
    }
    const list = saved.map((p) => {
      const n = count(p.id), nopin = p.lat == null || p.lng == null;
      return { id: p.id, name: p.name, emoji: p.emoji, nopin,
        sub: nopin ? "Not found on the map" : street(p.address) + (n ? ` · ${n} ${n === 1 ? "plan" : "plans"}` : "") };
    });
    function card(id) {
      const sp = id && spotOf(id); if (!sp) return null;
      const there = (byAt.get(id) || []).filter((p) => p.day).sort((a, b) => a.start.localeCompare(b.start));
      return { id, icon: sp.plan ? "🔵" : sp.emoji, name: sp.name,
        addr: sp.plan ? sp.address + " · from the plan, not a saved place" : sp.lat == null ? "Not found on the map" : sp.address,
        plans: there.map((p) => [`${DOW[dowOf(p.day)]} ${p.time}`.trim(), p.name]), dir: gdir(sp), remove: !sp.plan };
    }
    /** Where one plan sits, dated or not: its pin id ("" for none) and the place line ("📍 name" or "No place yet"). */
    function rowOf(id) {
      const p = plans.find((x) => x.id === id), sp = p && p.at && spotOf(p.at);
      return { at: p ? p.at : "", where: sp ? "📍 " + sp.name : "No place yet" };
    }
    return { pins, days, places: list, lookups, card, rowOf };
  }

  /** + Add place (d32): one box, a name or an address. The words are the name; the server looks the address up, so a
      bare name goes with the trip's destination ("Schwartz's Deli, Montreal"). null when nothing was typed. */
  function placeAdd(q, trip, T) {
    const s = String(q || "").trim(); if (!s) return null;
    const dest = T.destOf(trip);
    return { name: s, address: s.includes(",") || !dest ? s : `${s}, ${dest}`, category: "place", trip, savedBy: "Junyan" };
  }
  /** The toast after a save (found or not) or a remove. */
  function placeToast(p, did) {
    if (did === "removed") return "Removed " + p.name;
    return p.lat != null && p.lng != null ? "Saved " + p.name : "Saved, but no pin: we could not find it. Add the street to place it.";
  }
  const placeRemove = (p) => ({ op: "del", id: p.id });
  /** d36: Montreal Birthday starts with the four Montreal places from Day Quest's seed, saved under the trip's name with
      Day Quest's own ids (mtl-…), so its own copy and this one are the same rows. Only while the trip has no places and
      this browser has not seeded it before (so removing all four does not bring them back). */
  function tripSeed(trip, have, done, T) {
    if (done || (have || []).length || T.tripKey(trip) !== T.tripKey(T.MTL)) return [];
    return T.SEED.places.map(({ seed, ...p }) => ({ ...p, id: p.id.replace(/^seed-/, "mtl-"), trip }));
  }
  /** The trip's head: flag (else a suitcase), full and short name, "Nov 12 to Nov 17", and who (Montreal only). */
  function tripHead(t, T) {
    const name = String(t.name || ""), flag = (name.match(/\p{Regional_Indicator}{2}/u) || [])[0];
    const short = name.replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|[️‍]/gu, " ").replace(/\b(19|20)\d\d\b/g, " ").replace(/\s+/g, " ").trim();
    const d = (s) => `${MON[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}`;
    const s = String(t.start || "").slice(0, 10), e = String(t.end || t.start || "").slice(0, 10);
    return { icon: flag || "🧳", title: name, short: short || name, dates: !s ? "" : e === s ? d(s) : `${d(s)} to ${d(e)}`,
      who: T.tripKey(name) === T.tripKey(T.MTL) ? T.SEED.who : "" };
  }
  /** The phone's tabs on a trip (d11). Bookings and Ideas join when those pieces are built. */
  const TRIP_TABS = ["Itinerary", "Map"];

  /* ---------- read a trip (slice 05, Junyan 2026-11-18: "70 yes, 71 yes, 72 yes, 73 yes it's probably not needed at
     all", then "74 yes": mock https://claude.ai/artifact/DoUcZHR3SbkquBrUoyKnCA as drawn). Computer only (d14), read
     only: nothing here writes. Day Quest's trip page (quest-trips.js: openTrip, drawLeft, openItem) is what this matches;
     its pure helpers come in as T (dayPlan, localDay, stayTime, stayLines, isStay, kindOf, missingInfo, statusLook,
     pillOf, fieldOf, cardLabel, destOf, MISSING_FIELD). Tests: still/test/trip-read.test.mjs. ---------- */
  /** Day Quest's hotel checklist (quest-trips.js CHECK, inside its page code, so copied here). */
  const CHECK = ["Research and pick the place", "Upload confirmation #", "Cancellation policy", "Address (opens in Google Maps)", "Pay outstanding balance", "Pictures of the room & amenities"];
  const dnum = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
  const isDay = (s) => /^\d{4}-\d\d-\d\d/.test(String(s || ""));
  /** "…T22:00…" → "10:00 pm", the plan's own wall clock (Day Quest's timeOf). */
  function clock(iso) {
    const m = /T(\d\d):(\d\d)/.exec(String(iso || "")); if (!m) return "";
    const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "pm" : "am"}`;
  }
  /** A time stored in UTC (or another offset) on a plan with a time zone, as that zone's wall clock "YYYY-MM-DDTHH:MM"
      (Day Quest's localDay does the same for the day: 03:30Z with America/Toronto is 10:30 pm the day before). */
  function wall(iso, tz) {
    const s = String(iso || "");
    if (!tz || !/T\d\d:\d\d.*(Z|[+-]\d\d:?\d\d)$/.test(s)) return iso;
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(new Date(s)).map((x) => [x.type, x.value]));
      return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
    } catch { return iso; }
  }
  /** A stay's check-in or check-out time: the time in its dates, else the Notion text column (Day Quest's stayTime). */
  function stayTime(it, which) {
    const t = clock(which === "in" ? it.start : it.end); if (t) return t;
    const f = (it.fields || {})[which === "in" ? "Departure / Check-in" : "Arrival / Check-out"];
    return f && f.value ? String(f.value).trim().slice(0, 30) : "";
  }
  /** "2026-11-13T21:00…" → "Fri Nov 13, 9:00 pm"; a day alone → "Fri Nov 13". */
  const at = (iso) => isDay(iso) ? dayLabel(String(iso).slice(0, 10)) + (clock(iso) ? ", " + clock(iso) : "") : String(iso || "");
  const gsearch = (q) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  const val = (v) => (v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v)).trim();

  /** One trip, read: {head, days, outside, shown(day), detail(id)}.
      trip {name, start, end, place}; items its plans; extras Day Quest's own, by plan id; places and spots as tripMap takes them; today "YYYY-MM-DD". */
  function tripRead({ trip, items, extras, places, spots, today, T }) {
    const ex = (id) => (extras || {})[id] || {};
    /* a calendar copy's status picked in Day Quest is kept in its extras (Day Quest's openTrip does the same) */
    const list = (items || []).filter((it) => it && it.name)
      .map((it) => ((it.seed || String(it.id).startsWith("seed-")) && ex(it.id).status ? { ...it, status: ex(it.id).status } : it))
      .map((it) => (it.tz ? { ...it, start: wall(it.start, it.tz), end: wall(it.end, it.tz) } : it))
      .sort((a, b) => (a.start || "9").localeCompare(b.start || "9"));
    const map = tripMap({ items: list, places, spots, T });
    let start = String(trip.start || "").slice(0, 10), end = String(trip.end || "").slice(0, 10);
    if (!start) { const ds = list.map((i) => String(i.start || "").slice(0, 10)).filter(isDay).sort(); start = ds[0] || ""; end = end || ds[ds.length - 1] || ""; }
    const n = start ? Math.min(31, Math.max(0, dnum(end || start) - dnum(start)) + 1) : 0;
    const plan = T.dayPlan(list, start, n);
    const look = (it) => T.statusLook(it.status, !!ex(it.id).plan);
    const tagOf = (it) => { const l = look(it); return l.cls === "need" ? { text: "Need to book", cls: "need" } : l.cls === "idea" ? { text: l.label, cls: "maybe" } : null; };
    const dow = (iso) => isDay(iso) ? ` (${DOW[dowOf(String(iso).slice(0, 10))]})` : "";
    function stayLine(it) {
      const ci = stayTime(it, "in"), co = stayTime(it, "out");
      const s = [ci && "Check-in " + ci + (clock(it.start) ? dow(it.start) : ""), co && "check-out " + co + (clock(it.end) ? dow(it.end) : "")].filter(Boolean).join(", ");
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    function row(it) {
      const stay = T.isStay(it), ms = T.missingInfo(it, ex(it.id)), r = map.rowOf(it.id);
      return { id: it.id, time: clock(it.start), end: !stay && clock(it.end) ? "to " + clock(it.end) : "",
        name: (it.icon ? it.icon + " " : "") + it.name, tag: tagOf(it), sub: (stay && stayLine(it)) || r.where,
        miss: ms.length ? "Missing: " + ms.join(", ") : "", at: r.at };
    }
    const days = plan.days.map((d, i) => {
      const date = new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10) + i)).toISOString().slice(0, 10);
      const L = T.stayLines(d.staying), lines = [];
      for (const o of d.out || []) lines.push(["Check-out", o.name, stayTime(o, "out") ? "by " + stayTime(o, "out") : ""].filter((x, k) => k < 2 || x));
      if (L.staying.length) lines.push(["Staying", L.staying.map((x) => x.name).join(", ")]);
      if (L.stillOn.length) lines.push(["Still on", L.stillOn.map((x) => x.name).join(", ")]);
      return { i, chip: `${DOW[dowOf(date)]} ${+date.slice(8, 10)}`, label: dayLabel(date), rows: d.on.map(row), lines };
    });
    // plans with no date are left out on the computer (Junyan, 2026-11-18: "drop this maybe")
    const outside = plan.undated.filter((i) => i.start).map(row);
    const shown = (day) => ({ days: day >= 0 ? days.filter((d) => d.i === day) : days, outside: day >= 0 ? [] : outside });

    const h = tripHead({ ...trip, start, end }, T), chips = [];
    const away = start && today ? dnum(start) - dnum(today) : 0;
    if (away > 0) chips.push({ text: away === 1 ? "1 day away" : `${away} days away`, cls: "" });
    for (const it of list) if (T.pillOf(it.status) === "need") chips.push({ text: (T.isStay(it) ? "Hotel" : it.name.replace(/ Day$/, "")) + " not booked", cls: "need" });
    const dates = !start ? "" : end && end !== start ? `${dayLabel(start)} to ${dayLabel(end)}` : dayLabel(start);
    const head = { icon: h.icon, title: h.title, meta: [dates, h.who].filter(Boolean).join(" · "), chips };

    function detail(id) {
      const it = list.find((x) => x.id === id); if (!it) return null;
      const e = ex(id), need = new Set(T.missingInfo(it, e).map((m) => T.MISSING_FIELD[m])), rows = [];
      const put = (key, k, v, links) => {
        v = val(v); const nd = need.has(key);
        if (!v && !nd && !(links && links.length)) return;
        rows.push({ k, v: v || (nd && !(links && links.length) ? "Missing" : ""), need: nd, ...(links && links.length ? { links } : {}) });
      };
      const fld = (k) => { const v = val(T.fieldOf(it, k, e)); return /^\d{4}-\d\d-\d\dT/.test(v) ? at(v) : v; };
      const kind = T.kindOf(it);
      if (kind !== "stay") {
        const day = T.localDay(it), t = clock(it.start), t2 = clock(it.end);
        put("When", "When", isDay(day) ? dayLabel(day.slice(0, 10)) + (t ? ", " + t + (t2 ? " to " + t2 : "") : "") : "");
      }
      if (kind === "stay") {
        const ci = stayTime(it, "in"), co = stayTime(it, "out");
        put("Check-in", "Check-in", ci && ci + (clock(it.start) ? dow(it.start) : ""));
        put("Check-out", "Check-out", co && co + (clock(it.end) ? dow(it.end) : ""));
      } else if (kind === "transport") {
        put("Check-in", "Departs", fld("Check-in") || (clock(it.start) ? at(it.start) : ""));
        put("Check-out", "Arrives", fld("Check-out") || (clock(it.end) ? at(it.end) : ""));
      }
      put("Status", "Status", T.cardLabel(it, e));
      const addr = val(T.fieldOf(it, "Address", e));
      put("Address", "Address", addr, addr ? [{ text: "Google Maps ↗", href: gsearch(addr) }, { text: "Directions ↗", href: gdir({ address: addr }) }] : null);
      for (const [k, label] of [["Booked Through", "Booked through"], ["Points / Cash", "Points / Cash"], ["Card", "Card"], ["Cancel by", "Cancel by"], ["Confirmation #", "Confirmation #"]]) put(k, label, fld(k));
      const files = [...(it.files || []).map((f) => ({ text: f.name + (f.url ? " ↗" : ""), href: f.url || "" })),
        ...(e.files || []).map((u) => ({ text: String(u).replace(/^https?:\/\//, "").slice(0, 40) + " ↗", href: u }))];
      put("Files", "Files", "", files);
      put("Notes", "Notes", e.notes);
      return { id, icon: it.icon || "", name: it.name, tag: tagOf(it), rows, at: map.rowOf(id).at,
        check: kind === "stay" ? CHECK.map((text, i) => ({ text, done: !!(e.check || {})[i] })) : null,
        // a reservation file can be dropped on a Notion card with a files column, as in Day Quest (no Book, no Notion link: 2026-11-18)
        drop: Array.isArray(it.files) && !it.seed && !String(id).startsWith("seed-") };
    }
    return { head, days, outside, shown, detail };
  }

  Object.assign(root.CalCore, { pinMatch, mapStart, gdir, tripMap, placeAdd, placeToast, placeRemove, tripSeed, tripHead, TRIP_TABS, tripRead });
})(typeof window !== "undefined" ? window : globalThis);
