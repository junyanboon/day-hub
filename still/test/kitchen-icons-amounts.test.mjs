// node --test still/test/*.test.mjs   (kitchen icons, amounts and an easier Edit: Junyan 2026-10-20, "38 yes, 39 yes, 40 yes")
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-kitchen.js", "../quest-merge.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const K = ctx.QuestKitchen, M = ctx.QuestMerge;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));
const T0 = Date.parse("2026-10-20T16:00:00Z"), H = 3600000;
const at = (h) => new Date(T0 + h * H).toISOString();
const find = (k, name, kit = "travel") => K.items(k, kit).find((x) => x.name === name);

// his Dry bag as the old code stored it (2026-10-20 screenshot): the amount in the name and a 🛒 icon
const OLD = { items: {
  u1: { id: "u1", k: "travel", shelf: "dry", name: "400g navy beans", group: "Legumes and grains", em: "🛒", lv: 3, at: at(0) },
  u2: { id: "u2", k: "travel", shelf: "dry", name: "500g pasta", group: "Legumes and grains", em: "🛒", lv: 3, at: at(0) },
  u3: { id: "u3", k: "travel", shelf: "dry", name: "Canol Oil", group: "Oils, vinegars and sweet", em: "🛒", lv: 3, at: at(0) },
  u4: { id: "u4", k: "travel", shelf: "cool", name: "Mystery thing", group: "Other", em: "🛒", lv: 2, at: at(0) },
  u5: { id: "u5", k: "travel", shelf: "cool", name: "Hummus", group: "Legumes and grains", em: "🥙", lv: 2, at: at(0) },
} };

test("d38: a new item's icon is a word match first, else its group's own icon", () => {
  const cases = { "Navy beans": "🫘", "Pasta": "🍝", "Basmati rice": "🍚", "Canol Oil": "🫒", "Honey": "🍯", "Bananas": "🍌",
    "Eggs": "🥚", "Cherry tomatoes": "🍅", "Peanut butter": "🥜", "Eggplant": "🍆", "Rice vinegar": "🍶", "Sweet potatoes": "🍠" };
  for (const [n, em] of Object.entries(cases)) assert.equal(K.iconFor(n), em, n);
  // no word match: the group's icon (the guessed group, or the one given)
  assert.equal(K.iconFor("Mystery thing"), "🧺");
  assert.equal(K.iconFor("Mystery thing", "Vegetables"), "🥦");
  assert.deepEqual(J(K.GROUP_ICONS), { "Vegetables": "🥦", "Fruit": "🍎", "Herbs": "🌿", "Legumes and grains": "🫘", "Nuts and seeds": "🥜",
    "Spices": "🧂", "Oils, vinegars and sweet": "🫒", "Drinks and ferments": "🥛", "Other": "🧺" });
  for (const g of K.GROUP_NAMES) assert.equal(K.iconFor("Zzz", g), K.GROUP_ICONS[g]);
  // the catalogue keeps its own icons
  assert.equal(K.iconFor("Cumin"), "🟤");
  // nothing new is ever 🛒
  let k = K.add({}, "travel", "dry", "Zorbles", at(0)).K;
  assert.equal(find(k, "Zorbles").em, "🧺");
  k = K.add(k, "travel", "dry", "navy beans", at(1)).K;
  assert.equal(find(k, "Navy beans").em, "🫘");
  assert.equal(K.preTick([], ["Wibble", "Bananas"], "travel").extra.map((x) => x.em).join(""), "🧺🍌");
});

test("d38: his old 🛒 items show a food icon once, with no write, and a stored icon of his own is kept", () => {
  assert.equal(find(OLD, "Navy beans").em, "🫘");
  assert.equal(find(OLD, "Pasta").em, "🍝");
  assert.equal(find(OLD, "Canol Oil").em, "🫒");
  assert.equal(find(OLD, "Mystery thing").em, "🧺");
  assert.equal(find(OLD, "Hummus").em, "🥙");   // his, not ours
  // the next write of the item leaves the old 🛒 out, never writes it back
  const k = K.tap(OLD, "u3", at(5));
  assert.equal(k.items.u3.em, undefined);
  assert.equal(find(k, "Canol Oil").em, "🫒");
  assert.equal(K.tap(OLD, "u5", at(5)).items.u5.em, "🥙");
});

