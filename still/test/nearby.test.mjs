// node --test still/test/*.test.mjs   (the Nearby widget, Junyan 2026-10-16)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-nearby.js", import.meta.url)), "utf8"), ctx);
const N = ctx.QuestNearby;
const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 16, h, m));
const gap = (a, b) => ({ s:a, e:b, min:(b - a) / 60000 });

test("the stay is found from the place line or a hotel calendar event; an unknown stay has no list", () => {
  assert.equal(N.stayFor(["🏨 Check in — Madrid Marriott Hotel Princesa Plaza", "Madrid"]).id, "madrid-marriott-princesa-plaza");
  assert.equal(N.stayFor(["Madrid", "Check out by 12:00 — Madrid Marriott Princesa Plaza"]).id, "madrid-marriott-princesa-plaza");
  assert.equal(N.stayFor(["Check in — ibis Styles Madrid Airport Valdebebas", "Madrid"]), null);
  assert.equal(N.stayFor(["Home", "Toronto"]), null);
  assert.equal(N.stayFor([]), null);
  assert.equal(N.stayFor([null, undefined, ""]), null);
  // the first text that names a stay wins (the place line comes first)
  const S = [{ id:"a", match:/alpha/i, places:[] }, { id:"b", match:/beta/i, places:[] }];
  assert.equal(N.stayFor(["beta hotel", "alpha hotel"], S).id, "b");
});

test("an unknown stay hides the widget: no markup at all", () => {
  assert.equal(N.html(null, {}), "");
  assert.equal(N.html({ id:"x", name:"X", places:[] }, {}), "");
});

test("the mode symbol comes from the minutes: walk up to 25 min, else the quicker ride plus the walk", () => {
  const lbl = p => N.chips(p).map(c => c.icon + " " + c.label).join(", ");
  assert.equal(lbl({ walk:10 }), "🚶 10 min");
  assert.equal(lbl({ walk:25, transit:12, car:6 }), "🚶 25 min");
  assert.equal(lbl({ walk:0 }), "🏨 In the hotel");
  assert.equal(lbl({ walk:40, transit:15 }), "🚇 15 min, 🚶 40 min");
  assert.equal(lbl({ walk:40, transit:20, car:12 }), "🚗 12 min, 🚶 40 min");
  assert.equal(lbl({ walk:90, car:15 }), "🚗 15 min, 🚶 1 hr 30 min");
  assert.equal(lbl({ transit:18 }), "🚇 18 min");
  assert.equal(N.chips({ walk:40, transit:15 })[0].mode, "transit");
  assert.equal(N.chips({ walk:12 })[0].mode, "walking");
});

test("every row is collapsed by default; a tapped row opens with what it is, a hint, Directions and Put on the plan", () => {
  const stay = N.stayFor(["Madrid Marriott Hotel Princesa Plaza"]);
  assert.ok(stay.places.length >= 7);
  const shut = N.html(stay, { tab:"see" });
  assert.equal((shut.match(/class="nb-row"/g) || []).length, stay.places.length);
  assert.equal((shut.match(/nb-row open/g) || []).length, 0);
  assert.ok(!/nb-body/.test(shut), "no row body is drawn while collapsed");
  assert.ok(/Nearby · Marriott Princesa Plaza/.test(N.title(stay)));
  const id = stay.places[1].id, open = N.html(stay, { tab:"see", open:{ [id]:true } });
  assert.equal((open.match(/nb-row open/g) || []).length, 1);
  assert.match(open, /Directions/);
  assert.match(open, /Put on the plan/);
  assert.match(open, new RegExp(`data-nbplan="${id}"`));
  // the gym's photo shows only when it is open
  const gym = stay.places.find(p => p.photo);
  assert.ok(gym && !shut.includes("<img"));
  assert.match(N.html(stay, { tab:"see", open:{ [gym.id]:true } }), /<img [^>]*loading="lazy"/);
  assert.ok(!/Directions/.test(N.html(stay, { tab:"see", open:{ [gym.id]:true } })), "no Directions to the hotel's own gym");
});

