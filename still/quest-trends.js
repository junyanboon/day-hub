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
  /* The one thing to beat tomorrow. In order: drains crept up, prana ended under his week, fewer pranic foods than
     usual, body ended under his week, last night's heart rate or HRV off his week; else what went well. */
  function beatLine(t) {
    const r = Object.fromEntries((t.rows || []).map((x) => [x.k, x]));
    const o = Object.fromEntries((t.oura || []).map((x) => [x.k, x]));
    const dr = r.dr, pf = r.pf, p = r.prana, b = r.body;
    if (dr && num(dr.today) && dr.today > 0 && (dr.yesterday == null || dr.today > dr.yesterday)) {
      const what = t.topDrain ? `Skip the ${t.topDrain.toLowerCase()} tomorrow` : "Pick one to skip tomorrow";
      return `${plural(dr.today, "drain", "drains")} today${dr.yesterday == null ? "" : ` vs ${dr.yesterday} yesterday`}. ${what} to win the day back.`;
    }
    if (p && num(p.today) && num(p.avg) && p.today < p.avg - 2)
      return `Prana ended at ${p.today}, your week averages ${Math.round(p.avg)}. A sadhana block early tomorrow is the quickest way back up.`;
    if (pf && num(pf.today) && num(pf.avg) && pf.today < pf.avg - 0.5)
      return `${plural(pf.today, "pranic food", "pranic foods")} today, your week averages ${Math.round(pf.avg)}. Add fresh fruit or sprouts to breakfast tomorrow.`;
    if (b && num(b.today) && num(b.avg) && b.today < b.avg - 2)
      return `Body ended at ${b.today}, your week averages ${Math.round(b.avg)}. An earlier night tonight gives tomorrow a better start.`;
    if (o.rhr && o.rhr.good === false)
      return `Your resting heart rate was ${o.rhr.last}, above your week's ${o.rhr.avg}. A light dinner and bed by 11 help it settle.`;
    if (o.hrv && o.hrv.good === false)
      return `Your HRV was ${o.hrv.last}, under your week's ${o.hrv.avg}. Rest and an early night help it recover.`;
    if (p && p.best && p.best.isToday && num(p.today)) return `Prana ${p.today} is your best day lately. Same again tomorrow.`;
    if (p && num(p.today) && num(p.avg)) return `Prana ${p.today} against your week's ${Math.round(p.avg)}. Beat ${Math.max(p.today, Math.round(p.avg)) + 1} tomorrow.`;
    return "A new day tomorrow. One sadhana block and one pranic food make a good start.";
  }
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

  root.QuestTrends = { OURA, mean, move, ouraRows, dayRow, beatLine, spark };
})(typeof window !== "undefined" ? window : globalThis);
