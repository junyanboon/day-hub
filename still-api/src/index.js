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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

/**
 * Keep only the VEVENTs that could land on this day before handing the text to
 * the parser: recurring series (which must be expanded) and anything dated
 * within a day of the target. A year of calendar is mostly irrelevant to today,
 * and parsing all of it is what blows the Worker's CPU budget.
 */
function prefilterICS(text, dayStart) {
  const stamp = (d) => {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(d);
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g("year")}${g("month")}${g("day")}`;
  };
  const near = new Set([
    stamp(new Date(dayStart.getTime() - 86400000)),
    stamp(dayStart),
    stamp(new Date(dayStart.getTime() + 86400000)),
  ]);

  const first = text.indexOf("BEGIN:VEVENT");
  if (first === -1) return text;
  const header = text.slice(0, first);
  const chunks = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

  const kept = chunks.filter((c) => {
    if (c.includes("RRULE") || c.includes("RECURRENCE-ID")) return true;
    const m = c.match(/DTSTART[^:\n]*:(\d{8})/);
    return m ? near.has(m[1]) : false;
  });
  return header + kept.join("\r\n") + "\r\nEND:VCALENDAR\r\n";
}

/**
 * Advance a series' anchor forward in WHOLE periods so expansion starts just
 * before the day we care about. Whole periods keep the recurrence aligned
 * (a WEEKLY rule stays on its weekday), so this is a speed-up, not a shift.
 * Only DAILY/WEEKLY are worth it; MONTHLY/YEARLY have few enough occurrences.
 */
function fastForward(dtstart, recur, target) {
  const freq = recur && recur.freq;
  const unitDays = freq === "DAILY" ? 1 : freq === "WEEKLY" ? 7 : 0;
  if (!unitDays) return dtstart;
  // A COUNT rule is numbered from its real start; moving the anchor would let
  // occurrences past the count through. Rare and cheap — just don't skip.
  if (recur.count) return dtstart;
  const interval = (recur.interval || 1) * unitDays;
  const diffDays = Math.floor((target - dtstart.toJSDate()) / 86400000);
  const periods = Math.floor(diffDays / interval) - 1;
  if (periods <= 0) return dtstart;
  const t = dtstart.clone();
  t.adjust(periods * interval, 0, 0, 0);
  return t;
}

async function fetchEvents(url, label, dayStart, dayEnd) {
  const res = await fetch(url, { cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const raw = await res.text();
  const text = prefilterICS(raw, dayStart);

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
      const recur = ve.getFirstPropertyValue("rrule");
      const anchor = fastForward(ev.startDate, recur, dayStart);
      const it = ev.iterator(anchor);
      const durMs = ev.duration.toSeconds() * 1000;
      let next, guard = 0;
      while ((next = it.next()) && guard++ < 200) {
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

/* ── Tasks Inbox (Notion) ────────────────────────────────────────────────────
   The focus sheet lists open tasks and marks them Done. The Notion token is a
   Worker secret (NOTION_TOKEN) shared with the 📥 Tasks Inbox database. */
const TASKS_DS = "a404eb91-e7a4-4aa7-aff5-2a86feae427f";
const NOTION_VER = "2025-09-03";

function notionHeaders(env) {
  return {
    "Authorization": `Bearer ${env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VER,
    "Content-Type": "application/json",
  };
}

async function listTasks(env) {
  if (!(env.NOTION_TOKEN || "").trim()) throw new Error("missing secret NOTION_TOKEN");
  const r = await fetch(`https://api.notion.com/v1/data_sources/${TASKS_DS}/query`, {
    method: "POST",
    headers: notionHeaders(env),
    body: JSON.stringify({
      filter: { property: "Status", status: { does_not_equal: "Done" } },
      page_size: 50,
    }),
  });
  if (!r.ok) throw new Error(`Notion query: HTTP ${r.status}`);
  const d = await r.json();
  const text = (p) => (p?.title || p?.rich_text || []).map((t) => t.plain_text).join("");
  const tasks = (d.results || []).map((pg) => ({
    id: pg.id,
    task: text(pg.properties?.Task) || "(untitled)",
    priority: pg.properties?.Priority?.select?.name || "",
    estimate: pg.properties?.Estimate?.select?.name || "",
    type: pg.properties?.Type?.select?.name || "",
    nextAction: !!pg.properties?.["Next Action"]?.checkbox,
    done: false,
  }));
  // Next Action first, then priority, then oldest first.
  const prio = { "🔴 High": 0, "🟡 Medium": 1, "🟢 Low": 2 };
  tasks.sort((a, b) => (b.nextAction - a.nextAction) ||
    ((prio[a.priority] ?? 3) - (prio[b.priority] ?? 3)));
  return tasks;
}

async function setTaskDone(env, id, done) {
  if (!(env.NOTION_TOKEN || "").trim()) throw new Error("missing secret NOTION_TOKEN");
  if (!/^[0-9a-f-]{32,36}$/i.test(id || "")) throw new Error("bad task id");
  const r = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: "PATCH",
    headers: notionHeaders(env),
    body: JSON.stringify({
      properties: { Status: { status: { name: done ? "Done" : "Not Started" } } },
    }),
  });
  if (!r.ok) throw new Error(`Notion update: HTTP ${r.status}`);
  return true;
}

