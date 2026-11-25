// node --test still/test/commute-suggest.test.mjs  (Junyan, 2026-11-25, d48 "48 yes suggest commute blocks", d49 "49yes")
// A dashed Suggested Commute block before each event that has a place away from Home: 30 minutes ending when the event starts.
// The pure rule (calendar-commute.js commuteSuggestions) and the gym session memory (one place for every "Gym · NAME").
// No test reads the real clock: every time here is a fixed instant.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "../calendar-core.js";
import "../calendar-commute.js";
const K = globalThis.CalCommute, C = globalThis.CalCore;
const TZ = "America/Toronto", DAY = "2026-11-26";
const at = (iso) => Date.parse(iso), MIN = 60000;
const NOW = at("2026-11-26T12:00:00Z");   // 7:00 am in Toronto
const ev = (id, title, s, e, x = {}) => ({ id, calId: "joint", title, s: at(s), e: at(e), allDay: false, k: C.kindOf({ title, kind: x.kind }), location: "", ...x });
const HOME = { id: "home1", name: "Home", category: "home", address: "100 Queen St W, Toronto", lat: 43.65, lng: -79.38 };
const forRow = (list, address, x = {}) => ({ id: "r-" + list, category: "commute-for", list, address, name: "x", lat: 43.7, lng: -79.4, ...x });
const run = (events, o = {}) => K.commuteSuggestions({ day: DAY, events, remembered: [], home: HOME, tz: TZ, now: NOW, ...o });
/** the suggestion for the event with id dm only (other events in a case carry places of their own and get theirs) */
const one = (events, o = {}) => run(events, o).filter((s) => s.forId === "dm");
// 10:00 to 11:00 in Toronto (15:00Z to 16:00Z)
const dm = (x = {}) => ev("dm", "DM Advanced Training", "2026-11-26T15:00:00Z", "2026-11-26T16:00:00Z", x);

test("a Location away from Home draws one 30 minute Commute ending when the event starts", () => {
  const out = one([dm({ location: "388 Carlaw Ave, Toronto" })]);
  assert.equal(out.length, 1);
  const s = out[0];
  assert.deepEqual([s.kind, s.title, s.e - s.s, s.e], ["commute", "Commute", 30 * MIN, at("2026-11-26T15:00:00Z")]);
  assert.equal(s.why, "To DM Advanced Training");
  assert.match(s.key, /^\w+$/, "safe for the ^auto:(\\w+):(.+)$ pattern");
  assert.match(`auto:${s.key}:${DAY}`, /^auto:(\w+):(.+)$/);
});

test("the key is unique per event and the same every time", () => {
  const a = dm({ location: "A St" }), b = ev("zz", "Zouk", "2026-11-26T18:00:00Z", "2026-11-26T19:00:00Z", { location: "B St" });
  const c = ev("zz", "Zouk", "2026-11-26T18:00:00Z", "2026-11-26T19:00:00Z", { location: "B St", calId: "junyan" });
  const keys = run([a, b, c]).map((s) => s.key);
  assert.equal(new Set(keys).size, 3, "even the same id on another calendar");
  assert.deepEqual(run([a, b, c]).map((s) => s.key), keys);
});

test("a place remembered for the event's name counts as a place (the for: row)", () => {
  const rem = [forRow("for:dm advanced training", "1 Studio Way, Toronto")];
  assert.equal(one([dm()], { remembered: rem }).length, 1);
  assert.equal(one([dm()], { remembered: [] }).length, 0, "no Location and nothing remembered: no place");
  assert.equal(one([dm({ location: "   " })]).length, 0, "an empty Location is no place");
});

test("a loc: row only translates a Location text; it is never a place for the event's name", () => {
  const loc = forRow("loc:dm advanced training", "1 Studio Way, Toronto");
  assert.equal(one([dm()], { remembered: [loc] }).length, 0);
  const rem = [forRow("loc:studio 509a", "509 Bloor St W, Toronto")];
  assert.equal(one([dm({ location: "Studio 509A" })], { remembered: rem }).length, 1);
});

