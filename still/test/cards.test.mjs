// Cards rules (cards.js): node --test still/test/cards.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import "../cards.js";
import { readFileSync } from "node:fs";
const { events, msrState, normalize, actions, dueNow, digest, digestEvents, FLOWS, flowState, startFlow, tidyFlow, timeline } = globalThis.Cards;
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

/* ---- the do-next list (mockup v3) ---- */
const book = () => normalize({ cards: [
  card({ id: "c1", name: "RBC Biz", last4: "1111", dueDay: 28, msr: { steps: [{ amount: 5000, deadline: "2026-12-09" }], base: 4070 } }),
  card({ id: "c2", owner: "Caney", name: "BMO Air", last4: "2222", status: "Need to Close", dueDay: 3, autopay: true, fee: { amount: 120, date: "01-15" } }),
  card({ id: "c3", name: "Old", last4: "3333", status: "Closed", dueDay: 5, fee: null })],
  todos: [{ id: "t1", cardId: "c2", text: "Book pass" }] });

test("the do-next list: soonest first, undated last; autopay and closed cards never ask to be paid", () => {
  const a = actions(book(), "2026-11-20");
  assert.deepEqual(a.map((x) => [x.t, x.card.id, x.day]), [["pay", "c1", "2026-11-28"], ["spend", "c1", "2026-12-09"], ["close", "c2", "2027-01-15"], ["do", "c2", null]]);
  assert.equal(a[1].st.left, 930);
});
test("the do-next list can show one person's cards only", () => {
  assert.deepEqual(actions(book(), "2026-11-20", "Caney").map((x) => x.t), ["close", "do"]);
  assert.deepEqual(actions(book(), "2026-11-20", "Junyan").map((x) => x.t), ["pay", "spend"]);
});
test("a bill more than 10 days away does not ask yet; a paid one drops off; a late one stays", () => {
  const d = book();
  assert.equal(actions(d, "2026-11-10").some((x) => x.t === "pay"), false, "18 days away");
  assert.equal(dueNow(d.cards[0], d, "2026-12-02").day, "2026-11-28", "4 days late still shows");
  d.payments.push({ id: "p1", cardId: "c1", forDue: "2026-11-28" });
  assert.equal(actions(d, "2026-11-20").some((x) => x.t === "pay"), false);
});
test("what the calendar shows while locked: dates and kinds only, never a card name or digit", () => {
  const g = digest(book(), "2026-11-20"), txt = JSON.stringify(g);
  assert.ok(g.length > 5);
  for (const w of ["RBC", "BMO", "1111", "2222", "Book pass", "Caney", "175"]) assert.equal(txt.includes(w), false, `the digest leaks "${w}"`);
  const ev = digestEvents(g, "2026-11-20", "2026-12-10");
  assert.deepEqual(ev.map((e) => [e.start, e.title]), [["2026-11-28", "💳 Card payment due"], ["2026-12-01", "💸 Card fee"], ["2026-12-03", "💳 Card payment due"], ["2026-12-09", "🎯 Card spend deadline"]]);
  assert.ok(ev.every((e) => e.locked && e.calId === "cards"));
});
test("bills that fell due before he started tracking here never show as late", () => {
  const d = book();
  assert.equal(dueNow(d.cards[0], d, "2026-12-02").day, "2026-11-28");
  d.since = "2026-12-01";
  assert.equal(dueNow(d.cards[0], d, "2026-12-02").day, "2026-12-28");
});
test("the card list's marker is not called \"dot\": a browser extension restyles that name and hid every card name", () => {
  const src = readFileSync(new URL("../cards.js", import.meta.url), "utf8"), html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  assert.doesNotMatch(src, /class="dot"/);
  assert.match(src, /<i class="xdot"><\/i>/);
  assert.match(html, /\.x-c \.xdot\{/);
});

/* ---- close and switch checklists, the timeline, no lock (Junyan, 2026-11-20) ---- */
test("Close card sets up a short checklist, and the card stays one row that walks through it", () => {
  const d = book();
  assert.equal(startFlow(d, "c1", "close", "2026-11-20"), true);
  assert.equal(d.cards[0].status, "Need to Close");
  const fl = flowState(d, d.cards[0]);
  assert.deepEqual([fl.kind, fl.done, fl.total, fl.next.text], ["close", 0, FLOWS.close.length, FLOWS.close[0]]);
  const a = actions(d, "2026-11-20", "Junyan");
  assert.deepEqual(a.map((x) => [x.t, x.day]), [["pay", "2026-11-28"], ["close", "2026-12-01"], ["spend", "2026-12-09"]], "dated by the fee; the steps are not extra Do rows");
  fl.next.done = true;
  assert.equal(actions(d, "2026-11-20", "Junyan").find((x) => x.t === "close").flow.next.text, FLOWS.close[1]);
  assert.equal(startFlow(d, "c3", "close", "2026-11-20"), false, "a closed card cannot start one");
});
test("Product switch sets up its own checklist; pressing it twice does not double it; keeping the card clears it", () => {
  const d = book();
  startFlow(d, "c1", "switch", "2026-11-20"); startFlow(d, "c1", "switch", "2026-11-21");
  assert.equal(d.cards[0].status, "Need to PS");
  assert.equal(d.todos.filter((t) => t.flow === "switch").length, FLOWS.switch.length);
  d.todos.find((t) => t.flow === "switch").done = true;
  d.cards[0].status = "Keeper"; tidyFlow(d, d.cards[0]);
  assert.deepEqual(d.todos.filter((t) => t.flow).map((t) => t.done), [true], "only the finished step stays, for the timeline");
  assert.equal(flowState(d, d.cards[0]), null);
});
test("the checklists stay very short", () => {
  for (const k of ["close", "switch"]) { assert.ok(FLOWS[k].length <= 4, k); for (const s of FLOWS[k]) assert.ok(s.length <= 36, s); }
});
test("a card's timeline: what is coming soonest first, what happened newest first", () => {
  const d = book(), c = d.cards[0];
  Object.assign(c, { opened: "2024-05-01", productSwitches: ["2025-02-02"] });
  d.payments.push({ id: "p0", cardId: "c1", date: "2026-10-27", forDue: "2026-10-28" });
  d.history.push({ id: "h1", cardId: "c1", date: "2026-11-01", text: "Kept another year" }, { id: "h2", cardId: "c1", date: "2027-02-01", text: "Ask for retention offer" });
  d.todos.push({ id: "t9", cardId: "c1", text: "Call the bank", done: true, doneAt: "2026-11-10" }, { id: "t8", cardId: "c1", text: "No date, done", done: true });
  const tl = timeline(d, c, "2026-11-20");
  assert.deepEqual(tl.next.map((x) => [x.d, x.k]), [["2026-11-28", "pay"], ["2026-12-01", "fee"], ["2026-12-09", "spend"], ["2027-02-01", "note"]]);
  assert.deepEqual(tl.past.map((x) => [x.d, x.t]), [["2026-11-10", "✓ Call the bank"], ["2026-11-01", "Kept another year"], ["2026-10-27", "Paid the Oct 28 bill"], ["2025-02-02", "Product switch"], ["2024-05-01", "Opened"]]);
  const closed = timeline(d, d.cards[2], "2026-11-20");
  assert.deepEqual(closed.next, [], "a closed card has nothing coming");
});
test("the page has no lock button, no idle lock and no add-a-to-do box", () => {
  const src = readFileSync(new URL("../cards.js", import.meta.url), "utf8");
  for (const w of ["Lock now", "5 minutes", "setInterval", 'id="xtd"', 'data-x="tadd"', 'data-x="lock"']) assert.equal(src.includes(w), false, w);
  assert.match(src, /data-x="flow" data-kind="close">Close card</);
  assert.match(src, /data-x="flow" data-kind="switch">Product switch</);
});