/** The live "Junyan CAD" / "Junyan USD" budget (archived copies excluded). */
async function findBudget(api, currency) {
  const br = await api("/budgets");
  if (!br.ok) throw new Error(`YNAB budgets: HTTP ${br.status}`);
  const want = `junyan ${currency}`.toLowerCase();
  return (await br.json()).data.budgets.find((b) => {
    const n = b.name.toLowerCase();
    return n.includes(want) && !n.includes("archived");
  }) || null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const headers = { ...cors(origin), "Content-Type": "application/json" };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        ok: true,
        configured: CALS.every((c) => !!(env[c.secret] || "").trim()),
        tasksConfigured: !!(env.NOTION_TOKEN || "").trim(),
        ouraConfigured: !!(env.OURA_TOKEN || "").trim(),
        ynabConfigured: !!(env.YNAB_TOKEN || "").trim(),
      }), { headers });
    }

    if (url.pathname === "/spent/accounts") {
      // Read-only: open account names in the last-used budget, for wiring/debugging.
      try {
        const token = (env.YNAB_TOKEN || "").trim();
        if (!token) throw new Error("YNAB_TOKEN not configured");
        const cache = caches.default;
        const key = new Request(new URL("/spent/accounts?v=4", url.origin));
        const hit = await cache.match(key);
        if (hit) return new Response(await hit.text(), { headers: { ...headers, "X-Still-Cache": "hit" } });
        const api = (path) => fetch("https://api.ynab.com/v1" + path, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const out = {};
        for (const cur of ["CAD", "USD"]) {
          const b = await findBudget(api, cur);
          if (!b) continue;
          const ar = await api(`/budgets/${b.id}/accounts`);
          if (!ar.ok) continue;
          out[cur] = (await ar.json()).data.accounts
            .filter((a) => !a.closed && !a.deleted)
            .map((a) => a.name)
            .filter((n) => !/gift card|🎁|\bGC\b/i.test(n));   // gift cards excluded by request
        }
        const body = JSON.stringify(out);
        ctx.waitUntil(cache.put(key, new Response(body, {
          headers: { "Content-Type": "application/json", "Cache-Control": "max-age=3600" },
        })));
        return new Response(body, { headers: { ...headers, "X-Still-Cache": "miss" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 502, headers });
      }
    }

    if (url.pathname === "/spent/today") {
      // Today's outflows from both Junyan budgets, so the app shows what the
      // bank feeds imported (pending card charges) alongside in-app entries.
      try {
        const token = (env.YNAB_TOKEN || "").trim();
        if (!token) throw new Error("YNAB_TOKEN not configured");
        const cache = caches.default;
        const key = new Request(new URL("/spent/today?v=1", url.origin));
        const hit = await cache.match(key);
        if (hit) return new Response(await hit.text(), { headers: { ...headers, "X-Still-Cache": "hit" } });
        const api = (path) => fetch("https://api.ynab.com/v1" + path, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const p = parts(new Date());
        const z = (n) => String(n).padStart(2, "0");
        const today = `${p.y}-${z(p.m)}-${z(p.d)}`;
        const items = [];
        for (const cur of ["CAD", "USD"]) {
          const b = await findBudget(api, cur);
          if (!b) continue;
          const tr = await api(`/budgets/${b.id}/transactions?since_date=${today}`);
          if (!tr.ok) continue;
          for (const t of (await tr.json()).data.transactions) {
            if (t.deleted || t.amount >= 0) continue;         // outflows only
            if (t.transfer_account_id) continue;              // not transfers
            items.push({
              name: t.payee_name || t.memo || "(no payee)",
              amt: -t.amount / 1000,
              cur,
              account: t.account_name,
              cleared: t.cleared,
            });
          }
        }
        const body = JSON.stringify({ items });
        ctx.waitUntil(cache.put(key, new Response(body, {
          headers: { "Content-Type": "application/json", "Cache-Control": "max-age=300" },
        })));
        return new Response(body, { headers: { ...headers, "X-Still-Cache": "miss" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 502, headers });
      }
    }

    if (url.pathname === "/spent" && request.method === "POST") {
      // Log a Spent-today entry straight into YNAB as an uncleared outflow.
      // Budget: last-used. Account: YNAB_ACCOUNT_ID env var if set, otherwise
      // the first open on-budget account (reported back so it can be pinned).
      try {
        const token = (env.YNAB_TOKEN || "").trim();
        if (!token) throw new Error("YNAB_TOKEN not configured");
        const { name, amt, cur, account } = await request.json();
        if (!name || !(amt > 0) || amt > 100000) throw new Error("bad name/amt");
        const currency = cur === "USD" ? "USD" : "CAD";
        const api = (path, init) => fetch("https://api.ynab.com/v1" + path, {
          ...init,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        // Budgets are "🇨🇦Junyan CAD" / "🇺🇸Junyan USD"; the entry names which
        // account inside that budget it belongs to (picker in the app).
        const budget = await findBudget(api, currency);
        if (!budget) throw new Error(`YNAB: no live "Junyan ${currency}" budget`);
        const budgetId = budget.id;
        const ar = await api(`/budgets/${budgetId}/accounts`);
        if (!ar.ok) throw new Error(`YNAB accounts: HTTP ${ar.status}`);
        const accounts = (await ar.json()).data.accounts.filter((a) => !a.closed && !a.deleted);
        const wantAcct = String(account || "").trim();
        const acct = (wantAcct && accounts.find((a) => a.name === wantAcct))
          || (wantAcct && accounts.find((a) => a.name.toLowerCase().includes(wantAcct.toLowerCase())))
          || accounts[0];
        if (!acct) throw new Error(`YNAB: no open accounts in "Junyan ${currency}"`);
        const accountId = acct.id, accountName = acct.name;
        const p = parts(new Date());
        const z = (n) => String(n).padStart(2, "0");
        const tr = await api(`/budgets/${budgetId}/transactions`, {
          method: "POST",
          body: JSON.stringify({ transaction: {
            account_id: accountId,
            date: `${p.y}-${z(p.m)}-${z(p.d)}`,
            amount: -Math.round(amt * 1000),   // milliunits, outflow
            payee_name: String(name).slice(0, 100),
            memo: "via Still · Spent today",
            cleared: "uncleared",
          } }),
        });
        if (!tr.ok) throw new Error(`YNAB create: HTTP ${tr.status} ${(await tr.text()).slice(0, 200)}`);
        const created = (await tr.json()).data.transaction;
        return new Response(JSON.stringify({
          ok: true, id: created.id, account: accountName || created.account_name || accountId,
        }), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 502, headers });
      }
    }

    if (url.pathname === "/sleep") {
      // Last night's Oura sleep score. Drives the aura's intensity in the app.
      try {
        const token = (env.OURA_TOKEN || "").trim();
        if (!token) throw new Error("OURA_TOKEN not configured");
        const cache = caches.default;
        const key = new Request(new URL("/sleep?v=1", url.origin), { method: "GET" });
        const hit = await cache.match(key);
        if (hit) {
          return new Response(await hit.text(), { headers: { ...headers, "X-Still-Cache": "hit" } });
        }
        // Ask for a few days so we still return the latest score after a lazy sync.
        const ymd = (d) => { const p = parts(d); const z = (n) => String(n).padStart(2, "0"); return `${p.y}-${z(p.m)}-${z(p.d)}`; };
        const r = await fetch(
          `https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${ymd(new Date(Date.now() - 3 * 86400000))}&end_date=${ymd(new Date())}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!r.ok) throw new Error(`Oura: HTTP ${r.status}`);
        const data = await r.json();
        const days = (data.data || []).filter((d) => typeof d.score === "number");
        if (!days.length) throw new Error("Oura: no recent sleep score");
        const latest = days[days.length - 1];
        const body = JSON.stringify({ score: latest.score, day: latest.day });
        ctx.waitUntil(cache.put(key, new Response(body, {
          headers: { "Content-Type": "application/json", "Cache-Control": "max-age=1800" },
        })));
        return new Response(body, { headers: { ...headers, "X-Still-Cache": "miss" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 502, headers });
      }
    }

    if (url.pathname === "/tasks") {
      try {
        return new Response(JSON.stringify({ tasks: await listTasks(env) }), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 502, headers });
      }
    }

    if (url.pathname === "/tasks/done" && request.method === "POST") {
      try {
        const { id, done } = await request.json();
        await setTaskDone(env, id, !!done);
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 502, headers });
      }
    }

    if (url.pathname !== "/plan") {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers });
    }

    try {
      const q = url.searchParams.get("date");
      const ref = q ? new Date(`${q}T12:00:00Z`) : new Date();

      // Building the plan means fetching and parsing two calendars, so serve a
      // recent copy when we have one. 60s is well inside "live" for a day plan
      // and keeps the app snappy when it polls.
      const cache = caches.default;
      const key = new Request(new URL(`/plan?d=${q || "today"}`, url.origin), { method: "GET" });
      const hit = await cache.match(key);
      if (hit) {
        const body = await hit.text();
        return new Response(body, { headers: { ...headers, "X-Still-Cache": "hit" } });
      }

      const plan = await buildPlan(env, ref);
      const body = JSON.stringify(plan);
      ctx.waitUntil(cache.put(key, new Response(body, {
        headers: { "Content-Type": "application/json", "Cache-Control": "max-age=60" },
      })));
      return new Response(body, { headers: { ...headers, "X-Still-Cache": "miss" } });
    } catch (err) {
      // Fail loud but harmless — the page falls back to its baked-in plan.
      return new Response(JSON.stringify({ error: String(err && err.message || err) }),
        { status: 502, headers });
    }
  },
};