test("Directions go from the hotel with the travel mode of the first chip", () => {
  const stay = N.stayFor(["Madrid Marriott Hotel Princesa Plaza"]);
  const u = new URL(N.directionsUrl(stay, { name:"Templo de Debod", q:"Templo de Debod, Madrid", walk:13 }));
  assert.equal(u.origin + u.pathname, "https://www.google.com/maps/dir/");
  assert.equal(u.searchParams.get("api"), "1");
  assert.match(u.searchParams.get("origin"), /Serrano Jover 3/);
  assert.equal(u.searchParams.get("destination"), "Templo de Debod, Madrid");
  assert.equal(u.searchParams.get("travelmode"), "walking");
  assert.equal(new URL(N.directionsUrl(stay, { name:"Far", walk:40, transit:15 })).searchParams.get("travelmode"), "transit");
  assert.equal(new URL(N.directionsUrl(stay, { name:"Far", walk:40, car:9 })).searchParams.get("travelmode"), "driving");
});

test("Put on the plan uses the first existing free slot that fits, 60 min by default", () => {
  const gaps = [gap(at(11), at(11, 30)), gap(at(12, 30), at(13, 20)), gap(at(14), at(16)), gap(at(17), at(19))];
  let r = N.slotFor(gaps);
  assert.equal(r.s.toISOString(), at(14).toISOString());
  assert.equal(r.e.toISOString(), at(15).toISOString());
  r = N.slotFor(gaps, 30);
  assert.equal(r.s.toISOString(), at(11).toISOString());
  assert.equal(N.slotFor([gap(at(11), at(11, 45))], 60), null);
  assert.equal(N.slotFor([], 60), null);
  // a place can carry its own length (the gym, a palace visit)
  assert.equal(N.minFor({ min:90 }), 90);
  assert.equal(N.minFor({}), 60);
});

test("a row that was put on the plan says when", () => {
  const stay = N.stayFor(["Madrid Marriott Hotel Princesa Plaza"]), id = stay.places[2].id;
  const h = N.html(stay, { tab:"see", open:{ [id]:true }, msg:{ [id]:"On the plan at 2:00 PM, 1 hr." } });
  assert.match(h, /On the plan at 2:00 PM/);
});

test("names and notes are escaped", () => {
  const stay = { id:"t", name:"T", short:"T", origin:"o", places:[{ id:"p", icon:"x", name:"<b>&", what:"<i>", hint:"\"", walk:5 }] };
  const h = N.html(stay, { open:{ p:true } });
  assert.ok(!h.includes("<b>&") && h.includes("&lt;b&gt;&amp;") && h.includes("&lt;i&gt;"));
});

test("quest.html starts the widget hidden, loads quest-nearby.js, and the dashboard can take it out of the grid", () => {
  const page = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
  const dash = fs.readFileSync(fileURLToPath(new URL("../quest-dash.js", import.meta.url)), "utf8");
  assert.match(page, /<script src="quest-nearby\.js\?v=\w+"><\/script>/);
  assert.match(page, /<h2 id="nearbyH" hidden>/);
  assert.match(page, /<div id="nearby" data-dash-optional hidden><\/div>/);
  assert.match(page, /QuestNearby\.stayFor|QN\.stayFor/);
  assert.match(page, /QuestMorning\.gapsOf\(MO_CTX\.data\(\)\)/);
  assert.match(dash, /window\.QuestDash = \{ sync \}/);
  assert.match(dash, /"w-nearby":/);
});

// Eat tab and stay times (Junyan 2026-10-16: food "in this widget", "updated based on where we are")
const mad = (d, h, m = 0) => new Date(Date.UTC(2026, 9, d, h - 2, m));   // Madrid wall clock in October (UTC+2)

test("the stay comes from its calendar check-in and check-out times, so days with no hotel event still know it", () => {
  const S = [
    { id:"a", match:/alpha/i, tz:"Europe/Madrid", in:"2026-10-16T13:00", out:"2026-10-20T12:00", places:[] },
    { id:"b", match:/beta/i, tz:"Europe/Madrid", in:"2026-10-20T18:00", out:"2026-10-22T13:00", places:[] },
  ];
  assert.equal(N.stayFor(["Madrid novelty slot", "Madrid"], S, mad(17, 10)).id, "a");   // a day between, no hotel text
  assert.equal(N.stayFor([], S, mad(20, 11, 59)).id, "a");
  assert.equal(N.stayFor([], S, mad(20, 14)).id, "b");   // moving day, after checkout: the stay he is heading to
  assert.equal(N.stayFor([], S, mad(16, 9)).id, "a");    // arrival day, before check-in
  assert.equal(N.stayFor([], S, mad(21, 9)).id, "b");
  assert.equal(N.stayFor([], S, mad(23, 9)), null);      // after the last checkout, nothing
  assert.equal(N.stayFor(["beta hotel"], S, mad(23, 9)).id, "b");   // the text still works as the fallback
  assert.equal(N.wall(mad(17, 10, 5), "Europe/Madrid"), "2026-10-17T10:05");
});

