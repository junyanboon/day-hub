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
  assert.deepEqual(J(s.upcoming.map((t) => t.name)), J(["Here now", "Montreal", "Carnaval"]));
  assert.deepEqual(J(s.needsDates.map((t) => t.name)), J(["No dates yet"]));
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
  assert.equal(T.destOf(T.MTL), "Montreal");
  assert.equal(T.destOf("2026 Brazilian Winter", "Rio de Janeiro"), "Rio de Janeiro");
  assert.equal(T.destOf("2026"), "");
  const mtl = [{ lat: 45.5, lng: -73.5, trip: T.MTL }];
  assert.deepEqual(J(T.mapStart([], "", null)), { world: true });
  assert.deepEqual(J(T.mapStart(mtl, "", null)), { pins: [[45.5, -73.5]] });
  assert.deepEqual(J(T.mapStart([], "Brazil", { lat: -10, lng: -55 })), { center: [-10, -55], zoom: 5 });
  assert.deepEqual(J(T.mapStart([{ lat: null }], "", null)), { world: true });
});

// Junyan 2026-11-01: Toronto is home (a Local list, never a trip), Home is never a trip,
// undated trips never sit in Upcoming
test("Toronto and Home are never trip cards and never Now", () => {
  const s = T.splitTrips([
    { name: "Toronto", start: "2026-10-01", end: "2026-11-30" },
    { name: "🏠 Home" },
    { name: "Montreal", start: "2026-11-12", end: "2026-11-17" },
  ], "2026-11-01");
  const all = [...s.upcoming, ...s.past, ...s.needsDates].map((t) => t.name);
  assert.deepEqual(J(all), J(["Montreal"]));
  assert.equal(T.isHomeTrip("toronto"), true);
  assert.equal(T.isHomeTrip("Home"), true);
  assert.equal(T.isHomeTrip("2026 Egypt"), false);
});

test("undated trips go to Past by the year in the name, else under Needs dates", () => {
  const s = T.splitTrips([
    { name: "2024 Japan" },
    { name: "Someday Peru" },
    { name: "Korea", start: "2026-05-01", end: "2026-05-10" },
    { name: "2025 Lisbon", start: "2025-06-01", end: "2025-06-09" },
    { name: "2027 Bali" },
  ], "2026-11-01");
  assert.deepEqual(J(s.upcoming.map((t) => t.name)), J([]));
  assert.deepEqual(J(s.past.map((t) => t.name)), J(["2027 Bali", "Korea", "2025 Lisbon", "2024 Japan"]));
  assert.deepEqual(J(s.needsDates.map((t) => t.name)), J(["Someday Peru"]));
  assert.equal(T.whenLabel(s.past[3]), "No dates yet");
});

test("Local list: Toronto items, newest first, undated last", () => {
  const l = T.localItems([
    { name: "Old show", start: "2026-03-01" },
    { name: "Undated cafe" },
    { name: "New show", start: "2026-10-20T19:00:00-04:00" },
  ]);
  assert.deepEqual(J(l.map((i) => i.name)), J(["New show", "Old show", "Undated cafe"]));
});

// Junyan 2026-11-01: the Egypt page said "Nothing planned yet" on every day.
// Rows from both spellings of the trip are read once each; a stay shows on its check-in
// day and as "staying" until check-out; a UTC time with a time zone lands on the local day.
test("dayPlan: Egypt-shaped rows land on their days, stays carry over, no doubles", () => {
  const it = (id, name, start, end = "", extra = {}) => ({ id, name, start, end, tags: "", icon: "", ...extra });
  const items = [
    it("f1", "IB1903 [MAD → CAI]", "2026-09-28T14:35:00.000Z"),
    it("h1", "Le Passage Cairo Hotel", "2026-09-29", "2026-10-04"),
    it("h1", "Le Passage Cairo Hotel", "2026-09-29", "2026-10-04"),
    it("e1", "AfroLatin Egypt Super 16", "2026-09-29", "2026-10-15"),
    it("f2", "MS285", "2026-10-09T23:30:00.000Z", "", { tz: "Africa/Cairo" }),
    it("x", "Visa", ""),
  ];
  const p = T.dayPlan(items, "2026-09-28", 26);
  assert.equal(p.days.length, 26);
  assert.deepEqual([...p.days[0].on.map((i) => i.id)], ["f1"]);
  assert.deepEqual([...p.days[1].on.map((i) => i.id)], ["h1", "e1"]);
  assert.deepEqual([...p.days[2].staying.map((i) => i.id)], ["h1", "e1"]);   // the festival pass runs on too
  assert.deepEqual([...p.days[5].staying.map((i) => i.id)], ["h1", "e1"]);   // Oct 3, last night
  assert.deepEqual([...p.days[6].staying.map((i) => i.id)], ["e1"]);       // Oct 4 is check-out
  assert.deepEqual([...p.days[12].on.map((i) => i.id)], ["f2"]);       // 23:30Z on Oct 9 is Oct 10 in Cairo
  assert.deepEqual([...p.undated.map((i) => i.id)], ["x"]);
  assert.equal(p.items.length, 5);
});

