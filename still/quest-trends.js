/* Day Quest trends (Junyan, 2026-10-19, d2 and d5): last night's Oura numbers beside his 7-day average, and the
   day-end "how today went" against his recent days. Display only: nothing here gives or takes points.
   - Oura nights come from still-api /lastnight: [{ day, rhr, hrv, score }], filed under the day he woke up.
     Resting heart rate is the lowest overnight (lower is better); HRV average and sleep score, higher is better.
   - Day history is G.days as [{ day, prana, body, pf, dr }] (pf = pranic foods, dr = drains), oldest first.
   - beatLine picks the one thing to beat tomorrow, in warm plain words (NVC: kind, never blaming).
   Pure, so it can be tested (node --test still/test). */
(function (root) {
  "use strict";
  const OURA = [
    ["rhr", "Resting heart rate", "bpm", "down"],
    ["hrv", "HRV average", "ms", "up"],
    ["score", "Sleep score", "", "up"],
  ];
  const num = (v) => typeof v === "number" && isFinite(v);
  const mean = (xs) => { const v = xs.filter(num); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  // which way it moved and whether that is the good way; within half a point counts as level
  function move(last, avg, better) {
    if (!num(last) || !num(avg)) return { arrow: "", good: null };
    const d = last - avg;
    if (Math.abs(d) < 0.5) return { arrow: "=", good: null };
    return { arrow: d > 0 ? "↑" : "↓", good: (d > 0) === (better === "up") };
  }
  // last night against the 7 nights before it
  function ouraRows(nights, day) {
    const list = (nights || []).filter((n) => n && n.day).sort((a, b) => a.day.localeCompare(b.day));
    const i = list.findIndex((n) => n.day === day);
    const last = i >= 0 ? list[i] : null, before = (i >= 0 ? list.slice(0, i) : list.filter((n) => n.day < day)).slice(-7);
    return OURA.map(([k, label, unit, better]) => {
      const avg = mean(before.map((n) => n[k]));
      const l = last && num(last[k]) ? last[k] : null;
      const seen = before.map((n) => n[k]).concat([l]).filter(num);
      return { k, label, unit, better, last: l, avg: avg == null ? null : Math.round(avg),
        best: seen.length ? (better === "up" ? Math.max : Math.min)(...seen) : null,
        series: before.map((n) => n[k]).concat([l]), ...move(l, avg == null ? null : avg, better) };
    });
  }
  // the value on the calendar day before, or null when that day has none (older days carry no pf or dr)
  function prevDay(list, day, k) {
    const want = new Date(Date.parse(day + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
    const h = list.find((x) => x.day === want);
    return h && num(h[k]) ? h[k] : null;
  }
  // one row of today's results: today, the 7 days before (avg and a sparkline), and the best day in the history
  function dayRow(k, label, history, today, better = "up") {
    const before = (history || []).filter((h) => num(h[k])).slice(-7), t = num(today[k]) ? today[k] : null;
    const all = (history || []).filter((h) => num(h[k])).concat(t == null ? [] : [{ day: today.day, [k]: t }]);
    const pick = better === "up" ? Math.max : Math.min;
    const bestV = all.length ? pick(...all.map((h) => h[k])) : null;
    // a best day needs days to beat, and a best of 0 pranic foods is no best at all
    const best = bestV == null || !before.length || (better === "up" && bestV <= 0) ? null : all.filter((h) => h[k] === bestV).pop();
    const avg = mean(before.map((h) => h[k]));
    return { k, label, better, today: t, avg: avg == null ? null : Math.round(avg * 10) / 10, yesterday: prevDay(before, today.day, k),
      best: best ? { day: best.day, v: bestV, isToday: best.day === today.day } : null, series: before.map((h) => h[k]).concat([t]),
      ...move(t, avg, better) };
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const lc = (x) => String(x || "").toLowerCase();
  const list = (xs) => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
  /* The one thing to beat tomorrow (Junyan, 2026-10-19, d65): his weakest area today among sleep and bedtime, HRV
     against his week, resting heart rate, water against his aim, prana against his week and drains. Each area gets
     a weight for how far off it is; the heaviest wins, and when two are close the day picks between them, so the tip
     varies. Each area has more than one wording, also picked by the day.
     t: { rows (dayRow list), oura (ouraRows), water ({ today, aim }), bedLate (true: asleep after 11 last night),
     drainNames ([labels]), seed (a number for the day) } */
  const pickOf = (arr, seed) => arr[Math.abs(Math.floor(seed || 0)) % arr.length];
  function weakest(t) {
    const r = Object.fromEntries((t.rows || []).map((x) => [x.k, x]));
    const o = Object.fromEntries((t.oura || []).map((x) => [x.k, x]));
    const out = [];
    const sc = o.score, sleepOff = sc && num(sc.last) && num(sc.avg) && sc.last < sc.avg ? (sc.avg - sc.last) / 10 : 0;
    if (t.bedLate || sleepOff > 0) out.push({ area: "sleep", w: (t.bedLate ? 0.6 : 0) + sleepOff, lines: t.bedLate ? [
      "You fell asleep after 11 last night. Lights out by 10:30 tonight gives Body a full start tomorrow.",
      "Last night ran past 11. Phone away an hour before bed tonight and let sleep come early.",
    ] : [
      `Sleep score ${sc.last}, under your week's ${sc.avg}. A dark, cool room and screens off an hour before bed help.`,
      `Sleep score ${sc.last} against your week's ${sc.avg}. A light dinner and an early night tonight bring it back.`,
    ] });
    const hv = o.hrv;
    if (hv && num(hv.last) && num(hv.avg) && hv.avg > 0 && hv.last < hv.avg) out.push({ area: "hrv", w: (hv.avg - hv.last) / hv.avg * 5, lines: [
      `HRV ${hv.last}, under your week's ${hv.avg}. A calm evening and an early night help it come back.`,
      `HRV ${hv.last} against your week's ${hv.avg}. Five minutes of Nadi Shuddhi before bed helps your system settle.`,
    ] });
    const rh = o.rhr;
    if (rh && num(rh.last) && num(rh.avg) && rh.avg > 0 && rh.last > rh.avg) out.push({ area: "rhr", w: (rh.last - rh.avg) / rh.avg * 10, lines: [
      `Resting heart rate ${rh.last}, above your week's ${rh.avg}. A light dinner and bed by 11 help it settle.`,
      `Resting heart rate ${rh.last} against your week's ${rh.avg}. Go easy tomorrow and drink water early.`,
    ] });
    const wt = t.water, aim = (wt && wt.aim) || 8, glasses = wt && num(wt.today) ? wt.today : 0;
    if (wt && glasses < aim) out.push({ area: "water", w: (aim - glasses) / aim, lines: [
      `${plural(glasses, "glass", "glasses")} of water today, your aim is ${aim}. Two glasses before noon tomorrow is a good start.`,
      `Water ended at ${glasses} of ${aim}. Keep a full bottle beside you tomorrow morning.`,
    ] });
    const p = r.prana;
    if (p && num(p.today) && num(p.avg) && p.today < p.avg - 2) out.push({ area: "prana", w: (p.avg - p.today) / 30, lines: [
      `Prana ended at ${p.today}, your week averages ${Math.round(p.avg)}. A sadhana block early tomorrow is the quickest way back up.`,
      `Prana ${p.today} against your week's ${Math.round(p.avg)}. Shambhavi first thing, before the phone, lifts the whole day.`,
    ] });
    const dr = r.dr;
    if (dr && num(dr.today) && dr.today > 0) {
      const names = (t.drainNames || []).map(lc), first = names[0];
      const said = names.length ? list(names) : plural(dr.today, "drain", "drains");
      out.push({ area: "drains", w: dr.today * 0.2 + (dr.yesterday != null && dr.today > dr.yesterday ? 0.2 : 0), lines: [
        `Drains today: ${said}. ${first ? `Skip the ${first}` : "Pick one to skip"} tomorrow to win the day back.`,
        `${names.length ? `${list(names).replace(/^./, (c) => c.toUpperCase())} drained you today` : `${plural(dr.today, "drain", "drains")} today`}. Choose one to leave out tomorrow.`,
      ] });
    }
    return out.sort((a, b) => b.w - a.w);
  }
  function beatLine(t) {
    const seed = num(t.seed) ? t.seed : 0;
    const weak = weakest(t).filter((x) => x.w > 0.1);
    if (weak.length) {
      const close = weak.filter((x) => weak[0].w - x.w <= 0.1);
      const top = pickOf(close, seed);
      return pickOf(top.lines, Math.floor(seed / close.length));
    }
    const p = Object.fromEntries((t.rows || []).map((x) => [x.k, x])).prana;
    if (p && p.best && p.best.isToday && num(p.today)) return `Prana ${p.today} is your best day lately. Same again tomorrow.`;
    if (p && num(p.today) && num(p.avg)) return `Prana ${p.today} against your week's ${Math.round(p.avg)}. Beat ${Math.max(p.today, Math.round(p.avg)) + 1} tomorrow.`;
    return "A new day tomorrow. One sadhana block and one pranic food make a good start.";
  }
  /* One short line of encouragement from his trends (d66): the area that moved most the right way against his week,
     said kindly and specifically. Never a nudge about what went wrong (that is beatLine's job). */
  const CHEER = {
    prana: (x) => `Prana ended at ${x.now}, above your week's ${x.avg}. Your practice is showing.`,
    body: (x) => `Body ended at ${x.now}, above your week's ${x.avg}. You looked after yourself today.`,
    pf: (x) => `${plural(x.now, "pranic food", "pranic foods")} today, more than your week's ${x.avg}. Good eating.`,
    dr: (x) => `${plural(x.now, "drain", "drains")} today, fewer than your week's ${x.avg}. That takes real care.`,
    rhr: (x) => `Resting heart rate ${x.now}, down from your week's ${x.avg}. Your body is recovering well.`,
    hrv: (x) => `HRV ${x.now}, up on your week's ${x.avg}. Your system is calmer.`,
    score: (x) => `Sleep score ${x.now}, better than your week's ${x.avg}. Good rest is paying off.`,
    wt: (x) => `${plural(x.now, "glass", "glasses")} of water, more than your week's ${x.avg}. Nicely done.`,
  };
  function encourage(t) {
    const cand = [];
    const add = (k, now, avg, good) => { if (good === true && num(now) && num(avg) && CHEER[k]) cand.push({ k, now, avg: Math.round(avg * 10) / 10, gain: Math.abs(now - avg) / Math.max(1, Math.abs(avg)) }); };
    for (const x of t.rows || []) add(x.k, x.today, x.avg, x.good);
    for (const x of t.oura || []) add(x.k, x.last, x.avg, x.good);
    if (t.water) add("wt", t.water.today, t.water.avg, t.water.good);
    if (!cand.length) return "You came to the end of your day and looked at it honestly. That is how better days begin.";
    const c = cand.sort((a, b) => b.gain - a.gain)[0];
    return CHEER[c.k]({ ...c, avg: Number.isInteger(c.avg) || Math.abs(c.avg) >= 10 ? Math.round(c.avg) : c.avg.toFixed(1) });
  }
  // the names of what he picked in today's meals, from a list of [id, icon, label]: "Fresh vegetables, raw..." reads "Fresh vegetables"
  const SHORT = { heavy: "Heavy meal", stale: "Leftovers" };
  function namesOf(ids, rows) {
    const out = [];
    for (const id of ids || []) {
      const row = (rows || []).find((x) => x[0] === id);
      const name = SHORT[id] || (row ? String(row[2]).split(/,| \(/)[0] : id === "pos" ? "Pranic food" : null);
      if (name && !out.includes(name)) out.push(name);
    }
    return out;
  }
  /* The done list at the bottom of Day's end (d67): the 3 that mattered most. Sadhana first, then health blocks,
     then the rest, meals and rest blocks last, longer first. A yoga block shows only when a practice was ticked in it.
     items: [{ name, rank (0 sadhana, 1 health, 2 other), mins, yoga, practiced }] */
  function topDone(items, n = 3) {
    return (items || []).filter((x) => !x.yoga || x.practiced)
      .map((x, i) => ({ ...x, i })).sort((a, b) => a.rank - b.rank || b.mins - a.mins || a.i - b.i).slice(0, n).map((x) => x.name);
  }
  /* Past days' Body for the 7-day average and the best (d68). A day's Body is kept only when it was worked out from
     its logged lines (bk), or the day is not one known to hold an unlogged jump (2026-10-19, the merge bug PR 44 fixed). */
  const BAD_BODY = ["2026-10-19"];
  const bodyOk = (day, v) => !!v && (v.bk === 1 || !BAD_BODY.includes(day));

  // a small line of the last days, today as the dot at the end
  function spark(values, colour) {
    const v = (values || []).map((x) => (num(x) ? x : null));
    const pts = v.map((x, i) => [i, x]).filter((p) => p[1] != null);
    if (pts.length < 2) return "";
    const W = 64, H = 18, lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1])), span = hi - lo || 1;
    const X = (i) => Math.round((i / Math.max(1, v.length - 1)) * (W - 4)) + 2, Y = (y) => Math.round(H - 3 - ((y - lo) / span) * (H - 6));
    const d = pts.map(([i, y], j) => `${j ? "L" : "M"}${X(i)},${Y(y)}`).join(" "), [li, ly] = pts[pts.length - 1];
    return `<svg class="tr-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="${colour}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${X(li)}" cy="${Y(ly)}" r="2.2" fill="${colour}"/></svg>`;
  }

  root.QuestTrends = { OURA, mean, move, ouraRows, dayRow, weakest, beatLine, encourage, namesOf, topDone, bodyOk, BAD_BODY, spark };
})(typeof window !== "undefined" ? window : globalThis);
