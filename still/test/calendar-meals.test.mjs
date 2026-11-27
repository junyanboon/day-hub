// node --test still/test/calendar-meals.test.mjs   (Junyan, 2026-11-27: "if meals are missing can we have it suggested as well? (We need to eat)";
// "4 yes but we want specifically Super Veggie, Nutty Pudding & Dinner"; "Nutty Pudding is 30 minutes, Super veggie is 1 hr (I need to cook)
// Dinne ris also 1 hr (generally around 6pm.. we prefer to have a bit of distance from when we wind down)".) Fixed instants only: no test reads the real clock.
import test from "node:test";
import assert from "node:assert/strict";
import "../calendar-core.js";
const C = globalThis.CalCore;
const TO = "America/Toronto", THU = "2026-11-26", FRI = "2026-11-27", SAT = "2026-11-28";
const at = (day, h, m = 0) => C.instant(day, h * 60 + m, TO);
const ev = (title, day, h1, m1, h2, m2) => ({ title, s: at(day, h1, m1), e: at(day, h2, m2) });
const hm = (ms) => { const w = C.wall(ms, TO), h = Math.floor(w.min / 60), m = w.min % 60; return `${w.day.slice(8)} ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const span = (b) => b && [hm(b.s), hm(b.e)];
const by = (list) => Object.fromEntries(list.map((b) => [b.key, b]));
const meals = (events, opts) => by(C.mealBlocks(FRI, events, TO, opts));
const MIN = 60000;

test("a clear Friday: Super Veggie right after the Morning Routine, Nutty Pudding at 12:30, Dinner at 6 pm", () => {
  const m = meals([]);
  assert.deepEqual(span(m.veggie), ["27 8:00 am", "27 9:00 am"], "the Thursday night's routine is 7 to 8 am (bed 11 pm, 8 hours)");
  assert.equal(m.veggie.title, "Super Veggie"); assert.equal(m.veggie.e - m.veggie.s, 60 * MIN);
  assert.deepEqual(span(m.pudding), ["27 12:30 pm", "27 1:00 pm"]);
  assert.equal(m.pudding.title, "Nutty Pudding"); assert.equal(m.pudding.e - m.pudding.s, 30 * MIN);
  assert.deepEqual(span(m.dinner), ["27 6:00 pm", "27 7:00 pm"]);
  assert.equal(m.dinner.title, "Dinner"); assert.equal(m.dinner.e - m.dinner.s, 60 * MIN);
  for (const b of Object.values(m)) assert.equal(b.kind, "cook");
});

test("Morning Routine then Super Veggie stay in order: it is the routine's own end, not a clock time", () => {
  const morning = by(C.routineBlocks(THU, [], TO)).morning;
  assert.equal(meals([]).veggie.s, morning.e);
  const early = [ev("Yoga class", FRI, 9, 0, 10, 0)];   // an early plan pulls the routine earlier: the night, not the meal, moves
  const r = by(C.routineBlocks(THU, early, TO)).morning;
  assert.equal(meals(early).veggie.s, r.e, "Super Veggie follows the routine, and the 9 am class starts when it ends");
});

test("Super Veggie never overlaps a real plan: it slides later, up to 90 minutes, or is skipped", () => {
  assert.deepEqual(span(meals([ev("Call", FRI, 8, 30, 9, 30)]).veggie), ["27 9:30 am", "27 10:30 am"]);
  assert.equal(meals([ev("Call", FRI, 7, 30, 11, 30)]).veggie, undefined, "nothing free in the 90 minutes after the routine: skipped, never overlapped");
});

test("his own Morning Routine on that day is the anchor; a Super Veggie suggestion lands right after it", () => {
  assert.deepEqual(span(meals([ev("Morning Routine", FRI, 6, 0, 7, 0)]).veggie), ["27 7:00 am", "27 8:00 am"]);
});

test("missing rule: a real event with the name on that day, any case, any time, means no suggestion", () => {
  assert.equal(meals([ev("Super Veggie", FRI, 14, 0, 15, 0)]).veggie, undefined);
  assert.equal(meals([ev("SUPER VEGGIE prep", FRI, 7, 0, 8, 0)]).veggie, undefined);
  assert.equal(meals([ev("nutty pudding", FRI, 16, 0, 16, 30)]).pudding, undefined);
  assert.equal(meals([ev("Bday Dinner w/ Phil & Co.", FRI, 19, 30, 21, 30)]).dinner, undefined);
  const only = meals([ev("Bday Dinner w/ Phil & Co.", FRI, 19, 30, 21, 30)]);
  assert.ok(only.veggie && only.pudding, "the other two meals are still suggested");
  // another day's meal does not count
  const other = meals([ev("Dinner", THU, 18, 0, 19, 0), ev("Super Veggie", SAT, 8, 0, 9, 0), ev("Nutty Pudding", SAT, 12, 30, 13, 0)]);
  assert.ok(other.veggie && other.pudding && other.dinner);
});

test("Nutty Pudding: the free half hour nearest 12:30, the earlier one on a tie, between 10 am and 4 pm", () => {
  assert.deepEqual(span(meals([ev("Work", FRI, 12, 0, 13, 30)]).pudding), ["27 11:30 am", "27 12:00 pm"], "11:30 and 1:30 are both 60 min from 12:30: the earlier wins the tie");
  assert.deepEqual(span(meals([ev("Lunch", FRI, 12, 30, 13, 0)]).pudding), ["27 12:00 pm", "27 12:30 pm"], "a tie between 12:00 and 13:00: the earlier");
  assert.deepEqual(span(meals([ev("Work", FRI, 12, 15, 12, 45)]).pudding), ["27 12:45 pm", "27 1:15 pm"], "15 min away beats 45");
  assert.equal(meals([ev("Work", FRI, 10, 0, 16, 0)]).pudding, undefined, "no gap between 10 am and 4 pm: skipped");
});

test("Dinner: around 6 pm; when 6 pm is taken it moves EARLIER, never later", () => {
  assert.deepEqual(span(meals([ev("Samba", FRI, 18, 0, 19, 0)]).dinner), ["27 5:00 pm", "27 6:00 pm"]);
  assert.deepEqual(span(meals([ev("Samba", FRI, 17, 30, 18, 30)]).dinner), ["27 4:30 pm", "27 5:30 pm"], "the nearest earlier hour that ends by the 5:30 plan");
});

test("Dinner is skipped, not moved later or overlapped, when nothing free fits at or before 6 pm", () => {
  const m = meals([ev("Rehearsal", FRI, 15, 0, 19, 0)]);
  assert.equal(m.dinner, undefined, "19:00 to 20:00 is free but is later than 6 pm");
});

test("Dinner ends at least 3 hours before that night's Wind Down: 11 pm bed means Wind Down 10 pm, done by 7 pm", () => {
  const night = by(C.routineBlocks(FRI, [], TO));
  assert.ok(night.wind.s - meals([]).dinner.e >= 3 * 60 * MIN);
  // an earlier bedtime: 9 pm bed, Wind Down 8 pm, Dinner must end by 5 pm
  const early = meals([], { bedtime: 21 * 60 });
  assert.deepEqual(span(early.dinner), ["27 4:00 pm", "27 5:00 pm"]);
  assert.equal(meals([ev("Practice", FRI, 15, 0, 17, 0)], { bedtime: 21 * 60 }).dinner, undefined, "nowhere earlier to go: skipped");
  // his own Wind Down at 9:45 pm (the dev seed): done by 6:45, so Dinner starts 5:45
  assert.deepEqual(span(meals([ev("Wind down", FRI, 21, 45, 22, 30)]).dinner), ["27 5:45 pm", "27 6:45 pm"]);
  // a late bedtime does not pull Dinner later than 6 pm
  assert.deepEqual(span(meals([], { bedtime: 30 }).dinner), ["27 6:00 pm", "27 7:00 pm"]);
});

test("a late evening plan that moves Wind Down later lets Dinner stay at 6 pm", () => {
  assert.deepEqual(span(meals([ev("Class", FRI, 21, 30, 22, 30)]).dinner), ["27 6:00 pm", "27 7:00 pm"]);
});

test("meals never overlap any real event or each other (a full day, several shapes)", () => {
  const shapes = [
    [], [ev("A", FRI, 8, 15, 8, 45), ev("B", FRI, 12, 20, 12, 50), ev("C", FRI, 17, 40, 18, 20)],
    [ev("Work", FRI, 9, 0, 12, 0)], [ev("Work", FRI, 9, 0, 12, 0), ev("Laundry", FRI, 13, 0, 14, 0)],
    [{ title: "Sleep", s: at(THU, 23), e: at(FRI, 7, 30) }, ev("Gym", FRI, 12, 0, 18, 30)],
  ];
  for (const events of shapes) {
    const blocks = C.mealBlocks(FRI, events, TO);
    const others = events;
    blocks.forEach((b, i) => {
      for (const o of [...others, ...blocks.filter((_, j) => j !== i)]) assert.ok(b.e <= o.s || b.s >= o.e, `${b.title} ${span(b)} overlaps ${o.title} ${span(o)}`);
    });
  }
});

test("Domestic keeps its own times; a meal moves out of its way when it can, and goes in beside it when it cannot (eating comes first)", () => {
  const events = [ev("Work", FRI, 9, 0, 12, 0)];
  const dom = by(C.routineBlocks(FRI, events, TO)).domestic;
  assert.deepEqual(span(dom), ["27 12:00 pm", "27 1:00 pm"]);
  assert.deepEqual(span(meals(events).pudding), ["27 1:00 pm", "27 1:30 pm"], "12:00 to 12:30 would sit on Domestic, so the next nearest");
  // a 9:00 to 9:30 plan leaves Domestic at 9:30 to 10:30; Super Veggie has no other free start within 90 minutes, so it sits beside Domestic, not on the plan
  const call = [ev("Call", FRI, 8, 30, 9, 30)];
  assert.deepEqual(span(by(C.routineBlocks(FRI, call, TO)).domestic), ["27 9:30 am", "27 10:30 am"]);
  assert.deepEqual(span(meals(call).veggie), ["27 9:30 am", "27 10:30 am"]);
});

test("routineBlocks is unchanged: the same four keys, no meals", () => {
  assert.deepEqual(C.routineBlocks(FRI, [], TO).map((b) => b.key).sort(), ["domestic", "morning", "sleep", "wind"]);
  assert.equal(C.routineBlocks.length, 3);
});

test("mealBlocks(day, events, tz, opts) takes no clock", () => {
  assert.equal(C.mealBlocks.length, 3);
  assert.deepEqual(C.mealBlocks(FRI, [], TO).map((b) => b.key), ["veggie", "pudding", "dinner"]);
});

test("meal icons: broccoli, peanuts, pot; apart from the night icons, so a meal never floats", () => {
  assert.equal(C.mealIcon("Super Veggie"), "\u{1F966}"); assert.equal(C.mealIcon(" nutty pudding "), "\u{1F95C}"); assert.equal(C.mealIcon("Dinner"), "\u{1F372}");
  assert.equal(C.mealIcon("Bday Dinner"), ""); assert.equal(C.mealIcon("Sleep"), "");
  for (const t of ["Super Veggie", "Nutty Pudding", "Dinner"]) { assert.equal(C.nightIcon(t), ""); assert.equal(C.floats({ title: t }), false); }
});

test("review fixes: Super Veggie stays right after the routine even with Domestic suggested; a routine across midnight is the anchor; a late dinner last night is not today's", () => {
  const b = by(C.mealBlocks(FRI, [], TO, { bedtime: 30 }));
  assert.deepEqual(span(by(C.routineBlocks(THU, [], TO, { bedtime: 30 })).morning), ["27 8:00 am", "27 9:00 am"]);
  assert.deepEqual(span(b.veggie), ["27 9:00 am", "27 10:00 am"], "right after the 8 to 9 routine, beside Domestic");
  const across = [{ title: "Morning Routine", s: at(THU, 23, 30), e: at(FRI, 0, 30) }];
  assert.deepEqual(span(meals(across).veggie), ["27 12:30 am", "27 1:30 am"]);
  assert.ok(meals([ev("Bday Dinner", THU, 21, 0, 23, 59), { title: "Late Dinner", s: at(THU, 22, 0), e: at(FRI, 1, 0) }]).dinner, "dinners that start the day before do not count");
});

test("a real Super Veggie keeps the Morning Routine anchored before it", () => {
  const sv = [ev("Super Veggie", FRI, 8, 30, 9, 30)];
  const m = by(C.routineBlocks(THU, sv, TO, { bedtime: 23 * 60 + 30 })).morning;
  assert.equal(m.why, "Before Super Veggie"); assert.equal(m.e, at(FRI, 8, 30));
  assert.equal(meals(sv).veggie, undefined);
});

test("ghost blocks carry no visible 'Suggested:' prefix (the dashed border says it)", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /content:\s*"Suggested: "/);
  assert.match(html, /\.ev\.ghost\{[^}]*dashed/);
});
