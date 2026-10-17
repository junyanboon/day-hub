/* Quest offline: what Day Quest shows and keeps when the phone has no internet (Junyan, 2026-10-17, Madrid:
   "when the internet is down it doesn't work. Is there a way to fix this"). Kept out of quest.html so it can be
   tested (node --test still/test). Every function is pure.
   - savedDay: the last day this phone saw, for the day the clock says it is now. The same day as the saved one
     shows as it was saved, however old; a later day comes from the agenda saved with it (yesterday to 3 ahead).
   - the edit-layer outbox: a calendar edit made offline (a Your move pick, a moved or dropped block) waits on the
     phone, one copy per day, until /ops takes it. The server keeps whichever copy is newer (ts), as before. */
(function (root) {
  // snap: { at, ymd, plan:{ tz, where, blocks }, ops, tasks, ag:{ ymd: blocks } } as quest.html saves it
  function savedDay(snap, ymd){
    if (!snap || !snap.plan || !Array.isArray(snap.plan.blocks) || !ymd) return null;
    const at = +snap.at || 0, tasks = Array.isArray(snap.tasks) ? snap.tasks : [], ag = { ...(snap.ag || {}) };
    if (snap.ymd === ymd) return { ymd, at, plan:snap.plan, ops:snap.ops || null, tasks, ag };
    const blocks = ag[ymd];
    if (!Array.isArray(blocks)) return null;
    // the saved day becomes one of the agenda's other days, and the new day leaves the agenda list
    if (snap.ymd) ag[snap.ymd] = snap.plan.blocks;
    delete ag[ymd];
    return { ymd, at, plan:{ tz:snap.plan.tz || null, where:snap.plan.where || null, blocks }, ops:null, tasks, ag };
  }

  // out: { "<day key>": { date, ts, edits, drops, adds } }
  const opsBody = (date, ops) => ({ date, ts:ops.ts || 0, edits:ops.edits || {}, drops:ops.drops || [], adds:ops.adds || [] });
  function queueOps(out, date, ops){ return { ...(out || {}), [date]:opsBody(date, ops) }; }
  function pendingOps(out, date){ const o = out && out[date]; return o ? { edits:o.edits || {}, drops:o.drops || [], adds:o.adds || [], ts:o.ts || 0 } : null; }
  // after /ops answered for `sent`: drop it from the outbox, unless a newer edit for that day was queued meanwhile
  function settleOps(out, sent){
    const o = out && out[sent.date];
    if (!o || o.ts !== sent.ts) return out || {};
    const next = { ...out }; delete next[sent.date]; return next;
  }

  // "Offline · calendar from 3:12 PM (4 hr ago)". time: the saved time as he reads it; ago: its age, written out
  function offlineNote(hasPlan, at, time, ago){
    if (!hasPlan) return "Offline · no calendar saved on this phone for today yet";
    return at > 0 ? `Offline · calendar from ${time} (${ago} ago)` : "Offline · showing the saved calendar";
  }

  root.QuestOffline = { savedDay, queueOps, pendingOps, settleOps, offlineNote };
})(typeof window !== "undefined" ? window : globalThis);
