/**
 * Still API — live day plan from Junyan's calendars.
 *
 * GitHub Pages is static and the day-hub repo is public, so the page itself can
 * never hold the calendars' secret iCal URLs. This Worker holds them instead:
 * it fetches both calendars, expands recurrence for today, and returns the same
 * plan shape the page already renders. The app calls it on open and on refresh,
 * which is what makes "refresh against my present calendar" instant.
 *
 * The scheduled GitHub Action still bakes a copy of the plan into the page, so
 * the app keeps working if this Worker is ever unreachable. Both implement the
 * same rules — see day-hub/scripts/RUNBOOK.md.
 *
 * GET /plan            → today's plan
 * GET /plan?date=…     → a specific YYYY-MM-DD (used for testing)
 * GET /health          → liveness + whether the secrets are configured
 */

import ICAL from "ical.js";

const TZ = "America/Toronto";

// Calendars that feed Still. Staff Scheduling is deliberately excluded —
// Junyan removed it from this system on 2026-07-30.
const CALS = [
  { secret: "ICS_URL_JOINT", label: "Joint Plans" },
  { secret: "ICS_URL_JUNYAN", label: "Junyan" },
];

const FOCUS_MIN = 50; // length of a generated focus block
const REST_MIN = 10;  // breather between consecutive focus blocks
const MIN_GAP = 25;   // ignore gaps too short to be worth a block
const DAY_START = 8;  // don't generate focus before 08:00 (calendar-local)
const DAY_END = 21;   // ...or after 21:00

const ALLOWED_ORIGINS = [
  "https://junyanboon.github.io",
  "http://localhost:8787",
];

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

/* ── timezone helpers ───────────────────────────────────────────────────────
   Everything is emitted with the calendars' own America/Toronto offset, never
   shifted. Junyan's phone renders it in device-local time (São Paulo), which is
   what makes a class stored 18:30-04:00 display correctly as 19:30. */

function offsetFor(date) {
  // Minutes that America/Toronto is behind UTC on this date (240 or 300).
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, timeZoneName: "longOffset",
  }).formatToParts(date).find((p) => p.type === "timeZoneName").value;
  const m = s.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

