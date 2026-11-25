// A stand-in for Open-Meteo in the calendar's test-browser runs (d31 B, 2026-11-25): no run calls the real service.
// stubOpenMeteo(page, opts) answers https://api.open-meteo.com/** with 16 days of hours, one per hour from midnight Toronto of
// opts.from (a Toronto day, "YYYY-MM-DD"), in the shape the real answer has (timeformat=unixtime; proven with one real call).
// It returns {urls, ...} where urls lists every address asked, so a test can check what was sent and how many times.
export function stubOpenMeteo(page, { from = "2026-11-24", tzOffsetHours = -5, temp = 3.2, feels = -0.4, pop = 70, code = 61, fail = false, delayMs = 0 } = {}) {
  const log = { urls: [], fail, delayMs, code, pop, temp, feels };
  const start = Date.parse(from + "T00:00:00Z") / 1000 - tzOffsetHours * 3600;
  const time = Array.from({ length: 16 * 24 }, (_, i) => start + i * 3600);
  page.route("https://api.open-meteo.com/**", async (route) => {
    log.urls.push(route.request().url());
    if (log.delayMs) await new Promise((r) => setTimeout(r, log.delayMs));
    if (log.fail) return route.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"error":true}' });
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({
      latitude: 43.65, longitude: -79.38, utc_offset_seconds: tzOffsetHours * 3600, timezone: "America/Toronto", hourly_units: { time: "unixtime" },
      hourly: { time, temperature_2m: time.map(() => log.temp), apparent_temperature: time.map(() => log.feels), precipitation_probability: time.map(() => log.pop), weather_code: time.map(() => log.code) } }) });
  });
  return log;
}
