/* Day Quest weekly training: gym sessions placed on the calendar by themselves for this week and next
   (Junyan, 2026-10-16: "I want Gym times auto-added in for this and next week based on whether I'm traveling or
   at home"). Pure, so it can be tested (node --test still/test).
   The rules were decided before this file and stay as they are:
   - d109: a home week is 3 Jack Woods sessions alternating Day 1 and Day 2 (60 min) plus 1 to 2 Matthew I. Smith
     (45 min); a travel week is at least 1 Day 1, 1 Day 2 and 1 Matthew I. Smith. This places the minimum (one
     Matthew I. Smith at home too).
   - d245: no strength on a day to go easy (sleep score under 70, a trip of an hour or more that day, or waking
     somewhere new). Matthew I. Smith is fine those days.
   - GENERATOR-SPEC.md: at home the gym is Mon/Wed/Fri 19:30 to 20:30; mobility on non-gym days. Gym is Grape
     (colorId 3).
   Placement: nothing on a hotel check-in or check-out day or a flight day, nothing starting within an hour after
   a meal, nothing ending less than 2 hours before bed, late afternoon first. One session a day; Matthew I. Smith
   shares a gym day only when no other day has room. The days furthest from the week's other sessions go first.
   Each slot of a week is placed once (`placed` holds its key): a session he moved, dropped or deleted stays as
   he left it. */
