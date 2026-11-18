// node --test still/test/*.test.mjs   (the gut log, Junyan 2026-10-22, d2)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
for (const f of ["../quest-gut.js", "../quest-merge.js"]) vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
const G = ctx.QuestGut, M = ctx.QuestMerge;
const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));

test("count, Bristol type, sticky, blood and urgency 0 to 3 are logged", () => {
  let g = G.set({}, "n", 2, "t1");
  g = G.set(g, "b", 5, "t2"); g = G.set(g, "sticky", 1, "t3"); g = G.set(g, "urg", 0, "t4");
  assert.deepEqual(J(g), { n: 2, b: 5, sticky: true, urg: 0, at: "t4" });
  assert.equal(G.line(g), "2× · type 5 soft blobs · sticky · urgency 0");
  assert.equal(G.warn(g), "");
  g = G.set(g, "blood", 1, "t5");
  assert.match(G.warn(g), /doctor/);
});

test("tapping the same type again clears it; the count stays between 0 and 12", () => {
  let g = G.set({}, "b", 4, "a"); g = G.set(g, "b", 4, "b");
  assert.equal(g.b, undefined);
  assert.equal(G.set({}, "n", -1, "a").n, 0);
  assert.equal(G.set({}, "n", 40, "a").n, 12);
  assert.equal(G.logged({}), false); assert.equal(G.line({}), "Not logged yet · about 30 seconds");
  assert.deepEqual(J(G.stamp({})), {});
});

test("two devices: the later change wins", () => {
  const o = { date: "2026-10-22", gut: { n: 1, at: "2026-10-22T10:00:00Z" } };
  const n = { date: "2026-10-22", gut: { n: 2, b: 4, at: "2026-10-22T11:00:00Z" } };
  assert.equal(M.mergeQuest({ xp: 0, ts: 2, day: o }, { xp: 0, ts: 1, day: n }).day.gut.n, 2);
  assert.equal(M.mergeQuest({ xp: 0, ts: 1, day: n }, { xp: 0, ts: 2, day: { date: "2026-10-22" } }).day.gut.n, 2);
});

test("the page shows the card, saves it into the day's history and loads the script", () => {
  assert.match(html, /quest-gut\.js\?v=/);
  assert.match(html, /waterHTML\(\) \+ gutHTML\(\)/);
  assert.match(html, /\.\.\.gutStamp\(\) \}/);
  assert.doesNotMatch(fs.readFileSync(fileURLToPath(new URL("../quest-gut.js", import.meta.url)), "utf8"), /[–—]/);
});

test("the card is closed by default, opens on tap, closes on a second tap, and starts closed on a new day", () => {
  assert.equal(G.isOpen(null, "2026-10-24"), false);
  let s = G.toggle(null, "2026-10-24");
  assert.equal(G.isOpen(s, "2026-10-24"), true);
  assert.equal(G.isOpen(s, "2026-10-25"), false);
  s = G.toggle(s, "2026-10-24");
  assert.equal(G.isOpen(s, "2026-10-24"), false);
  const f = html.slice(html.indexOf("function gutHTML("), html.indexOf("function tapGut("));
  assert.match(f, /data-guttog/); assert.match(f, /gq-closed/); assert.match(f, /gq-chev/);
  assert.match(f, /try \{ return QGut\(\)\.isOpen\(localStorage/);
  assert.match(html, /querySelectorAll\("\[data-guttog\]"\)/);
});