// day planner in trip cards (d39, d40)
test("day plan: hikes and trip days get the full plan, small outings the short one", () => {
  assert.equal(T.planKind({ name: "Mount Royal hike", tags: "" }, T.MTL), "full");
  assert.equal(T.planKind({ name: "Spa & Recovery Day", tags: "" }, T.MTL), "full");
  assert.equal(T.planKind({ name: "Dinner with friends", tags: "" }, T.MTL), "short");
  assert.equal(T.planKind({ name: "Movie night", tags: "" }, T.MTL), "short");
  assert.equal(T.planKind({ name: "Spa day", tags: "" }, "Toronto"), "short");
  assert.equal(T.planKind({ name: "Rouge hike", tags: "" }, "Toronto"), "full");
});
test("day plan: tag line and Planned pill", () => {
  assert.equal(T.planTag({ checked: "2026-11-14" }), "✨ Planned by day planner · checked Nov 14");
  assert.equal(T.planTag(null), "");
  assert.equal(T.cardLabel({ status: "Need to Book" }, { plan: { checked: "2026-11-14" } }), "Planned");
  assert.equal(T.cardLabel({ status: "Need to Book" }, {}), "Need to Book");
  assert.equal(T.cardLabel({ status: "" }, {}), "Planned");
});
test("day plan: panel shows only the sections the plan has, must-dos as checkboxes", () => {
  const short = T.planHtml({ kind: "short", checked: "2026-11-14", sections: { getting: [{ t: "Walk", text: "10 min" }], must: [{ text: "Book a table", done: true }] } }, {});
  assert.match(short, /GETTING THERE/); assert.match(short, /MUST-DOS/); assert.doesNotMatch(short, /CONDITIONS|CAREFUL/);
  assert.match(short, /class="chk y" data-m="0"/);
  const full = T.planHtml({ kind: "full", checked: "2026-11-14", sections: { conditions: { open: "", weather: "3°C", mood: "", note: "" }, getting: [], day: [], must: [], careful: ["<b>x</b>"], after: { rating: "", worked: "", energy: "" } } }, {});
  for (const h of ["CONDITIONS", "GETTING THERE", "THE DAY", "MUST-DOS", "CAREFUL", "AFTER THE DAY"]) assert.match(full, new RegExp(h));
  assert.match(full, /3°C/); assert.match(full, /&lt;b&gt;/);
});

test("hotel nights say Staying, festivals say Still on (Junyan 2026-11-02, d54)", () => {
  // the Egypt / DC stay: name has no "hotel", the Notion Tags say Accommodations
  const inn = { name: "Residence Inn Washington DC", tags: "Accommodations", icon: "", fields: {} };
  assert.ok(T.isStay(inn));
  assert.ok(T.isStay({ name: "Marriott Cairo", tags: "", icon: "🏨", fields: {} }));
  assert.ok(T.isStay({ name: "Cairo flat", tags: "", icon: "", fields: { Type: { type: "select", value: "Accommodation" } } }));
  assert.ok(T.isStay({ name: "Lisbon Airbnb", tags: "", fields: {} }));
  const fest = { name: "Zouk Festival", tags: "Event", icon: "💃", fields: { Notes: { type: "rich_text", value: "check-in at the hotel desk" } } };
  assert.ok(!T.isStay(fest));
  const L = T.stayLines([inn, fest]);
  assert.deepEqual(L.staying.map((i) => i.name), ["Residence Inn Washington DC"]);
  assert.deepEqual(L.stillOn.map((i) => i.name), ["Zouk Festival"]);
});

