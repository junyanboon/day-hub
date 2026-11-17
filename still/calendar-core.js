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
    ["rest", "Rest"], ["other", "Other"]];
  /* Hand-set kinds saved before the eleven types (ex, food, out, work). "ex" is guessed again: gym or dance. */
  const OLD_KIND = { food: "cook", out: "travel", work: "studio" };
  /* Packing (slice 02, Junyan 2026-11-16, d23: "p1 yes"): "pack" anywhere in the title, any case, so "Pack for FICTION
     stay", "Unpack", and also "backpack" and "Packers". First, so "Pack for the trip" is Packing, not Travel. */
  const RX = [
    ["pack", /pack/i],
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
    KINDS, guessKind, kindOf, layout, pieces, coversDay, orderBetween, groupOf, dropTask, blockMinutes, hm, dur, SWIPE, swipeLock, swipeCommit, HOUR, pinchHeight, hourMin, pinchMinute, pinchScroll, cardFit, cardTime, startHour, LOOKS, lookId, startLook, LOOK_RESET, placeOf, sunTimes, sunHalf, lookFace, tripCards, tripLinks, homeFit, homeShift,
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
    function setWhen(id, when) { const o = byId(id); if (o && when in ORDER) { o.when = when; save(); } }

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
    /** The pill menu's choices, the same as the bags'. */
    const foodWhens = () => WHEN.map(([id, label]) => ({ id, label }));

    return { ready, seed, sync, openFor, picker, head, choices, board, start, move, bring, tick, setWhen, untickAll, add, rename, remove, found,
      foodReady, seedFood, food, startFood, foodAdd, foodRemove, foodTick, foodWhen, foodWhens };
  }

  root.CalCore.packing = packing;
})(typeof window !== "undefined" ? window : globalThis);
