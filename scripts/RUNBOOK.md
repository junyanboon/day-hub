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
