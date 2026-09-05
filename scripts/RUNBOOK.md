# Day Hub — morning rollover (cloud, Brazil-proof)

Once a day, GitHub Actions runs `scripts/rollover.py` (deterministic, no AI) and:

1. Reads the four Google Calendars for TODAY (America/Toronto) via `scripts/calfeed.py`
   — the **Calendar API** where configured, secret **iCal URLs** otherwise.
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
| `GOOGLE_SA_JSON` | Service-account key JSON (see **Calendar access** below). Raw JSON or base64 of it. |
| `CAL_ID_JOINT` / `CAL_ID_JUNYAN` / `CAL_ID_CANEY` / `CAL_ID_STAFF` | Each calendar's id (see below). |
| `ICS_URL_JOINT` / `ICS_URL_JUNYAN` / `ICS_URL_CANEY` / `ICS_URL_STAFF` | *Fallback.* Each calendar's **Secret address in iCal format**. Keep these until the API path is proven; `ICS_URL_STAFF` is the same value as fbs-monitor's. |
| `NOTION_TOKEN`   | A Notion internal-integration token. **Share the *Travel Activities Planner* database with that integration** (••• → Connections). Reuse the fbs-monitor integration if it's easier — just add this DB to its connections. |
| `NOTION_DAYPLAN_DB` | *(optional)* the Day-Plan database id. Defaults to `e3212b3245264da48a12dc6d8900490b`; only set if that ever changes. |

## Calendar access — two backends, chosen per calendar

`scripts/calfeed.py` reads a calendar through the **Calendar API** when both
`GOOGLE_SA_JSON` and that calendar's `CAL_ID_*` are set, and falls back to
`ICS_URL_*` otherwise. So calendars can be migrated one at a time, and removing a
`CAL_ID_*` rolls that calendar back with no code change. Every run prints which
backend each calendar used:

```
calendar 'Joint Plans' via google-api
calendar 'Junyan' via ics-url
```

**Why the API is preferred.** Google's private iCal endpoints return intermittent —
and sometimes sustained — 5xx. A 500 on the Joint Plans feed took *every* day-hub run
down from 2026-09-03 14:17Z: ten consecutive failures, zero successes, while the
Calendar API served the same calendar without complaint. The API also expands
recurring events server-side and fetches only today's window.

### Setting up the service account (one time)

1. In a Google Cloud project, **enable the Google Calendar API**.
2. Create a **service account**, then create a **JSON key** for it. Put the whole file
   in the `GOOGLE_SA_JSON` secret (base64 it first if newlines get mangled).
3. Copy the service account's email — it looks like
   `something@project.iam.gserviceaccount.com`.
4. For **each** of the four calendars: Google Calendar → hover the calendar → ⋮ →
   *Settings and sharing* → **Share with specific people** → add that email with
   **"See all event details"**. A calendar that is not shared returns HTTP 404 and the
   run fails fast with a message saying exactly that.
5. Read each calendar's id from the same settings page (*Integrate calendar* →
   **Calendar ID**) and put it in the matching `CAL_ID_*` secret.

No domain-wide delegation, no OAuth consent screen — sharing each calendar directly
with the service account is enough, and it keeps the grant read-only and revocable
per calendar.

### The iCal fallback

Google Calendar → hover the calendar → ⋮ → *Settings and sharing* →
**Integrate calendar** → *Secret address in iCal format*. Treat these like passwords —
anyone with the URL can read the calendar. Still required by the Cloudflare Worker in
`still-api/`, which has its own copies as Worker secrets; migrating the GitHub side does
not change the Worker.

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
- **Fail-loud, but not on the first blip:** each calendar read gets 3 attempts, 3s then
  9s apart.
  - *Retried:* network errors, timeouts, 5xx, 429, `403 rateLimitExceeded` /
    `quotaExceeded`, truncated bodies, and — on the API path — **404**.
  - *Not retried:* `401` (the key is bad), `403 forbidden`, and a 4xx on an iCal URL
    (it is revoked or wrong). These abort on the first attempt.
  - **Why 404 is retried.** Measured 2026-09-04: a calendar shared minutes earlier
    returned 404 on 1 of 5 identical requests while Google propagated the sharing.
    Failing fast there turns a settling share into a dead run. A genuinely wrong or
    unshared calendar still fails — it just takes 3 attempts to say so.
  - Either way an exhausted calendar read aborts and writes nothing (no partial page).
- If the Notion query can't be verified, it does **not** create a page (avoids duplicates).
- Local dry-run: `pip install -r scripts/requirements.txt`, set `NOTION_TOKEN` plus each
  calendar's `CAL_ID_*` (with `GOOGLE_SA_JSON`) or `ICS_URL_*`, then
  `python scripts/rollover.py`.

---

# Still — pomodoro day plan (cloud, every 30 min)

`.github/workflows/still.yml` runs `scripts/still_plan.py` (deterministic, no AI)
roughly every 30 minutes, ~06:00–22:30 Toronto, and:

1. Reads **Joint Plans** + **Junyan** for TODAY through the same `scripts/calfeed.py`
   as the rollover, so it shares the `CAL_ID_*` / `ICS_URL_*` secrets and needs none of
   its own. Staff Scheduling is
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

Local dry-run: `pip install -r scripts/requirements.txt`, set either
`GOOGLE_SA_JSON` + `CAL_ID_JOINT` + `CAL_ID_JUNYAN` or `ICS_URL_JOINT` +
`ICS_URL_JUNYAN`, then `python scripts/still_plan.py`.

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
