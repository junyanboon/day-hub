// node --test still/test/packing-food.test.mjs
// Road trip food on the Packing page (slice 03, Junyan 2026-11-17, "26 yes, 27 yes" to mock v3): its own list beside
// the bags, behind CalCore.packing, with the storage passed in. Set up the same way as packing.test.mjs.
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
const SEED = JSON.parse(file("../packing-seed.json"));
const FOOD = JSON.parse(file("../food-seed.json"));

function mem() {
  const m = new Map();
  return { m, get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { if (v == null) m.delete(k); else m.set(k, String(v)); } };
}
const TODAY = "2026-11-13";
const TRIPS = [
  { name: "2026 🇨🇦 Montreal Birthday", start: "2026-11-12", end: "2026-11-17" },
  { name: "2027 🇧🇷 Brazil Carnaval", start: "2027-01-03", end: "2027-02-07" },
  { name: "2026 🇪🇬 Egypt", start: "2026-09-25", end: "2026-10-23" },
];
const MTL = "t:2026 montreal birthday", BRAZIL = "t:2027 brazil carnaval", EGYPT = "t:2026 egypt";
/** A new browser: the bags' copy, then the food template, then his trips (the page loads them in this order). */
function open(store = mem()) { const p = C.packing({ store, trips: T }); p.seed(SEED); p.seedFood(FOOD); p.sync(TRIPS, TODAY); return p; }
/** His browser today: Montreal already started from the Road Trip list before food existed. */
function today(store = mem()) { const p = C.packing({ store, trips: T }); p.seed(SEED); p.sync(TRIPS, TODAY); p.seedFood(FOOD); return p; }
const names = (g) => g.rows.map((r) => r.name);
const grp = (f, id) => f.groups.find((g) => g.id === id);

test("the Road Trip list has the food template: six groups in the mock's order, words and items", () => {
  const f = open().food("road");
  assert.equal(f.started, true);
  assert.equal(f.ticks, false, "My lists have no ticks");
  assert.deepEqual(f.groups.map((g) => [g.id, g.title, g.icon, g.pill]), [
    ["steps", "Before you go", "📝", true], ["every", "Every road trip", "🥣", true],
    ["trip", "This trip", "🍚", true], ["gear", "Kitchen gear", "🍳", true],
    ["buy", "Buy on arrival", "🛒", false], ["cooler", "Cooler", "🧊", true]]);
  assert.ok(f.groups.every((g) => !("sub" in g)), "mock v5 (d29): no group subtitles");
  assert.deepEqual(names(grp(f, "steps")), ["Mix the nutty pudding", "Close out the fridge"]);
  assert.deepEqual(names(grp(f, "every")), ["Nutty pudding mix", "Super veggie", "Lentils"]);
  assert.deepEqual(names(grp(f, "trip")), ["Rice", "Cumin seeds", "Sea salt", "Olive oil", "Lunch for the drive"]);
  assert.deepEqual(names(grp(f, "gear")), ["Vitamix, in its tote", "Kitchen scale", "Measuring spoons", "Whisk", "Spatula", "Knife", "Wiping towel"]);
  assert.deepEqual(names(grp(f, "buy")), ["Frozen berries", "Broccoli", "Cauliflower"]);
  assert.deepEqual([grp(f, "cooler").rows, grp(f, "cooler").empty], [[], "Empty. No ice packs."]);
  assert.deepEqual(grp(f, "steps").rows.map((r) => [r.when, r.pill]), [["day", "Day before"], ["day", "Day before"]]);
  assert.deepEqual(grp(f, "every").rows.map((r) => r.pill), ["Day before", "When?", "Day before"]);
  assert.equal(grp(f, "trip").rows[4].pill, "On leaving");
  assert.equal(grp(f, "every").count, "3", "a list with no ticks shows the size only");
});

test("seeding food happens once and never touches the bags", () => {
  const p = open(), before = JSON.stringify(p.board(MTL, {}));
  assert.equal(p.seedFood(FOOD), false);
  assert.equal(p.foodReady(), true);
  assert.equal(JSON.stringify(p.board(MTL, {})), before);
});

