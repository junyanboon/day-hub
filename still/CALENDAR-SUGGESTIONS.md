# Suggesting calendar plans to Junyan (for Claude sessions)

Junyan plans in the calendar app (`still/calendar.html`). When a session wants to put something on his
calendar, it **suggests** it instead of writing to Google Calendar. The suggestion shows in the app as a
dashed "Suggested" event and in the left panel with **Accept** and **Skip**. Only his Accept writes the
event (to the calendar the suggestion names, or one he picks). Never write his calendar directly for a plan
he has not seen.

## When to suggest
- He asks you to plan, schedule or find time for something.
- You turned tasks into time blocks (use the task's Estimate as the length).
- A trip or booking needs prep time before it.

## How
The key lives on the Mac at `~/.config/still/suggest-key` (one line). It can only list and propose
suggestions; it cannot accept them, read his calendar or change anything.

```sh
KEY=$(cat ~/.config/still/suggest-key)
curl -s https://still.srv1948070.hstgr.cloud/planner/suggestions \
  -H "X-Suggest-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "by": "Desk Hand session",
    "note": "Prep for the Montreal trip",
    "items": [
      {"title": "Pack for Montreal", "start": "2026-11-12T19:00:00-05:00", "end": "2026-11-12T20:00:00-05:00",
       "kind": "other", "why": "Train leaves 8 am on the 13th"},
      {"title": "Montreal trip", "allDay": true, "start": "2026-11-13", "end": "2026-11-18", "kind": "out"}
    ]
  }'
# → {"ids":["sg_..."]}
```

Fields per item:
- `title` (required), `start` and `end` (ISO time with offset; for `allDay` use `YYYY-MM-DD`, end is the day after the last day).
- `calId` (optional, default his own "Junyan" calendar). Others: Joint Plans
  `fm1c5usrdr4n94qfla41lplg50@group.calendar.google.com`, Staff scheduling
  `mvt3fofsepaioutvomq7tor1jk@group.calendar.google.com`. The Caney calendar is read-only.
- `kind` (optional colour): `ex` exercise, `food`, `out` (out, needs prep), `work` (studio work), `other`.
  Leave it out to let the app guess from the title.
- `why` (optional, one line he sees on the card), `taskId` (optional Notion Tasks Inbox page id).

Up to 30 items per call. The same open proposal (same title, start and calendar) is kept once, so a retry
is safe. Check what is still waiting with
`curl -s https://still.srv1948070.hstgr.cloud/planner/suggestions -H "X-Suggest-Key: $KEY"`.

## Rules
- Suggest, then tell Junyan in chat that suggestions are waiting in the calendar app. Do not ask him to
  accept them in chat.
- Times in his calendar's zone unless he is travelling; always send an explicit offset.
- Do not re-suggest something he skipped (`?all=1` shows skipped ones for 30 days).
