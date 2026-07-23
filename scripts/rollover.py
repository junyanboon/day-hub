#!/usr/bin/env python3
"""
Day Hub — deterministic morning rollover (GitHub Actions, Brazil-proof).

Pure rails, no AI. Once a day it:
  1. Reads the four Google Calendars (secret ICS URLs) for TODAY (America/Toronto).
  2. Builds the Day Hub #tab-today + #tab-meals timelines and splices them into
     index.html between the ROLLOVER:* markers (leaving the rest of the app alone).
  3. Creates today's Notion "Day Plan" page in the Travel Activities Planner data
     source — idempotently (skips if one dated today already exists).

The workflow commits index.html only when it changed, and pushes with the built-in
GITHUB_TOKEN (no PAT). Notion writes use NOTION_TOKEN.

This mirrors the proven fbs-monitor / day-sheet cloud pattern. It replaces the local
`day-hub-morning-rollover` scheduled task, which the local scheduler skips unattended.

Fail policy: a calendar-source failure aborts nonzero and writes nothing (never a
fabricated/partial page). Missing secrets → the workflow skip-greens before we run.
"""

import os
import re
import sys
import json
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo

import requests
import icalendar
import recurring_ical_events

TZ = ZoneInfo("America/Toronto")
HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, "..", "index.html")

# ── calendars ────────────────────────────────────────────────────────────────
# Each maps to a GitHub secret holding that calendar's PRIVATE iCal URL
# (Google Calendar → Settings → "Secret address in iCal format").
CALS = [
    {"key": "joint",  "env": "ICS_URL_JOINT",  "label": "Joint"},
    {"key": "myplan", "env": "ICS_URL_MYPLAN", "label": "My Plan"},
    {"key": "caney",  "env": "ICS_URL_CANEY",  "label": "Caney"},
    {"key": "staff",  "env": "ICS_URL_STAFF",  "label": "Staff"},
]

# ── Notion ───────────────────────────────────────────────────────────────────
NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "").strip()
NOTION_DB = os.environ.get("NOTION_DAYPLAN_DB", "e3212b3245264da48a12dc6d8900490b").strip()
NOTION_VER = "2022-06-28"
DATE_PROP = "Scheduled Date"

BRAZIL_DEPART = date(2026, 7, 27)

# ── emoji / treatment rules (title substring, case-insensitive) ──────────────
# (pattern, emoji, is_meal, treatment)  treatment ∈ {"", "rock", "open"}
RULES = [
    ("shambhavi",      "🧘", False, ""),
    ("sadhana",        "🧘", False, ""),
    ("super veggie",   "🥦", True,  ""),
    ("nutty pudding",  "🥣", True,  ""),
    ("breakfast",      "🥣", True,  ""),
    ("lunch",          "🍽️", True,  ""),
    ("dinner",         "🍽️", True,  ""),
    ("domestics",      "🧹", False, ""),
    ("groceries",      "🛒", False, ""),
    ("grocery",        "🛒", False, ""),
    ("zouk",           "💃", False, ""),
    ("samba",          "💃", False, ""),
    ("workshop",       "💃", False, ""),
    (" ws",            "💃", False, ""),
    ("ws ",            "💃", False, ""),
    ("rehearsal",      "💃", False, ""),
    ("dance",          "💃", False, ""),
    ("social",         "🎉", False, ""),
    ("party",          "🎉", False, ""),
    ("gym",            "🏋️", False, ""),
    ("sauna",          "🏋️", False, ""),
    ("mobility",       "🤸", False, ""),
    ("drive",          "🚗", False, ""),
    ("pack",           "🎒", False, ""),
    ("pool",           "🏊", False, ""),
    ("cake",           "🎂", False, ""),
    ("birthday",       "🎂", False, ""),
    ("wind-down",      "🌙", False, "rock"),
    ("wind down",      "🌙", False, "rock"),
    ("sleep",          "🌙", False, "rock"),
]


def die(msg):
    print(f"FATAL: {msg}", file=sys.stderr)
    sys.exit(1)


_LEAD_EMOJI = re.compile(
    r"^[\s‍️"
    r"\U0001F300-\U0001FAFF"
    r"\U00002600-\U000027BF"
    r"\U0001F1E6-\U0001F1FF"
    r"\U00002190-\U000021FF"
    r"\U00002B00-\U00002BFF]+")


