/* Quest agenda: the calendar column's rules, kept out of quest.html so they can be tested
   (node --test still/test). Junyan, 2026-10-14: "Instead of change course, be able to change
   things directly on the calendar shown", an agenda from yesterday to 3 days ahead in one
   scroll that opens on now, and blocks that move and stretch like Apple Calendar.
   Every function is pure: blocks are { s:Date, e:Date, t, id?, calId?, key?, type?, kind? }. */
(function (root) {
  const MIN = 60000, HR = 3600000;

  // "2026-10-14" plus n days, by the calendar date alone (no clock, no zone)
  function addDays(ymd, n){
    const [y, m, d] = ymd.split("-").map(Number), x = new Date(Date.UTC(y, m - 1, d + n));
    return x.toISOString().slice(0, 10);
  }
  // yesterday, today and the three days after it
  const agendaDays = today => [-1, 0, 1, 2, 3].map(n => addDays(today, n));

  /* One list from the game's own day (game: true, carries its edits and check-ins) and the plans of
     the other days. Neighbouring days' plans share the events that cross midnight, and the game day
     can already hold early blocks of the next day, so an event shows once: by its calendar id when it
     has one, else by start and title. The game's copy wins. */
  function mergeAgenda(game, others){
    const seen = new Set(), out = [];
    const sig = b => b.id ? "id:" + b.id : "st:" + (+new Date(b.s)) + "|" + b.t;
    for (const b of game) { seen.add(sig(b)); out.push({ ...b, game:true }); }
    for (const list of others) for (const b of list || []) {
      const k = sig(b); if (seen.has(k)) continue;
      seen.add(k); out.push({ ...b, s:new Date(b.s), e:new Date(b.e), game:false });
    }
    return out.sort((x, y) => x.s - y.s || x.e - y.e);
  }

  // 15 minutes divides every real time zone offset, so snapping the instant snaps the wall clock too
  const snap = (ms, step = 15) => Math.round(ms / (step * MIN)) * step * MIN;

  /* Where a drag leaves a block. mode: "move" keeps its length, "top" moves the start, "bottom"
     the end. dy is pixels dragged, pxh pixels per hour. A block is never shorter than one step. */
  function dragResult(mode, s, e, dy, pxh, step = 15){
    const dt = dy / pxh * HR, len = +e - +s, min = step * MIN;
    if (mode === "move") { const ns = snap(+s + dt, step); return { s:new Date(ns), e:new Date(ns + len) }; }
    if (mode === "top") return { s:new Date(Math.min(snap(+s + dt, step), +e - min)), e:new Date(+e) };
    return { s:new Date(+s), e:new Date(Math.max(snap(+e + dt, step), +s + min)) };
  }

  /* Can this block be dragged, and where would the change be saved?
     "cal"  a Google Calendar event (Joint Plans or Junyan): the change goes to the calendar
     "day"  a block that lives only in today's plan (added in Quest): saved for today only
     "free" open space and breathers: they are the gaps between things, not things
     "lock" cannot be saved from here; why says so, in his words
     ctx: { paired, dry }. */
  function dragKind(b, ctx){
    if (!b || b.kind === "open" || b.kind === "break" || b.type === "break" || b.type === "focus") return { kind:"free" };
    if (ctx.dry) return { kind: b.id && b.calId ? "cal" : "day", dry:true };
    if (b.id && b.calId) return ctx.paired ? { kind:"cal" } : { kind:"lock", why:"Pair this device in ⚙️ to change the calendar from here." };
    if (b.game) return { kind:"day" };
    return { kind:"lock", why:"This block is not in a calendar, so it cannot be moved from here." };
  }

  /* Blocks that overlap share the width: each gets a lane and the number of lanes in its group. */
  function lanes(items){
    const ev = items.slice().sort((p, q) => p.s - q.s);
    let open = [], group = [], end = 0;
    const close = () => { group.forEach(x => x.n = open.length); group = []; open = []; };
    for (const x of ev) {
      if (group.length && x.s >= end) close();
      let L = open.findIndex(e => e <= x.s); if (L < 0) { L = open.length; open.push(0); }
      open[L] = x.e; x.lane = L; group.push(x); end = Math.max(end, x.e);
    }
    close();
    return ev;
  }

  /* A change waiting for the calendar to agree: shown at its new place until the plan read back has
     it there, or for 3 minutes (the plan is cached for one), whichever comes first. */
  function applyPending(list, pend, t){
    return list.map(b => {
      const p = pend[b.id ? "id:" + b.id : b.key];
      if (!p || t - p.at > 3 * MIN) return b;
      if (+b.s === +p.s && +b.e === +p.e) return b;
      return { ...b, s:new Date(p.s), e:new Date(p.e), pending:true };
    });
  }

  root.QuestAgenda = { addDays, agendaDays, mergeAgenda, snap, dragResult, dragKind, lanes, applyPending };
})(typeof window !== "undefined" ? window : globalThis);
