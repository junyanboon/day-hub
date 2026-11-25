// node --test still/test/commute-weather.test.mjs  (d31 B, Junyan 2026-11-25: "31 B": the weather box replaces the small map in the Commute panel)
// The rules behind the weather box: the Open-Meteo address, the hour to read, the words and icon, the tip, the minutes outside, and when
// there is no box. Field names were proven with one real call (see the PR): hourly temperature_2m, apparent_temperature,
// precipitation_probability, weather_code, with timeformat=unixtime. No test reads the real clock: every time here is a fixed instant.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../calendar-core.js";
import "../calendar-commute.js";
const K = globalThis.CalCommute;
const TZ = "America/Toronto";
const at = (iso) => Date.parse(iso);
const src = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("the address sends only the rounded From point, the hourly fields and the time zone", () => {
  const u = new URL(K.weatherUrl({ lat: 43.6532, lng: -79.3849, tz: TZ }));
  assert.equal(u.origin + u.pathname, "https://api.open-meteo.com/v1/forecast");
  assert.deepEqual([...u.searchParams.keys()].sort(), ["forecast_days", "hourly", "latitude", "longitude", "timeformat", "timezone"]);
  assert.equal(u.searchParams.get("latitude"), "43.65");
  assert.equal(u.searchParams.get("longitude"), "-79.38");
  assert.equal(u.searchParams.get("hourly"), "temperature_2m,apparent_temperature,precipitation_probability,weather_code");
  assert.equal(u.searchParams.get("timezone"), TZ);
  assert.equal(u.searchParams.get("timeformat"), "unixtime");
  assert.equal(u.searchParams.get("forecast_days"), "16");
});
test("rounding: two decimals, no minus zero, nothing longer", () => {
  assert.equal(new URL(K.weatherUrl({ lat: 43.6551, lng: -79.3851, tz: TZ })).searchParams.get("latitude"), "43.66");
  assert.equal(new URL(K.weatherUrl({ lat: 43.6551, lng: -79.3851, tz: TZ })).searchParams.get("longitude"), "-79.39");
  assert.equal(new URL(K.weatherUrl({ lat: -0.001, lng: 0.004, tz: TZ })).searchParams.get("latitude"), "0.00");
  assert.equal(new URL(K.weatherUrl({ lat: 43.6, lng: -79, tz: TZ })).searchParams.get("longitude"), "-79.00");
});
test("a place key is the rounded point: two nearby addresses share one answer, and no pin gives none", () => {
  assert.equal(K.weatherKey({ lat: 43.6532, lng: -79.3849 }), "43.65,-79.38");
  assert.equal(K.weatherKey({ lat: 43.6549, lng: -79.3841 }), "43.65,-79.38");
  assert.equal(K.weatherKey({ lat: 43.6551, lng: -79.3849 }), "43.66,-79.38");
  assert.equal(K.weatherKey(null), "");
  assert.equal(K.weatherKey({ lat: null, lng: -79 }), "");
  assert.equal(K.weatherUrl({ lat: null, lng: -79, tz: TZ }), "", "no pin, no address");
});

test("weather codes become words and an icon; every code Open-Meteo documents has both", () => {
  const w = (c) => K.weatherWords(c);
  assert.deepEqual([w(0).words, w(1).words, w(2).words, w(3).words], ["clear", "mostly clear", "partly cloudy", "overcast"]);
  assert.equal(w(61).words, "light rain");
  assert.equal(w(63).words, "rain");
  assert.equal(w(65).words, "heavy rain");
  assert.equal(w(71).words, "light snow");
  assert.equal(w(75).words, "heavy snow");
  assert.equal(w(45).words, "fog");
  assert.equal(w(95).words, "thunderstorm");
  assert.equal(w(0).icon, "☀️");
  assert.equal(w(63).icon, "🌧️");
  assert.equal(w(73).icon, "🌨️");
  assert.equal(w(95).icon, "⛈️");
  for (const c of [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99]) {
    assert.ok(w(c).words && w(c).icon, "code " + c);
  }
  assert.deepEqual(w(1234), { icon: "🌡️", words: "" }, "an unknown code still draws, with no words");
  assert.deepEqual(w(null), { icon: "🌡️", words: "" });
});