test("every stay on the trip is found on its days from the real list", () => {
  assert.equal(N.stayFor([], null, mad(18, 15)).id, "madrid-marriott-princesa-plaza");
  assert.equal(N.stayFor(["Madrid novelty slot", "Madrid"], null, mad(17, 21)).id, "madrid-marriott-princesa-plaza");
  assert.equal(N.stayFor(["Drive/park for El Yelmo", "La Pedriza"], null, mad(21, 9)).id, "manzanares-estudio-maeso");
  assert.equal(N.stayFor(["Provisional · Drive to airport hotel", "MAD"], null, mad(22, 20)).id, "madrid-ac-hotel-airport");
  assert.equal(N.stayFor(["🏨 Check in — AC Hotel Madrid Airport"]).id, "madrid-ac-hotel-airport");
  assert.equal(N.stayFor([], null, mad(24, 12)), null);   // home: no card
  for (const s of N.STAYS) assert.ok((s.eat || []).length >= 4, `${s.id} has an Eat list`);
  for (const s of N.STAYS) assert.ok(s.in < s.out && s.tz, s.id);
  const ids = N.STAYS.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of N.STAYS) {
    const all = [].concat(s.places || [], s.eat || []).map(p => p.id);
    assert.equal(new Set(all).size, all.length, `${s.id}: ids unique across See & do and Eat`);
  }
});

test("Eat is a second tab in the same card; near meal times the card opens on it", () => {
  const stay = { id:"t", name:"T", short:"T", origin:"o", tz:"Europe/Madrid",
    places:[{ id:"museum", icon:"🏛️", name:"Museum", walk:10, what:"w" }],
    eat:[{ id:"e-soup", icon:"🍜", name:"Soup Bar", fits:"Pho for Caney, tofu for you", walk:8, what:"w", rating:"4.6 Google (900 reviews)" }] };
  const see = N.html(stay, { tab:"see" });
  assert.match(see, /class="nb-tabs"/);
  assert.match(see, /data-nbtab="see"[^>]*>|aria-selected="true" data-nbtab="see"/);
  assert.match(see, /Museum/); assert.ok(!/Soup Bar/.test(see));
  const eat = N.html(stay, { tab:"eat" });
  assert.match(eat, /Soup Bar/); assert.ok(!/Museum/.test(eat));
  assert.match(eat, /class="nb-fit">Pho for Caney, tofu for you</);
  assert.ok(!/nb-rate/.test(eat), "the rating shows only when the row is open");
  assert.match(N.html(stay, { tab:"eat", open:{ "e-soup":true } }), /⭐ 4\.6 Google/);
  // no tab picked yet: lunch and dinner open on Eat, mid-morning and afternoon on See & do
  assert.equal(N.defaultTab(stay, mad(17, 14)), "eat");
  assert.equal(N.defaultTab(stay, mad(17, 21)), "eat");
  assert.equal(N.defaultTab(stay, mad(17, 11)), "see");
  assert.equal(N.defaultTab(stay, mad(17, 17)), "see");
  assert.match(N.html(stay, {}, mad(17, 21)), /Soup Bar/);
  // a stay with only one list: no tab bar, just that list
  const only = { ...stay, places:[] };
  assert.ok(!/nb-tabs/.test(N.html(only, {})));
  assert.match(N.html(only, { tab:"see" }), /Soup Bar/);
  // Put on the plan finds a food row too
  assert.equal(N.find(stay, "e-soup").name, "Soup Bar");
  assert.equal(N.find(stay, "museum").name, "Museum");
  assert.equal(N.find(stay, "nope"), null);
});

