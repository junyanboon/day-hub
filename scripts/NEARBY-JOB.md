# Nearby job: research the stays coming up

Junyan, 2026-10-16 (d3): the Nearby card on Day Quest should know every stay on the calendar
without anyone typing it in ("we already have brazil trip coming up"). This job runs weekly. It
finds the stays in the next 21 days that the card does not know yet, researches places to see and
eat near each one, and adds them to `still/nearby-stays.json`. The card reads that file and picks
the stay from its check-in and check-out times (`still/quest-nearby.js`, `stayAt`).

## 1. Find the stays

Read the **Joint Plans** calendar (`fm1c5usrdr4n94qfla41lplg50@group.calendar.google.com`) from
today to today + 21 days.

A stay is an all-day event with a location that is a place to sleep: a hotel or rental (title ends
in a `[YYYY.MM.DD]` stamp, or names a hotel, Airbnb, flat, apartment, studio or hostel) **and** has
a timed check-in event at the same address. An all-day event for a festival, congress or class
("IZC 2027", "Lambafest 2027") is not a stay, even with a location.

For each stay take:
- `in`: the check-in event's start, as the stay's own wall clock (`2027-01-03T15:00`). No event:
  15:00 on the first day.
- `out`: the check-out event's start, same format. No event: 11:00 on the all-day event's last day.
- `tz`: the check-in event's time zone (Rio and São Paulo are `America/Sao_Paulo`).
- `origin`: the street address from the event's location.

Skip a stay the card already has: same address or name as a stay in `STAYS` in
`still/quest-nearby.js` or in `still/nearby-stays.json`.

Two stays booked for the same nights (a backup booking) are both added; list them under
"Overlaps" in the report so Junyan can say which one is real.

## 2. Research each new stay

Who is eating and going out:
- Junyan: vegetarian, egg-free, garlic-light, wants real protein (tofu, legumes, tempeh, cheese).
- Caney: loves soup (ramen, pho, caldos, cremas) and seafood.
- Both eat healthy and want well rated places: about Google 4.4 or better (or the same on
  TripAdvisor, TheFork or HappyCow) with a decent number of reviews.

**Eat**: 6 to 9 places, mostly within a 20 minute walk. Best for both of them first, then a strong
vegetarian place and a strong soup or seafood place, a healthy breakfast café, a food market if one
fits. Say honestly what each person can order.

**See & do**: 5 to 7 sights, parks, markets or walks near the stay. Add the hotel gym as the first
row (`walk: 0`) if the hotel has one.

Check every place on the web: open now (not permanently closed), exact address, rating with its
source and review count, opening hours and closing days for the dates of the stay, whether to book.
Never invent a rating; leave `rating` out if none is found.

Times, from the stay's address:
- Geocode with Nominatim (`https://nominatim.openstreetmap.org/search?format=json&q=...`, send a
  User-Agent header, one request a second).
- Walking: `https://routing.openstreetmap.de/routed-foot/route/v1/foot/{lon},{lat};{lon2},{lat2}?overview=false`,
  `routes[0].duration / 60`, rounded.
- Over 25 minutes on foot: also `car` from
  `https://routing.openstreetmap.de/routed-car/route/v1/driving/{lon},{lat};{lon2},{lat2}?overview=false`.
  Over an hour on foot: leave `walk` out and give `car` only.

## 3. Write the file

Append one object per stay to `stays` in `still/nearby-stays.json`:

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

Then run `node --test still/test/*.test.mjs`. Every test must pass.

## 4. Ship it

Commit only `still/nearby-stays.json` on a branch, open a pull request on `junyanboon/day-hub` and
merge it (squash). Message: `Nearby job: add <short names>`. GitHub Pages publishes it within a few
minutes. If no new stay was found, change nothing and open nothing.

## 5. Report

A few plain lines: stays added (name, dates, how many places), stays skipped and why, overlaps,
and anything that could not be checked.