test("a trip started from the Road Trip list gets its own copy of the food; the Food count is the four packed groups", () => {
  const p = open(), f = p.food(MTL);
  assert.equal(f.started, true);
  assert.equal(f.ticks, true);
  assert.equal(f.count, 15, "Every road trip 3 + This trip 5 + Kitchen gear 7 + Cooler 0");
  assert.deepEqual(f.groups.map((g) => g.count), ["0 of 2", "0 of 3", "0 of 5", "0 of 7", "0 of 3", "0 of 0"]);
  assert.equal(p.board(MTL, {}).chips[0].n, 37, "the bags still hold 37");
});

test("no Food switch on a trip started from another list, on a trip with no list, or on the other My lists", () => {
  const p = open();
  p.start(BRAZIL, "brazil");
  assert.equal(p.food(BRAZIL), null);
  assert.equal(p.food(EGYPT), null);
  for (const l of ["all", "brazil", "ski"]) assert.equal(p.food(l), null, l);
  p.start(EGYPT, MTL);
  assert.equal(p.food(EGYPT), null, "copying a trip is not starting from the Road Trip list");
});

test("starting a trip over from the Road Trip list gives it fresh food; over from another list takes food away", () => {
  const p = open();
  p.foodAdd(MTL, "trip", "Pasta");
  p.foodTick(MTL, grp(p.food(MTL), "every").rows[0].id, true);
  p.start(MTL, "road");
  const f = p.food(MTL);
  assert.deepEqual(names(grp(f, "trip")), ["Rice", "Cumin seeds", "Sea salt", "Olive oil", "Lunch for the drive"]);
  assert.equal(grp(f, "every").done, 0);
  p.start(MTL, "ski");
  assert.equal(p.food(MTL), null);
});

test("an existing Road Trip trip without food shows the button, and starting food leaves its bags and ticks alone", () => {
  const store = mem(), p = today(store);
  const bagId = p.board(MTL, {}).bags[0].rows[0].id;
  p.tick(MTL, bagId, true);
  const before = JSON.stringify(p.board(MTL, {})), card = JSON.stringify(p.picker({ today: TODAY }).up[0]);
  assert.deepEqual(p.food(MTL), { started: false, ticks: true, count: 0, groups: [], button: "Start food from your Road Trip list" });
  p.startFood(MTL);
  assert.equal(p.food(MTL).count, 15);
  assert.equal(JSON.stringify(p.board(MTL, {})), before, "bags and ticks untouched");
  assert.equal(JSON.stringify(p.picker({ today: TODAY }).up[0]), card, "the trip card still counts bags only");
  assert.equal(C.packing({ store, trips: T }).food(MTL).count, 15, "kept in the browser");
  p.foodAdd(MTL, "trip", "Pasta");
  p.startFood(MTL);
  assert.ok(names(grp(p.food(MTL), "trip")).includes("Pasta"), "the button does nothing once food is there");
  assert.equal(p.startFood(BRAZIL), undefined);
  assert.equal(p.food(BRAZIL), null, "the button only works on a Road Trip trip");
});

test("+ Add, then Enter adds to the end of every group, Before you go included; Buy on arrival has no pill", () => {
  const p = open();
  for (const g of ["steps", "every", "trip", "gear", "buy", "cooler"]) assert.ok(p.foodAdd(MTL, g, `  New ${g}  `), g);
  const f = p.food(MTL);
  for (const g of f.groups) assert.equal(g.rows[g.rows.length - 1].name, `New ${g.id}`, g.id);
  assert.equal(grp(f, "trip").rows[5].when, "day", "added food is Day before, as in the mock");
  assert.equal(grp(f, "buy").rows[3].pill, "", "no pill on Buy on arrival");
  assert.equal(f.count, 15 + 4, "steps and Buy on arrival are not counted");
  assert.equal(p.foodAdd(MTL, "trip", "   "), null, "an empty box adds nothing");
  assert.equal(p.foodAdd(MTL, "nope", "Pasta"), null, "only the six groups");
  assert.equal(p.foodAdd(BRAZIL, "trip", "Pasta"), null, "no food on a trip without it");
});

