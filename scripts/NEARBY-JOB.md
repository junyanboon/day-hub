# Nearby job: research the stays and the day's places coming up

Junyan, 2026-10-16 (d3): the Nearby card on Day Quest should know every stay on the calendar
without anyone typing it in ("we already have brazil trip coming up"). Later that day (d4, d6, d8)
he asked for it to run **daily**, to cover **each place of the day** too (the card's title is a
drop-down of the day's places: the stay, then each event with an address), to have everything
ready **before he looks** (no live asking), and to **remove** what is cancelled.

Each run:
1. finds the stays in the next 21 days and the event places in the next 3 days that the card does
   not know yet;
2. researches places to see and eat near each;
3. saves them on the Still server;
4. removes stays and event places whose calendar event is gone or has moved.

The card reads them from the server, picks the stay from its check-in and check-out times
(`still/quest-nearby.js`, `stayAt`) and lists the day's event places in its drop-down (`choices`).

Nothing of this goes in this repo: it is public, and a stay or an event place is an address with
the dates Junyan and Caney are there.

Server: `https://still.srv1948070.hstgr.cloud`. Send the pairing code from the environment variable
`QUEST_KEY` as the header `X-Quest-Key`. Never print it, log it or put it in a URL. If it is empty,
or a call answers 401, stop and report "QUEST_KEY missing or wrong".

## 1. Find the stays

Read the **Joint Plans** calendar (`fm1c5usrdr4n94qfla41lplg50@group.calendar.google.com`) from
today to today + 21 days.

A stay is an all-day event with a location that is a place to sleep: its title ends in a
`[YYYY.MM.DD]` stamp, or names a hotel, Airbnb, flat, apartment, studio or hostel, or a timed
check-in event uses the same address. Any one of these is enough. An all-day event for a festival,
congress or class ("IZC 2027", "Lambafest 2027") is not a stay, even with a location.

For each stay take:
- `in`: the check-in event's start, as the stay's own wall clock (`2027-01-03T15:00`). The calendar
  tool returns times in Toronto time (`13:00-05:00`): convert to the stay's `tz` first, in Python with
  `zoneinfo`. No check-in event: 15:00 on the first day.
- `out`: the check-out event's start, converted the same way. No event: 11:00 on the all-day
  event's last day.
- `tz`: the check-in event's time zone (Rio and São Paulo are `America/Sao_Paulo`).
- `origin`: the street address from the event's location.

Skip a stay the card already has: same address or name as a stay in `STAYS` in
`still/quest-nearby.js` or in `GET /quest/nearby` (its `stays` list).

Two stays booked for the same nights are both added (Junyan, 2026-10-16: the overlapping Rio
bookings in February are all real for now; he cancels the extras closer to the date). List them
under "Overlaps" in the report.

## 1b. Find the event places

Read the **Joint Plans** and **Junyan**
(`c647a75387b94bd045b4e6ec216b3b42585b37c057c8ec35b54dbc9bf6230f1a@group.calendar.google.com`)
calendars from today to today + 3 days. An event place is a timed event whose location is a real
address or a named venue ("Be Banh Mi Es Vietnam, Calle de San Bernardo 25, Madrid"). Skip:
- a location that is only a city or area ("Madrid", "La Pedriza");
- the stay's own address (check-in, checkout, hotel gym, breakfast in the hotel);
- flights, trains and rides (a location with "→", an airport or a station);
- recurring home events (Toronto) and anything at home.

For each event place take: `ev` (the event id), `title` (the event title), `loc` (its location),
`date` (the event's day in its own time zone, `2026-10-18`), `tz`, and `lat`/`lng` from geocoding
`loc`. `name` is the venue in a few words ("Punto Vegano", "Museo del Prado").

The id is `spot:<date>:<short-kebab-name>`. Skip one already on the server with the same `ev` and
`date` and a `loc` that has not changed.

**Next to something already researched**: if the event place is within 600 m of a stay or another
event place that has lists (same day or not), do not research it again. Save it with `same` set to
that stay's or place's id and no lists: the card uses those lists, sorted from the event place.

## 2. Research each new stay and event place

Who is eating and going out:
- Junyan: vegetarian, egg-free, garlic-light, wants real protein (tofu, legumes, tempeh, cheese).
- Caney: loves soup (ramen, pho, caldos, cremas) and seafood.
- Both eat healthy and want well rated places: about Google 4.4 or better (or the same on
  TripAdvisor, TheFork or HappyCow) with a decent number of reviews.

**Eat**: 6 to 9 places, mostly within a 20 minute walk. Where the stay has few good places that
close, go up to 30 minutes on foot or a short ride, and say so in the report. Best for both of them first, then a strong
vegetarian place and a strong soup or seafood place, a healthy breakfast café, a food market if one
fits. Say honestly what each person can order.

**See & do**: 5 to 7 sights, parks, markets or walks near the stay. A hotel with a gym gets the gym
as the first row (`walk: 0`). A rental gets no gym row.

Check every place on the web: open now (not permanently closed), exact address, rating with its
source and review count, opening hours and closing days for the dates of the stay, whether to book.
Never invent a rating; leave `rating` out if none is found. Google and TripAdvisor pages usually
cannot be read directly: Google numbers can come from Wanderlog, Restaurant Guru or Gastroranking
(name the source in `rating`, e.g. "4.6 Google (1,100 reviews, via Wanderlog)"), plus HappyCow for
vegetarian places. Restaurant Guru rate-limits after a few pages, so spread the lookups. Leave out a
place that is closed for good, only does delivery, or has no rating and is far.

For an event place, research around its address the same way: Eat 5 to 7, See & do 3 to 5 (what
is worth doing before or after that event). Mind the event's time: a lunch event wants places open
at lunch, an evening class wants dinner after.

Times, from the stay's or event place's address:
- Geocode with Nominatim (`https://nominatim.openstreetmap.org/search?format=json&q=...`, send a
  User-Agent header, one request a second). A beach or park comes back as its middle point: use the
  nearest entrance or the nearest stretch of sand instead.
- Walking: `https://routing.openstreetmap.de/routed-foot/route/v1/foot/{lon},{lat};{lon2},{lat2}?overview=false`,
  `routes[0].duration / 60`, rounded.
- Over 25 minutes on foot: also `car` from
  `https://routing.openstreetmap.de/routed-car/route/v1/driving/{lon},{lat};{lon2},{lat2}?overview=false`.
  Over an hour on foot: leave `walk` out and give `car` only. The routing service ignores traffic,
  so add half again to car times in a big city (Rio, São Paulo, Madrid) and round up.

## 3. Save each stay and event place

Send each on its own as `POST /quest/nearby` with the JSON body `{ "stay": { ... } }` or
`{ "spot": { ... } }`. The same id replaces the earlier copy. A stay looks like this:

```json
{ "id": "rio-flat-moderno-flamengo", "name": "Flat Moderno no Flamengo", "short": "Flamengo flat",
  "kind": "apartment", "match": "flat moderno|sen\\.? vergueiro",
  "tz": "America/Sao_Paulo", "in": "2027-01-03T15:00", "out": "2027-01-07T10:00",
  "origin": "R. Sen. Vergueiro 224, Flamengo, Rio de Janeiro",
  "places": [ { "id": "gym", "icon": "🏋️", "name": "...", "walk": 0, "lat": 0, "lng": 0, "q": "...", "what": "...", "hint": "..." } ],
  "eat": [ { "id": "e-...", "icon": "🍜", "name": "...", "walk": 12, "lat": 0, "lng": 0, "q": "Name, street, city",
             "fits": "under 40 characters, who it suits", "what": "...", "hint": "...", "rating": "4.6 Google (2,100 reviews)" } ] }
```

- `kind` is `hotel` or `apartment`. `short` is what the card title shows after "Nearby ·".
- `match` is a case-insensitive pattern for the stay's calendar titles.
- `q` is a Google Maps search ("Name, street, city"). `min` (minutes) only when a visit is clearly
  not an hour (a market 30, a long dinner 90).
- Ids are unique within a stay; eat ids start with `e-`.
- Plain everyday English, short sentences, no em or en dashes.

An event place looks like this (with its own lists, or `same` and no lists):

```json
{ "id": "spot:2026-10-18:punto-vegano", "name": "Punto Vegano", "date": "2026-10-18",
  "ev": "hfvuko366u5rvis0h16f34jhu8", "title": "Lunch at Punto Vegano",
  "loc": "Calle de Luisa Fernanda 27, Madrid", "tz": "Europe/Madrid", "lat": 40.4281, "lng": -3.7149,
  "places": [ ... ], "eat": [ ... ] }
{ "id": "spot:2026-10-17:museo-cerralbo", "name": "Museo Cerralbo", "date": "2026-10-17", "ev": "...",
  "loc": "Calle de Ventura Rodríguez 17, Madrid", "tz": "Europe/Madrid", "lat": 40.4237, "lng": -3.7145,
  "same": "madrid-marriott-princesa-plaza" }
```

Before sending, check each stay in Python: `in` is before `out`, both look like `2027-01-03T15:00`,
every place has `id`, `name`, `what`, `lat`, `lng` and at least one of `walk`, `transit` or `car`.
A 400 answer says what is wrong; fix it and send again.

## 4. Remove what is gone (d6)

For every stay and event place on the server (`GET /quest/nearby`) whose dates are still ahead or
today, look for its calendar event again. Remove it when:
- a stay: no all-day event at that address covers its dates any more (the booking was cancelled);
- an event place: the event `ev` is gone or cancelled, or its date or location changed (then
  research the new one in the same run).

Send one `POST /quest/nearby` with `{ "remove": { "stays": [ids], "spots": [ids] } }`. Never remove
the hand-made stays in `still/quest-nearby.js` (they are not on the server). Past ones drop off the
server on their own.

## 4b. Check

`GET /quest/nearby` and confirm each one you sent is there with its places and each one you removed
is gone. Change nothing in the repo, and never commit or push.

## 5. Report

A few plain lines: stays and event places added (name, dates, how many places, or "same as"),
skipped and why, removed and why, overlaps, and anything that could not be checked.
