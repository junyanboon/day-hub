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
    KINDS, kindOf, layout, pieces, coversDay, orderBetween, groupOf, dropTask, blockMinutes, hm, dur, SWIPE, swipeLock, swipeCommit, HOUR, pinchHeight, hourMin, pinchMinute, pinchScroll, cardFit, cardTime, startHour, LOOKS, lookId, startLook, LOOK_RESET, placeOf, sunTimes, sunHalf, lookFace, tripCards, tripLinks, homeFit, homeShift,
    sheetForm, sheetWhen, sheetPatch, sheetLength, sheetStart, sheetEnd, sheetDay, sheetEndDay, sheetAllDay, notesRich, notesText, dayText, clock, toMin };
})(typeof window !== "undefined" ? window : globalThis);