test("d27: an add to Every road trip, Kitchen gear or Before you go also goes onto the Road Trip template", () => {
  const p = open();
  p.foodAdd(MTL, "every", "Chia pudding");
  p.foodAdd(MTL, "gear", "Cutting board");
  p.foodAdd(MTL, "steps", "Take out the trash");
  p.foodAdd(MTL, "trip", "Pasta");
  p.foodAdd(MTL, "buy", "Avocado");
  p.foodAdd(MTL, "cooler", "Frozen peas");
  const r = p.food("road");
  assert.equal(names(grp(r, "every")).at(-1), "Chia pudding");
  assert.equal(names(grp(r, "gear")).at(-1), "Cutting board");
  assert.equal(names(grp(r, "steps")).at(-1), "Take out the trash");
  assert.ok(!names(grp(r, "trip")).includes("Pasta"), "This trip stays on this trip");
  assert.ok(!names(grp(r, "buy")).includes("Avocado"));
  assert.deepEqual(grp(r, "cooler").rows, []);
  p.foodAdd(MTL, "every", "chia PUDDING");
  assert.equal(names(grp(p.food("road"), "every")).filter((n) => /chia/i.test(n)).length, 1, "not twice on the template");
  p.start(BRAZIL, "road");
  assert.equal(names(grp(p.food(BRAZIL), "every")).at(-1), "Chia pudding", "a future road trip starts with it");
});

test("adding on the Road Trip list itself changes the template only", () => {
  const p = open();
  p.foodAdd("road", "trip", "Pasta");
  assert.equal(names(grp(p.food("road"), "trip")).at(-1), "Pasta");
  assert.ok(!names(grp(p.food(MTL), "trip")).includes("Pasta"), "a trip already started keeps its own copy");
});

test("× removes from this trip only; the template keeps it", () => {
  const p = open();
  const rice = grp(p.food(MTL), "trip").rows[0], pudding = grp(p.food(MTL), "every").rows[0];
  p.foodRemove(MTL, rice.id);
  p.foodRemove(MTL, pudding.id);
  assert.ok(!names(grp(p.food(MTL), "trip")).includes("Rice"));
  assert.ok(!names(grp(p.food(MTL), "every")).includes("Nutty pudding mix"));
  assert.ok(names(grp(p.food("road"), "every")).includes("Nutty pudding mix"));
  assert.equal(p.food(MTL).count, 13);
  const step = grp(p.food(MTL), "steps").rows[1];
  p.foodRemove(MTL, step.id);
  assert.deepEqual(names(grp(p.food(MTL), "steps")), ["Mix the nutty pudding"], "steps can go too");
  const t = grp(p.food("road"), "buy").rows[0];
  p.foodRemove("road", t.id);
  assert.ok(!names(grp(p.food("road"), "buy")).includes("Frozen berries"), "× on the template removes from the template");
});

test("ticks are per trip: N of M, kept, and another Road Trip trip starts unticked", () => {
  const store = mem(), p = open(store);
  p.start(BRAZIL, "road");
  const f = p.food(MTL);
  p.foodTick(MTL, grp(f, "every").rows[0].id, true);
  p.foodTick(MTL, grp(f, "every").rows[2].id, true);
  p.foodTick(MTL, grp(f, "steps").rows[0].id, true);
  p.foodTick(MTL, grp(f, "buy").rows[1].id, true);
  const g = p.food(MTL);
  assert.deepEqual([grp(g, "every").count, grp(g, "steps").count, grp(g, "buy").count], ["2 of 3", "1 of 2", "1 of 3"]);
  assert.deepEqual(grp(g, "every").rows.map((r) => r.done), [true, false, true]);
  assert.equal(grp(p.food(BRAZIL), "every").done, 0);
  assert.equal(grp(C.packing({ store, trips: T }).food(MTL), "every").done, 2, "kept in the browser");
  p.foodTick(MTL, grp(g, "every").rows[0].id, false);
  assert.equal(grp(p.food(MTL), "every").count, "1 of 3");
  p.foodTick("road", grp(p.food("road"), "every").rows[0].id, true);
  assert.equal(grp(p.food("road"), "every").done, 0, "the template has no ticks");
});