test("the hour read is the nearest hour of the answer, in the page's own time: a block that crosses midnight reads the next day", () => {
  const hour = (iso) => at(iso);
  const res = { hourly: {
    time: [at("2026-11-24T23:00:00-05:00"), at("2026-11-25T00:00:00-05:00"), at("2026-11-25T01:00:00-05:00")].map((t) => t / 1000),
    temperature_2m: [2.4, -0.6, -1.2], apparent_temperature: [-1, -4.2, -5], precipitation_probability: [10, 60, 20], weather_code: [3, 71, 3] } };
  assert.deepEqual(K.pickHour(res, hour("2026-11-24T23:20:00-05:00")), { temp: 2.4, feels: -1, pop: 10, code: 3 }, "23:20 reads 23:00");
  assert.deepEqual(K.pickHour(res, hour("2026-11-24T23:50:00-05:00")), { temp: -0.6, feels: -4.2, pop: 60, code: 71 }, "23:50 reads 00:00 of the next day");
  assert.equal(K.pickHour(res, hour("2026-11-25T00:10:00-05:00")).code, 71);
  assert.equal(K.pickHour(res, hour("2026-11-24T23:30:00-05:00")).code, 71, "half past goes to the later hour");
  assert.equal(K.pickHour(res, hour("2026-11-24T23:29:00-05:00")).code, 3);
  assert.equal(K.pickHour(res, hour("2026-11-25T03:00:00-05:00")), null, "after the last hour of the answer");
  assert.equal(K.pickHour(res, hour("2026-11-24T20:00:00-05:00")), null, "before the first hour of the answer");
});
test("the hour read tolerates a bad or short answer: null, never a throw", () => {
  const t = at("2026-11-25T12:36:00-05:00");
  for (const bad of [null, undefined, {}, { hourly: {} }, { hourly: { time: "x" } }, { hourly: { time: [t / 1000], temperature_2m: [] } }, { hourly: { time: [Math.round(t / 3600000) * 3600], temperature_2m: [null] } }]) {
    assert.equal(K.pickHour(bad, t), null);
  }
  const ok = { hourly: { time: [Math.round(t / 3600000) * 3600], temperature_2m: [3.2] } };
  assert.deepEqual(K.pickHour(ok, t), { temp: 3.2, feels: null, pop: null, code: null }, "missing optional fields are null");
});

test("when there is no box: a block that has ended draws nothing, a day past the forecast says so, otherwise ok", () => {
  const now = at("2026-11-25T12:00:00-05:00");
  assert.equal(K.weatherWindow({ at: at("2026-11-25T09:00:00-05:00"), end: at("2026-11-25T11:59:00-05:00"), now, tz: TZ }), "ended");
  assert.equal(K.weatherWindow({ at: at("2026-11-25T09:00:00-05:00"), end: now, now, tz: TZ }), "ended", "ends this very minute: ended");
  assert.equal(K.weatherWindow({ at: at("2026-11-25T11:00:00-05:00"), end: at("2026-11-25T12:30:00-05:00"), now, tz: TZ }), "ok", "in progress");
  assert.equal(K.weatherWindow({ at: at("2026-11-25T13:00:00-05:00"), end: at("2026-11-25T14:00:00-05:00"), now, tz: TZ }), "ok");
  // forecast_days=16 reaches the end of today plus 15 days, on the calendar's clock
  assert.equal(K.weatherWindow({ at: at("2026-12-10T23:30:00-05:00"), end: at("2026-12-11T01:00:00-05:00"), now, tz: TZ }), "ok", "day 16 (Dec 10) is the last covered");
  assert.equal(K.weatherWindow({ at: at("2026-12-11T00:10:00-05:00"), end: at("2026-12-11T01:00:00-05:00"), now, tz: TZ }), "far", "Dec 11 is not");
  // late evening in Toronto is already the next day in UTC: the day counts in Toronto
  assert.equal(K.weatherWindow({ at: at("2026-12-10T21:00:00-05:00"), end: at("2026-12-10T22:00:00-05:00"), now: at("2026-11-25T21:00:00-05:00"), tz: TZ }), "ok");
});

