// node --test still/test/calendar-packing-block.test.mjs
// The Packing block type (slice 02, Junyan 2026-11-16, d23 and d24: "p1 yes, p2 yes"). A "🧳 Packing" chip next to
// Travel and Errands; a block whose title has "pack" in it is guessed as Packing; on a computer the panel of a Packing
// block opens the Packing page on the trip that block belongs to (the trip whose dates hold its day, else the next trip
// coming up after it, else the Packing page as it opens today). On the phone only the chip is new (d24, d14).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import "../calendar-core.js";

const C = globalThis.CalCore;
const file = (p) => fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(file("../quest-trips.js"), ctx);
const T = ctx.QuestTrips;
const html = file("../calendar.html");

function mem() {
  const m = new Map();
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { if (v == null) m.delete(k); else m.set(k, String(v)); } };
}
const TODAY = "2026-11-16";
const TRIPS = [
  { name: "2026 🇨🇦 Montreal Birthday", start: "2026-11-12", end: "2026-11-17" },
  { name: "2026 FICTION stay", start: "2026-12-04", end: "2026-12-07" },
  { name: "2027 🇧🇷 Brazil Carnaval", start: "2027-01-03", end: "2027-02-07" },
  { name: "2026 🇪🇬 Egypt", start: "2026-09-25", end: "2026-10-23" },
  { name: "2024 🇨🇦 Toronto Zouk Marathon", start: "", end: "" },
  { name: "Toronto", start: "2026-11-01", end: "2026-11-30" },
];
const MTL = "t:2026 montreal birthday", FICTION = "t:2026 fiction stay", BRAZIL = "t:2027 brazil carnaval", EGYPT = "t:2026 egypt";
/** A Packing page that has read his trips. Its items need not be loaded for the trip pick. */
function page(trips = TRIPS) { const p = C.packing({ store: mem(), trips: T }); if (trips) p.sync(trips, TODAY); return p; }

test("a block with \"pack\" in its title is guessed as Packing, in any case", () => {
  for (const t of ["Pack for FICTION stay", "pack", "PACKING", "Packing for Brazil", "Finish packing", "Unpack after Montreal"])
    assert.equal(C.guessKind(t), "pack", t);
  assert.equal(C.kindOf({ title: "Pack for FICTION stay" }), "pack");
});

test("\"pack\" inside a longer word counts too: Backpack and Packers are guessed as Packing", () => {
  assert.equal(C.guessKind("Buy a backpack"), "pack");
  assert.equal(C.guessKind("Packers game"), "pack");
});

test("Packing wins over the other types' words: \"Pack for the trip\" is Packing, not Travel", () => {
  assert.equal(C.guessKind("Pack for the trip"), "pack");
  assert.equal(C.guessKind("Pack lunch"), "pack");
  assert.equal(C.guessKind("Pack gym bag", "Staff"), "pack");
});

test("a title without \"pack\" keeps its old guess", () => {
  const OLD = [["Flight to Montreal", "travel"], ["Deep work", "deep"], ["Gym", "gym"], ["Zouk night", "dance"], ["Dinner with Caney", "cook"],
    ["Call the bank", "errand"], ["Bedtime", "wind"], ["Nap", "rest"], ["Mom's birthday", "social"], ["Studio viewing", "studio"],
    ["Yoga", "yoga"], ["Remembrance Day", "other"], ["", "other"], ["Stay at FICTION", "travel"]];
  for (const [t, k] of OLD) assert.equal(C.guessKind(t), k, t);
  assert.equal(C.guessKind("Staff sync", "Staff"), "studio");
});

test("a hand-set Packing wins over the guess, and a hand-set type wins over \"pack\"", () => {
  assert.equal(C.kindOf({ title: "Gym", kind: "pack" }), "pack");
  assert.equal(C.kindOf({ title: "Pack for FICTION stay", kind: "travel" }), "travel");
});