// Near me (Junyan 2026-10-16, d2): times from where the phone is
test("Near me: rough times from where he is, nearest first, marked ~, Directions from his spot", () => {
  const stay = { id:"t", name:"T", short:"T", origin:"Hotel door", tz:"Europe/Madrid",
    places:[
      { id:"far", icon:"🏛️", name:"Far", walk:10, lat:40.4167, lng:-3.7136, what:"w" },
      { id:"gym", icon:"🏋️", name:"Gym", walk:0, lat:40.4297, lng:-3.7144, what:"w" },
      { id:"nopos", icon:"?", name:"No position", walk:7, what:"w" },
      { id:"near", icon:"🌳", name:"Near", walk:14, lat:40.4241, lng:-3.7176, what:"w" },
    ] };
  const here = { lat:40.4240, lng:-3.7176, at:0 };   // at Templo de Debod
  assert.ok(Math.abs(N.metres({ lat:40.4297, lng:-3.7144 }, { lat:40.4240, lng:-3.7176 }) - 690) < 30);
  assert.equal(N.ordered(stay.places, here).map(p => p.id).join(), "near,gym,far,nopos");
  assert.equal(N.chips(stay.places[3], here)[0].label, "~1 min");
  assert.equal(N.chips(stay.places[1], here)[0].label, "~11 min");          // the hotel gym from out in the city
  assert.equal(N.chips(stay.places[1], { lat:40.4297, lng:-3.7144 })[0].label, "In the hotel");
  assert.equal(N.chips(stay.places[2], here)[0].label, "7 min");            // no position: the stay's own time
  // a long way off: the ride first, then the walk, both rough
  assert.equal(N.chips(stay.places[0], { lat:40.47, lng:-3.57 }).map(c => c.mode).join(), "driving,walking");
  // Directions start from the phone (no origin) only when he is using Near me
  assert.ok(!new URL(N.directionsUrl(stay, stay.places[3], here)).searchParams.has("origin"));
  assert.equal(new URL(N.directionsUrl(stay, stay.places[3])).searchParams.get("origin"), "Hotel door");
  // the card: a Near me button, and with it on a note and the nearest row first
  const off = N.html(stay, { tab:"see" });
  assert.match(off, /data-nbnear aria-pressed="false">📍 Near me</);
  assert.ok(!/nb-from/.test(off));
  const on = N.html(stay, { tab:"see", here });
  assert.match(on, /nb-near on/); assert.match(on, /Rough times from where you are/);
  assert.ok(on.indexOf(">Near<") < on.indexOf(">Far<"));
  assert.match(N.html(stay, { tab:"see", locating:true }), /Finding you/);
  assert.match(N.html(stay, { tab:"see", nearMsg:"Location is off for this page." }), /Location is off/);
  // no positions at all: no button
  assert.ok(!/data-nbnear/.test(N.html({ ...stay, places:[stay.places[2]] }, {})));
  // every real place has a position, so Near me can sort them all
  for (const s of N.STAYS) for (const p of [].concat(s.places || [], s.eat || [])) assert.ok(p.lat != null && p.lng != null, `${s.id}/${p.id}`);
});

// d3 (2026-10-16): stays the weekly job keeps on the Still server (GET /quest/nearby)
test("stays from the job's file join the list, are found by their times, and never replace a hand-made one", () => {
  const S = [{ id:"a", match:/alpha/i, tz:"Europe/Madrid", in:"2026-10-16T13:00", out:"2026-10-20T12:00", places:[] }];
  const rio = { id:"rio-flat-flamengo", name:"Flat Moderno no Flamengo", short:"Flamengo flat", kind:"apartment",
    match:"flat moderno|sen\\\\.? vergueiro", tz:"America/Sao_Paulo", in:"2027-01-03T15:00", out:"2027-01-07T10:00",
    origin:"R. Sen. Vergueiro 224, Flamengo, Rio de Janeiro", places:[], eat:[{ id:"e-x", icon:"🥗", name:"X", walk:5, lat:-22.93, lng:-43.17, what:"w" }] };
  assert.equal(N.addStays([rio, { id:"a", name:"dup", in:"x", out:"y" }, { id:"bad" }, null], S), 1);
  assert.equal(S.length, 2);
  assert.equal(N.stayFor([], S, new Date("2027-01-05T15:00:00Z")).id, "rio-flat-flamengo");   // noon in Rio
  assert.equal(N.stayFor(["🏨 Check-in — Flat Moderno no Flamengo"], S).id, "rio-flat-flamengo");
  assert.equal(N.wall(new Date("2027-01-05T15:00:00Z"), "America/Sao_Paulo"), "2027-01-05T12:00");
  // no match pattern: the name is matched as plain text
  N.addStays([{ id:"n", name:"Hotel (Centro)", in:"2027-02-01T14:00", out:"2027-02-02T12:00", tz:"America/Sao_Paulo" }], S);
  assert.ok(S.find(s => s.id === "n").match.test("Check in: Hotel (Centro)"));
  const page = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
  assert.match(page, /qfetch\("\/quest\/nearby"\)/);   // private: on the Still server, never in this public repo
  assert.ok(!fs.existsSync(fileURLToPath(new URL("../nearby-stays.json", import.meta.url))), "no stays file in the public repo");
});