def strip_lead_emoji(summary):
    """Calendar titles often already start with an emoji ('🧘 Shambhavi',
    '🥦Super Veggie'). Drop it so we don't double up with our mapped one."""
    return _LEAD_EMOJI.sub("", summary).strip()


def classify(summary):
    s = summary.lower()
    for pat, emoji, meal, treat in RULES:
        if pat in s:
            return emoji, meal, treat
    return "📌", False, ""


def fetch_events(env, url, day_start, day_end, label):
    """Return [{summary, start(dt), end(dt), all_day(bool)}] for the window."""
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        cal = icalendar.Calendar.from_ical(r.content)
    except Exception as e:
        die(f"calendar '{label}' ({env}) failed to fetch/parse: {e}")
    occ = recurring_ical_events.of(cal).between(day_start, day_end)
    out = []
    for e in occ:
        summary = str(e.get("SUMMARY", "")).strip()
        if not summary:
            continue
        status = str(e.get("STATUS", "")).upper()
        if status == "CANCELLED":
            continue
        if summary.lower() in ("unavailable", "busy"):
            continue
        dt = e.get("DTSTART").dt
        de = e.get("DTEND").dt if e.get("DTEND") else None
        all_day = not isinstance(dt, datetime)
        if all_day:
            out.append({"summary": summary, "start": None, "end": None,
                        "all_day": True, "label": label})
            continue
        s = dt.astimezone(TZ)
        en = de.astimezone(TZ) if isinstance(de, datetime) else None
        out.append({"summary": summary, "start": s, "end": en,
                    "all_day": False, "label": label})
    return out


def hm(dt):
    return dt.strftime("%H:%M")


def esc(t):
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def build_timelines(events):
    """Return (today_html, meals_html, flags_html, plan_rows) from timed events."""
    timed = sorted([e for e in events if not e["all_day"]], key=lambda e: e["start"])
    all_day = [e for e in events if e["all_day"]]

    # deep-work injection: if nothing hard occupies 15:30–17:00, add the focus block
    win_s = 15 * 60 + 30
    win_e = 17 * 60
    def mins(dt): return dt.hour * 60 + dt.minute
    occupied = False
    for e in timed:
        emoji, meal, treat = classify(e["summary"])
        if meal:
            continue
        es = mins(e["start"])
        ee = mins(e["end"]) if e["end"] else es + 60
        if es < win_e and ee > win_s:
            occupied = True
            break

    slots = []          # (sort_min, html, is_meal, summary, start, end)
    plan_rows = []       # for Notion: (timelabel, title, note)

    for e in timed:
        emoji, meal, treat = classify(e["summary"])
        clean = strip_lead_emoji(e["summary"]) or e["summary"]
        title = f"{emoji} {esc(clean)}"
        if e["end"] and e["end"] > e["start"]:
            note = f"{hm(e['start'])}–{hm(e['end'])}"
        else:
            note = hm(e["start"])
        cls = "slot" + (f" {treat}" if treat else "")
        html = (f'    <div class="{cls}" data-start="{hm(e["start"])}">'
                f'<span class="t">{hm(e["start"])}</span>'
                f'<div class="what"><b>{title}</b>'
                f'<span class="d">{note}</span></div></div>')
        slots.append((mins(e["start"]), html, meal, e["summary"], e["start"], e["end"]))
        plan_rows.append((note, f"{emoji} {clean}", ""))

    if not occupied:
        dw = ('    <div class="slot open" data-start="15:30">'
              '<span class="t">15:30</span>'
              '<div class="what"><b>🎯 Deep-work block</b>'
              '<span class="d">15:30–17:00 · the day\'s real focus window</span></div></div>')
        slots.append((win_s, dw, False, "Deep-work block", None, None))
        plan_rows.append(("15:30–17:00", "🎯 Deep-work block", "the day's focus window"))

    slots.sort(key=lambda x: x[0])
    plan_rows.sort(key=lambda r: r[0])

    today_html = "\n".join(s[1] for s in slots)
    meal_html = "\n".join(
        s[1].replace('class="slot"', 'class="slot"')  # meals keep plain style
        for s in slots if s[2]
    )
    if not meal_html:
        meal_html = ('    <div class="slot" data-start="10:30"><span class="t">10:30</span>'
                     '<div class="what"><b>🥦 Meals</b>'
                     '<span class="d">jot portions in Slack when you cook</span></div></div>')

    # ── flags ────────────────────────────────────────────────────────────────
    flags = []
    # headline: latest significant evening event (>=17:00, non-meal, non-rock)
    evening = [s for s in slots if s[0] >= 17 * 60 and not s[2]
               and "🌙" not in s[1]]
    headline = None
    for s in evening:
        if "🎯" in s[1]:
            continue
        headline = s
    if headline:
        # pull the bold title text back out
        m = re.search(r"<b>(.*?)</b>.*?<span class=\"d\">(.*?)</span>", headline[1])
        if m:
            flags.append(f'<b>TONIGHT:</b> {m.group(1)} — {m.group(2)}')
    # all-day context (festival/birthday banners)
    for a in all_day:
        low = a["summary"].lower()
        if any(k in low for k in ("infinity", "congress", "festival", "czc", "zouk")):
            flags.append(f'<b>TODAY:</b> {esc(a["summary"])}')
            break
    # Brazil countdown
    today = datetime.now(TZ).date()
    days = (BRAZIL_DEPART - today).days
    if 0 <= days <= 7:
        unit = "today" if days == 0 else ("tomorrow" if days == 1 else f"{days} days out")
        flags.append(f'<b>BRAZIL:</b> {unit} (Mon Jul 27) — check prep is on the calendar')
    elif not occupied:
        flags.append('<b>FOCUS:</b> 15:30–17:00 is today\'s real deep-work window')

    flags = flags[:2] if flags else [
        '<b>TODAY:</b> plan below — reply in Slack to reshape it']
    flags_html = "\n".join(
        f'  <div class="flag"><span>{f}</span></div>' for f in flags)

    return today_html, meal_html, flags_html, plan_rows