test("a web link or a video call link is not a place", () => {
  for (const l of ["https://zoom.us/j/123456", "http://example.com/a", "www.example.com/meet", "meet.google.com/abc-defg-hij", "teams.microsoft.com/l/meetup-join/x"]) {
    assert.equal(K.isWebLink(l), true, l);
    assert.equal(one([dm({ location: l })]).length, 0, l);
  }
  assert.equal(K.isWebLink("388 Carlaw Ave"), false);
  assert.equal(K.isWebLink("Studio 509A"), false);
  // a link Location with a place remembered for the name still has a place, and the block's To reads that place, not the link
  const rem = [forRow("for:dm advanced training", "1 Studio Way, Toronto")];
  const e = dm({ location: "https://zoom.us/j/123456" });
  assert.equal(one([e], { remembered: rem }).length, 1);
  const block = ev("cm", "Commute", "2026-11-26T14:30:00Z", "2026-11-26T15:00:00Z");
  const t = K.target({ ev: block, events: [block, e], tz: TZ, remembered: rem });
  assert.deepEqual([t.source, t.address], ["remembered", "1 Studio Way, Toronto"]);
});

test("Home is not away: the same address, a Location text remembered as Home, and a Location that says Home", () => {
  assert.equal(one([dm({ location: "100 queen st w,  Toronto" })]).length, 0, "same address by its words");
  const rem = [forRow("loc:my flat", "100 Queen St W, Toronto")];
  assert.equal(one([dm({ location: "My flat" })], { remembered: rem }).length, 0, "a Location text whose remembered place is Home");
  assert.equal(one([dm({ location: "Home" })]).length, 0);
  const nameRow = [forRow("for:dm advanced training", "100 Queen St W, Toronto")];
  assert.equal(one([dm()], { remembered: nameRow }).length, 0, "a name row that is Home");
  assert.equal(one([dm({ location: "Studio 509A" })]).length, 1, "text that is not remembered stays away");
});

test("with no Home saved every place counts as away", () => {
  assert.equal(one([dm({ location: "100 Queen St W, Toronto" })], { home: null }).length, 1);
  assert.equal(one([dm({ location: "100 Queen St W, Toronto" })], { home: { name: "Home", address: "", id: "" } }).length, 1, "an empty Home is no Home");
});

test("none when a Commute block is the last timed block before the event", () => {
  const e = dm({ location: "388 Carlaw Ave" });
  assert.equal(one([e, ev("c", "Commute", "2026-11-26T12:00:00Z", "2026-11-26T12:30:00Z")]).length, 0, "even when it sits far before");
  const other = ev("o", "Lunch", "2026-11-26T12:00:00Z", "2026-11-26T13:00:00Z", { location: "5 Far Ave" });
  assert.equal(one([e, other, ev("c", "Commute", "2026-11-26T11:00:00Z", "2026-11-26T11:30:00Z")]).length, 1, "an earlier Commute with a plan after it is not the last block");
});

test("none when a Commute block overlaps the 30 minutes before the event", () => {
  const e = dm({ location: "388 Carlaw Ave" });
  const lunch = ev("o", "Lunch", "2026-11-26T14:00:00Z", "2026-11-26T14:20:00Z", { location: "5 Far Ave" });
  const c = ev("c", "Bus to class", "2026-11-26T14:40:00Z", "2026-11-26T15:10:00Z");   // not last by start? it is, but also overlaps
  assert.equal(one([e, lunch, c]).length, 0);
  const longCommute = ev("c2", "Transit", "2026-11-26T14:10:00Z", "2026-11-26T15:00:00Z");
  const late = ev("late", "Coffee", "2026-11-26T14:20:00Z", "2026-11-26T14:25:00Z", { location: "5 Far Ave" });
  assert.equal(one([e, longCommute, late]).length, 0, "a Commute that runs into the window, though a short plan starts after it");
  const early = ev("c3", "Transit", "2026-11-26T13:30:00Z", "2026-11-26T14:20:00Z");   // ends before the window opens at 14:30
  assert.equal(one([e, early, late]).length, 1);
});

test("none when the timed event before it that day is at the same place", () => {
  const e = dm({ location: "388 Carlaw Ave, Toronto" });
  const prev = ev("p", "Practice", "2026-11-26T13:00:00Z", "2026-11-26T14:00:00Z", { location: "388 carlaw ave, toronto" });
  assert.equal(one([e, prev]).length, 0, "same Location text");
  const elsewhere = ev("p", "Practice", "2026-11-26T13:00:00Z", "2026-11-26T14:00:00Z", { location: "5 Far Ave" });
  assert.equal(one([e, elsewhere]).length, 1, "another place: still suggested");
  const noPlace = ev("p", "Practice", "2026-11-26T13:00:00Z", "2026-11-26T14:00:00Z");
  assert.equal(one([e, noPlace]).length, 1, "the event before has no place");
  const rem = [forRow("for:practice", "388 Carlaw Ave, Toronto")];
  assert.equal(one([e, noPlace], { remembered: rem }).length, 0, "the event before is there by its remembered name");
  const yesterday = ev("y", "Practice", "2026-11-25T15:00:00Z", "2026-11-25T16:00:00Z", { location: "388 Carlaw Ave, Toronto" });
  assert.equal(one([e, yesterday]).length, 1, "an event on another day is not before it");
});

