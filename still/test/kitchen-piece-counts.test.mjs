// node --test still/test/*.test.mjs   (piece foods as counts: Junyan 2026-10-21, d64)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-meals.js", "../quest-kitchen.js", "../quest-merge.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const K = ctx.QuestKitchen;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));
const T0 = Date.parse("2026-10-21T16:00:00Z"), H = 3600000;
const at = (h) => new Date(T0 + h * H).toISOString();
const NOW = T0 + 5 * H;
// a stored travel item as his phone has it (synced state, no write since)
const stored = (id, x) => ({ items: { [id]: { id, k: "travel", shelf: "cool", lv: 3, hist: [[at(0), 3, "add"]], added: at(0), at: at(0), ...x } } });

test("d64: 'Bananas 4' with an empty amount stored splits on read and is a count of 4", () => {
  const S = stored("u1", { name: "Bananas 4", amt: "", group: "Fruit" });
  const b = K.item(S, "u1");
  assert.equal(b.name, "Bananas");
  assert.equal(b.q, 4); assert.equal(b.u, "");
  assert.equal(K.status(b, NOW, null, "America/Toronto"), "4");
  // no write: the stored record is as it was
  assert.equal(S.items.u1.name, "Bananas 4");
  // a name with no count and an empty amount stays a level item
  const t = K.item(stored("u2", { name: "Tomatoes", amt: "" }), "u2");
  assert.equal(t.name, "Tomatoes"); assert.equal(K.hasQ(t), false);
  // names that only look like a count stay whole
  for (const n of ["Omega 3", "Vitamin B 12"]) assert.equal(K.item(stored("u3", { name: n, amt: "" }), "u3").name, n);
});

test("d64: capsicum and other piece foods are counted, capsicum gets 🫑", () => {
  for (const n of ["Capsicum", "Capsicums", "Red capsicum", "Bell pepper", "Bell peppers", "Sweet potatoes", "Beetroots", "Figs", "Kiwis",
    "Jalapenos", "Tortillas", "Bagels", "Tomatoes", "Lemons", "Bananas"]) assert.equal(K.unitFor(n), "", n);
  for (const [n, u] of [["Black pepper", "g"], ["Dried figs", "g"], ["Chilli flakes", "g"], ["Cauliflower", "g"], ["Cherry tomatoes", "g"]]) assert.equal(K.unitFor(n), u, n);
  assert.equal(K.iconFor("Capsicum", "Vegetables"), "🫑");
  assert.equal(K.iconFor("Red capsicums", "Vegetables"), "🫑");
});

test("d64: a piece food whose bare number was read as grams shows as a count", () => {
  // stored by the old build: q 1 in grams (he typed "1")
  const c = K.item(stored("u4", { name: "Capsicum", q: 1, u: "g", qt: at(0), buy: 1, amt: "1 g" }), "u4");
  assert.equal(c.u, ""); assert.equal(c.left, 1);
  assert.equal(K.status(c, NOW, null, "America/Toronto"), "1");
  // a d39 amount "1" with no number stored reads as a count too
  const d = K.item(stored("u5", { name: "Capsicum", amt: "1" }), "u5");
  assert.equal(d.q, 1); assert.equal(d.u, "");
  // real grams stay grams: a big number, or a food not bought by the piece
  assert.equal(K.item(stored("u6", { name: "Bananas", q: 400, u: "g", qt: at(0), buy: 400, amt: "400 g" }), "u6").u, "g");
  assert.equal(K.item(stored("u7", { name: "Ginger", q: 5, u: "g", qt: at(0), buy: 5, amt: "5 g" }), "u7").u, "g");
  // grams he types now stay grams, even a few of a piece food ("5 g" of lemon), and a later change keeps them
  let G5 = K.setAmount(stored("u8", { name: "Lemons", amt: "" }), "u8", "5 g", at(1));
  assert.equal(K.item(G5, "u8").u, "g"); assert.equal(K.item(G5, "u8").amt, "5 g");
  G5 = K.place(G5, "u8", "dry", null, at(2));
  assert.equal(K.item(G5, "u8").u, "g");
  // and a count put back later drops the mark
  G5 = K.setAmount(G5, "u8", "3", at(3));
  assert.equal(K.item(G5, "u8").u, "g");
  G5 = K.setAmount(G5, "u8", "3 lemons", at(4));
  assert.equal(K.item(G5, "u8").u, ""); assert.equal(G5.items.u8.wg, undefined);
});

