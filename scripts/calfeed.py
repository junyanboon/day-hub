#!/usr/bin/env python3
"""
One calendar reader for both day-hub scripts (rollover.py, still_plan.py).

Two backends, one output shape. Which one runs is decided per calendar by which
secrets are set, so the two can be migrated independently and rolled back
without a code change:

  1. Google Calendar API (preferred) — a service account reads the calendar by
     id. This is the supported door. Recurring events are expanded server-side
     (singleEvents), so only today's window crosses the wire.
  2. Secret iCal URL (fallback) — the original path. Kept because Google's
     private ICS endpoints are the only thing the Cloudflare Worker in
     still-api/ can use, and because the workflow must stay green until the
     service account is provisioned.

WHY THE SWITCH: Google's private ICS endpoints return intermittent — and
sometimes sustained — 5xx. A 500 on the Joint Plans feed took every day-hub run
down from 2026-09-03 14:17Z onward: ten consecutive failures, zero successes,
while the Calendar API served the same calendar's events without complaint.

Both backends retry the failures a second attempt can plausibly fix and fail
fast on the ones it cannot, so a transient blip never costs a whole run.

Times come back as aware datetimes in America/Toronto, matching what the iCal
path produced. Never shift them further: a class stored 18:30-04:00 must stay
18:30-04:00 so Junyan's phone renders it correctly from São Paulo.

Env, per calendar (see scripts/RUNBOOK.md):
  GOOGLE_SA_JSON   service-account key, raw JSON or base64 — shared by all
  CAL_ID_<NAME>    calendar id, e.g. ...@group.calendar.google.com
  ICS_URL_<NAME>   secret iCal URL (fallback)
"""

import base64
import json
import os
import re
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

TZ = ZoneInfo("America/Toronto")

ATTEMPTS = 3
BACKOFF = (3, 9)        # seconds to wait before attempt 2, then attempt 3

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


class Permanent(Exception):
    """A failure retrying cannot fix — a revoked URL, a calendar not shared
    with the service account, a wrong id. Retrying only delays the same answer.
    """


def die(msg):
    print(f"FATAL: {msg}", file=sys.stderr)
    sys.exit(1)


