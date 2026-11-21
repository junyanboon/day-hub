// Cards rules (cards.js): node --test still/test/cards.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import "../cards.js";
const { events, msrState, normalize } = globalThis.Cards;
const card = (o) => ({ id: "c1", owner: "Junyan", name: "Avion Biz", last4: "6637", status: "MSR", currency: "CAD", dueDay: 31, fee: { amount: 175, date: "12-01" }, ...o });

test("due dates clamp to the month's last day and skip closed cards", () => {
  const d = normalize({ cards: [card({ fee: null }), card({ id: "c2", status: "Closed" })] });
  const due = events(d, "2027-02-01", "2027-03-31", "2027-02-01").filter((e) => e.cardEvent === "due").map((e) => e.start);
  assert.deepEqual(due, ["2027-02-28", "2027-03-31"]);
});
test("a payment marks that due date paid", () => {
  const d = normalize({ cards: [card({ fee: null, dueDay: 4 })], payments: [{ id: "p", cardId: "c1", forDue: "2026-12-04" }] });
  const e = events(d, "2026-12-01", "2026-12-31", "2026-12-01")[0];
  assert.match(e.title, /^✓ Paid/);
});
test("fees repeat yearly on their month and day", () => {
  const d = normalize({ cards: [card({ dueDay: null })] });
  assert.deepEqual(events(d, "2026-01-01", "2027-12-31", "2026-01-01").map((e) => e.start), ["2026-12-01", "2027-12-01"]);
});
test("spend target moves to the next step and counts added spend", () => {
  const c = card({ msr: { steps: [{ amount: 5000, deadline: "2026-12-09" }, { amount: 15000, deadline: "2027-03-09" }], base: 4070, baseAt: 100 } });
  let d = normalize({ cards: [c] });
  let s = msrState(c, d, "2026-11-20");
  assert.equal(s.step.amount, 5000); assert.equal(s.left, 930); assert.equal(s.daysLeft, 19);
  d.transactions.push({ id: "x", cardId: "c1", amount: 1000, at: 200 }, { id: "y", cardId: "c1", amount: 999, at: 50 });
  s = msrState(c, d, "2026-11-20");
  assert.equal(s.spent, 5070); assert.equal(s.step.amount, 15000);
  const dl = events(d, "2026-11-01", "2027-04-01", "2026-11-20").filter((e) => e.cardEvent === "msr");
  assert.deepEqual(dl.map((e) => e.start), ["2027-03-09"]);   // the met step's deadline is gone
});
test("dated to-dos show, done ones do not", () => {
  const d = normalize({ cards: [card({ dueDay: null, fee: null })], todos: [{ id: "t1", cardId: "c1", text: "Book pass", due: "2026-11-25" }, { id: "t2", cardId: "c1", text: "x", due: "2026-11-25", done: true }] });
  assert.deepEqual(events(d, "2026-11-01", "2026-11-30", "2026-11-20").map((e) => e.title), ["☐ 6637: Book pass"]);
});