test("d38: a group icon follows a group change (Edit or drag); a word or catalogue icon stays", () => {
  let k = K.add({}, "travel", "dry", "Zorbles", at(0), "Other").K;
  const z = find(k, "Zorbles").id;
  k = K.place(k, z, null, "Spices", at(1));
  assert.equal(find(k, "Zorbles").em, "🧂");
  k = K.place(k, z, "cool", "Fruit", at(2));
  assert.equal(find(k, "Zorbles").em, "🍎");
  // a word icon is not a group icon: Navy beans moved to Other keeps 🫘
  k = K.add(k, "travel", "dry", "Navy beans", at(3)).K;
  k = K.place(k, find(k, "Navy beans").id, null, "Other", at(4));
  assert.equal(find(k, "Navy beans").em, "🫘");
  // a catalogue item keeps its icon in any group
  k = K.place(k, "h:cumin", null, "Other", at(5));
  assert.equal(K.item(k, "h:cumin").em, "🟤");
  // an icon of his own stays when the group changes
  k = K.place(OLD, "u5", null, "Other", at(6));
  assert.equal(K.item(k, "u5").em, "🥙");
  // renaming an item whose icon came from its name gives the new name's icon
  const p = K.add({}, "travel", "dry", "Pasta", at(0));
  k = K.rename(p.K, p.id, "Rice", at(1));
  assert.equal(find(k, "Rice").em, "🍚");
});

test("d39: an amount at the start or end of a name is split off; no amount, no split", () => {
  const cases = [
    ["400g navy beans", "Navy beans", "400 g"], ["500 g pasta", "Pasta", "500 g"], ["pasta 500g", "Pasta", "500 g"],
    ["2 x 400g chickpeas", "Chickpeas", "2 × 400 g"], ["1L oat milk", "Oat milk", "1 L"], ["6 eggs", "Eggs", "6"],
    ["500g of pasta", "Pasta", "500 g"], ["1,5kg rice", "Rice", "1.5 kg"], ["olive oil 1.5 l", "Olive oil", "1.5 L"],
    ["Canol Oil", "Canol Oil", ""], ["navy beans", "Navy beans", ""], ["Omega 3", "Omega 3", ""], ["100% juice", "100% juice", ""],
    ["400g", "400g", ""], ["Vitamin B12", "Vitamin B12", ""],
  ];
  for (const [raw, name, amt] of cases) assert.deepEqual(J(K.splitName(raw)), { name, amt }, raw);
  assert.equal(K.amtOf("400g"), "400 g");
  assert.equal(K.amtOf("  "), "");
  assert.equal(K.amtOf("a big bag"), "a big bag");
});

test("d39: adding splits the amount; the same food added again updates the amount, not a second tile", () => {
  let r = K.add({}, "travel", "dry", "400g navy beans", at(0));
  let it = K.item(r.K, r.id);
  assert.equal(it.name, "Navy beans"); assert.equal(it.amt, "400 g"); assert.equal(it.group, "Legumes and grains");
  r = K.add(r.K, "travel", "dry", "navy beans 800 g", at(1));
  assert.equal(K.items(r.K, "travel").length, 1);
  assert.equal(K.item(r.K, r.id).amt, "1.2 kg");   // d42: what he adds goes on top of what is there (400 g + 800 g)
  // no amount typed: none stored, and the tile line is the status alone
  r = K.add({}, "travel", "dry", "Canol Oil", at(0));
  assert.equal(K.item(r.K, r.id).amt, "");
  assert.equal(K.tileLine(K.item(r.K, r.id), T0, T0 + 99 * H), "how many?");
  r = K.add({}, "travel", "dry", "400g navy beans", at(0));
  assert.equal(K.tileLine(K.item(r.K, r.id), T0, T0 + 99 * H), "400 g");   // d42: the amount instead of the level
  // the fill-in picker's names split too, and fill the same item
  const f = K.fill(r.K, "travel", [{ name: "800g navy beans" }, { name: "500g pasta" }], at(2), "buy");
  assert.equal(K.items(f.K, "travel").length, 2);
  assert.equal(find(f.K, "Navy beans").amt, "1.2 kg");   // 400 g there + 800 g bought (d42)
  assert.equal(find(f.K, "Pasta").amt, "500 g");
  assert.equal(K.preTick([{ id: "p:pasta", name: "Pasta" }], ["500g pasta"], "travel").on[0], "p:pasta");
});