def _retrying(what, label, call):
    """Run `call`, retrying transient failures. `call` raises Permanent for the
    ones that will never succeed."""
    last = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            return call()
        except Permanent as e:
            die(f"calendar '{label}' {what} failed permanently: {e}")
        except Exception as e:
            last = e
            if attempt == ATTEMPTS:
                break
            wait = BACKOFF[attempt - 1]
            print(f"calendar '{label}' {what} attempt {attempt}/{ATTEMPTS} "
                  f"failed: {e} — retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    die(f"calendar '{label}' {what} failed after {ATTEMPTS} attempts: {last}")


# ── Google Calendar API ──────────────────────────────────────────────────────

_service = None


def google_ready():
    """True when the service-account key is present. Calendar ids are checked
    per calendar by read_day, so one calendar can move before the others."""
    return bool(os.environ.get("GOOGLE_SA_JSON", "").strip())


def _client():
    """Build (once) an authorised Calendar client from GOOGLE_SA_JSON.

    The secret holds a service-account key as raw JSON, or base64 of the same —
    base64 survives copy-paste into a secrets box without newline mangling.
    """
    global _service
    if _service is not None:
        return _service

    raw = os.environ.get("GOOGLE_SA_JSON", "").strip()
    if not raw:
        die("GOOGLE_SA_JSON is empty — cannot use the Calendar API")

    if not raw.lstrip().startswith("{"):
        try:
            raw = base64.b64decode(raw).decode("utf-8")
        except Exception as e:
            die(f"GOOGLE_SA_JSON is neither JSON nor valid base64: {e}")
    try:
        info = json.loads(raw)
    except Exception as e:
        die(f"GOOGLE_SA_JSON is not valid JSON: {e}")

    missing = [k for k in ("client_email", "private_key", "token_uri")
               if not info.get(k)]
    if missing:
        die("GOOGLE_SA_JSON is not a service-account key — missing "
            f"{', '.join(missing)}. Download the JSON key, do not paste the "
            "OAuth client or the project id.")

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as e:
        die(f"Google client libraries missing ({e}) — "
            "pip install -r scripts/requirements.txt")

    creds = service_account.Credentials.from_service_account_info(
        info, scopes=SCOPES)
    _service = build("calendar", "v3", credentials=creds,
                     cache_discovery=False)
    return _service


def _google_day(cal_id, day_start, day_end, label):
    """Fetch one day's events for one calendar id. Recurrence is expanded by
    Google (singleEvents), so this replaces recurring_ical_events entirely."""
    from googleapiclient.errors import HttpError

    def call():
        svc = _client()
        items, page = [], None
        while True:
            try:
                resp = svc.events().list(
                    calendarId=cal_id,
                    timeMin=day_start.isoformat(),
                    timeMax=day_end.isoformat(),
                    singleEvents=True,
                    orderBy="startTime",
                    maxResults=2500,
                    pageToken=page,
                ).execute(num_retries=0)   # _retrying owns the retry policy
            except HttpError as e:
                status = getattr(e.resp, "status", None)
                reason = getattr(e, "reason", "") or ""

                if status == 401:
                    raise Permanent(
                        f"HTTP 401 — Google rejected the service-account key "
                        f"({reason}). Check GOOGLE_SA_JSON.") from e

                # 403 is two different things. Google returns it for a real
                # permission denial AND for rate/quota limits, which are
                # transient. Only the first kind is permanent. The machine
                # reason ("rateLimitExceeded") lives in the response body, so
                # check that as well as the human message.
                body = (e.content or b"").decode("utf-8", "replace")
                if status == 403 and not re.search(r"rate|quota",
                                                   reason + " " + body, re.I):
                    raise Permanent(
                        f"HTTP 403 on calendar id {cal_id!r} — {reason}. Share "
                        "the calendar with the service account (See all event "
                        "details).") from e

                # 404 is NOT treated as permanent, even though a wrong id also
                # returns it. Measured 2026-09-04: a calendar shared minutes
                # earlier returned 404 on 1 of 5 identical requests while the
                # ACL propagated across Google's replicas. Failing fast there
                # turns a settling share into a dead run, so retry and let the
                # attempt budget decide.
                if status == 404:
                    raise RuntimeError(
                        f"HTTP 404 on calendar id {cal_id!r} — not shared with "
                        "the service account, wrong id, or a very recent share "
                        "still propagating") from e
                raise
            items += resp.get("items", [])
            page = resp.get("nextPageToken")
            if not page:
                return items

    return _retrying("Google Calendar read", label, call)


def _parse_api_event(e):
    """One API event → the neutral shape, or None to drop it."""
    if e.get("status") == "cancelled":
        return None
    summary = (e.get("summary") or "").strip()
    start, end = e.get("start", {}), e.get("end", {})

    if start.get("date"):                       # all-day
        return {"summary": summary, "start": None, "end": None,
                "all_day": True}

    sd, ed = start.get("dateTime"), end.get("dateTime")
    if not sd:
        return None
    s = datetime.fromisoformat(sd).astimezone(TZ)
    en = datetime.fromisoformat(ed).astimezone(TZ) if ed else None
    return {"summary": summary, "start": s, "end": en, "all_day": False}


# ── secret iCal URL (fallback) ───────────────────────────────────────────────

def _ics_calendar(url, label):
    """GET and parse one iCal feed.

    Retried: network/timeout errors, 429, 5xx, and parse failures (a truncated
    or HTML-error body). Not retried: other 4xx — a revoked or wrong URL.
    """
    import icalendar

    def call():
        r = requests.get(url, timeout=30)
        if 400 <= r.status_code < 500 and r.status_code != 429:
            raise Permanent(f"HTTP {r.status_code}")
        r.raise_for_status()
        return icalendar.Calendar.from_ical(r.content)

    return _retrying("iCal fetch", label, call)


def _ics_day(url, day_start, day_end, label):
    import recurring_ical_events

    cal = _ics_calendar(url, label)
    out = []
    for e in recurring_ical_events.of(cal).between(day_start, day_end):
        if str(e.get("STATUS", "")).upper() == "CANCELLED":
            continue
        summary = str(e.get("SUMMARY", "")).strip()
        dt = e.get("DTSTART").dt
        de = e.get("DTEND").dt if e.get("DTEND") else None
        if not isinstance(dt, datetime):        # all-day
            out.append({"summary": summary, "start": None, "end": None,
                        "all_day": True})
            continue
        out.append({"summary": summary,
                    "start": dt.astimezone(TZ),
                    "end": de.astimezone(TZ) if isinstance(de, datetime) else None,
                    "all_day": False})
    return out


# ── the one entry point ──────────────────────────────────────────────────────

def read_day(name, label, day_start, day_end):
    """Read one calendar's events for [day_start, day_end).

    `name` is the secret suffix — "JOINT" reads CAL_ID_JOINT / ICS_URL_JOINT.
    Returns [{summary, start, end, all_day}] with aware America/Toronto
    datetimes (None for all-day). Callers apply their own filtering.

    Prefers the Calendar API and falls back to the iCal URL, so a calendar
    moves the moment its id is set and nothing breaks before that.
    """
    cal_id = os.environ.get(f"CAL_ID_{name}", "").strip()
    ics_url = os.environ.get(f"ICS_URL_{name}", "").strip()

    if cal_id and google_ready():
        return [ev for ev in
                (_parse_api_event(e)
                 for e in _google_day(cal_id, day_start, day_end, label))
                if ev is not None]

    if ics_url:
        if cal_id and not google_ready():
            print(f"calendar '{label}': CAL_ID_{name} is set but "
                  "GOOGLE_SA_JSON is not — using the iCal URL",
                  file=sys.stderr)
        return _ics_day(ics_url, day_start, day_end, label)

    die(f"calendar '{label}': set CAL_ID_{name} (+ GOOGLE_SA_JSON) "
        f"or ICS_URL_{name}")


def source_of(name):
    """Which backend read_day will use — for run logs and /health output."""
    if os.environ.get(f"CAL_ID_{name}", "").strip() and google_ready():
        return "google-api"
    if os.environ.get(f"ICS_URL_{name}", "").strip():
        return "ics-url"
    return "unconfigured"
