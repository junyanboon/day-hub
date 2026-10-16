/* Day Quest basics: what the plan puts in every day without him typing (Junyan, 2026-10-16, d1 d5 d6 d7),
   plus the Fill it list (d2) and type to add (d3). Pure, so it can be tested (node --test still/test).
   1. "Go over the day with Caney", 15 min, right after breakfast: its own block every day, home or travelling,
      never folded into Domestics (Junyan, 2026-10-16: "make the caney check in one 15 minute block separately
      then from the domestics"; it was 10 min before that).
   2. "Domestics" right after it: one block, its steps a checklist inside (his Notion skill page). Home Mon to
      Fri 60 min with the day's Plus One, home Sat and Sun 30 min, travelling 25 min.
   3. "Wind-down", ending at bedtime: 45 min at home, 35 travelling (no kitchen). Steps from his Notion page.
   Home or travelling: a hotel check-in or check-out, or a flight, within 2 days means travelling; he can
   switch it for the day on step 1. Times are Dates; gaps are { s, e, min } from the morning planner. */
(function (root) {
  "use strict";
  const MIN = 60000;
  const DR_AM = { t:"Dr Ellie AM mouth care", h:"mouthAm" };
  const WASH = { t:"Shower, face wash, moisturizer with SPF, dress" };
  // Mon to Fri at home: one bigger job a day
  const PLUS = { 1:"Vacuum", 2:"Iron", 3:"Deep-clean the kitchen", 4:"Deep-clean the bathroom", 5:"Deep-clean the bedroom (sheets, surfaces)" };
  const CANEY = { id:"caney", t:"Go over the day with Caney", min:15 }, CANEY_OLD = 10;

  // wd: 0 Sunday to 6 Saturday, the game day's weekday
  function domestics(mode, wd){
    if (mode === "travel") return { min:25, steps:[DR_AM, WASH, { t:"Tidy the room" }] };
    const steps = [{ t:"Wash the dishes" }, { t:"Sweep" }, DR_AM, WASH];
    if (PLUS[wd]) return { min:60, steps: steps.concat([{ t:`Plus One: ${PLUS[wd]}` }]) };
    return { min:30, steps };
  }
  function windDown(mode){
    const steps = [
      { t:"Phone on the charger, screens off, lights low", wind:true },
      { t:"Kitchen reset and dishes (10 min)", home:true },
      { t:"Shower to reset the day's energy (10 min, Sadhguru)" },
      { t:"Dr Ellie PM, full routine: Closys, Crest, Listerine, ACT (10 min)", h:"mouth" },
      { t:"Face wash and night cream (3 min)" },
      { t:"Light the lamp (2 min, Sadhguru)", h:"lamp" },
      { t:"Bedtime screen: how today went and the deathbed minute (10 min)" },
      { t:"Quiet until bed: reading or stretching, no screens" },
    ];
    return mode === "travel" ? { min:35, steps: steps.filter(x => !x.home) } : { min:45, steps };
  }
  // one basic by id: { id, t, min, steps, habit } (habit: the Prana action that ticking it done ticks)
  function basic(id, mode, wd){
    if (id === "caney") return { ...CANEY, steps:[], habit:null };
    if (id === "domestics") return { id, t:"Domestics", ...domestics(mode, wd), habit:"mouthAm" };
    if (id === "winddown") return { id, t:"Wind-down", ...windDown(mode), habit:"mouth" };
    return null;
  }

  /* Home or travelling. list: [{ t, day:"YYYY-MM-DD" }] from the calendar around today. */
  // "Check in — ibis Styles", "Check out by 12:00 — Marriott", "Hotel check-out"; not "Weekly check-in" or "check in with Ela"
  const HOTEL = /^\W*check.?(in|out)\b|\b(hotel|hostel|airbnb|resort)\b/i, NOT_HOTEL = /\bcheck.?in\s+(with|call)\b/i;
  const FLIGHT = /\bflight\b|✈|\bairport\b/i, CODE = /\b[A-Z]{2}\d{2,4}\b/;   // the flight code rule quest.html uses
  const dayDiff = (a, b) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);
  function guessMode(list, today){
    const hit = (list || []).filter(x => x && x.day && Math.abs(dayDiff(x.day, today)) <= 2)
      .sort((a, b) => Math.abs(dayDiff(a.day, today)) - Math.abs(dayDiff(b.day, today)))   // the nearest one names the guess
      .find(x => (HOTEL.test(x.t) && !NOT_HOTEL.test(x.t)) || FLIGHT.test(x.t) || CODE.test(x.t));
    if (!hit) return { mode:"home", why:"" };
    const d = dayDiff(hit.day, today), when = d === 0 ? "today" : d === 1 ? "tomorrow" : d === -1 ? "yesterday" : d > 0 ? `in ${d} days` : `${-d} days ago`;
    return { mode:"travel", why:`${hit.t} ${when}` };
  }

  /* Where today's basics go. o: { now, gaps, breakfastEnd?, wake?, latest?, bed?, busy:[[s ms, e ms]], mode, wd,
     have:{ id:true } (placed, done or dropped today), morning (default true) }.
     Caney right after breakfast (or, with no breakfast, in the first gap of 25 min or more after waking),
     Domestics right after Caney, else the first gap that fits before `latest`, else shrunk to the biggest room
     (15 min at least), and a note says so. The Wind-down ends at bed; something fixed running into it
     shortens it (a note again). Returns { place:[{ id, t, s, e, min }], notes:[{ id, t }] }. */
  function placeBasics(o){
    const have = o.have || {}, out = [], notes = [];
    let gaps = (o.gaps || []).map(g => [+g.s, +g.e]);
    const take = (a, b) => { gaps = gaps.flatMap(([x, y]) => b <= x || a >= y ? [[x, y]] : [[x, a], [b, y]].filter(([p, q]) => q - p >= 5 * MIN)); };
    const room = (after) => gaps.map(([x, y]) => [Math.max(x, after), y]).filter(([x, y]) => y > x);
    const okStart = s => !o.latest || s <= +o.latest;
    const put = (id, s, min) => { const b = basic(id, o.mode, o.wd), e = s + min * MIN; out.push({ id, t:b.t, s:new Date(s), e:new Date(e), min }); take(s, e); return e; };
    if (o.morning !== false && !(have.caney && have.domestics)) {
      const after = +(o.breakfastEnd || o.wake || o.now || 0);
      const need = o.breakfastEnd ? CANEY.min : 25;
      let at = after;
      if (!have.caney) {
        const g = room(after).find(([x, y]) => y - x >= need * MIN && okStart(x));
        if (g) at = put("caney", g[0], CANEY.min);
      }
      if (!have.domestics) {
        const want = basic("domestics", o.mode, o.wd).min, R = room(at).filter(([x]) => okStart(x));
        const fit = R.find(([x, y]) => y - x >= want * MIN);
        if (fit) put("domestics", fit[0], want);
        else {
          const big = R.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]) || a[0] - b[0])[0], len = big ? Math.floor((big[1] - big[0]) / (5 * MIN)) * 5 : 0;
          if (len >= 15) { put("domestics", big[0], len); notes.push({ id:"domestics", t:`Domestics is ${len} min today, not ${want}: that is all the room there is this morning. Do the top of the list.` }); }
          else notes.push({ id:"domestics", t:`No room for Domestics this morning (it needs ${want} min).` });
        }
      }
    }
    if (o.bed && !have.winddown && +o.bed > +(o.now || 0)) {
      const wdn = windDown(o.mode), bed = +o.bed;
      let s = Math.max(bed - wdn.min * MIN, +(o.now || 0));
      (o.busy || []).forEach(([a, b]) => { if (b > s && a < bed) s = Math.max(s, Math.min(b, bed)); });
      s = Math.ceil(s / (5 * MIN)) * 5 * MIN;
      const len = Math.round((bed - s) / MIN);
      if (len >= 10) { out.push({ id:"winddown", t:"Wind-down", s:new Date(s), e:new Date(bed), min:len });
        if (len < wdn.min) notes.push({ id:"winddown", t:`Wind-down is ${len} min tonight, not ${wdn.min}: something runs until ${len} min before bed.` }); }
      else notes.push({ id:"winddown", t:"No room for the Wind-down before bed tonight." });
    }
    return { place: out, notes };
  }

  /* A Caney block placed today at the old 10 min grows to 15 on the next refresh, in place (no second block).
     Only one that has not started (its start is still ahead and started(a) is false: not ticked, not closed).
     A Domestics that begins right where the old Caney ended (and has not started) moves 5 min later with it,
     same length; if that runs into something fixed in busy ([[s ms, e ms]], not the basics) it keeps its end
     and starts 5 min later, as long as 15 min are left. When neither fits, or something fixed sits in the
     5 min after Caney, Caney stays at 10 rather than overlap. adds: today's edit-layer adds, changed in place.
     Only matters on 2026-10-16 (adds are today-only); any 10 min Caney counts as the old one.
     Returns how many Caney blocks it grew. */
  function growCaney(adds, now, started, busy){
    let n = 0;
    const ahead = a => Date.parse(a.s) > +now && !started(a), shift = (CANEY.min - CANEY_OLD) * MIN;
    const blocked = (x, y) => (busy || []).some(([p, q]) => p < y && q > x);
    (adds || []).forEach(c => {
      if (c.basic !== "caney" || !ahead(c) || Date.parse(c.e) - Date.parse(c.s) !== CANEY_OLD * MIN) return;
      const oldE = Date.parse(c.e), newE = oldE + shift;
      const d = adds.find(a => a.basic === "domestics" && Date.parse(a.s) === oldE);
      if (d && !ahead(d)) return;   // Domestics already under way right after it: no room to grow
      if (!d) {
        if (blocked(oldE, newE) || adds.some(a => a !== c && Date.parse(a.s) < newE && Date.parse(a.e) > oldE)) return;
      } else {
        const de = Date.parse(d.e);
        if (!blocked(de, de + shift)) d.e = new Date(de + shift).toISOString();
        else if (de - newE < 15 * MIN) return;
        d.s = new Date(newE).toISOString();
      }
      c.e = new Date(newE).toISOString(); n++;
    });
    return n;
  }

  /* Fill it: what fits a free slot of `min` minutes, in this order: basics not yet on today's plan, practices,
     short tasks, then Rest (the slot, at most 30 min). Each candidate is { id, t, min, ... }. */
  function fitList(min, c){
    const fits = (xs, kind, n) => (xs || []).filter(x => x.min > 0 && x.min <= min).slice(0, n).map(x => ({ ...x, kind }));
    return fits(c.basics, "basic", 3).concat(fits(c.practices, "practice", 3), fits(c.tasks, "task", 3),
      [{ kind:"rest", id:"rest", t:"Rest", min:Math.min(min, 30) }]);
  }

  // "shower 15" -> { t:"Shower", min:15 }; no number means 15 min
  function parseQuick(text){
    const m = /^(.*?)(?:\s+(\d{1,3})\s*(?:m|min|mins|minutes)?)?\s*$/i.exec(String(text || "").trim());
    const t = m ? m[1].trim() : "";
    if (!t || /^\d+$/.test(t)) return null;
    const min = m[2] ? Math.max(5, Math.min(240, +m[2])) : 15;
    return { t: t[0].toUpperCase() + t.slice(1), min };
  }

  root.QuestBasics = { domestics, windDown, basic, guessMode, placeBasics, growCaney, fitList, parseQuick, IDS:["caney", "domestics", "winddown"] };
})(typeof window !== "undefined" ? window : globalThis);