(function (root) {
  "use strict";
  const MIN = 60000, DAY = 86400000;
  const GRAPE = "3";
  const NAMES = { jw1:"Gym · Jack Woods Day 1", jw2:"Gym · Jack Woods Day 2", ms:"Gym · Matthew I. Smith" };
  const LEN = { jw1:60, jw2:60, ms:45 };

  const isGymTitle = t => /\bgym\b|workout|calisthenics|rings/i.test(t || "");
  // which session a title (or a logged program) is: "jw1", "jw2", "jw" (strength, day not named) or "ms"
  function sessionOf(t){
    t = String(t || "");
    if (/matthew|\bsmith\b|mobility|stretch/i.test(t)) return "ms";
    if (/day\s*1\b/i.test(t)) return "jw1";
    if (/day\s*2\b/i.test(t)) return "jw2";
    return "jw";
  }
  // a hotel check-in or check-out, or a flight: no session that day ("Hotel gym" and "check in with Ela" are not)
  const MARK = t => { t = String(t || "");
    return (/^\W*check.?(in|out)\b|\b(hotel|hostel|airbnb)\s+check.?(in|out)\b|\barrive\b.*\bcheck.?in\b/i.test(t) && !/\bcheck.?in\s+(with|call)\b/i.test(t))
      || /\bflight\b|✈/i.test(t) || /\b[A-Z]{2}\d{2,4}\b/.test(t); };
  // a trip of an hour or more (the quest.html recoveryReasons rule, plus taxi, Uber and drives)
  const TRIP = /flight|\bbus\b|\btrain\b|ferry|overnight|\btaxi\b|\buber\b|\bdrive\b|\b[A-Z]{2}\d{2,4}\b/;
  const tripOf = t => TRIP.test(String(t || "").replace(/bus|train|ferry|flight|overnight|taxi|uber|drive/gi, m => m.toLowerCase()));
  const MEAL = /breakfast|brunch|lunch|dinner|\bmeal\b|\beat\b/i;

  const addDays = (ymd, n) => new Date(Date.parse(ymd + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
  const mondayOf = ymd => { const t = Date.parse(ymd + "T12:00:00Z"), dow = (new Date(t).getUTCDay() + 6) % 7; return addDays(ymd, -dow); };
  const dayGap = (a, b) => Math.round(Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / DAY);
  function offset(ms, tz){
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone:tz, year:"numeric", month:"numeric", day:"numeric",
      hour:"numeric", minute:"numeric", second:"numeric", hourCycle:"h23" }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
  }
  // "2026-10-19", 19.5, "Europe/Madrid" -> ms of 19:30 that day in that zone
  function at(ymd, h, tz){
    const [y, m, d] = ymd.split("-").map(Number), g = Date.UTC(y, m - 1, d, Math.floor(h), Math.round((h % 1) * 60));
    let ms = g - offset(g, tz); ms = g - offset(ms, tz); return ms;
  }
  const localYmd = (ms, tz) => new Intl.DateTimeFormat("en-CA", { timeZone:tz, year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(ms));

  /* One day of the calendar. evs: [{ t, s, e, free? }] (ms or Dates) that touch the day; prevEvs: the day
     before's. Returns { ymd, tz, mode, blocked: why or "", easy: [why], busy:[[s, e]], meals:[[s, e]], bed }.
     mode comes from the caller (his switch for today, else QuestBasics.guessMode). bed: a Sleep block starting
     that evening, else 22:30. sleepScore only for today. */
  function dayInfo(ymd, tz, mode, evs, prevEvs, sleepScore){
    const own = (evs || []).map(x => ({ ...x, s:+x.s, e:+x.e })).filter(x => x.e > x.s);
    const onDay = own.filter(x => localYmd(x.s, tz) === ymd);
    const mark = onDay.find(x => MARK(x.t));
    const easy = [];
    if (typeof sleepScore === "number" && sleepScore < 70) easy.push(`sleep score ${sleepScore}`);
    const trip = own.find(x => x.e - x.s >= 60 * MIN && tripOf(x.t) && (localYmd(x.s, tz) === ymd || localYmd(x.e, tz) === ymd));
    if (trip) easy.push(`travel day (${trip.t})`);
    const moved = (prevEvs || []).find(x => MARK(x.t));
    if (moved) easy.push(`waking somewhere new (${moved.t})`);
    const sleep = own.filter(x => /^sleep\b/i.test(x.t) && x.s > at(ymd, 18, tz)).sort((a, b) => a.s - b.s)[0];
    return { ymd, tz, mode: mode === "travel" ? "travel" : "home", blocked: mark ? mark.t : "", easy,
      busy: own.filter(x => !x.free && !/^sleep\b/i.test(x.t)).map(x => [x.s, x.e]),
      meals: own.filter(x => MEAL.test(x.t) && !/snack/i.test(x.t)).map(x => [x.s, x.e]),
      bed: sleep ? sleep.s : at(ymd, 22.5, tz) };
  }

  // the week is a home week when he is home at least 4 of its 7 days (one answer for the whole week)
  const weekMode = days => days.filter(d => d.mode === "home").length >= 4 ? "home" : "travel";

  // start times for a day, best first: late afternoon (around 17:00), then the evening, then the morning
  function starts(home, kind, wd){
    const hs = []; for (let h = 9; h <= 20.5; h += 0.25) hs.push(h);
    const score = h => (h >= 14 && h <= 19.5 ? 0 : 100) + Math.abs(h - 17);
    const out = hs.sort((a, b) => score(a) - score(b));
    if (home && kind !== "ms" && [1, 3, 5].includes(wd)) return [19.5].concat(out.filter(h => h !== 19.5));
    return out;
  }
  function fits(day, s, len, now, taken){
    const e = s + len * MIN;
    if (s < now + 30 * MIN) return false;
    if (e > day.bed - 120 * MIN) return false;
    const clash = ([a, b]) => a < e && b > s;
    if (day.busy.some(clash) || taken.some(clash)) return false;
    if (day.meals.some(([, me]) => s >= me && s < me + 60 * MIN)) return false;
    return true;
  }

  /* The plan for one week. o: { week (Monday ymd), days: 7 dayInfo, sessions:[{ t, s, e, done? }] (gym blocks
     on the plan that week), logs:[{ date, program }] (finished workouts), placed:{ key:true }, now (ms), today (the game day's ymd),
     lastJw: "jw1" | "jw2" | null (the last Jack Woods day before this week) }.
     Returns { week, mode, slots, have, total, line, place:[{ key, kind, t, s, e, ymd, color }], skipped:[{ key, kind, why }] }. */
  function planWeek(o){
    const now = +o.now, days = o.days || [], mode = weekMode(days), placed = o.placed || {};
    const inWeek = d => d >= o.week && d <= addDays(o.week, 6);
    // what is done or on the plan: finished workouts, then blocks still ahead (or ticked done) not already logged that day
    const logs = (o.logs || []).filter(w => inWeek(w.date)).map(w => ({ kind:sessionOf(w.program), ymd:w.date, s:Date.parse(w.date + "T12:00:00Z") }));
    const blocks = (o.sessions || []).filter(b => isGymTitle(b.t)).map(b => {
      const s = +b.s, e = +b.e, tz = (days.find(d => d.ymd === localYmd(s, d.tz)) || days[0] || { tz:"America/Toronto" }).tz;
      return { kind:sessionOf(b.t), ymd:localYmd(s, tz), s, e, done:!!b.done };
    }).filter(b => inWeek(b.ymd) && (b.e > now || b.done) && !logs.some(l => l.ymd === b.ymd && (l.kind === b.kind || b.kind === "jw" && l.kind !== "ms")));
    const have = logs.concat(blocks);
    // the slots this week needs, and which are covered
    const slots = mode === "home" ? ["jw#1", "jw#2", "jw#3", "ms#1"] : ["jw1", "jw2", "ms"];
    const cover = {}, pool = have.slice();
    const take = test => { const i = pool.findIndex(test); if (i < 0) return null; return pool.splice(i, 1)[0]; };
    if (mode === "travel") {
      for (const k of ["jw1", "jw2", "ms"]) { const x = take(h => h.kind === k); if (x) cover[k] = x; }
      for (const k of ["jw1", "jw2"]) if (!cover[k]) { const x = take(h => h.kind === "jw" || h.kind === "jw1" || h.kind === "jw2"); if (x) cover[k] = x; }
    } else {
      for (const k of ["jw#1", "jw#2", "jw#3"]) { const x = take(h => h.kind !== "ms"); if (x) cover[k] = x; }
      const m = take(h => h.kind === "ms"); if (m) cover["ms#1"] = m;
    }
    const open = slots.filter(k => !cover[k]), place = [], skipped = [], taken = [];
    const used = have.map(h => h.ymd);
    const today = o.today || localYmd(now, (days[0] || {}).tz || "America/Toronto");
    // a slot's key is the same whether the week reads as home or travel (the nth Jack Woods, the nth Matthew I. Smith),
    // so a week whose answer flips cannot bring back a session he deleted
    const n = { jw: Object.keys(cover).filter(k => !k.startsWith("ms")).length, ms: Object.keys(cover).filter(k => k.startsWith("ms")).length };
    for (const slot of open) {
      const kind0 = slot.replace(/#\d+$/, ""), fam = kind0 === "ms" ? "ms" : "jw", key = `${o.week}:${fam}#${++n[fam]}`;
      if (placed[key]) { skipped.push({ key, kind:kind0, why:"placed before; left as he left it" }); continue; }
      const strength = kind0 !== "ms", len = strength ? 60 : 45;
      const spread = d => used.length ? Math.min(...used.map(u => dayGap(u, d.ymd))) : 7;
      const ok = days.filter(d => d.ymd >= today && !d.blocked && !(strength && d.easy.length));
      const free = ok.filter(d => !used.includes(d.ymd)), fallback = strength ? [] : ok.filter(d => used.includes(d.ymd));
      const wdOf = d => new Date(Date.parse(d.ymd + "T12:00:00Z")).getUTCDay();
      const rank = xs => xs.slice().sort((a, b) => (mode === "home" && strength ? (![1, 3, 5].includes(wdOf(a))) - (![1, 3, 5].includes(wdOf(b))) : 0)
        || spread(b) - spread(a) || (a.ymd < b.ymd ? -1 : 1));
      let got = null;
      for (const d of rank(free).concat(rank(fallback))) {
        const h = starts(mode === "home", kind0, wdOf(d)).find(h => fits(d, at(d.ymd, h, d.tz), len, now, taken));
        if (h != null) { const s = at(d.ymd, h, d.tz); got = { key, kind:kind0, ymd:d.ymd, s, e:s + len * MIN }; break; }
      }
      if (!got) { skipped.push({ key, kind:kind0, why:"no free hour that fits this week" }); continue; }
      place.push(got); taken.push([got.s, got.e]); used.push(got.ymd);
    }
    // names: a travel slot says which day it is; at home the Jack Woods days alternate in time order
    let last = o.lastJw || null;
    const jwSeq = have.filter(h => h.kind !== "ms").map(h => ({ ...h, mine:false })).concat(place.filter(p => p.kind !== "ms").map(p => ({ ...p, mine:true })))
      .sort((a, b) => a.s - b.s);
    for (const x of jwSeq) {
      const k = x.mine ? (mode === "travel" ? x.kind : (last === "jw1" ? "jw2" : "jw1")) : x.kind === "jw" ? (last === "jw1" ? "jw2" : "jw1") : x.kind;
      if (x.mine) place.find(p => p.key === x.key).kind = k;
      last = k;
    }
    place.forEach(p => { p.t = NAMES[p.kind]; p.color = GRAPE; p.min = LEN[p.kind]; });
    const total = slots.length, onPlan = total - open.length + place.length;
    // how many of each are done or on the plan (placed ones included), for the Practices list
    const by = { jw:0, jw1:0, jw2:0, ms:0 };
    Object.values(cover).concat(place).forEach(x => { by[x.kind] = (by[x.kind] || 0) + 1; if (x.kind !== "ms") by.jw++; });
    if (mode === "travel") { by.jw1 = cover.jw1 || place.some(p => p.kind === "jw1") ? 1 : 0; by.jw2 = cover.jw2 || place.some(p => p.kind === "jw2") ? 1 : 0; }
    return { week:o.week, mode, slots, have:onPlan, total, by, lastJw:last, place: place.sort((a, b) => a.s - b.s), skipped,
      line:`Gym: ${onPlan} of ${total} placed this week` };
  }

  root.QuestGym = { sessionOf, isGymTitle, dayInfo, weekMode, planWeek, at, localYmd, mondayOf, addDays, NAMES, GRAPE };
})(typeof window !== "undefined" ? window : globalThis);