test("when the block before ends inside the 30 minutes the suggestion starts when it ends, never under 15 minutes", () => {
  const e = dm({ location: "388 Carlaw Ave" });
  const prev = (end) => ev("p", "Practice", "2026-11-26T13:00:00Z", end, { location: "5 Far Ave" });
  const a = one([e, prev("2026-11-26T14:40:00Z")])[0];
  assert.deepEqual([a.s, a.e], [at("2026-11-26T14:40:00Z"), at("2026-11-26T15:00:00Z")], "20 minutes");
  const b = one([e, prev("2026-11-26T14:30:00Z")])[0];
  assert.equal(b.e - b.s, 30 * MIN, "ends exactly when the 30 minutes begin: the full 30");
  const c = one([e, prev("2026-11-26T14:55:00Z")])[0];
  assert.deepEqual([c.e - c.s, c.e], [15 * MIN, at("2026-11-26T15:00:00Z")], "5 minutes left: a 15 minute floor");
  const d = one([e, prev("2026-11-26T14:00:00Z")])[0];
  assert.equal(d.e - d.s, 30 * MIN, "ended well before: the full 30");
});

test("today and later only: nothing for an event that has started or ended", () => {
  const e = dm({ location: "388 Carlaw Ave" });
  assert.equal(one([e], { now: at("2026-11-26T15:00:00Z") }).length, 0, "starts right now: it has started");
  assert.equal(one([e], { now: at("2026-11-26T15:30:00Z") }).length, 0);
  assert.equal(one([e], { now: at("2026-11-26T14:59:00Z") }).length, 1, "one minute before it starts");
  const soon = one([e], { now: at("2026-11-26T14:45:00Z") })[0];
  assert.equal(soon.e > at("2026-11-26T14:45:00Z"), true, "not over yet");
  assert.equal(one([e], { day: "2026-11-27" }).length, 0, "another day has no such event");
  assert.equal(run([ev("t", "Later", "2026-11-27T15:00:00Z", "2026-11-27T16:00:00Z", { location: "5 Far Ave" })], { day: "2026-11-27" }).length, 1);
});

test("only his own timed events: not all-day, not a suggestion, not itself a Commute block", () => {
  const all = ev("a", "Conference", "2026-11-26T15:00:00Z", "2026-11-27T15:00:00Z", { allDay: true, location: "5 Far Ave" });
  const ghost = ev("g", "Wind Down", "2026-11-26T15:00:00Z", "2026-11-26T16:00:00Z", { ghost: true, location: "5 Far Ave" });
  const commute = ev("c", "Commute", "2026-11-26T15:00:00Z", "2026-11-26T15:30:00Z", { location: "5 Far Ave" });
  assert.deepEqual(run([all, ghost, commute]), []);
});

test("a Commute suggestion is listed for each event of the day and never for one it already covers", () => {
  const a = dm({ location: "388 Carlaw Ave" });
  const b = ev("b", "Zouk Training", "2026-11-26T20:00:00Z", "2026-11-26T21:30:00Z", { location: "527 Bloor St W" });
  const out = run([a, b]);
  assert.deepEqual(out.map((s) => s.why), ["To DM Advanced Training", "To Zouk Training"]);
  assert.equal(out[1].s, at("2026-11-26T19:30:00Z"));
});

/* ---- the gym: one place for every "Gym · NAME" ---- */
test("isGym: the whole word gym, any case", () => {
  for (const t of ["Gym · Jack Woods", "Gym · Matthew I. Smith", "GYM", "gym time", "Leg day at the gym!", "🏋️ Gym"]) assert.equal(K.isGym(t), true, t);
  for (const t of ["Gymnastics", "Gymkhana", "Energym", "Zouk Training", ""]) assert.equal(K.isGym(t), false, t);
});

