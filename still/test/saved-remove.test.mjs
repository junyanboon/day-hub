// node --test still/test/saved-remove.test.mjs  (Junyan, 2026-11-25, d34: "34 yes")
// Taking a kept place off Saved places from the Commute From and To box: an Edit link, a small x on each kept place, nothing else.
// No test reads the real clock.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "../calendar-core.js";
import "../calendar-commute.js";
const K = globalThis.CalCommute;
const html = fs.readFileSync(fileURLToPath(new URL("../calendar.html", import.meta.url)), "utf8");
const fnOf = (from, to) => html.slice(html.indexOf(from), html.indexOf(to));

const home = { id: "h", name: "Home", category: "home", address: "1 Home St" };
const kept = { id: "k1", name: "Saigon Lotus", category: "saved", address: "1 Queen St W", lat: 1, lng: 2 };
const trip = { id: "t1", name: "Trip place", category: "place", address: "x", lat: 1, lng: 1 };

test("only a place kept from the box (category saved) can be removed here", () => {
  assert.equal(K.removableChip(kept), true);
  assert.equal(K.removableChip(trip), false, "Trips places are removed in the Travel tab");
  assert.equal(K.removableChip(home), false, "Home never gets an x");
  assert.equal(K.removableChip({ id: "h", name: "Home" }), false, "the Home chip itself");
  assert.equal(K.removableChip({ id: "r", name: "DM", category: "commute-for" }), false);
  assert.equal(K.removableChip({ name: "no id", category: "saved" }), false, "no id, nothing to send");
  assert.equal(K.removableChip(null), false);
  assert.equal(K.removableChip(undefined), false);
});
test("the Edit link shows only when at least one chip can be removed", () => {
  const chips = (places) => K.savedChips(places, home);
  assert.equal(K.anyRemovable(chips([home, trip])), false, "Home and Trips only: no Edit link");
  assert.equal(K.anyRemovable(chips([home, trip, kept])), true);
  assert.equal(K.anyRemovable(chips([kept])), true, "no Home saved");
  assert.equal(K.anyRemovable([]), false); assert.equal(K.anyRemovable(null), false);
});
test("the chips keep their order and Home stays first, whatever can be removed", () => {
  const ids = K.savedChips([home, trip, kept], home).map((p) => p.id);
  assert.deepEqual(ids, ["h", "k1", "t1"]);
});

const box = fnOf("function cmEditBox(", "function cmKeepTyped(");
const chipFn = fnOf("function cmChipHtml(", "/** The typing box one row turns into");
test("wording: the link reads Edit, then Done; the x names the place; the toasts are as agreed", () => {
  assert.match(box, /CM\.rm \? "Done" : "Edit"/);
  assert.match(chipFn, /aria-label="Remove \$\{esc\(p\.name\)\} from Saved places"/);
  assert.match(html, /toast\("Removed from Saved places"\)/);
  assert.match(html, /toast\("Not removed\. Try again in a moment\.", \{ bad: true \}\)/);
});
test("the link sits beside the Saved places label and shows only when something can be removed", () => {
  assert.match(box, /CalCommute\.anyRemovable\(chips\)/);
  const i = box.indexOf(">Saved places</p>"), j = box.indexOf('data-cm="rmmode"');
  assert.ok(i > 0 && j > i && j - i < 200, "Edit follows the label in the same row");
});
test("remove mode: a chip's name never picks, only the x acts; outside the mode chips pick as before", () => {
  const i = chipFn.indexOf("if (!rmOn)"), j = chipFn.indexOf("if (!CalCommute.removableChip(p))");
  assert.match(chipFn.slice(i, j), /data-cm="pick\$\{side\}"/, "outside the mode a chip picks");
  assert.doesNotMatch(chipFn.slice(j), /data-cm="pick/, "in the mode no chip carries a pick action");
  assert.match(chipFn.slice(j), /data-cm="rmplace"/);
  assert.match(box, /rmOn = can && CM\.rm && CalCommute\.anyRemovable\(chips\)/);
});
test("the remove mode is off every time a box opens or closes", () => {
  const act = fnOf("async function cmAct(", "/** The page's own check");
  for (const a of ["rowto", "rowfrom", "cancel", "cancelfrom"]) {
    const line = act.split("\n").find((l) => l.includes(`d.cm === "${a}"`));
    assert.match(line, /CM\.rm = false/, a + " turns the mode off");
  }
  const paint = fnOf("function cmPaint()", "/* ---------- d31 B");
  assert.match(paint, /if \(!ask && !CM\.editFrom\) CM\.rm = false/, "a box that is not open has no remove mode");
  assert.match(html, /CM\.edit = ""; CM\.editFrom = false; CM\.rm = false; CM\.notes = null/, "a new block starts with it off");
});
test("a removal sends the existing placeRemove, keeps the box open and never touches a block's From or To", () => {
  const fn = fnOf("async function cmRemovePlace(", "/** A row of the Location list");
  assert.match(fn, /send\("\/quest\/places", "POST", C\.placeRemove\(p\)\)/);
  assert.doesNotMatch(fn, /cmSaveRoute|cmSetFrom|cmSetTarget|cmFromHome|CM\.edit = ""|CM\.editFrom = false|cmSugClose/, "no route write, no box close");
  assert.match(fn, /removableChip\(p\)/, "refuses anything but a kept place");
});
test("touch size: the x and the Edit link are at least 32 px, the x set apart from its neighbours", () => {
  assert.match(html, /\.cmx\{[^}]*min-width:32px[^}]*min-height:32px/);
  assert.match(html, /\.cmedit\{[^}]*min-height:32px/);
  assert.match(html, /\.chips\.rm\{[^}]*gap:10px/);
});
test("the BUILD stamp names this change", () => {
  assert.match(html, /const BUILD = "2026-11-25c tidy commute panel";/);
});