test("Montreal: named Year Flag Place, same as Notion, one card once Notion has it", () => {
  assert.equal(T.MTL, "2026 🇨🇦 Montreal Birthday");
  assert.equal(T.SEED.name, T.MTL);
  assert.ok(T.SEED.places.every((p) => p.trip === T.MTL));
  const merged = T.mergeTrips([{ name: T.MTL, start: "2026-11-12", end: "2026-11-17", icon: "🧳" },
    { name: "2026 🇨🇦 Montreal Birthday", start: "2026-11-13", end: "2026-11-17", icon: "🧳", count: 3 }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, T.MTL);
  assert.equal(T.destOf(T.MTL), "Montreal");
});

test("Plan this: calendar copies get a pointer to Create in Notion, Notion cards get the button", () => {
  assert.match(T.planGate({ id: "seed-spa", seed: true }), /Save this trip to Notion to plan days/);
  assert.equal(T.planGate({ id: "2f0c1d2e-aaaa-bbbb-cccc-1234567890ab", db: "activities" }), "");
});

// Junyan 2026-11-02: status reads at a glance (Booked solid with a check, Need to Book amber with Book, Maybe dashed)
test("status look: booked, need to book, unpaid, maybe, planned", () => {
  assert.deepEqual({ ...T.statusLook("Prepaid") }, { cls: "paid", icon: "✓", label: "Prepaid", book: false });
  assert.equal(T.statusLook("Booked Unpaid").cls, "warn");
  assert.deepEqual({ ...T.statusLook("Need to Book") }, { cls: "need", icon: "!", label: "Need to book", book: true });
  assert.equal(T.statusLook("Maybe").cls, "idea");
  assert.equal(T.statusLook("").label, "Planned");
  assert.equal(T.statusLook("Need to Book", true).cls, "plan");   // a day plan written: Planned
});

// Junyan d61: what a drag carries becomes one drop (image first, then a link, then text)
test("drop payload and the date of a trip day", () => {
  assert.deepEqual({ ...T.dropPayload({ uri: "#comment\nhttps://maps.app.goo.gl/x\n", text: "https://maps.app.goo.gl/x" }) }, { url: "https://maps.app.goo.gl/x" });
  assert.deepEqual({ ...T.dropPayload({ text: " https://lemousso.com/ " }) }, { url: "https://lemousso.com/" });
  assert.deepEqual({ ...T.dropPayload({ text: "Joe Beef dinner" }) }, { text: "Joe Beef dinner" });
  assert.deepEqual({ ...T.dropPayload({ image: true, uri: "https://x.com/a.png" }) }, { image: true });
  assert.equal(T.dropPayload({ text: "  " }), null);
  assert.equal(T.tripDate("2026-11-12", 0), "2026-11-12");
  assert.equal(T.tripDate("2026-11-28", 4), "2026-12-02");
});

// d64 d65 (2026-11-02): missing info, calendar copies, check-out day, pasted messages
const F = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { type: k === "Tags" ? "multi_select" : "rich_text", value: v }]));
const fiction = { id: "n1", name: "FICTION St-Denis Apartment [2026.11.13]", status: "Prepaid", tags: "Accommodations",
  start: "2026-11-13", end: "2026-11-17", fields: F({ Tags: "Accommodations", Address: "", "Confirmation #": "", "Departure / Check-in": "4 pm", "Arrival / Check-out": "", "Cancellation Policy": "" }) };

