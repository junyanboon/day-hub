# Day Hub — morning rollover (cloud, Brazil-proof)

Once a day, GitHub Actions runs `scripts/rollover.py` (deterministic, no AI) and:

1. Reads the four Google Calendars for TODAY (America/Toronto) via secret **iCal URLs**.
2. Rewrites the Day Hub's **Today** and **Meals** tabs (only the content between the
   `<!-- ROLLOVER:*:START/END -->` markers in `index.html`) and commits if it changed.
3. Creates today's **Notion Day Plan** page in the *Travel Activities Planner* data
   source — **idempotently** (skips if one dated today already exists).

Workflow: `.github/workflows/rollover.yml` — fires at **11:10 & 12:10 UTC** (= 07:10
Toronto in summer/winter; the second fire is a harmless no-op). Also `workflow_dispatch`
for manual runs. It **skip-greens** until the secrets below exist, so it's safe to merge
before setup.

This replaces the local `day-hub-morning-rollover` scheduled task, which the local
scheduler skips when unattended (same reason day-sheet & fbs-monitor are cloud).

## One-time setup — GitHub repo secrets

In **github.com/junyanboon/day-hub → Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `ICS_URL_JOINT`  | Joint Plans calendar → Settings → **Secret address in iCal format** |
| `ICS_URL_JUNYAN` | "Junyan" / My Plan calendar → same secret iCal URL |
| `ICS_URL_CANEY`  | Caney calendar (`junyan.boon@gmail.com`) → same secret iCal URL |
| `ICS_URL_STAFF`  | Staff Scheduling calendar → same secret iCal URL (same value as fbs-monitor's `ICS_URL_STAFF`) |
| `NOTION_TOKEN`   | A Notion internal-integration token. **Share the *Travel Activities Planner* database with that integration** (••• → Connections). Reuse the fbs-monitor integration if it's easier — just add this DB to its connections. |
| `NOTION_DAYPLAN_DB` | *(optional)* the Day-Plan database id. Defaults to `e3212b3245264da48a12dc6d8900490b`; only set if that ever changes. |

To get a calendar's secret iCal URL: Google Calendar → hover the calendar → ⋮ →
*Settings and sharing* → **Integrate calendar** → *Secret address in iCal format*.
Treat these like passwords — anyone with the URL can read the calendar.

## After setup

1. Push a commit (or hit **Run workflow** on the Actions tab) to trigger a run.
2. First green run: confirm `index.html` was updated and a Notion Day Plan page appeared.
3. Once verified, **disable the local `day-hub-morning-rollover` task** so the two don't
   both run (the cloud job is authoritative). They won't corrupt each other — the run is
   idempotent — but one owner is cleaner.

## Notes / limits

- **Deterministic only.** The timeline is built by rules (emoji map, Staff rows kept only
  when the title starts "Junyan", a deep-work block injected into a free 15:30–17:00,
  a Brazil countdown ≤7 days). It does *not* know one-off context like "bring $30 cash" —
  that's still the live co-pilot's job to add on top during the day.
- **Fail-loud:** any calendar fetch/parse error aborts and writes nothing (no partial page).
- If the Notion query can't be verified, it does **not** create a page (avoids duplicates).
- Local dry-run: `pip install -r scripts/requirements.txt` then set the five env vars and
  `python scripts/rollover.py`.

---

# Still — pomodoro day plan (cloud, every 30 min)

`.github/workflows/still.yml` runs `scripts/still_plan.py` (deterministic, no AI)
roughly every 30 minutes, ~06:00–22:30 Toronto, and:

1. Reads **Joint Plans** + **Junyan** for TODAY via the existing secret iCal URLs
   (`ICS_URL_JOINT`, `ICS_URL_JUNYAN` — no new secrets needed). Staff Scheduling is
   deliberately excluded; Junyan removed it from Still on 2026-07-30.
2. Treats every calendar event as a **fixed** block, skips Still's own
   `🌊 Focus — …` events, and fills the remaining daytime gaps with 50-minute
   focus blocks separated by 10-minute rests.
3. Splices the result into `still/index.html` between the `STILL:PLAN:*` markers
   and stamps `<meta name="still-version">` so phones can detect a fresh plan.

Served at **https://junyanboon.github.io/day-hub/still/**

## Design rules (don't break these)

- **Never shift the offsets.** Times are emitted with the calendars' own
  `-04:00` (Toronto) offsets. The phone renders them in device-local time
  (São Paulo), which is what makes a class stored `18:30-04:00` display as
  19:30. Shifting them "to fix the timezone" breaks every block by an hour.
- **Only future gaps are replanned.** Blocks that already started are carried
  over from the previous file verbatim, so the block you're in is never
  rewritten under you and the past stays an honest record.
- **The calendar is the source of truth.** If something isn't on Joint Plans or
  Junyan, the planner will fill that time with work. A missing class shows up
  as deep-work blocks over the class — add the event, don't patch the script.
- **In-app edits are safe.** Junyan's edits live in his phone's localStorage
  (`still-ops-v2`) and are layered over `PLAN` at render time. A rebuild never
  destroys them; the script cannot see them.

This replaces the local `still-day-resync` scheduled task, disabled 2026-07-31
after it skipped every fire while the Mac was unattended in Brazil (the app sat
on the previous day's plan). Do not re-enable it while this workflow runs.

Local dry-run: `pip install -r scripts/requirements.txt`, set `ICS_URL_JOINT`
and `ICS_URL_JUNYAN`, then `python scripts/still_plan.py`.

## Live refresh — `still-api` Worker

The 15-minute job above is the safety net. For "I just changed my calendar, show
me now", the app calls a Cloudflare Worker that reads the calendars on demand:

- Source: `still-api/` (deployed with `wrangler deploy` from that directory)
- Endpoint: `https://still.srv1948070.hstgr.cloud/plan`
- Health:   `https://still.srv1948070.hstgr.cloud/health` → `{ok, configured}`

**Moved off Cloudflare Workers on 2026-09-01.** The free tier caps CPU at 10 ms and
the two-calendar parse did not fit: `/plan` returned HTTP 503 with Cloudflare
`error code: 1102` on 6 of 8 forced builds, which is what made the desktop orb say
"plan may be stale". It now runs as Node on the Hostinger VPS `srv1948070.hstgr.cloud`,
in `/docker/still-api`, behind the Traefik already on that box. `server.mjs` hosts the
*same* `src/index.js` — the cache and the `STILL_OPS` KV binding are shimmed, so there
is no second implementation to keep in step.

- Deploy:  `cd still-api && ./deploy.sh` (needs key-based ssh to `root@2.25.139.60`)
- Logs:    `ssh root@2.25.139.60 'docker logs -f still-api'`
- Secrets: `/docker/still-api/.env` on the server only — never committed, never in chat.

**Unset secrets forward to the old Worker.** Cloudflare will not read Worker secrets
back, and Oura has retired Personal Access Tokens (the existing one is masked and new
ones cannot be created), so `OURA_TOKEN` could not be moved. When a secret is unset,
`/sleep`, `/spent` and `/tasks` proxy to `https://still-api.still-api.workers.dev` and
the response carries `X-Still-Fallback`. Fill the secret in on the VPS and that endpoint
stops forwarding — no code change. **Keep the old Worker deployed**; it backs these
routes. **Do not revoke the Oura tokens.**

**Why a Worker at all.** This repo is public and GitHub Pages is static, so the
page can never hold the calendars' secret iCal URLs — anyone with one can read
the calendar. The Worker holds them as Cloudflare secrets and returns only the
finished plan.

**Secrets** (set once, interactively — the values never touch chat or the repo):

```
cd still-api
npx wrangler secret put ICS_URL_JOINT
npx wrangler secret put ICS_URL_JUNYAN
```

Same two values as the matching GitHub secrets. `/health` reports
`configured:false` until both are set, and `/plan` returns 502 with a clear
message — the app falls back to its baked plan, so nothing breaks meanwhile.

**When the app calls it:** on first open, whenever the tab regains focus, every
5 minutes while open, when the day sheet opens, and from the "⟳ refresh from my
calendar" button in that sheet. Any failure is silent and falls back to the
baked plan; the button then reads "(offline)".

**Two planners, on purpose.** `scripts/still_plan.py` and `still-api/src/index.js`
share the shape of the plan (fixed blocks from the calendar, 50-minute focus
blocks with 10-minute rests in the gaps, Toronto offsets never shifted). They are
kept as independent paths so a Worker outage cannot also break the baked
fallback. Change one, change the other.

They differ deliberately in one place — **the past**:

- The Python job *preserves* blocks that already started, carrying them over
  verbatim from the previous file. The baked page is therefore a record of the
  day as it was lived, and the block you are in is never rewritten under you.
- The Worker *recomputes* the whole day from the calendar each call. So if an
  already-finished event is edited, the live view shows the corrected time while
  the baked copy keeps the original.

Both are right for their job. Expect morning blocks to differ between the two
after a same-day edit to an early event; that is not a bug.

## Edit-layer sync — `/ops` (added 2026-09-01)

The phone's in-app edits (pause/+15/done/add/drop, localStorage `still-ops-v2`)
now also sync through the Worker: `GET /ops?d=<JS toDateString>` and `POST /ops`
(last-write-wins on a client `ts`), stored in Cloudflare KV (binding
`STILL_OPS`), 48 h TTL. The phone pushes on every edit and pulls on every plan
refresh. The native desktop orb (`desk-widgets/Still.app` in the workspace)
speaks the same protocol, so both devices show one day. Offline is fine — the
push is fire-and-forget and localStorage stays authoritative until a newer
`ts` arrives.

## Worker performance

The first cut of the Worker died with CPU error 1102. Two causes, both fixed —
keep them in mind before changing `fetchEvents`:

1. **Parse less.** `prefilterICS` strips the calendar down to recurring series
   plus events dated within a day of the target before `ICAL.parse` runs. A full
   year of calendar is mostly irrelevant to today and parsing it blows the CPU
   budget on its own.
2. **Don't walk recurrence from the beginning of time.** `fastForward` advances
   a series' anchor in WHOLE periods (so a weekly rule keeps its weekday) to just
   before the target day. Iterating a daily series from its real start burns
   thousands of steps per request — and the old 400-step guard meant long-running
   series were silently *missed* as well as slow. Rules with `COUNT` are skipped,
   since moving their anchor would change which occurrences count.

Responses are cached for 60s (`caches.default`, `X-Still-Cache` header shows
hit/miss), so the app's polling is nearly free.

## Still — focus sheet (Tasks Inbox)

The "☑ focus" tab lists open rows from the Notion 📥 Tasks Inbox
(data source a404eb91-e7a4-4aa7-aff5-2a86feae427f) via still-api:

- `GET /tasks` — open tasks (Status != Done), Next Action first, then priority
- `POST /tasks/done {id, done}` — flips Status to Done / Not Started

Needs one more Worker secret: `NOTION_TOKEN` — a Notion internal-integration
token whose integration has the 📥 Tasks Inbox database shared with it
(••• → Connections on the DB). Reuse the "Dance Annex Desk CLI" integration if
easier — just add Tasks Inbox to its connections. Set with:

    cd still-api && npx wrangler secret put NOTION_TOKEN

Until set: `/health` shows `tasksConfigured:false`, the focus sheet says it
can't reach the inbox, everything else works.

UI notes: bottom pill nav (tasks / ＋ / my day) replaces the old header
buttons — thumb zone, Tiimo/Calm pattern. Center ❚❚ button pauses the current
block; resume pushes the block's end out by the paused duration so no focus
time is lost. App icon: still/icon.svg + icon-180.png (apple-touch-icon).
The app is silent (all chimes removed 2026-08-07) and the countdown shows
whole minutes only.

## Still — aura centerpiece (Oura sleep score)

The timer centerpiece is a canvas recreation of Calm Sleep's animated aura
(layered wobbling bands, sunburst core), breathing autonomously. It has
exactly five intensity states, mirroring the reference app's five slider
stops, driven by last night's Oura sleep score via `GET /sleep` on still-api:

    score < 60 → 1 (dim, cool)   … a score of 50 or below is the bottom state
    60–69 → 2 · 70–79 → 3 (default when offline) · 80–89 → 4 · 90+ → 5 (full warmth)

After 22:00 (and before 05:00) device-local, the aura yields to the textured
full moon (Sadhguru/Isha inspiration).

Worker secret needed once: `OURA_TOKEN` — an Oura personal access token from
cloud.ouraring.com/personal-access-tokens. Set with:

    cd still-api && npx wrangler secret put OURA_TOKEN

`/health` shows `ouraConfigured`; until set, `/sleep` 502s and the app quietly
uses intensity 3. Responses cache 30 min.

Design studies that led here: still/centerpieces.html (7 interactive
centerpiece prototypes, kept for reference).

## Still — Spent tab (removed 2026-08-07)

The bottom bar is Now / Focus / Schedule (Calm Countdown design; quick-add is
the ＋ pill under the orb). A fourth **Spent** tab briefly logged same-day
spending into YNAB and was removed the same evening — the reason is worth
keeping, since it kills the idea rather than the implementation:

**YNAB's API only exposes a transaction once it POSTS.** Card charges sitting
as *pending* in the YNAB app are invisible to `/transactions`, so "what did I
spend today" was reliably empty on the days it mattered, while manual entries
duplicated what the bank feed would import a day or two later.

The Worker keeps the routes (`POST /spent`, `GET /spent/today`,
`GET /spent/accounts`) and the `YNAB_TOKEN` secret is set, so this can be
revived from the app side alone. `/health` reports `ynabConfigured`. Budgets
are found by name — 🇨🇦Junyan CAD / 🇺🇸Junyan USD, archived copies excluded.