def splice(html, start_marker, end_marker, inner, indent_close=""):
    pat = re.compile(re.escape(start_marker) + r".*?" + re.escape(end_marker), re.S)
    block = f"{start_marker}\n{inner}\n{indent_close}{end_marker}"
    if not pat.search(html):
        die(f"marker {start_marker} not found in index.html")
    return pat.sub(lambda _: block, html, count=1)


def update_hub(today_html, meal_html, flags_html):
    with open(INDEX, encoding="utf-8") as fh:
        html = fh.read()

    today_inner = (
        f"{flags_html}\n"
        f'  <div class="tl" id="today-tl">\n{today_html}\n  </div>')
    html = splice(
        html,
        "<!-- ROLLOVER:TODAY:START — everything between these markers is regenerated daily by scripts/rollover.py. Hand-edits here are overwritten at the next rollover. -->",
        "<!-- ROLLOVER:TODAY:END -->",
        today_inner, indent_close="  ")

    meals_inner = (
        '    <div class="tl" style="margin-top:.6rem">\n'
        f'{meal_html}\n    </div>')
    html = splice(
        html,
        "<!-- ROLLOVER:MEALS:START — regenerated daily by scripts/rollover.py (planned meals only; macros are logged live during the day). -->",
        "<!-- ROLLOVER:MEALS:END -->",
        meals_inner, indent_close="    ")

    with open(INDEX, "w", encoding="utf-8") as fh:
        fh.write(html)


# ── Notion ───────────────────────────────────────────────────────────────────
def notion_headers():
    return {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": NOTION_VER,
        "Content-Type": "application/json",
    }


def notion_day_exists(iso_day):
    r = requests.post(
        f"https://api.notion.com/v1/databases/{NOTION_DB}/query",
        headers=notion_headers(),
        json={"filter": {"property": DATE_PROP, "date": {"equals": iso_day}},
              "page_size": 1},
        timeout=30)
    if r.status_code == 200:
        return len(r.json().get("results", [])) > 0
    print(f"WARN: Notion query returned {r.status_code}: {r.text[:300]}")
    # Don't create a possible duplicate if we can't verify.
    return True