test("minutes outside: all of a walk, only the walking legs of transit, nothing for a drive", () => {
  assert.equal(K.outsideMinutes("commute", { minutes: 18 }), 18);
  assert.equal(K.outsideMinutes("transit", { minutes: 40, steps: [{ kind: "walk", minutes: 6 }, { kind: "transit", minutes: 25 }, { kind: "walk", minutes: 4 }] }), 10);
  assert.equal(K.outsideMinutes("transit", { minutes: 40, steps: [{ kind: "transit", minutes: 40 }] }), null, "no walking legs");
  assert.equal(K.outsideMinutes("drive", { minutes: 12 }), null);
  assert.equal(K.outsideMinutes("commute", null), null, "no way loaded");
  assert.equal(K.outsideMinutes("commute", { tooFar: true, minutes: 90 }), null, "a way that is not usable");
  assert.equal(K.outsideMinutes("transit", { minutes: 40 }), null, "no steps");
});

test("the tip: one line, only when rain or snow is likely at that hour; the minutes outside ride on it", () => {
  assert.equal(K.weatherTip({ temp: 3, feels: 0, pop: 70, code: 61 }), "Bring an umbrella.");
  assert.equal(K.weatherTip({ temp: 3, feels: 0, pop: 50, code: 3 }), "Bring an umbrella.", "50 percent is likely");
  assert.equal(K.weatherTip({ temp: 3, feels: 0, pop: 49, code: 3 }), "", "49 percent is not");
  assert.equal(K.weatherTip({ temp: 3, feels: 0, pop: 5, code: 63 }), "Bring an umbrella.", "the words say rain even with a low chance");
  assert.equal(K.weatherTip({ temp: -3, feels: -8, pop: 80, code: 73 }), "Snow is likely. Dress for it.");
  assert.equal(K.weatherTip({ temp: -3, feels: -8, pop: 80, code: 3 }), "Snow is likely. Dress for it.", "below freezing with a likely chance of precipitation is snow");
  assert.equal(K.weatherTip({ temp: 18, feels: 18, pop: 0, code: 0 }), "");
  assert.equal(K.weatherTip({ temp: 18, feels: 18, pop: null, code: null }), "", "no chance and no code: no tip");
  assert.equal(K.weatherTip({ temp: 3, feels: 0, pop: 70, code: 61 }, 12), "Bring an umbrella. About 12 min of the trip is outside.");
  assert.equal(K.weatherTip({ temp: 3, feels: 0, pop: 70, code: 61 }, 1), "Bring an umbrella. About 1 min of the trip is outside.");
  assert.equal(K.weatherTip({ temp: 18, feels: 18, pop: 0, code: 0 }, 12), "", "no tip, so the minutes do not stand alone");
  assert.equal(K.weatherTip({ temp: 3, feels: 0, pop: 70, code: 61 }, null), "Bring an umbrella.");
});

test("the card: icon, the big line, the small line with the hour and feels like, and at most one tip", () => {
  const fmt = (ms) => globalThis.CalCore.hm(globalThis.CalCore.wall(ms, TZ).min);
  const hr = { temp: 2.6, feels: -0.4, pop: 70, code: 61 };
  const leaving = K.weatherCard({ hr, at: at("2026-11-25T12:36:00-05:00"), leaving: true, outside: 9, fmt });
  assert.deepEqual(leaving, { icon: "🌧️", big: "3° · light rain", small: "feels like 0° when you leave", tip: "Bring an umbrella. About 9 min of the trip is outside." });
  const starts = K.weatherCard({ hr: { temp: -3.4, feels: -9.5, pop: 0, code: 0 }, at: at("2026-11-25T08:00:00-05:00"), leaving: false, outside: null, fmt });
  assert.deepEqual(starts, { icon: "☀️", big: "-3° · clear", small: "feels like -10° when the block starts", tip: "" });
  assert.equal(K.weatherCard({ hr: { temp: 0.2, feels: -0.3, pop: 0, code: 0 }, at: at("2026-11-25T08:00:00-05:00"), leaving: true, fmt }).big, "0° · clear", "no minus zero");
  assert.equal(K.weatherCard({ hr: { temp: 0.2, feels: -0.3, pop: 0, code: 0 }, at: at("2026-11-25T08:00:00-05:00"), leaving: true, fmt }).small, "feels like 0° when you leave");
  assert.equal(K.weatherCard({ hr: { temp: 5, feels: null, pop: null, code: 1234 }, at: at("2026-11-25T08:00:00-05:00"), leaving: true, fmt }).big, "5°", "no words for an unknown code");
  assert.equal(K.weatherCard({ hr: { temp: 5, feels: null, pop: null, code: 1234 }, at: at("2026-11-25T08:00:00-05:00"), leaving: true, fmt }).small, "when you leave", "no feels like when the answer has none");
});