test("a pill changes when, on this trip only; Buy on arrival takes no pill", () => {
  const p = open();
  const sv = grp(p.food(MTL), "every").rows[1];
  p.foodWhen(MTL, sv.id, "week");
  assert.deepEqual([grp(p.food(MTL), "every").rows[1].when, grp(p.food(MTL), "every").rows[1].pill], ["week", "Week before"]);
  assert.equal(grp(p.food("road"), "every").rows[1].when, "none", "the template is not changed");
  p.foodWhen(MTL, sv.id, "bogus");
  assert.equal(grp(p.food(MTL), "every").rows[1].when, "week");
  const step = grp(p.food(MTL), "steps").rows[0];
  p.foodWhen(MTL, step.id, "leave");
  assert.equal(grp(p.food(MTL), "steps").rows[0].pill, "On leaving");
  const berries = grp(p.food(MTL), "buy").rows[0];
  p.foodWhen(MTL, berries.id, "week");
  assert.equal(grp(p.food(MTL), "buy").rows[0].pill, "");
});

test("one click on a pill moves it on: Week before, Day before, On leaving, When?, then round again; saved per trip", () => {
  const store = mem(), p = open(store);
  const pillOf = (q, list) => grp(q.food(list), "every").rows[1];
  const sv = pillOf(p, MTL);
  assert.deepEqual([sv.when, sv.pill], ["none", "When?"]);
  const seen = [];
  for (let i = 0; i < 4; i++) { p.foodCycle(MTL, sv.id); const r = pillOf(p, MTL); seen.push([r.when, r.pill]); }
  assert.deepEqual(seen, [["week", "Week before"], ["day", "Day before"], ["leave", "On leaving"], ["none", "When?"]], "four clicks get back to the start");
  p.foodCycle(MTL, sv.id);
  const again = C.packing({ store, trips: T }); again.sync(TRIPS, TODAY);
  assert.equal(pillOf(again, MTL).when, "week", "kept in this browser after a reload");
  assert.equal(pillOf(again, "road").when, "none", "this trip only: the template keeps its pill");
  const berries = grp(p.food(MTL), "buy").rows[0];
  p.foodCycle(MTL, berries.id);
  assert.equal(grp(p.food(MTL), "buy").rows[0].pill, "", "Buy on arrival takes no pill");
  const tpl = pillOf(p, "road"); p.foodCycle("road", tpl.id);
  assert.equal(pillOf(p, "road").when, "week", "the template's own pills cycle the same way");
});

test("bags untouched: the whole bag side reads the same after a full round of food", () => {
  const p = open(), board = JSON.stringify(p.board(MTL, {})), road = JSON.stringify(p.board("road", {})), pick = JSON.stringify(p.picker({ today: TODAY }));
  const f = p.food(MTL);
  p.foodAdd(MTL, "every", "Chia pudding");
  p.foodTick(MTL, grp(f, "gear").rows[0].id, true);
  p.foodWhen(MTL, grp(f, "trip").rows[0].id, "week");
  p.foodRemove(MTL, grp(f, "trip").rows[1].id);
  assert.equal(JSON.stringify(p.board(MTL, {})), board);
  assert.equal(JSON.stringify(p.board("road", {})), road);
  assert.equal(JSON.stringify(p.picker({ today: TODAY })), pick);
  p.untickAll(MTL);
  assert.equal(grp(p.food(MTL), "gear").done, 1, "Start fresh on the bags leaves food ticks alone");
});

test("names are kept as typed; food never reads amounts", () => {
  const p = open();
  p.foodAdd(MTL, "trip", "Pasta x3");
  assert.equal(names(grp(p.food(MTL), "trip")).at(-1), "Pasta x3");
});

test("before the food template loads, nothing breaks and no switch shows", () => {
  const p = C.packing({ store: mem(), trips: T });
  p.seed(SEED); p.sync(TRIPS, TODAY);
  assert.equal(p.foodReady(), false);
  assert.equal(p.food("road"), null);
  assert.equal(p.food(MTL), null);
  assert.equal(p.foodAdd(MTL, "trip", "Pasta"), null);
});

