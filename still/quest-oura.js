/* Oura readiness seeds Body (Junyan, 2026-10-19, d58). Oura often posts today's readiness late in the morning,
   so the page asks again on each load and on coming back to the page (throttled) until today's score arrives.
   A readiness score that arrives later still wins over a "N h" tap or the sleep score, once, and keeps the
   Body changes already taken today: Body = readiness plus today's non-sleep Body changes so far. */
(function(root){
  const RETRY_MS = 10 * 60000;
  // a log line that set Body from sleep (the old ones carry no sl flag: matched by their words)
  const isSleepLine = x => !!x && (x.sl || /^(Slept \d+(\.\d+)? h|Slept \d+ \(Oura\)|Readiness \d+ \(Oura\))$/.test(x.msg || ""));
  // should the page ask Oura now? not once readiness is in for today, and not more than every 10 minutes
  function shouldAsk(day, lastAsk, nowMs){
    if (!day || day.ouraReady) return false;
    return !lastAsk || nowMs - lastAsk >= RETRY_MS;
  }
  // Body changes today that were not the sleep seed (blocks used, health actions filled)
  function dayChanges(log){
    let s = 0;
    for (const x of log || []) if (x && x.m === "b" && !isSleepLine(x)) s += +x.xp || 0;
    return s;
  }
  // where Body goes when readiness arrives
  const bodyFrom = (ready, log) => Math.max(0, Math.min(100, Math.round(ready + dayChanges(log))));
  root.QuestOura = { RETRY_MS, isSleepLine, shouldAsk, dayChanges, bodyFrom };
})(typeof globalThis !== "undefined" ? globalThis : this);