test("d39: rename with an amount, and Edit's Amount field", () => {
  let r = K.add({}, "travel", "dry", "Pasta", at(0));
  let k = K.rename(r.K, r.id, "pasta 1kg", at(1));
  assert.equal(K.item(k, r.id).name, "Pasta"); assert.equal(K.item(k, r.id).amt, "1 kg");
  k = K.rename(k, r.id, "Pasta", at(2), "500g");          // the Amount field
  assert.equal(K.item(k, r.id).amt, "500 g");
  k = K.rename(k, r.id, "Penne", at(3));                   // a name with no amount keeps the amount
  assert.equal(K.item(k, r.id).amt, "500 g");
  k = K.rename(k, r.id, "Penne", at(4), "");               // emptied field: no amount
  assert.equal(K.item(k, r.id).amt, "");
  k = K.rename(k, r.id, "400g penne", at(5), "");          // typed in the name wins over the field
  assert.equal(K.item(k, r.id).amt, "400 g");
  assert.equal(K.rename(k, r.id, "Penne", at(6), "400 g"), k);   // nothing changed: nothing written
});

test("d39: his existing items are split once on read, written as split at their next change, and merge either way", () => {
  assert.deepEqual(J(K.items(OLD, "travel").filter((x) => x.shelf === "dry").map((x) => [x.name, x.amt])),
    [["Navy beans", "400 g"], ["Pasta", "500 g"], ["Canol Oil", ""]]);
  // reading twice is the same (no write, nothing to repeat)
  assert.deepEqual(J(K.items(OLD, "travel")), J(K.items(OLD, "travel")));
  // a change on the new page stores the split name and amount (d42: a tap no longer steps an item with an amount)
  assert.equal(K.tap(OLD, "u1", at(5)), OLD);
  const mine = K.move(OLD, "u1", "cool", at(5));
  assert.equal(mine.items.u1.name, "Navy beans"); assert.equal(mine.items.u1.amt, "400 g"); assert.equal(mine.items.u1.q, 400);
  // a later change from a device still on the old page (raw name) reads the same after the merge
  const other = J(OLD); other.items.u1 = { ...other.items.u1, lv: 1, at: at(6) };
  for (const m of [M.mergeKitchen(mine, other), M.mergeKitchen(other, mine)]) {
    const it = K.item(m, "u1");
    assert.equal(it.name, "Navy beans"); assert.equal(it.amt, "400 g"); assert.equal(it.em, "🫘");
    // d42: its 400 g is its amount now, so a level tapped on an old page does not change what it shows
    assert.equal(it.q, 400); assert.equal(it.lv, 3);
  }
  // a split item renamed on purpose with no amount stays unsplit (amt stored as "")
  const k = K.rename(OLD, "u1", "Navy beans", at(7), "");
  assert.equal(K.item(k, "u1").amt, "");
  // the dinner match and the shopping list read the split name
  assert.equal(K.match(OLD, "travel", "navy beans").id, "u1");
});

test("d38 to d40: the page shows the amount on the tile, an Amount field, a shelf ✏️, the editing bar and a two-tap delete", () => {
  assert.match(html, /QK\(\)\.tileLine\(/);
  assert.match(html, /id="kiAmt"/);
  assert.match(html, /data-kedit/);
  assert.match(html, /Editing: tap an item to change or delete it/);
  assert.match(html, /Tap again to delete/);
  assert.match(html, /\.kt-editbar\s*\{[^}]*position:\s*sticky/);
  assert.doesNotMatch(html, /r\.em \|\| "🛒"/);
});

test("review fixes: no split for a name that only starts with a number, capitals kept, Black pepper, a catalogue icon kept on rename", () => {
  for (const n of ["2 % milk", "5 spice", "3 bean salad", "7 Up", "iPhone cable"]) assert.equal(K.splitName(n).name, n, n);
  assert.equal(K.splitName("500 grapes").amt, "500");
  assert.equal(K.iconFor("Black pepper"), "🧂");
  assert.equal(K.iconFor("Red pepper flakes"), "🫑");
  const k = K.rename({}, "h:cumin", "Cumin seeds", at(1));
  assert.equal(K.item(k, "h:cumin").em, "🟤");
});