test("gym: the exact name row first, then the shared for:gym row", () => {
  const shared = forRow("for:gym", "800 Dunfield Ave (GoodLife)", { id: "shared" });
  const jack = forRow("for:gym jack woods", "1 Jack's Own St", { id: "jack" });
  assert.equal(K.titleMemory([shared], "Gym · Matthew I. Smith").id, "shared", "a gym name nobody taught still finds the shared row");
  assert.equal(K.titleMemory([shared, jack], "Gym · Jack Woods").id, "jack", "an exact name row beats the shared one");
  assert.equal(K.titleMemory([jack, shared], "Gym · Jack Woods").id, "jack", "whatever the order");
  assert.equal(K.titleMemory([shared], "Gymnastics Class"), null, "not a gym session");
  assert.equal(K.titleMemory([shared], "Zouk Training"), null);
  assert.equal(K.titleMemory([forRow("for:gym", "")], "Gym · Jack Woods"), null, "a row with no address is no place");
});

test("gym: the suggestion rule and the block's To use the same lookup", () => {
  const shared = [forRow("for:gym", "800 Dunfield Ave, Toronto")];
  const jack = ev("j", "Gym · Jack Woods", "2026-11-26T22:00:00Z", "2026-11-26T23:00:00Z");
  assert.equal(run([jack]).length, 0, "nothing taught yet");
  const out = run([jack], { remembered: shared });
  assert.equal(out.length, 1);
  assert.equal(out[0].why, "To Gym · Jack Woods");
  const matt = ev("m", "Gym · Matthew I. Smith", "2026-11-26T22:00:00Z", "2026-11-26T23:00:00Z");
  assert.equal(run([matt], { remembered: shared }).length, 1, "a new gym name matches too");
  const block = ev("cm", "Commute", "2026-11-26T21:30:00Z", "2026-11-26T22:00:00Z");
  const t = K.target({ ev: block, events: [block, matt], tz: TZ, remembered: shared });
  assert.deepEqual([t.source, t.address], ["remembered", "800 Dunfield Ave, Toronto"]);
  const own = K.target({ ev: block, events: [block, matt], tz: TZ, remembered: [...shared, forRow("for:gym matthew i smith", "9 Own St")] });
  assert.equal(own.address, "9 Own St", "an exact name row beats the shared one in target too");
});

test("a Commute suggested before Gym · Jack Woods starts as Walk (nothing is hard-coded to a gym name or address)", () => {
  const shared = [forRow("for:gym", "800 Dunfield Ave, Toronto")];
  const jack = ev("j", "Gym · Jack Woods", "2026-11-26T22:00:00Z", "2026-11-26T23:00:00Z");
  const s = run([jack], { remembered: shared })[0];
  const accepted = { title: s.title, kind: s.kind };   // what Accept writes (acceptSugg: title, kind; no way is stored)
  assert.equal(C.modeOf(accepted), "commute", "commute is the walk");
  assert.equal(C.MODES.find((m) => m[0] === C.modeOf(accepted))[2], "Walk");
  const src = fs.readFileSync(fileURLToPath(new URL("../calendar-commute.js", import.meta.url)), "utf8");
  assert.doesNotMatch(src, /goodlife|dunfield|jack woods|matthew/i, "no gym name or address in the code");
});

test("Remember for every gym session: the wording, the row, the place name kept, and a second save replaces the row", () => {
  assert.equal(K.rememberName("Gym · Jack Woods"), "gym session");
  assert.equal(K.rememberName("DM Advanced Training"), "DM Advanced Training");
  const row = K.rememberPlace({ title: "Gym · Jack Woods", address: "800 Dunfield Ave, Toronto", lat: 43.7, lng: -79.4, placeName: "GoodLife Fitness Dunfield" });
  assert.equal(row.list, "for:gym");
  assert.equal(row.category, "commute-for");
  assert.ok(row.name && row.name.length <= 200);
  assert.match(row.notes, /^Place: GoodLife Fitness Dunfield$/m, "the place's name is kept in notes (a field the server stores)");
  assert.ok(row.notes.length <= 2000);
  assert.equal(K.placeNameOf(row), "GoodLife Fitness Dunfield");
  const plain = K.rememberPlace({ title: "DM Advanced Training", address: "1 Studio Way" });
  assert.equal(plain.list, "for:dm advanced training", "a title that is not a gym keeps its own row");
  assert.equal(K.placeNameOf(plain), "", "no place name when none was picked");
  assert.equal(K.placeNameOf({ notes: "Where the Commute block before this event goes" }), "", "rows from before this change have none");
  assert.equal(K.rememberPlace({ title: "Gym · Jack Woods", address: "" }), null);
  // the toast keeps its shapes, with "gym session" as the name
  assert.equal(K.rememberToast({ title: K.rememberName("Gym · Jack Woods"), t: { ok: true } }).text, "Remembered for every gym session");
  assert.equal(K.rememberToast({ title: "gym session", t: { ok: false, error: "the server said no" } }).text, "Not remembered: the server said no");
});

