// node --test still/test/*.test.mjs   (desktop Trips section, Junyan 2026-11-01)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-trips.js", import.meta.url)), "utf8"), ctx);
const T = ctx.QuestTrips;

// three points about 1.11 km apart going north, climbing 100 m then down 20 m, one hour
const GPX = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>
<trkpt lat="45.5000" lon="-73.5900"><ele>100</ele><time>2026-11-16T14:00:00Z</time></trkpt>
<trkpt lat="45.5100" lon="-73.5900"><ele>200</ele><time>2026-11-16T14:30:00Z</time></trkpt>
<trkpt lat="45.5200" lon="-73.5900"><ele>180</ele><time>2026-11-16T15:00:00Z</time></trkpt>
</trkseg></trk></gpx>`;

test("GPX: distance, climb, time from timestamps, profile", () => {
  const s = T.gpxStats(GPX);
  assert.ok(Math.abs(s.km - 2.224) < 0.01, String(s.km));
  assert.equal(s.climb, 100);
  assert.equal(s.descent, 20);
  assert.equal(s.secs, 3600);
  assert.equal(s.timed, true);
  assert.equal(s.hi, 200);
  assert.equal(s.profile.length, 3);
  assert.equal(T.fmtDur(s.secs), "1 h 00");
});

test("GPX without times: Naismith estimate; empty file: null", () => {
  const s = T.gpxStats(GPX.replace(/<time>[^<]*<\/time>/g, ""));
  assert.equal(s.timed, false);
  assert.ok(Math.abs(s.secs - (s.km / 5 + 100 / 600) * 3600) < 2);
  assert.equal(T.gpxStats("<gpx></gpx>"), null);
  // self-closing route points still count
  assert.equal(T.gpxPoints('<gpx><rte><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2"/></rte></gpx>').length, 2);
});

test("cards land on the right trip day and get the right pill", () => {
  assert.equal(T.dayIndex("2026-11-13T17:00:00-05:00", "2026-11-12"), 1);
  assert.equal(T.dayIndex("2026-11-17", "2026-11-12"), 5);
  assert.equal(T.dayIndex("", "2026-11-12"), -1);
  assert.equal(T.pillOf("Need to Book"), "need");
  assert.equal(T.pillOf("Booked Unpaid"), "warn");
  assert.equal(T.pillOf("Prepaid"), "paid");
  assert.equal(T.pillOf("Maybe"), "idea");
  assert.equal(T.whenText({ start: "2026-11-16T11:00:00-05:00", end: "2026-11-16T17:30:00-05:00" }), "11:00 am to 5:30 pm");
});

test("Montreal: Nov 12 to 17, stay and spa Need to Book, hike card, rows for Notion", () => {
  const S = T.SEED;
  assert.equal(S.start, "2026-11-12"); assert.equal(S.end, "2026-11-17");
  const stay = S.items.find((i) => T.isStay(i));
  assert.equal(stay.status, "Need to Book");
  assert.match(stay.start, /2026-11-13T17:00/); assert.match(stay.end, /2026-11-17T10:30/);
  assert.equal(S.items.find((i) => /Spa/.test(i.name)).status, "Need to Book");
  assert.ok(S.items.some((i) => T.isHike(i)));
  assert.ok(!T.isHike(stay));
  const rows = T.seedRows(S);
  assert.equal(rows.planner.length, 2);
  assert.equal(rows.planner[0].props.Status, "Need to Book");
  assert.ok(rows.activities.every((r) => !("Status" in r.props)), "activities get no status we might not have as an option");
});

const J = (x) => JSON.parse(JSON.stringify(x));
// Trips home (Junyan 2026-11-01: one Trips tab, Upcoming and Past on their own page)
test("trip names that differ only by flags, emoji or case are one trip", () => {
  assert.equal(T.tripKey("2026 🇪🇬 Egypt"), T.tripKey("2026 Egypt"));
  assert.notEqual(T.tripKey("2026 Egypt"), T.tripKey("2026 Korea"));
  const m = T.mergeTrips([
    { name: "2026 🇪🇬 Egypt", start: "2026-03-02", end: "2026-03-09", bookings: 2, need: 1, booked: 1 },
    { name: "2026 Egypt", start: "2026-03-01", end: "2026-03-08", bookings: 1, need: 0, booked: 1 },
    { name: "2026 Korea", start: "2026-05-01", end: "2026-05-10" },
  ]);
  assert.equal(m.length, 2);
  const eg = m.find((t) => T.tripKey(t.name) === T.tripKey("2026 Egypt"));
  assert.deepEqual(J([...eg.aliases].sort()), J(["2026 Egypt", "2026 🇪🇬 Egypt"].sort()));
  assert.equal(eg.start, "2026-03-01"); assert.equal(eg.end, "2026-03-09");
  assert.equal(eg.bookings, 3); assert.equal(eg.need, 1); assert.equal(eg.booked, 2);
});

test("Upcoming: now and future, soonest first; Past: ended, newest first", () => {
  const today = "2026-11-01";
  const s = T.splitTrips([
    { name: "Korea", start: "2026-05-01", end: "2026-05-10" },
    { name: "Carnaval", start: "2027-02-05", end: "2027-02-15" },
    { name: "Montreal", start: "2026-11-12", end: "2026-11-17" },
    { name: "Here now", start: "2026-10-30", end: "2026-11-03" },
    { name: "2025 Lisbon", start: "2025-06-01", end: "2025-06-09" },
    { name: "No dates yet" },
  ], today);
  assert.deepEqual(J(s.upcoming.map((t) => t.name)), J(["Here now", "Montreal", "Carnaval", "No dates yet"]));
  assert.deepEqual(J(s.past.map((t) => t.name)), J(["Korea", "2025 Lisbon"]));
  assert.equal(s.upcoming[0].now, true);
  assert.equal(s.upcoming[1].away, 11);
  assert.equal(s.past[0].ago, 175);
  assert.equal(T.whenLabel(s.upcoming[0]), "Now");
  assert.equal(T.whenLabel(s.upcoming[1]), "11 days away");
  assert.equal(T.whenLabel({ away: 1 }), "Tomorrow");
  assert.equal(T.whenLabel(s.past[0]), "175 days ago");
});

test("map centre: the trip's own pins, else its destination, never Montreal by default", () => {
  assert.equal(T.destOf("2027 🇧🇷 Brazil Carnaval"), "Brazil Carnaval");
  assert.equal(T.destOf("Montreal birthday trip"), "Montreal");
  assert.equal(T.destOf("2026 Brazilian Winter", "Rio de Janeiro"), "Rio de Janeiro");
  assert.equal(T.destOf("2026"), "");
  const mtl = [{ lat: 45.5, lng: -73.5, trip: "Montreal birthday trip" }];
  assert.deepEqual(J(T.mapStart([], "", null)), { world: true });
  assert.deepEqual(J(T.mapStart(mtl, "", null)), { pins: [[45.5, -73.5]] });
  assert.deepEqual(J(T.mapStart([], "Brazil", { lat: -10, lng: -55 })), { center: [-10, -55], zoom: 5 });
  assert.deepEqual(J(T.mapStart([{ lat: null }], "", null)), { world: true });
});
