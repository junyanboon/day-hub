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
  /* Dr Ellie in Domestics and Grooming is always the morning routine, at any hour; the night one lives only in the
     Wind-down (Junyan, 2026-10-19: "dr ellie should be am in the morning. Wind down is where dr ellie pm should reside").
     It used to turn into the PM routine after 2 PM (d11). */
  const DR_AM = { t:"Dr Ellie AM mouth care", h:"mouthAm" };
  const WASH = { t:"Shower, face wash, moisturizer with SPF, dress", h:"shower" };
  // at home only (Junyan, 2026-10-19: "not when I travel but yes when I'm at home")
  const COPPER = { t:"Clean the copper pot and bless the water", h:"copper", home:true, skip:true };
  // Mon to Fri at home: one bigger job a day
  const PLUS = { 1:"Vacuum", 2:"Iron", 3:"Deep-clean the kitchen", 4:"Deep-clean the bathroom", 5:"Deep-clean the bedroom (sheets, surfaces)" };
  const CANEY = { id:"caney", t:"Go over the day with Caney", min:15 }, CANEY_OLD = 10;

  // wd: 0 Sunday to 6 Saturday, the game day's weekday
  function domestics(mode, wd){
    if (mode === "travel") return { min:25, steps:[DR_AM, WASH, { t:"Tidy the room" }] };
    const steps = [{ t:"Wash the dishes" }, { t:"Sweep" }, DR_AM, WASH, COPPER];
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
  /* Morning Yoga (Junyan, 2026-10-19, d6: "let's change it back to giving prana based on the yogas that were
     performed"). A yoga or sadhana block is a checklist of what he did; each tick pays that practice once, and the
     block's length no longer matters. Neem and turmeric and the lamp are ticked here too. */
  const YOGA = [["shambhavi", "Shambhavi"], ["surya", "Surya Kriya"], ["angam", "Angamardana"], ["yogasana", "Yogasanas"],
    ["upa", "Upa Yoga"], ["bhuta", "Bhuta Shuddhi"], ["kriya", "Isha Kriya"], ["nadi", "Nadi Shuddhi"],
    ["neem", "Neem and turmeric"], ["lamp", "Light the oil lamp"]];
  /* What each practice pays, exactly (Junyan, 2026-10-19, d25 and d26). No level multiplier and no smaller second
     tick: the number on the tile is the number he gets. Tuned so a strong day (Shambhavi, one long practice, Bhuta
     Shuddhi, the lamp, neem, and some pranic food) lands at about 71. */
  const PRACTICE_PAY = { angam:25, yogasana:25, shambhavi:20, surya:20, kriya:10, bhuta:8, upa:5, nadi:4, lamp:3, neem:3 };
  // n: how many already counted today, max: the daily limit. null: not a practice (the page's own rule applies)
  const practicePay = (id, n, max) => (id in PRACTICE_PAY ? (n >= max ? 0 : PRACTICE_PAY[id]) : null);
  // the supplements moved to the meal quiz (Junyan, 2026-10-19: "I actually take these after my meal usually as my
  // stomach can't handle them otherwise")
  const yoga = () => ({ min:60, steps: YOGA.map(([h, t]) => ({ t, h })) });
  // a Grooming or Shower block on the calendar: the body care, and the copper pot at home
  function groom(mode){
    const steps = [DR_AM, WASH, COPPER];
    return { min:20, steps: mode === "travel" ? steps.filter(x => !x.home) : steps };
  }
  /* one basic by id: { id, t, min, steps, habit }. The checklist's steps carry the Prana actions they pay (h), so
     ticking a step pays it; Done only closes the block (habit is null since 2026-10-19). "yoga" and "groom" are
     never placed by the plan: they come from calendar blocks with those titles (blockBasic). */
  function basic(id, mode, wd){
    if (id === "caney") return { ...CANEY, steps:[], habit:null };
    if (id === "domestics") return { id, t:"Domestics", ...domestics(mode, wd), habit:null };
    if (id === "winddown") return { id, t:"Wind-down", ...windDown(mode), habit:null };
    if (id === "yoga") return { id, t:"Morning Yoga", ...yoga(), habit:null };
    if (id === "groom") return { id, t:"Grooming", ...groom(mode), habit:null };
    return null;
  }
  /* Which checklist a calendar block opens, from its title (Junyan, 2026-10-19, d6 d9 d11). Wind-down first
     ("Wind down, shower" is the evening one), then Domestics, then the yoga and sadhana practices, then grooming.
     Yoga Nidra and NSDR are rest, not practice. */
  function blockBasic(title, kind){
    const t = String(title || "");
    if (/wind.?down/i.test(t)) return "winddown";
    if (/\bdomestics?\b/i.test(t)) return "domestics";
    if (/nidra|nsdr/i.test(t)) return null;
    if (/yoga|sadhana|shambhavi|mahamudra|kriya|angamardana|yogasana|hatha|bhuta shuddhi|nadi shuddhi/i.test(t) || kind === "practice") return "yoga";
    if (/groom|shower/i.test(t)) return "groom";
    return null;
  }
  /* the Prana action a step pays at this hour, and its label. A step with a pm part turns into it from 2 PM to the end
     of the game day (4 AM). No step has one since Dr Ellie stayed AM (2026-10-19); kept for the shape. */
  const stepAt = (st, hour) => st && st.pm && (hour >= 14 || hour < 4) ? { ...st, ...st.pm } : st;
  /* What a step's tile shows: what it paid, when that differs from what it pays now. Today's Domestics may hold a
     Dr Ellie PM tick from before Dr Ellie stayed AM: it keeps showing PM with its amount, and its untick takes back
     exactly that (tickStep reads the paid record). */
  const stepShown = (st, paid) => paid && paid.h && st && paid.h !== st.h ? { ...st, h:paid.h } : st;
  /* The icon on a step's tile when the step pays nothing (d23: every step is a tile). First match wins. */
  const ICONS = [[/dish|kitchen/i, "🍽️"], [/sweep|vacuum/i, "🧹"], [/tidy|bedroom|sheets/i, "🛏️"], [/iron/i, "👔"], [/bathroom/i, "🛁"],
    [/deathbed|how today went|bedtime/i, "🌙"], [/read|stretch|quiet/i, "📖"], [/phone|screen/i, "📵"], [/shower/i, "🚿"],
    [/face|cream|moistur/i, "🧴"], [/lamp/i, "🪔"], [/pack|bring|passport|bag/i, "🎒"], [/book|ticket|reserve|confirm/i, "🎟️"],
    [/call|text|email|message/i, "📞"], [/water|bottle/i, "💧"], [/eat|food|snack|meal/i, "🥗"], [/shoe|cloth|wear|dress/i, "👟"],
    [/map|route|directions|leave|drive|uber|transit/i, "🗺️"], [/charge|battery/i, "🔋"], [/learn|watch|video|practice|warm/i, "🎯"]];
  const stepIcon = t => (ICONS.find(([re]) => re.test(String(t || ""))) || [null, "✅"])[1];
  /* What ticking step i of a block pays. W: that block's { tick, paid } (G.day.work[key]); all: every block's W today;
     kind: the block's basic id. A step pays once per kind a day (the lamp: once in Morning Yoga and once in the
     Wind-down, d9) and never past the habit's daily limit (gain(h) is 0 then). Unticking takes back exactly what
     that tick paid (Junyan, 2026-10-19, d28), the way a meal tile does: back is the paid record, and the page counts it
     off in G.day.voided (habits only ever go up when two devices merge). A tick that paid nothing takes nothing back.
     Returns { on, pay:{ h, d, kind } | null, back:{ h, d, kind, at } | null, why }. */
  function tickStep(W, all, kind, i, st, hour, gain){
    const on = !(W.tick || {})[i];
    if (!on) { const p = (W.paid || {})[i]; return { on, pay:null, back: p && p.d ? p : null, why:"" }; }
    if ((W.paid || {})[i]) return { on, pay:null, back:null, why:"paid" };
    const s = stepAt(st, hour), h = s && s.h; if (!h) return { on, pay:null, why:"" };
    const had = Object.values(all || {}).some(w => w && Object.values(w.paid || {}).some(p => p && p.h === h && p.kind === kind));
    if (had) return { on, pay:null, why:"done" };
    const d = gain(h); if (!d) return { on, pay:null, why:"full" };
    return { on, pay:{ h, d, kind }, why:"" };
  }
  /* Writes one tap into the block's W: the tick, what it paid (with the time, so its take-back has a key), and when
     this step last changed (W.t), so two devices merge each step on its own and the later change wins (quest-merge.js).
     A take-back removes the paid record; a later tick can pay it again. */
  function applyTick(W, i, r, at){
    W.tick = W.tick || {}; W.paid = W.paid || {}; W.t = W.t || {};
    if (r.on) W.tick[i] = true; else delete W.tick[i];
    if (r.pay) W.paid[i] = { ...r.pay, at };
    if (r.back) delete W.paid[i];
    W.t[i] = at;
    return W;
  }
  /* How many times habit h counts as done today. A checklist tick's payment lives on its own step (W.paid[i] with a
     time, "at"), and the step merges by itself across devices (quest-merge.js mergeWork), so those ticks are counted
     from the live paid records and never touch G.day.habits: a counter merged by max lost a tick on one device when
     the other device took a different tick back (review of d28). Everything else (meals, the timed rule, paid
     records from an older page, which have no time) still counts in habits less voided. */
  function liveTicks(work, h){
    let n = 0;
    for (const W of Object.values(work || {})) for (const p of Object.values((W && W.paid) || {})) if (p && p.at && p.h === h) n++;
    return n;
  }
  function habitCount(day, h){
    const d = day || {};
    return Math.max(0, ((d.habits || {})[h] || 0) - ((d.voided || {})[h] || 0)) + liveTicks(d.work, h);
  }
  // log line keys: a pay names its tick (block, step, tick time); its take-back names the same tick, so two devices
  // that take back the same tick write it once (quest-merge.js onceKey). An older paid record has no tick time: its
  // take-back is keyed by the untick time instead.
  const payKey = (blockKey, i, at) => `pay:${blockKey}:${i}:${at}`;
  const backKey = (blockKey, i, p, at) => `back:${blockKey}:${i}:${(p && p.at) || "u" + at}`;
  /* One tap on a checklist tile, applied to the day (G.day): ticks or unticks step i of block blockKey, at time at.
     Returns { r, W, pay:{ h, d, kind, k } | null, back:{ h, d, kind, k } | null }; the page writes pay and back to the
     log with their keys. Only an older paid record's take-back goes in day.voided (it was counted in habits). */
  function tapDay(day, blockKey, kind, i, st, hour, gain, at){
    const work = (day.work = day.work || {}), W = (work[blockKey] = work[blockKey] || { tick:{}, goal:"" });
    const r = tickStep(W, work, kind, i, st, hour, gain);
    applyTick(W, i, r, at);
    if (r.back && !r.back.at) (day.voided = day.voided || {})[r.back.h] = (day.voided[r.back.h] || 0) + 1;
    return { r, W, pay: r.pay ? { ...r.pay, k:payKey(blockKey, i, at) } : null,
      back: r.back ? { h:r.back.h, d:r.back.d, kind:r.back.kind, k:backKey(blockKey, i, r.back, at) } : null };
  }
  /* The take-backs the log still owes, checked after every merge: a checklist pay line whose tick is no longer live
     on its step and that has no take-back yet. That covers an untick on a device that never saw the re-tick (its
     take-back names the first tick, which was already taken back), and two devices that ticked the same step (the
     later tick wins the step, the other pay comes back). Returns [{ k, xp, m, msg }], keys as backKey writes them. */
  function owedBacks(work, log){
    const L = Array.isArray(log) ? log : [], keys = new Set(L.map(e => e && e.k).filter(Boolean)), out = [];
    for (const e of L) {
      const k = String((e && e.k) || ""); if (!k.startsWith("pay:") || k.length < 30) continue;
      const at = k.slice(-24), pre = k.slice(4, -25), c = pre.lastIndexOf(":"), blk = pre.slice(0, c), i = pre.slice(c + 1);
      const p = ((((work || {})[blk]) || {}).paid || {})[i];
      if (p && p.at === at) continue;   // still ticked: it stays paid
      const bk = `back:${blk}:${i}:${at}`; if (keys.has(bk)) continue;
      keys.add(bk); out.push({ k:bk, xp:-(+e.xp || 0), m:e.m, msg:e.msg || "" });
    }
    return out;
  }
  /* The barefoot walk (Junyan, 2026-10-19, d27): a tile in the check-in that opens after a walk, hike or other outdoor
     block ends. It pays the barefoot habit (its value, once a day, into prana) the same way a checklist tile does.
     Whole words only, so "Call with Hillary", "Madison Square Garden", "Parks Canada" or "Trailer" never match. */
  const OUTDOOR = /\b(walks?|walking|hikes?|hiking|treks?|trekking|beach|forest|trails?|sandboard(ing)?|picnic|camping|meadow)\b|\b(in|at|to) the park\b|\bpark walk\b|\bnational park\b|\bbotanical gardens?\b|\bdesert (tour|safari|walk)\b|^(park|garden)\b/i;
  const outdoorBlock = title => OUTDOOR.test(String(title || ""));
  const barefootStep = () => ({ t:"Walk barefoot on natural ground: soil, grass or sand", h:"barefoot" });
  // what a block's ticks paid: { p, b } by meter (meter(h) is "p" or "b")
  function paidOf(W, meter){
    let p = 0, b = 0;
    for (const x of Object.values((W && W.paid) || {})) if (x && x.d) { if (meter(x.h) === "b") b += x.d; else p += x.d; }
    return { p, b };
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

  /* The tap symbol on a calendar block (Junyan, 2026-10-19, d32: "If I haven't clicked on the block then there can be a
     symbol to indicate for me to click on it"). Only a block with its own list, once it has started, and until he opens
     it: an open on any device (day.opened, merged from both), a ticked tile or a tapped meal tile all count. */
  function unopened(day, key, hasList, started){
    if (!hasList || !started || !key) return false;
    const d = day || {}, W = (d.work || {})[key];
    if ((d.opened || {})[key] || (d.mealq || {})[key]) return false;
    return !(W && (Object.values(W.tick || {}).some(Boolean) || Object.keys(W.paid || {}).length));
  }

  // "shower 15" -> { t:"Shower", min:15 }; no number means 15 min
  function parseQuick(text){
    const m = /^(.*?)(?:\s+(\d{1,3})\s*(?:m|min|mins|minutes)?)?\s*$/i.exec(String(text || "").trim());
    const t = m ? m[1].trim() : "";
    if (!t || /^\d+$/.test(t)) return null;
    const min = m[2] ? Math.max(5, Math.min(240, +m[2])) : 15;
    return { t: t[0].toUpperCase() + t.slice(1), min };
  }

  root.QuestBasics = { PRACTICE_PAY, practicePay, domestics, windDown, yoga, groom, basic, blockBasic, stepAt, stepShown, stepIcon, tickStep, applyTick, tapDay, owedBacks, liveTicks, habitCount, payKey, backKey, outdoorBlock, barefootStep, unopened, paidOf, guessMode, placeBasics, growCaney, fitList, parseQuick, IDS:["caney", "domestics", "winddown"] };
})(typeof window !== "undefined" ? window : globalThis);
