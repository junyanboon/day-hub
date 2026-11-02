#!/usr/bin/env python3
"""
Day Hub — deterministic morning rollover (GitHub Actions, Brazil-proof).

Pure rails, no AI. Once a day it:
  1. Reads the four Google Calendars for TODAY (America/Toronto) via
     scripts/calfeed.py — Calendar API where configured, secret ICS URL otherwise.
  2. Builds the Day Hub #tab-today + #tab-meals timelines and splices them into
     index.html between the ROLLOVER:* markers (leaving the rest of the app alone).

It no longer creates a Notion "Day Plan" page (Junyan, 2026-11-01: those pages
were useless; that step was removed).

The workflow commits index.html only when it changed, and pushes with the built-in
GITHUB_TOKEN (no PAT).

This mirrors the proven fbs-monitor / day-sheet cloud pattern. It replaces the local
`day-hub-morning-rollover` scheduled task, which the local scheduler skips unattended.

Fail policy: a calendar-source failure that survives its retries aborts nonzero and
writes nothing (never a fabricated/partial page). Missing secrets → the workflow
skip-greens before we run.
"""

import os
import re
import sys
import json
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo


import calfeed

TZ = ZoneInfo("America/Toronto")
HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, "..", "index.html")

# ── calendars ────────────────────────────────────────────────────────────────
# Each maps to a GitHub secret holding that calendar's PRIVATE iCal URL
# (Google Calendar → Settings → "Secret address in iCal format").
CALS = [
    {"key": "joint",  "name": "JOINT",  "label": "Joint"},
    {"key": "myplan", "name": "JUNYAN", "label": "My Plan"},
    {"key": "caney",  "name": "CANEY",  "label": "Caney"},
    {"key": "staff",  "name": "STAFF",  "label": "Staff"},
]

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
    ("laundry",        "🧺", False, ""),
    ("laundo",         "🧺", False, ""),   # recurring typo in the calendar event
    ("nails",          "💅", False, ""),
    ("rbc",            "🏦", False, ""),
    ("bank",           "🏦", False, ""),
    ("studio",         "🏢", False, ""),
    ("morning",        "🌅", False, ""),
    ("parents",        "👨‍👩‍👧", False, ""),
    ("flight",         "✈️", False, ""),
    ("brazil",         "✈️", False, ""),
    ("airport",        "✈️", False, ""),
    ("doctor",         "🩺", False, ""),
    ("dentist",        "🦷", False, ""),
    ("call",           "📞", False, ""),
    ("meeting",        "👥", False, ""),
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


def fetch_events(name, day_start, day_end, label):
    """Return [{summary, start(dt), end(dt), all_day(bool)}] for the window."""
    out = []
    for e in calfeed.read_day(name, label, day_start, day_end):
        summary = e["summary"]
        if not summary:
            continue
        if summary.lower() in ("unavailable", "busy"):
            continue
        out.append({"summary": summary, "start": e["start"], "end": e["end"],
                    "all_day": e["all_day"], "label": label})
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


def hub_day(html):
    """The date the hub's generated regions were last built for, or None."""
    m = re.search(r'data-rollover-day="(\d{4}-\d{2}-\d{2})"', html)
    return m.group(1) if m else None


def update_hub(today_html, meal_html, flags_html, iso_day):
    """Rewrite the generated regions — but ONLY when rolling to a NEW day.

    The live co-pilot annotates these same regions during the day: ticked meals,
    computed macros, retimed blocks. Those edits are the day's real record and the
    rollover has no way to reproduce them. So once a region is stamped with today's
    date, a later run leaves it alone — a rollover rolls to a new day, it does not
    rewrite the current one. (This also makes the double cron fire a true no-op.)
    Set FORCE_ROLLOVER=1 to rebuild today from the calendar anyway, discarding
    whatever was logged.
    """
    with open(INDEX, encoding="utf-8") as fh:
        html = fh.read()

    stamped = hub_day(html)
    if stamped == iso_day and not os.environ.get("FORCE_ROLLOVER", "").strip():
        print(f"Hub already built for {iso_day} — leaving live edits intact "
              f"(set FORCE_ROLLOVER=1 to override).")
        return False

    today_inner = (
        f"{flags_html}\n"
        f'  <div class="tl" id="today-tl" data-rollover-day="{iso_day}">\n'
        f"{today_html}\n  </div>")
    html = splice(
        html,
        "<!-- ROLLOVER:TODAY:START — everything between these markers is regenerated daily by scripts/rollover.py. Hand-edits here are overwritten at the next rollover. -->",
        "<!-- ROLLOVER:TODAY:END -->",
        today_inner, indent_close="  ")

    meals_inner = (
        f'    <div class="tl" style="margin-top:.6rem" data-rollover-day="{iso_day}">\n'
        f'{meal_html}\n    </div>')
    html = splice(
        html,
        "<!-- ROLLOVER:MEALS:START — regenerated daily by scripts/rollover.py (planned meals only; macros are logged live during the day). -->",
        "<!-- ROLLOVER:MEALS:END -->",
        meals_inner, indent_close="    ")

    with open(INDEX, "w", encoding="utf-8") as fh:
        fh.write(html)
    return True


def main():
    now = datetime.now(TZ)
    day_start = now.replace(hour=4, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(hours=23, minutes=59)
    iso_day = now.date().isoformat()

    events = []
    for c in CALS:
        print(f"calendar '{c['label']}' via {calfeed.source_of(c['name'])}",
              file=sys.stderr)
        evs = fetch_events(c["name"], day_start, day_end, c["label"])
        if c["key"] == "staff":
            # Staff rows are reference only unless the title names Junyan.
            evs = [e for e in evs if e["summary"].lower().startswith("junyan")]
        events.extend(evs)

    today_html, meal_html, flags_html, plan_rows = build_timelines(events)

    if update_hub(today_html, meal_html, flags_html, iso_day):
        print(f"Hub rewritten for {iso_day} ({len(plan_rows)} blocks).")

if __name__ == "__main__":
    main()