test("the exact words of the four quiet states", () => {
  assert.equal(K.WX_TEXT.loading, "Checking the weather…");
  assert.equal(K.WX_TEXT.far, "No forecast yet for that day.");
  assert.equal(K.WX_TEXT.none, "Weather is not available right now.");
  assert.ok(!/[–—]/.test(Object.values(K.WX_TEXT).join("")), "no em or en dashes");
});

test("answers are kept 30 minutes per rounded place: fresh inside the time, stale after, failures only for 2 minutes", () => {
  const t0 = at("2026-11-25T12:00:00-05:00");
  assert.equal(K.wxFresh({ at: t0, res: {} }, t0 + 29 * 60000), true);
  assert.equal(K.wxFresh({ at: t0, res: {} }, t0 + 30 * 60000), false);
  assert.equal(K.wxFresh({ at: t0, fail: true }, t0 + 119000), true);
  assert.equal(K.wxFresh({ at: t0, fail: true }, t0 + 120000), false);
  assert.equal(K.wxFresh(null, t0), false);
});

test("page: the small map is gone from the Commute panel, the weather box is wired in, and Travel keeps its map", () => {
  const html = src("calendar.html"), cm = html.slice(html.indexOf("/* commute:start */"), html.indexOf("/* commute:end */"));
  assert.doesNotMatch(html, /id="cmMap"/);
  assert.doesNotMatch(html, /cmMapShow|cmFit\b|cmDrop|\.cmmap|\.cmpin|class="cmpin/, "no Commute-only map code is left");
  assert.match(cm, /id="cmWx"/, "the weather box");
  assert.match(cm, /K\.weatherUrl\(/, "built by the tested rule");
  assert.match(html, /function mapLib\(/, "Leaflet's loader stays for the Travel tab");
  assert.match(html, /L\.tileLayer\("https:\/\/tile\.openstreetmap\.org/, "the Travel map still draws");
});
test("page: the pin lookup for Open in Organic Maps still runs with no map, and the weather call carries nothing else about him", () => {
  const html = src("calendar.html"), fn = html.slice(html.indexOf("async function cmLookups("), html.indexOf("function cmClose("));
  assert.match(fn, /cmPin\(from\)/);
  assert.match(fn, /#cmLinks/);
  assert.match(fn, /cmLinksHtml\(ev\)/, "the links are redrawn with the pins just kept");
  const wx = html.slice(html.indexOf("async function cmWxFetch("), html.indexOf("async function cmWxRun("));
  assert.match(wx, /fetch\(url\)/, "a plain GET: no headers, no body, no cookies");
  assert.doesNotMatch(wx, /credentials|headers|body:|quest-key|\bev\b|\bt\b|cmTarget|address/, "nothing about the event, him or the destination goes with it");
});
test("page: a weather repaint writes only the weather box, so it never touches the From or To box he is typing in", () => {
  const html = src("calendar.html"), fn = html.slice(html.indexOf("function cmWxSet("), html.indexOf("async function cmWxFetch("));
  assert.match(fn, /#cmWx/);
  assert.doesNotMatch(fn, /cmPaint\(|#cmBox/, "no whole-box repaint from the weather");
});
