/* ?timing=1 (Junyan, 2026-11-03, d102: the calendar is slow on his paired Mac and shows nothing while it waits):
   when each load step happened, in ms since the page started, on a small readout on screen and in the console
   as "[timing] ...". Off unless ?timing=1, so the page is as before for everyone else.
   create({ search, now, log }): mark(label, why), wrapFetch(fetch) gives a fetch that marks each call's start and
   end (plan, edits, tasks, game state, Oura named), lines() the marks so far, onLine(fn) for the readout. */
(function (root) {
  const NAMES = [[/\/plan\?date=([\d-]+)/, m => "plan " + m[1]], [/\/ops(\?|$)/, () => "edits"], [/\/tasks(\?|$)/, () => "tasks"],
    [/\/quest\/state/, () => "game state"], [/\/(readiness|sleep|lastnight)(\?|$)/, m => "Oura " + m[1]]];
  function nameOf(url){
    const u = String(url && url.url || url);
    for (const [re, f] of NAMES) { const m = u.match(re); if (m) return f(m); }
    return u.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*/, "");
  }
  function create({ search = "", now, log } = {}){
    const on = /[?&]timing=1(&|$)/.test(search), out = [], subs = [];
    const mark = (label, why) => {
      if (!on) return;
      const line = `+${Math.round(now())} ms  ${label}${why ? ": " + why : ""}`;
      out.push(line);
      if (log) log("[timing] " + line);
      subs.forEach(f => { try { f(line); } catch {} });
    };
    function wrapFetch(f){
      if (!on) return f;
      return async function (url, opts){
        const n = nameOf(url) + (opts && opts.method && opts.method !== "GET" ? " " + opts.method : ""), t0 = now();
        mark(n + " start");
        try { const r = await f.apply(this, arguments); mark(`${n} end ${r.status} (${Math.round(now() - t0)} ms)`); return r; }
        catch (e) { mark(`${n} failed: ${e && e.message || e} (${Math.round(now() - t0)} ms)`); throw e; }
      };
    }
    return { on, mark, wrapFetch, lines: () => out.slice(), onLine: f => { subs.push(f); } };
  }
  root.QuestTiming = { create, nameOf };
})(typeof window !== "undefined" ? window : globalThis);