function iso(date) {
  const off = offsetFor(date);
  const local = new Date(date.getTime() + off * 60000);
  const sign = off < 0 ? "-" : "+";
  const a = Math.abs(off);
  const pad = (n) => String(n).padStart(2, "0");
  return local.toISOString().slice(0, 19) +
    `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** Local wall-clock hour/minute in America/Toronto. */
function parts(date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const g = (t) => Number(f.find((p) => p.type === t).value);
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour"), mi: g("minute") };
}

/** UTC instant for a given Toronto wall-clock time on `ref`'s date. */
function atLocalHour(ref, hour, minute = 0) {
  const p = parts(ref);
  const guess = Date.UTC(p.y, p.m - 1, p.d, hour, minute);
  // Correct for the offset at that instant.
  const off = offsetFor(new Date(guess));
  return new Date(guess - off * 60000);
}

/* ── calendar ───────────────────────────────────────────────────────────── */

async function fetchEvents(url, label, dayStart, dayEnd) {
  const res = await fetch(url, { cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const text = await res.text();

  const comp = new ICAL.Component(ICAL.parse(text));
  const out = [];

  for (const ve of comp.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(ve);
    const summary = (ev.summary || "").trim();
    if (!summary) continue;
    if ((ve.getFirstPropertyValue("status") || "").toUpperCase() === "CANCELLED") continue;
    if (["unavailable", "busy"].includes(summary.toLowerCase())) continue;
    // Still's own output — never treat it as a fixed commitment.
    if (summary.startsWith("🌊 Focus")) continue;
    if (!ev.startDate || !ev.endDate) continue;
    if (ev.startDate.isDate) continue;          // all-day (hotel stays) — not a block

    const push = (s, e) => {
      const sd = s.toJSDate(), ed = e.toJSDate();
      if (ed <= dayStart || sd >= dayEnd) return;
      out.push({ summary, start: sd, end: ed, label });
    };

    if (ev.isRecurring()) {
      const it = ev.iterator();
      const durMs = ev.duration.toSeconds() * 1000;
      let next, guard = 0;
      while ((next = it.next()) && guard++ < 400) {
        const sd = next.toJSDate();
        if (sd >= dayEnd) break;
        if (sd.getTime() + durMs <= dayStart.getTime()) continue;
        const det = ev.getOccurrenceDetails(next);
        push(det.startDate, det.endDate);
      }
    } else {
      push(ev.startDate, ev.endDate);
    }
  }
  return out;
}

function mergeFixed(events) {
  events.sort((a, b) => a.start - b.start || a.end - b.end);
  const kept = [];
  for (const e of events) {
    if (kept.some((k) => k.start <= e.start && e.end <= k.end)) continue;
    kept.push(e);
  }
  return kept;
}

function roman(n) {
  const vals = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of vals) while (n >= v) { out += s; n -= v; }
  return out;
}

function fillGaps(fixed, ref) {
  const lo = atLocalHour(ref, DAY_START);
  const hi = atLocalHour(ref, DAY_END);
  const windows = [];
  let cursor = lo;
  for (const f of fixed) {
    if (f.start > cursor) windows.push([cursor, new Date(Math.min(f.start, hi))]);
    cursor = new Date(Math.max(cursor, f.end));
  }
  if (cursor < hi) windows.push([cursor, hi]);

  const blocks = [];
  for (const [ws, we] of windows) {
    let t = new Date(Math.max(ws, lo));
    while ((we - t) / 60000 >= MIN_GAP) {
      const span = Math.min(FOCUS_MIN, Math.floor((we - t) / 60000));
      const end = new Date(t.getTime() + span * 60000);
      blocks.push({ s: iso(t), e: iso(end), t: "Deep work", type: "focus", cal: "Junyan" });
      const restEnd = new Date(end.getTime() + REST_MIN * 60000);
      if ((we - restEnd) / 60000 >= MIN_GAP) {
        blocks.push({ s: iso(end), e: iso(restEnd), t: "Rest", type: "break", cal: "" });
      }
      t = restEnd;
    }
  }
  return blocks;
}

async function buildPlan(env, ref) {
  const dayStart = atLocalHour(ref, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  let events = [];
  for (const c of CALS) {
    const url = (env[c.secret] || "").trim();
    if (!url) throw new Error(`missing secret ${c.secret}`);
    events = events.concat(await fetchEvents(url, c.label, dayStart, dayEnd));
  }

  const fixed = mergeFixed(events);
  const blocks = fixed.map((f) => ({
    s: iso(f.start), e: iso(f.end), t: f.summary, type: "fixed", cal: f.label,
  })).concat(fillGaps(fixed, ref));

  blocks.sort((a, b) => new Date(a.s) - new Date(b.s));

  let n = 0;
  for (const b of blocks) {
    if (b.type === "focus" && b.t === "Deep work") b.t = `Deep work ${roman(++n)}`;
  }

  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", month: "short", day: "numeric",
  }).format(ref) + " · live from Joint Plans + Junyan";

  return { generated: iso(new Date()), label, blocks };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const headers = { ...cors(origin), "Content-Type": "application/json" };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        ok: true,
        configured: CALS.every((c) => !!(env[c.secret] || "").trim()),
      }), { headers });
    }

    if (url.pathname !== "/plan") {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers });
    }

    try {
      const q = url.searchParams.get("date");
      const ref = q ? new Date(`${q}T12:00:00Z`) : new Date();
      const plan = await buildPlan(env, ref);
      return new Response(JSON.stringify(plan), { headers });
    } catch (err) {
      // Fail loud but harmless — the page falls back to its baked-in plan.
      return new Response(JSON.stringify({ error: String(err && err.message || err) }),
        { status: 502, headers });
    }
  },
};