test("d64: typed '4', '4 tomatoes', '4 lemons' or 'Tomatoes 4' saves as the count 4; grams and ml still work", () => {
  const base = stored("t", { name: "Tomatoes", amt: "" });
  for (const typed of ["4", "4 tomatoes", "4 Tomatoes", "Tomatoes 4", "4 pieces", "4 tomato"]) {
    const x = K.item(K.setAmount(base, "t", typed, at(1)), "t");
    assert.equal(x.q, 4, typed); assert.equal(x.u, "", typed); assert.equal(x.amt, "4", typed);
  }
  const L = stored("l", { name: "Lemons", amt: "" });
  assert.equal(K.item(K.setAmount(L, "l", "4 lemons", at(1)), "l").q, 4);
  // rename with Edit's Amount field goes the same way
  assert.equal(K.item(K.rename(L, "l", "Lemons", at(1), "3 lemons"), "l").q, 3);
  // grams and ml are untouched
  const N = stored("n", { name: "Navy beans", amt: "" });
  assert.deepEqual([K.item(K.setAmount(N, "n", "500 g", at(1)), "n").q, K.item(K.setAmount(N, "n", "500 g", at(1)), "n").u], [500, "g"]);
  const O = stored("o", { name: "Olive oil", amt: "" });
  assert.equal(K.item(K.setAmount(O, "o", "1 L", at(1)), "o").q, 1000);
  // a count of a container is a count of that container since 2026-10-21 ("2 cans" of beans is 2 cans); other words stay words
  const c2 = K.item(K.setAmount(N, "n", "2 cans", at(1)), "n");
  assert.deepEqual([c2.q, c2.u, c2.amt], [2, "", "2 cans"]);
  const c3 = K.item(K.setAmount(N, "n", "2 bunches", at(1)), "n");
  assert.equal(K.hasQ(c3), false); assert.equal(c3.amt, "2 bunches");
});

test("d64: the - and + step (one at a time, from 1 when there is none, never below 0)", () => {
  assert.equal(K.stepCount("", "Tomatoes", 1), "1");
  assert.equal(K.stepCount("", "Tomatoes", -1), "");
  assert.equal(K.stepCount("3", "Tomatoes", 1), "4");
  assert.equal(K.stepCount("1", "Tomatoes", -1), "0");
  assert.equal(K.stepCount("0", "Tomatoes", -1), "0");
  assert.equal(K.stepCount("2.5", "Lemons", 1), "3.5");
  assert.equal(K.stepCount("0.5", "Lemons", -1), "0");
  assert.equal(K.stepCount("4 tomatoes", "Tomatoes", 1), "5");
  assert.equal(K.stepCount("a bag", "Tomatoes", 1), "1");
  // which items get the buttons: counted ones, and level items of a piece food
  assert.equal(K.isPiece(K.item(stored("t", { name: "Tomatoes", amt: "" }), "t")), true);
  assert.equal(K.isPiece(K.item(stored("b", { name: "Bananas 4", amt: "" }), "b")), true);
  assert.equal(K.isPiece(K.item(stored("n", { name: "Navy beans", amt: "" }), "n")), false);
  assert.equal(K.isPiece(K.item(stored("x", { name: "Bananas", q: 400, u: "g", qt: at(0), buy: 400 }), "x")), false);
});

test("d64: restock and fill with '4 tomatoes' add a count", () => {
  const base = stored("t", { name: "Tomatoes", amt: "" });
  const r = K.item(K.restock(base, "t", "4 tomatoes", at(1), "buy"), "t");
  assert.equal(r.q, 4); assert.equal(r.u, "");
  const f = K.fill(base, "travel", [{ name: "Tomatoes", item: "t", amt: "3 tomatoes" }], at(1), "buy");
  assert.equal(K.item(f.K, "t").q, 3);
  const a = K.add({}, "travel", "cool", "Capsicum", at(1), null, "2 capsicums");
  assert.deepEqual([K.item(a.K, a.id).q, K.item(a.K, a.id).u], [2, ""]);
});

test("d64: counted items come off in meals (Tomatoes '3 medium', Capsicum for 'Red peppers')", () => {
  let S = K.setAmount(stored("t", { name: "Tomatoes", amt: "" }), "t", "4", at(1));
  let r = K.eat(S, "travel", "d|dinner|x|Tomatoes", { name: "Tomatoes" }, true, at(2), "3 medium");
  assert.equal(r.id, "t"); assert.equal(K.item(r.K, "t").left, 1);
  S = { items: { c: { ...stored("c", { name: "Capsicum", q: 2, u: "", qt: at(0), buy: 2 }).items.c } } };
  r = K.eat(S, "travel", "d|dinner|x|Red peppers", { name: "Red peppers" }, true, at(2), "1");
  assert.equal(r.id, "c"); assert.equal(K.item(r.K, "c").left, 1);
  // a capsicum stored in grams (the old read) comes off as a count too
  r = K.eat(stored("c", { name: "Capsicum", q: 1, u: "g", qt: at(0), buy: 1, amt: "1 g" }), "travel", "d|dinner|y|Red peppers", { name: "Red peppers" }, true, at(2), "1");
  assert.equal(r.id, "c"); assert.equal(K.item(r.K, "c").left, 0);
});

test("d64: the Edit page has - and + for piece foods, and fill-in asks 'How many?' for them", () => {
  assert.match(html, /id="kiMinus"/);
  assert.match(html, /id="kiPlus"/);
  assert.match(html, /QK\(\)\.stepCount\(/);
  assert.match(html, /QK\(\)\.isPiece\(/);
  assert.match(html, /How many\?/);
});