test("the chips: 🧳 Packing comes right after Travel, before Social and Errands", () => {
  assert.deepEqual(C.KINDS.map((x) => x[0]), ["deep", "studio", "yoga", "gym", "dance", "cook", "travel", "pack", "social", "errand", "wind", "rest", "other"]);
  assert.deepEqual(C.KINDS.find((x) => x[0] === "pack"), ["pack", "Packing"]);
  assert.match(html, /const KICON = \{[^}]*\bpack: "🧳"/, "the chip shows the suitcase");
});

test("a block's day inside a trip opens that trip", () => {
  const p = page();
  assert.deepEqual({ ...p.openFor("2026-11-16", TODAY) }, { list: MTL, tab: "up" });
  assert.deepEqual({ ...p.openFor("2026-11-12", TODAY) }, { list: MTL, tab: "up" }, "its first day");
  assert.deepEqual({ ...p.openFor("2026-11-17", TODAY) }, { list: MTL, tab: "up" }, "its last day");
  assert.deepEqual({ ...p.openFor("2026-12-05", TODAY) }, { list: FICTION, tab: "up" });
});

test("a block's day before a trip opens the next trip coming up after it", () => {
  const p = page();
  assert.deepEqual({ ...p.openFor("2026-11-20", TODAY) }, { list: FICTION, tab: "up" }, "Pack for FICTION stay, two weeks ahead");
  assert.deepEqual({ ...p.openFor("2026-12-08", TODAY) }, { list: BRAZIL, tab: "up" });
});

test("a block in the past opens its trip on the Past tab", () => {
  assert.deepEqual({ ...page().openFor("2026-10-01", TODAY) }, { list: EGYPT, tab: "past" });
  assert.deepEqual({ ...page().openFor("2026-09-20", TODAY) }, { list: EGYPT, tab: "past" }, "the trip after it, now over");
});

test("the home trip and a trip with no dates are never picked", () => {
  const p = page([{ name: "Toronto", start: "2026-11-01", end: "2026-11-30" }, { name: "2024 🇨🇦 Toronto Zouk Marathon", start: "", end: "" }]);
  assert.equal(p.openFor("2026-11-16", TODAY), null);
});

test("no trip after the block, or no trips read yet: null, so the Packing page opens as it does today", () => {
  assert.equal(page().openFor("2027-03-01", TODAY), null);
  assert.equal(page(null).openFor("2026-11-16", TODAY), null);
  assert.equal(page([]).openFor("2026-11-16", TODAY), null);
  assert.equal(page().openFor("", TODAY), null);
});

test("the panel: the Open packing list button is drawn only on a computer, and Packing gets no tab of its own", () => {
  assert.match(html, /TYPES = C\.KINDS\.map\(\(x\) => x\[0\]\)\.filter\(\(k\) => k !== "other" && k !== "pack"\)/, "no second Packing tab beside the Packing button");
  const btn = html.match(/[^\n]*Open packing list[^\n]*/g) || [];
  assert.equal(btn.length, 1, "one button, in the computer panel");
  assert.match(btn[0], /WIDE\.matches/, "drawn only at 768 px and up (d14)");
  assert.match(btn[0], /data-pkday=/);
  const sheet = html.slice(html.indexOf("function pSheet("), html.indexOf("function pSheet(") + 6000);
  assert.doesNotMatch(sheet, /packing list/i, "the phone sheet has no Packing button");
  assert.match(html, /d\.pkday != null\) packFor\(d\.pkday\)/, "a click opens the Packing page on the block's trip");
  assert.match(html, /function packFor\(day\) \{\s*if \(!WIDE\.matches\) return;/, "and does nothing under 768 px");
});

test("the BUILD label names this copy", () => {
  assert.match(html, /const BUILD = "2026-11-17f trip map";/, "slice 04 (trip map) renamed it");
  assert.match(html, /calendar-core\.js\?v=25"/, "a new stamp for the changed core (slice 04)");
});

test("the page's own script still parses (a stray backtick once broke the whole page and no regex test saw it)", () => {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.trim());
  assert.ok(scripts.length > 0);
  for (const s of scripts) assert.doesNotThrow(() => new vm.Script(s), SyntaxError);
});