test("the To line shows the place's name over its address when one was picked, for a remembered row", () => {
  const row = K.rememberPlace({ title: "Gym · Jack Woods", address: "800 Dunfield Ave, Toronto", placeName: "GoodLife Fitness Dunfield" });
  const matt = ev("m", "Gym · Matthew I. Smith", "2026-11-26T22:00:00Z", "2026-11-26T23:00:00Z");
  const block = ev("cm", "Commute", "2026-11-26T21:30:00Z", "2026-11-26T22:00:00Z");
  const t = K.target({ ev: block, events: [block, matt], tz: TZ, remembered: [{ ...row, id: "g1" }] });
  assert.equal(t.name, "GoodLife Fitness Dunfield");
  assert.deepEqual(K.rowText(t), { main: "GoodLife Fitness Dunfield", sub: "800 Dunfield Ave, Toronto" });
  const old = K.target({ ev: block, events: [block, matt], tz: TZ, remembered: [{ ...row, notes: "Where the Commute block before this event goes", id: "g2" }] });
  assert.deepEqual(K.rowText(old), { main: "800 Dunfield Ave, Toronto", sub: "" }, "an older row without a place name reads as before");
  assert.equal(K.rememberPlace({ title: "Gym · Jack Woods", address: "800 Dunfield Ave", placeName: "800 Dunfield Ave" }).notes.includes("Place:"), false, "a name that is just the address adds nothing");
});

test("page: the second switch, the load of places, the suggestion draw, the gym wording and the stamps", () => {
  const html = fs.readFileSync(fileURLToPath(new URL("../calendar.html", import.meta.url)), "utf8");
  assert.match(html, /const BUILD = "2026-11-25k commute directions after reload";/);
  assert.match(html, /calendar-commute\.js\?v=10/);
  assert.match(html, /calendar-core\.js\?v=34"/, "the core is unchanged");
  assert.match(html, /id="cmSuggSw"/);
  assert.match(html, /Suggest a Commute block before plans away from home/);
  assert.match(html, /store\.get\("cal-commute-suggest"\) !== "0"/, "on by default, its own store key");
  assert.match(html, /store\.set\("cal-commute-suggest"/);
  assert.match(html, /CalCommute\.commuteSuggestions\(/);
  assert.match(html, /CalCommute\.rememberName\(/);
  assert.match(html, /api\("\/quest\/places"\)/);
  const draw = html.slice(html.indexOf("function autoGhosts"), html.indexOf("/** Studio shifts"));
  assert.doesNotMatch(draw, /\/quest\/commute|weather|open-meteo/i, "drawing a suggestion asks Google for nothing");
  assert.match(draw, /homeCal\(\)/, "Accept goes to the calendar new events go to");
  const settings = html.slice(html.indexOf('id="routineSw"'), html.indexOf('id="railSw"'));
  assert.ok(settings.indexOf('id="cmSuggSw"') > settings.indexOf('id="routineSw"'), "below the existing switch");
});

test("opening the Commute panel reads the places again, since first paint already read them (a place taught elsewhere shows)", () => {
  const html = fs.readFileSync(fileURLToPath(new URL("../calendar.html", import.meta.url)), "utf8");
  const after = html.slice(html.indexOf("async function cmAfter(ev)"), html.indexOf("async function cmLoadNotes(ev)"));
  assert.match(after, /else \{[^}]*CM\.places = \(await api\("\/quest\/places"\)\)/, "the already-loaded branch re-reads /quest/places");
});

test("no suggestion when an earlier plan still runs at the start (overlap), and none until the places have loaded", () => {
  const e = dm({ location: "388 Carlaw Ave" });
  const longer = ev("p", "Workshop", "2026-11-26T13:00:00Z", "2026-11-26T16:00:00Z", { location: "5 Far Ave" });
  assert.equal(one([e, longer]).length, 0, "the workshop covers the start");
  const html = fs.readFileSync(fileURLToPath(new URL("../calendar.html", import.meta.url)), "utf8");
  assert.match(html, /const cm0 = CM\.places !== null \|\| CM\.placesTried;/);
  assert.match(html, /cmCal = S\.cmSuggest && cm0 && homeCal\(\)/);
});