def notion_create_day(iso_day, weekday_title, plan_rows, headline):
    icon = "🌅"
    anchor = (f"Auto-rolled {datetime.now(TZ).strftime('%-I:%M %p ET')}. "
              f"{headline or 'Home day.'} "
              "Day Hub = today only; this page is the durable record + change log "
              "+ meal log + review. Deep-work window 15:30–17:00 is the real focus slot.")
    children = [
        {"object": "block", "type": "callout",
         "callout": {"icon": {"type": "emoji", "emoji": "🗓️"},
                     "color": "orange_background",
                     "rich_text": [{"type": "text", "text": {"content": anchor}}]}},
        {"object": "block", "type": "heading_2",
         "heading_2": {"rich_text": [{"type": "text",
                       "text": {"content": "🗓️ Day Plan"}}]}},
    ]
    for tlabel, title, note in plan_rows:
        line = f"{tlabel} — {title}" + (f" · {note}" if note else "")
        children.append({"object": "block", "type": "bulleted_list_item",
                         "bulleted_list_item": {"rich_text": [
                             {"type": "text", "text": {"content": line}}]}})
    children += [
        {"object": "block", "type": "heading_2",
         "heading_2": {"rich_text": [{"type": "text",
                       "text": {"content": "📝 Change log"}}]}},
        {"object": "block", "type": "bulleted_list_item",
         "bulleted_list_item": {"rich_text": [{"type": "text", "text": {
             "content": f"Rolled over automatically at "
                        f"{datetime.now(TZ).strftime('%-I:%M %p')}."}}]}},
        {"object": "block", "type": "heading_2",
         "heading_2": {"rich_text": [{"type": "text",
                       "text": {"content": "🍽️ Meal Log"}}]}},
        {"object": "block", "type": "paragraph",
         "paragraph": {"rich_text": [{"type": "text", "text": {
             "content": "(Filled in live as portions are reported.)"}}]}},
        {"object": "block", "type": "heading_2",
         "heading_2": {"rich_text": [{"type": "text",
                       "text": {"content": "📝 Post-Activity Review"}}]}},
    ]
    for q in ("Overall rating (1–5):", "What worked well:",
              "What didn't work / would change:", "Standout moments:",
              "Lessons learned:"):
        children.append({"object": "block", "type": "bulleted_list_item",
                         "bulleted_list_item": {"rich_text": [
                             {"type": "text", "text": {"content": q}}]}})

    payload = {
        "parent": {"type": "database_id", "database_id": NOTION_DB},
        "icon": {"type": "emoji", "emoji": icon},
        "properties": {
            "Name": {"title": [{"text": {"content": weekday_title}}]},
            "Activity Type": {"select": {"name": "Main Focus"}},
            "Status": {"select": {"name": "In progress"}},
            "Trip": {"select": {"name": "Toronto"}},
            DATE_PROP: {"date": {"start": iso_day}},
        },
        "children": children,
    }
    r = requests.post("https://api.notion.com/v1/pages",
                      headers=notion_headers(), json=payload, timeout=30)
    if r.status_code not in (200, 201):
        die(f"Notion page create failed {r.status_code}: {r.text[:400]}")
    return r.json().get("url", "(created)")


def main():
    now = datetime.now(TZ)
    day_start = now.replace(hour=4, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(hours=23, minutes=59)
    iso_day = now.date().isoformat()
    weekday_title = f"🌅 {now.strftime('%A, %b %-d %Y')} — Day Plan"

    events = []
    for c in CALS:
        url = os.environ.get(c["env"], "").strip()
        if not url:
            die(f"missing secret {c['env']} for the {c['label']} calendar")
        evs = fetch_events(c["env"], url, day_start, day_end, c["label"])
        if c["key"] == "staff":
            # Staff rows are reference only unless the title names Junyan.
            evs = [e for e in evs if e["summary"].lower().startswith("junyan")]
        events.extend(evs)

    today_html, meal_html, flags_html, plan_rows = build_timelines(events)
    headline = None
    m = re.search(r"<b>TONIGHT:</b>\s*(.*?)\s*—", flags_html)
    if m:
        headline = f"Tonight: {m.group(1)}."

    update_hub(today_html, meal_html, flags_html)
    print(f"Hub rewritten for {iso_day} ({len(plan_rows)} blocks).")

    if not NOTION_TOKEN:
        print("NOTION_TOKEN absent — skipped Notion Day Plan (hub still updated).")
        return
    if notion_day_exists(iso_day):
        print(f"Notion Day Plan for {iso_day} already exists — not duplicating.")
        return
    url = notion_create_day(iso_day, weekday_title, plan_rows, headline)
    print(f"Notion Day Plan created: {url}")


if __name__ == "__main__":
    main()