/* ---------- the page (still/calendar.html): it draws CalCore.packing's food and passes his clicks back ---------- */
const html = file("../calendar.html");
const load = html.slice(html.indexOf("async function packLoad("), html.indexOf("const packDayOf"));

test("the page loads the food template from food-seed.json before his trips, so a new Road Trip trip gets food", () => {
  assert.match(load, /food-seed\.json/);
  assert.ok(load.indexOf("food-seed.json") < load.indexOf("PK.sync("), "food first, then trips (first load starts the trip he is on)");
  assert.match(load, /PK\.foodReady\(\)/, "fetched only until it is kept");
  assert.match(load, /PK\.seedFood\(/);
});

test("the page has the Bags | Food switch, the button, the six groups, + Add, ticks, pills and ×, all wired to the rules", () => {
  for (const s of ["🧳 Bags", "🥣 Food", "data-pkview", "data-pkact=\"food-start\"", "data-pkfadd", "Add, then Enter", "data-pkftick", "data-pkfpill", "data-pkfrm"])
    assert.ok(html.includes(s), s);
  for (const s of ["PK.food(", "PK.startFood(", "PK.foodAdd(", "PK.foodTick(", "PK.foodCycle(", "PK.foodRemove("])
    assert.ok(html.includes(s), s);
});

test("mock v5 (d29): Food is laid out like the Bags, with the Bags' own wells, rows and hover ×", () => {
  const fn = html.slice(html.indexOf("function packFood("), html.indexOf("function packFind("));
  for (const s of ["pk-well", "pk-wh", "pk-em", "pk-ct", "pk-cols", "pk-rows", "pk-it", "pk-rm", "pk-add", "pk-plus"])
    assert.ok(fn.includes(s), s);
  assert.ok(fn.includes("Add a to-do, then press Enter"), "Before you go adds like To place");
  assert.ok(!fn.includes("pk-menu") && !fn.includes("data-pkfwhen") && !html.includes("PK.foodWhens("), "a pill changes on one click, no menu (Junyan after v5)");
  assert.ok(fn.includes("Add, then Enter"), "every column adds at the bottom");
  assert.ok(!/\.sub\b/.test(fn), "no subtitles");
  assert.ok(!fn.includes("pk-fsteps") && !fn.includes("pk-fside") && !fn.includes("pk-frm"), "the v3 layout is gone");
  const nm = (html.match(/\.pk-fnm\{[^}]*\}/) || [""])[0];
  assert.match(nm, /overflow-wrap:anywhere/, "names wrap");
  assert.doesNotMatch(nm, /ellipsis|nowrap/, "names are never cut off");
  const title = (html.match(/\.pk-food \.pk-wh \.pk-nm\{[^}]*\}/) || [""])[0];
  assert.match(title, /white-space:normal/, "group titles wrap too, never cut off");
});

test("food stays computer only (d14): its styles sit inside the Packing page's pk- block, nothing for the phone", () => {
  const css = html.slice(html.indexOf("/* the Packing page (slice 01"), html.indexOf("/* computer only (d14): no Packing button"));
  assert.match(css, /\.pk-food\b/);
  assert.equal((html.match(/\.pk-f[a-z]*\{/g) || []).length, (css.match(/\.pk-f[a-z]*\{/g) || []).length, "every pk-f style is in the Packing block");
});

test("the BUILD label names this copy, with a new stamp for the changed core", () => {
  assert.match(html, /const BUILD = "2026-11-18b trip read";/);
  assert.match(html, /calendar-core\.js\?v=26"/);
});

test("the page's own script still parses", () => {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.trim());
  for (const s of scripts) assert.doesNotThrow(() => new vm.Script(s), SyntaxError);
});

test("no when menu anywhere on the Packing page: a Bags pill moves on with one click too (Junyan, d30)", () => {
  const html = file("../calendar.html");
  assert.ok(!html.includes("pk-menu") && !html.includes("data-pkwhen") && !html.includes("PK.setWhen("), "the menu and its picks are gone");
  assert.ok(html.includes("PK.cycleWhen("), "the Bags pill click calls cycleWhen");
  assert.ok(!html.includes("aria-haspopup"), "a pill no longer opens anything");
});
