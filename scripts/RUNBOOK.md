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
