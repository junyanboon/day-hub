/* Day Quest weekly training: gym sessions placed on the calendar by themselves for this week and next
   (Junyan, 2026-10-16: "I want Gym times auto-added in for this and next week based on whether I'm traveling or
   at home"). Pure, so it can be tested (node --test still/test).
   The rules were decided before this file and stay as they are:
   - d109: a home week is 3 Jack Woods sessions (60 min) plus 1 to 2 Matthew I. Smith (45 min); a travel week is at
     least 2 Jack Woods and 1 Matthew I. Smith. This places the minimum (one Matthew I. Smith at home too).
     Since later 2026-10-16 Jack Woods is flexible: one "Gym · Jack Woods" session holds all six moves and he picks
     which ones he feels like, so there is no Day 1 / Day 2 to alternate. Old "Day 1" and "Day 2" events and saved
     sessions still count as Jack Woods.
   - d21 (2026-10-16): a session on a day he is ill is skipped. It is not moved or placed again later, and the week's
     target drops by it.
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
  const NAMES = { jw:"Gym · Jack Woods", ms:"Gym · Matthew I. Smith" };
  const LEN = { jw:60, ms:45 };

  const isGymTitle = t => /\bgym\b|workout|calisthenics|rings/i.test(t || "");
  // which session a title (or a logged program) is: "ms" (Matthew I. Smith) or "jw" (any strength session, the old
  // "Jack Woods Day 1" and "Day 2" included)
  function sessionOf(t){
    return /matthew|\bsmith\b|mobility|stretch/i.test(String(t || "")) ? "ms" : "jw";
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
     that evening, else 22:30. sleepScore only for today. ill: he said he is ill that day (a day to go easy, d245). */
  function dayInfo(ymd, tz, mode, evs, prevEvs, sleepScore, ill){
    const own = (evs || []).map(x => ({ ...x, s:+x.s, e:+x.e })).filter(x => x.e > x.s);
    const onDay = own.filter(x => localYmd(x.s, tz) === ymd);
    const mark = onDay.find(x => MARK(x.t));
    const easy = [];
    if (typeof sleepScore === "number" && sleepScore < 70) easy.push(`sleep score ${sleepScore}`);
    const trip = own.find(x => x.e - x.s >= 60 * MIN && tripOf(x.t) && (localYmd(x.s, tz) === ymd || localYmd(x.e, tz) === ymd));
    if (trip) easy.push(`travel day (${trip.t})`);
    const moved = (prevEvs || []).find(x => MARK(x.t));
    if (moved) easy.push(`waking somewhere new (${moved.t})`);
    if (ill) easy.push("ill");
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

  /* The plan for one week. o: { week (Monday ymd), days: 7 dayInfo, sessions:[{ t, s, e, done? }] (gym blocks on the
     plan that week, past ones too), logs:[{ date, program }] (finished workouts), placed:{ key:true }, placedS:{ key:ms }
     (the time each placed slot went in, optional), now (ms), today (the game day's ymd), ill: [ymd] (days of this week
     up to today he was ill, from illDays), illNow: he is ill today (place nothing new), illSkips: [{ t, s, key? }] (gym
     sessions Day Quest took off a day he was ill), movedOut: ["jw" | "ms"] (sessions he moved from this week to
     another one: their slots are not filled again) }.
     Returns { week, mode, slots, have, total, excused, excusedBy:{ jw, ms }, line, by, place:[{ key, kind, t, s, e, ymd,
     color, min }], skipped:[{ key, kind, why }] }.
     Ill days (d21, 2026-10-16: "just skip the session altogether if I'm ill"): a session on an ill day is skipped, and
     the week's target drops by it. That is a gym block on an ill day, one Day Quest took off an ill day, a placed slot
     whose time was an ill day, and a slot not placed yet whose normal day (the week planned as if he were well, from
     its Monday) is an ill day. Nothing is moved to the days left and nothing is caught up: the days left get what they
     would have had anyway. While he is ill nothing new goes in. */
  function planWeek(o){
    const now = +o.now, days = o.days || [], mode = weekMode(days), placed = o.placed || {}, placedS = o.placedS || {};
    const inWeek = d => d >= o.week && d <= addDays(o.week, 6);
    const ill = new Set((o.ill || []).filter(inWeek)), moved = (o.movedOut || []).slice();
    const tzAt = s => (days.find(d => d.ymd === localYmd(s, d.tz)) || days[0] || { tz:"America/Toronto" }).tz;
    const ymdAt = s => localYmd(s, tzAt(s));
    const famOf = k => k === "ms" ? "ms" : "jw";
    // what is done or on the plan: finished workouts, then blocks not already logged that day
    const logs = (o.logs || []).filter(w => inWeek(w.date)).map(w => ({ kind:sessionOf(w.program), ymd:w.date, s:Date.parse(w.date + "T12:00:00Z") }));
    const all = (o.sessions || []).filter(b => isGymTitle(b.t)).map(b => ({ kind:sessionOf(b.t), ymd:ymdAt(+b.s), s:+b.s, e:+b.e, done:!!b.done }))
      .filter(b => inWeek(b.ymd) && !logs.some(l => l.ymd === b.ymd && l.kind === b.kind));
    // a block on an ill day that was not done is skipped (d21); the others count when still ahead or ticked done
    const illBlocks = all.filter(b => ill.has(b.ymd) && !b.done);
    const blocks = all.filter(b => !illBlocks.includes(b) && (b.e > now || b.done));
    const have = logs.concat(blocks);
    // the slots this week needs (home 3 Jack Woods, travel 2, plus one Matthew I. Smith), and which are covered
    const slots = mode === "home" ? ["jw#1", "jw#2", "jw#3", "ms#1"] : ["jw#1", "jw#2", "ms#1"];
    const cover = {}, pool = have.slice();
    const take = fam => { const i = pool.findIndex(h => famOf(h.kind) === fam); return i < 0 ? null : pool.splice(i, 1)[0]; };
    for (const k of slots) { const x = take(k.startsWith("ms") ? "ms" : "jw"); if (x) cover[k] = x; }
    const open = slots.filter(k => !cover[k]), place = [], skipped = [];
    const today = o.today || localYmd(now, (days[0] || {}).tz || "America/Toronto");
    // the sessions skipped for being ill: blocks on ill days, and the ones Day Quest took off an ill day (counted once)
    const sick = illBlocks.map(b => ({ fam:famOf(b.kind), s:b.s, key:null }));
    for (const x of o.illSkips || []) {
      const s = +new Date(x.s); if (!isFinite(s) || !ill.has(ymdAt(s)) || sick.some(k => Math.abs(k.s - s) < 60000)) continue;
      sick.push({ fam:famOf(sessionOf(x.t)), s, key:x.key || null });
    }
    const sickDays = sick.map(k => ymdAt(k.s)), excusedBy = { jw:0, ms:0 };
    const skipIll = (key, fam, why) => { skipped.push({ key, kind:fam, why }); excusedBy[fam]++; };
    // a slot's key is the same whether the week reads as home or travel (the nth Jack Woods, the nth Matthew I. Smith),
    // so a week whose answer flips cannot bring back a session he deleted
    const n = { jw: Object.keys(cover).filter(k => !k.startsWith("ms")).length, ms: Object.keys(cover).filter(k => k.startsWith("ms")).length };
    const want = [], keyed = open.map(slot => { const fam = slot.startsWith("ms") ? "ms" : "jw"; return { fam, key:`${o.week}:${fam}#${++n[fam]}` }; });
    const illPlaced = k => placed[k] && placedS[k] != null && ill.has(ymdAt(+placedS[k]));
    // a placed slot whose own time was an ill day accounts for that session itself
    for (const { key } of keyed) if (illPlaced(key)) for (let i = sick.length - 1; i >= 0; i--) if (Math.abs(sick[i].s - +placedS[key]) < 60000) sick.splice(i, 1);
    for (const { fam, key } of keyed) {
      if (illPlaced(key)) { skipIll(key, fam, "skipped: ill that day"); continue; }
      // slot keys are renumbered from what is covered now, so a skipped session is matched by its kind, not its old key
      const si = sick.findIndex(k => k.fam === fam);
      if (si >= 0) { sick.splice(si, 1); skipIll(key, fam, "skipped: ill that day"); continue; }
      if (placed[key]) { skipped.push({ key, kind:fam, why:"placed before; left as he left it" }); continue; }
      const mi = moved.indexOf(fam);
      if (mi >= 0) { moved.splice(mi, 1); skipped.push({ key, kind:fam, why:"moved to another week by Junyan" }); continue; }
      want.push({ key, fam });
    }
    // where each slot goes: one session a day, Matthew I. Smith shares a day only when no other day has room
    const wdOf = d => new Date(Date.parse(d.ymd + "T12:00:00Z")).getUTCDay();
    function placeAll(list, dayList, from, nowMs, used, skipDay){
      const out = {}, taken = [];
      used = used.slice();
      for (const { key, fam } of list) {
        const strength = fam !== "ms", len = LEN[fam];
        const spread = d => used.length ? Math.min(...used.map(u => dayGap(u, d.ymd))) : 7;
        const ok = dayList.filter(d => d.ymd >= from && !d.blocked && !skipDay(d.ymd) && !(strength && d.easy.length));
        const free = ok.filter(d => !used.includes(d.ymd)), fallback = strength ? [] : ok.filter(d => used.includes(d.ymd));
        const rank = xs => xs.slice().sort((a, b) => (mode === "home" && strength ? (![1, 3, 5].includes(wdOf(a))) - (![1, 3, 5].includes(wdOf(b))) : 0)
          || spread(b) - spread(a) || (a.ymd < b.ymd ? -1 : 1));
        for (const d of rank(free).concat(rank(fallback))) {
          const h = starts(mode === "home", fam, wdOf(d)).find(h => fits(d, at(d.ymd, h, d.tz), len, nowMs, taken));
          if (h != null) { const s0 = at(d.ymd, h, d.tz); out[key] = { key, kind:fam, ymd:d.ymd, s:s0, e:s0 + len * MIN }; taken.push([s0, s0 + len * MIN]); used.push(d.ymd); break; }
        }
      }
      return out;
    }
    // d21: a slot not placed yet whose normal day is an ill day is skipped, not squeezed into the days left
    let go = want;
    if (ill.size && want.length) {
      const well = days.map(d => ({ ...d, easy:d.easy.filter(x => x !== "ill") }));
      const start = at(o.week, 0, (days[0] || {}).tz || "America/Toronto");
      const asIf = placeAll(want, well, o.week, start, all.map(b => b.ymd).concat(logs.map(l => l.ymd), sickDays), () => false);
      go = want.filter(w => { const p = asIf[w.key]; if (p && ill.has(p.ymd)) { skipIll(w.key, w.fam, "skipped: ill that day"); return false; } return true; });
    }
    if (o.illNow) { go.forEach(w => skipped.push({ key:w.key, kind:w.fam, why:"ill today: nothing new goes in" })); go = []; }
    const got = placeAll(go, days, today, now, have.map(h => h.ymd), d => ill.has(d));
    for (const w of go) { if (got[w.key]) place.push(got[w.key]); else skipped.push({ key:w.key, kind:w.fam, why:"no free hour that fits this week" }); }
    place.forEach(p => { p.t = NAMES[p.kind]; p.color = GRAPE; p.min = LEN[p.kind]; });
    const excused = excusedBy.jw + excusedBy.ms, total = slots.length - excused, onPlan = slots.length - open.length + place.length;
    // how many of each are done or on the plan (placed ones included), for the Practices list
    const by = { jw:0, ms:0 };
    Object.values(cover).concat(place).forEach(x => { by[famOf(x.kind)]++; });
    const tail = excused ? ` · ${excused} skipped, ill` : "";
    const line = o.illNow ? `Gym: ${onPlan} of ${total} this week · ill, nothing new placed` : `Gym: ${onPlan} of ${total} placed this week${tail}`;
    return { week:o.week, mode, slots, have:onPlan, total, excused, excusedBy, ill:ill.size, illNow:!!o.illNow, by,
      place: place.sort((a, b) => a.s - b.s), skipped, line };
  }

  /* Ill days (Junyan, 2026-10-16: "If I'm ill I can't work out"). map: { ymd: { ill:true|false, at } }, one answer a
     day (G.ill, synced). A day with no answer carries the answer before it (up to 14 days), so he stays ill until he
     says "I'm better". Returns the ill days from..to. */
  function illDays(map, from, to){
    map = map || {};
    const out = []; let state = false, since = null;
    for (let d = addDays(from, -14); d <= to; d = addDays(d, 1)) {
      const x = map[d];
      if (x && typeof x === "object") { state = !!x.ill; since = d; }
      else if (state && dayGap(since, d) > 14) state = false;
      if (state && d >= from) out.push(d);
    }
    return out;
  }
  // today: ill or not, whether to ask "Still ill?" (ill carried from an earlier day, no answer yet today), since when
  function illStatus(map, today){
    const now = illDays(map, today, today).length > 0;
    if (!now) return { ill:false, ask:false, since:null };
    let since = today;
    while (illDays(map, addDays(since, -1), addDays(since, -1)).length && dayGap(since, today) < 14) since = addDays(since, -1);
    return { ill:true, ask:!(map || {})[today], since };
  }

  /* Where a gym session could move to (Junyan, 2026-10-16: "give me the option to reschedule with different
     days/times I can reschedule to. This way I can stick to it"). o: { kind ("jw" | "ms"; an old "jw1" / "jw2" reads as "jw"), s, e (its
     time now), days: dayInfo for today and the 6 days after it (its own event left out of busy), week: the Monday of
     its week, gymDays: [ymd] with another gym session, ill: [ymd], modes: { monday: "home" | "travel" }, now }.
     The placement rules of planWeek: no move or flight day, no strength on a go-easy or ill day, an hour clear after a
     meal, 2 hours before bed, one session a day, late afternoon first, home Mon/Wed/Fri 19:30 first for strength.
     One time a day (a second one only when that leaves fewer than 4), its own week first so the week's count holds; never within an hour of where it is now.
     Returns { options:[{ ymd, s, e, same, label }] (4 to 6 when the calendar has room), note }. */
  function moveOptions(o){
    const strength = o.kind !== "ms", len = Math.round((+o.e - +o.s) / MIN) || (strength ? 60 : 45), now = +o.now;
    const ill = new Set(o.ill || []), others = new Set(o.gymDays || []);
    const wdOf = ymd => new Date(Date.parse(ymd + "T12:00:00Z")).getUTCDay();
    const firsts = [], seconds = [], shared = [];
    for (const d of o.days || []) {
      if (d.blocked || ill.has(d.ymd) || (strength && (d.easy.length || others.has(d.ymd)))) continue;
      const share = others.has(d.ymd);   // only Matthew I. Smith gets here, and only as a last resort
      const home = (o.modes || {})[mondayOf(d.ymd)] === "home";
      const hs = starts(home, o.kind, wdOf(d.ymd)).filter(h => { const s = at(d.ymd, h, d.tz); return Math.abs(s - +o.s) >= 60 * MIN && fits(d, s, len, now, []); });
      if (!hs.length) continue;
      const mk = h => { const s = at(d.ymd, h, d.tz); return { ymd:d.ymd, s, e:s + len * MIN, same:mondayOf(d.ymd) === o.week, later:mondayOf(d.ymd) > o.week, label:label(s, d.tz), ...(share ? { shared:true } : {}) }; };
      if (share) { shared.push(mk(hs[0])); continue; }
      firsts.push(mk(hs[0]));
      const h2 = hs.find(h => Math.abs(h - hs[0]) >= 2); if (h2 != null) seconds.push(mk(h2));
    }
    const pick = (xs, n) => xs.slice().sort((a, b) => a.s - b.s).slice(0, n);
    let opts = pick(firsts.filter(x => x.same), 6);
    if (opts.length < 4) opts = opts.concat(pick(seconds.filter(x => x.same), 4 - opts.length));
    if (opts.length < 4) opts = opts.concat(pick(firsts.filter(x => !x.same), 6 - opts.length));
    if (opts.length < 4) opts = opts.concat(pick(seconds.filter(x => !x.same), 4 - opts.length));
    if (opts.length < 4) opts = opts.concat(pick(shared.filter(x => x.same), 4 - opts.length), pick(shared.filter(x => !x.same), 4 - opts.length));
    opts = opts.slice(0, 6).sort((a, b) => (b.same - a.same) || a.s - b.s);
    const note = !opts.length ? "No free time in the next 7 days fits the gym rules."
      : !opts.some(x => x.same) ? (opts.every(x => x.later) ? "Nothing free is left this week, so these are next week. This week will be one short."
        : "Nothing free is left in its own week, so these are in another week. Its week will be one short.")
      : opts.some(x => x.shared) ? "Every other day is full, so some of these are on the same day as another gym session." : "";
    return { options:opts, note };
  }
  // "Sun Oct 25 · 2:00 PM" in the day's own zone
  function label(ms, tz){
    const d = new Date(ms), o = { timeZone:tz };
    const day = new Intl.DateTimeFormat("en-US", { ...o, weekday:"short", month:"short", day:"numeric" }).format(d).replace(",", "");
    const t = new Intl.DateTimeFormat("en-US", { ...o, hour:"numeric", minute:"2-digit" }).format(d);
    return `${day} · ${t}`.replace(/[\u202f\u00a0]/g, " ");
  }

  root.QuestGym = { sessionOf, isGymTitle, dayInfo, weekMode, planWeek, illDays, illStatus, moveOptions, label, at, localYmd, mondayOf, addDays, NAMES, GRAPE };
})(typeof window !== "undefined" ? window : globalThis);
