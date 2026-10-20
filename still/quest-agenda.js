/* Quest agenda: the calendar column's rules, kept out of quest.html so they can be tested
   (node --test still/test). Junyan, 2026-10-14: "Instead of change course, be able to change
   things directly on the calendar shown", an agenda from yesterday to 3 days ahead in one
   scroll that opens on now, and blocks that move and stretch like Apple Calendar.
   Every function is pure except addKey (it reads the clock and a counter): blocks are { s:Date, e:Date, t, id?, calId?, key?, type?, kind? }. */
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

  /* A booking (a car rental, a stay: anything over 12 hours, or a whole-day event) is not a block of his
     time, so the day column leaves it out and real blocks keep their full width (Junyan, 2026-10-20, d71). */
  const isLong = x => +x.e - +x.s > 12 * MIN * 60;
  function timelineLanes(items){ return lanes(items.filter(x => !isLong(x.st || x))); }

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

  /* ---------- Your move: pick from a list (Junyan, 2026-10-14, d10 "A", d7 and d8) ----------
     Tap a free stretch, pick one thing, and it goes on today's plan (the /ops layer, never Google
     Calendar). One block per task per day: picking it again moves its block. */

  // where a pick lands: now rounded up to 5 minutes if the gap has begun, else the gap start;
  // the task's estimate, at least 15 minutes, never past the gap end
  function pickSpan(gs, ge, t, est){
    const s = +t > +gs ? Math.ceil(+t / (5 * MIN)) * 5 * MIN : +gs;
    return { s:new Date(s), e:new Date(Math.min(s + Math.max(+est || 0, 15) * MIN, +ge)) };
  }

  // a key no other block has, even one added at the same minute ("x<start ms>" alone collided)
  let seq = 0;
  const addKey = s => "x" + (+s) + "-" + (Date.now() % 1e6).toString(36) + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);

  // is this added block the same task as the pick? A Notion task by its id; anything else by name
  const samePick = (a, p) => p.taskId ? a.taskId === p.taskId
    : !a.taskId && ((p.pickId && a.pickId === p.pickId) || (a.t || "").trim().toLowerCase() === (p.t || "").trim().toLowerCase());

  /* Put a pick on today's adds. p: { t, s, e, taskId?, pickId? }. Returns the new list (the given one is
     left alone), the key of the block, whether it moved, and what it replaced (for Undo).
     done(a) says a block is already history (it has ended, or was checked in): it stays where it
     happened, so this morning's Walk is not pulled to the evening with its check-in. */
  function placePick(adds, p, key, done = () => false){
    const before = adds.filter(a => samePick(a, p) && !done(a)).map(a => ({ ...a }));
    const s = new Date(p.s).toISOString(), e = new Date(p.e).toISOString();
    const extra = { ...(p.taskId ? { taskId:p.taskId } : {}), ...(p.pickId ? { pickId:p.pickId } : {}) };
    if (before.length) {
      const k = before[0].key, gone = new Set(before.slice(1).map(a => a.key));
      const out = adds.filter(a => !gone.has(a.key)).map(a => a.key === k ? { ...a, s, e, ...extra } : a);
      return { adds:out, key:k, moved:true, before };
    }
    return { adds:adds.concat([{ key, s, e, t:p.t, type:"task", cal:"you", ...extra }]), key, moved:false, before:[] };
  }
  // put today's adds back the way they were before the pick
  function undoPick(adds, r){
    const back = new Set([r.key, ...r.before.map(a => a.key)]);
    return adds.filter(a => !back.has(a.key)).concat(r.before.map(a => ({ ...a })));
  }

  /* A block added in Quest uses up the open space it covers, so no "Your move" is drawn under or
     beside it (before, the open space stayed underneath and split around it, which looked like a
     copy). Calendar events are left to the planner. Leftover pieces under 5 minutes go. */
  function carveFree(list){
    const isFree = b => b.kind === "open" || b.kind === "break";
    const taken = list.filter(b => b.extra && !isFree(b)).map(b => [+b.s, +b.e]).sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const b of list) {
      if (!isFree(b) || !taken.length) { out.push(b); continue; }
      let pieces = [[+b.s, +b.e]];
      for (const [ts, te] of taken) pieces = pieces.flatMap(([s, e]) => te <= s || ts >= e ? [[s, e]]
        : [[s, Math.min(e, ts)], [Math.max(s, te), e]].filter(([x, y]) => y - x >= 5 * MIN));
      // each piece gets its own key (the one at the stretch's start keeps the original), so check-ins and
      // the calendar never mistake two pieces for one block
      for (const [s, e] of pieces) out.push(s === +b.s && e === +b.e ? b
        : { ...b, s:new Date(s), e:new Date(e), ...(s === +b.s ? {} : { key:(b.key || "free") + "@" + s }) });
    }
    return out.sort((x, y) => x.s - y.s || x.e - y.e);
  }

  /* ---------- nothing overlaps (Junyan, 2026-10-19, d30 d31) ----------
     "I don't want the calendar to be able to have anything overlap." Open space and breathers are the gaps
     between things, so they never count. */
  const isGap = b => b.kind === "open" || b.kind === "break" || b.type === "break" || b.type === "focus";
  const byStart = (x, y) => x.s - y.s || x.e - y.e;
  // every pair of blocks that overlap, [[first, second], ...] by start; touching (one ends as the next starts) is fine
  function overlaps(list){
    const xs = list.filter(b => !isGap(b)).sort(byStart), out = [];
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length && +xs[j].s < +xs[i].e; j++) out.push([xs[i], xs[j]]);
    return out;
  }
  /* ---------- nothing overlaps, and only his block moves (Junyan, 2026-10-19) ----------
     "don't push any plans only move the things that I'm moving on the calendar specifically", "nothing should be
     pushed". The rule holds among Joint Plans events and blocks added in Quest (d40: "the other calendars don't conflict
     with this one"); Junyan calendar events overlap anything. An event over 12 hours is a booking (a stay, a car), not
     a block: left out. */
  const JOINT = "fm1c5usrdr4n94qfla41lplg50@group.calendar.google.com";
  const JUNYAN = "c647a75387b94bd045b4e6ec216b3b42585b37c057c8ec35b54dbc9bf6230f1a@group.calendar.google.com";
  // the calendars Day Quest can add to (still-api's CALS), the default first (d41)
  const ADD_CALS = [{ id:JOINT, name:"Joint Plans" }, { id:JUNYAN, name:"Junyan" }];
  const onJoint = b => !!b && (b.calId === JOINT || (!b.calId && b.cal === "Joint Plans"));
  const inRoom = b => !!b && !isGap(b) && (onJoint(b) || !!b.extra) && +b.e - +b.s <= 12 * HR;
  /* Where the block he moves or adds goes. moved: { key, id?, calId? | extra?, s, e } at the place he put it. If it lands
     on another Joint Plans or Quest block, it starts at the next 15-minute mark after that one ends, and again after
     whatever it lands on there, until a gap fits its length. Past bedtime is fine (d31). Nothing else moves. A block
     outside the Joint Plans world stays where he put it. Returns { s, e, hit } (hit: the block it first landed on, or
     null when it stays). */
  function freeSlot(list, moved, step = 15){
    const s0 = +moved.s, len = +moved.e - s0, stay = { s:new Date(s0), e:new Date(+moved.e), hit:null };
    if (!inRoom(moved)) return stay;
    const q = step * MIN, up = ms => Math.ceil(ms / q) * q;
    const others = list.filter(b => inRoom(b) && b.key !== moved.key && !(moved.id && b.id === moved.id));
    let s = s0, hit = null;
    for (let n = 0; n < 500; n++) {
      const on = others.filter(b => +b.s < s + len && +b.e > s);
      if (!on.length) return { s:new Date(s), e:new Date(s + len), hit };
      hit = hit || [...on].sort(byStart)[0];
      s = up(Math.max(...on.map(b => +b.e)));
    }
    return stay;
  }

  /* A drag of one edge of a block (Junyan, 2026-10-19, d51: "the end stops at the next block's start. The block doesn't
     jump"). moved: the block with its new s and e; mode "bottom" (the end moved) or "top" (the start moved); was: the
     block before the drag. The end stops at the start of the first Joint Plans or Quest block that begins after the
     block's start; the start stops at the end of the latest one that began before it. It never shrinks the block past
     where it was (one that already overlapped stays as it was). Nothing else moves. Returns { s, e, hit }. */
  function clampEdge(list, moved, mode, was){
    let s = +moved.s, e = +moved.e, hit = null;
    if (!inRoom(moved)) return { s:new Date(s), e:new Date(e), hit };
    const others = list.filter(b => inRoom(b) && b.key !== moved.key && !(moved.id && b.id === moved.id));
    if (mode === "bottom") {
      const nx = others.filter(b => +b.s > s && +b.s < e).sort(byStart)[0];
      if (nx && Math.max(+nx.s, +was.e) < e) { e = Math.max(+nx.s, +was.e); hit = nx; }
    } else if (mode === "top") {
      const pv = others.filter(b => +b.s < +was.s && +b.e > s).sort((x, y) => +y.e - +x.e)[0];
      if (pv && Math.min(+pv.e, +was.s) > s) { s = Math.min(+pv.e, +was.s); hit = pv; }
    }
    return { s:new Date(s), e:new Date(e), hit };
  }

  // "7:25 PM" and "7:40 PM" read "7:25 to 7:40 PM"
  function rangeText(a, b){
    const m = /\s?([AP]M)$/i, x = a.match(m), y = b.match(m);
    return x && y && x[1] === y[1] ? `${a.replace(m, "")} to ${b}` : `${a} to ${b}`;
  }

  root.QuestAgenda = { addDays, agendaDays, mergeAgenda, snap, dragResult, dragKind, lanes, isLong, timelineLanes, applyPending,
    pickSpan, addKey, samePick, placePick, undoPick, carveFree, rangeText, overlaps, freeSlot, clampEdge,
    JOINT, JUNYAN, ADD_CALS, onJoint, inRoom };
})(typeof window !== "undefined" ? window : globalThis);