test("missing info: a booked stay lists every empty must-have, nice-to-haves never warn", () => {
  assert.deepEqual([...T.missingInfo(fiction)], ["address", "check-out", "confirmation #", "cancellation policy"]);
  const full = { ...fiction, fields: F({ Tags: "Accommodations", Address: "1 St-Denis", "Confirmation #": "AB1", "Departure / Check-in": "4 pm", "Arrival / Check-out": "11 am", "Cancellation Policy": "Nov 10" }) };
  assert.deepEqual([...T.missingInfo(full)], []);
  assert.deepEqual([...T.missingInfo({ ...full, status: "" })], ["paid or owed"]);
  assert.deepEqual([...T.missingInfo({ ...fiction, status: "Need to Book" })], ["address"]);
  assert.deepEqual([...T.missingInfo({ ...fiction, status: "Cancelled" })], []);
  // extras hold a value when Notion has no such column
  assert.deepEqual([...T.missingInfo({ ...full, fields: {} , tags: "Hotel", start: "2026-11-13T16:00:00-05:00", end: "2026-11-17T11:00:00-05:00" },
    { f: { Address: "x", "Confirmation #": "y", "Cancel by": "z" } })], []);
});
test("missing info: restaurants and flights", () => {
  assert.deepEqual([...T.missingInfo({ id: "r", name: "Dinner at Joe Beef", start: "2026-11-15", status: "", fields: {} })], ["address", "time", "booked or not"]);
  assert.deepEqual([...T.missingInfo({ id: "f", name: "Flight YYZ to YUL", start: "2026-11-12T08:00:00-05:00", status: "Prepaid", fields: {} })], ["confirmation #"]);
  assert.equal(T.kindOf({ name: "VIA Rail train", fields: {} }), "transport");
});
test("calendar copy hidden when a Notion card of the same kind overlaps (d64)", () => {
  const seedStay = { ...T.SEED.items.find((i) => i.name === "Montreal stay") };
  const seedSpa = { ...T.SEED.items.find((i) => i.name === "Spa & Recovery Day") };
  const out = T.hideCopies([seedStay, seedSpa, fiction]).map((i) => i.name);
  assert.deepEqual(out, ["Spa & Recovery Day", fiction.name]);
  // a stay on other dates does not hide it
  assert.equal(T.hideCopies([seedStay, { ...fiction, start: "2026-12-01", end: "2026-12-03" }]).length, 2);
});
test("a stay with a check-out time shows on its last day", () => {
  const st = { id: "s", name: "Hotel X", tags: "Hotel", start: "2026-11-13T16:00:00-05:00", end: "2026-11-17T11:00:00-05:00", fields: {} };
  const p = T.dayPlan([st], "2026-11-12", 6);
  assert.equal(p.days[1].on.length, 1);
  assert.equal(p.days[5].out[0].id, "s");
  assert.equal(p.days[4].staying.length, 1);
  assert.equal(T.whenText(st), "Check-in 4:00 pm · check-out 11:00 am");
});
test("pasted message becomes one log entry", () => {
  const e = T.pastedEntry("From: Marie (host)\nCheck-in is now 3 pm, code 4411.\nhttps://mail.google.com/mail/u/0/#inbox/abc", new Date(2026, 10, 2));
  assert.equal(e.date, "2026-11-02"); assert.equal(e.from, "Marie (host)");
  assert.equal(e.summary, "Check-in is now 3 pm, code 4411."); assert.equal(e.link, "https://mail.google.com/mail/u/0/#inbox/abc");
  assert.equal(T.pastedEntry("   "), null);
});

test("booked cards with no confirmation file warn; others do not (2026-11-02)", () => {
  const base = { id: "n", db: "planner", name: "Flight YYZ to YUL", start: "2026-11-12T08:00:00-05:00", fields: { "Confirmation #": { type: "rich_text", value: "X1" } }, files: [] };
  for (const status of ["Prepaid", "Booked Unpaid", "Taxes Still Owing", "Free"])
    assert.deepEqual([...T.missingInfo({ ...base, status })], ["confirmation file"], status);
  assert.deepEqual([...T.missingInfo({ ...base, status: "Prepaid", files: [{ name: "a.pdf", url: "u" }] })], []);
  assert.deepEqual([...T.missingInfo({ ...base, status: "Need to Book" })], []);
  assert.deepEqual([...T.missingInfo({ ...base, status: "Gas" })], []);
  const { files, ...noCol } = base;   // a calendar copy or older server: no files list, no warning
  assert.deepEqual([...T.missingInfo({ ...noCol, status: "Prepaid" })], []);
  assert.equal(T.needsConfirmFile({ ...base, status: "Prepaid" }), true);
});
