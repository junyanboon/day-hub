// node --test still/test/*.test.mjs   (Junyan, 2026-10-19: ghost copies after moving blocks, "drop the quest log",
// and "I don't want the calendar to be able to have anything overlap", d30 d31)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const load = f => { const ctx = {}; ctx.globalThis = ctx; vm.runInNewContext(fs.readFileSync(here + f, "utf8"), ctx); return ctx; };
const A = load("quest-agenda.js").QuestAgenda, G = load("quest-gym.js").QuestGym;
const html = fs.readFileSync(here + "quest.html", "utf8"), dash = fs.readFileSync(here + "quest-dash.js", "utf8");
// his day on 2026-10-19 in Madrid (+02:00), as the calendar read it after the moves
const T = (hm) => new Date(`2026-10-19T${hm}:00+02:00`);
const blk = (key, s, e, t, extra = {}) => ({ key, s:T(s), e:T(e), t, kind:"fixed", ...extra });
const hm = d => new Date(+d + 2 * 3600000).toISOString().slice(11, 16);
const shown = moves => [...moves].map(m => `${m.b.t} ${hm(m.s)}-${hm(m.e)}`);

test("overlaps: finds every pair that overlaps; open space, breathers and touching blocks are fine", () => {
  const day = [blk("tp", "12:30", "13:15", "Trip Planning"), blk("tp2", "13:30", "14:30", "Trip Planning"),
    blk("gym", "14:30", "15:30", "Gym · Jack Woods"), blk("sh", "14:30", "14:45", "Shavasana (rest after workout)"),
    blk("rest", "15:30", "17:30", "Rest"), blk("o", "13:00", "16:00", "Open space", { kind:"open" })];
  const pairs = [...A.overlaps(day)].map(([a, b]) => a.key + "+" + b.key);
  assert.deepEqual(pairs, ["sh+gym"]);
  assert.deepEqual(A.overlaps([blk("a", "09:00", "10:00", "A"), blk("b", "10:00", "11:00", "B")]).length, 0);
  assert.equal(A.overlaps([blk("a", "09:00", "12:00", "A"), blk("b", "10:00", "10:30", "B"), blk("c", "11:00", "11:30", "C")]).length, 2);
});

test("ghost copies: 'Shavasana (rest after workout)' is its own block, not a second Gym", () => {
  // 2026-10-19: Gym moved to 2:30 and the Shavasana event that follows it stayed at 2:30, drawn as "✓ Gym 2:30 PM"
  const SHORT = /\n  const SHORT = \[[\s\S]*?\n  \];\n/.exec(html)[0];
  const ctx = {}; vm.runInNewContext(SHORT.replace("const SHORT", "SHORT_OUT"), Object.assign(ctx, { SHORT_OUT:null }));
  const name = t => { for (const [re, v] of ctx.SHORT_OUT) if (re.test(t)) return typeof v === "function" ? v(t) : v; return null; };
  assert.notEqual(name("Shavasana (rest after workout)"), "Gym");
  assert.equal(name("Gym · Jack Woods"), "Gym"); assert.equal(name("Upper body workout"), "Gym");
  assert.equal(G.isGymTitle("Shavasana (rest after workout)"), false);
  assert.equal(G.isGymTitle("Workout"), true);
  const isGym = /const isGym = b => !!b && (\/.*\/i)\.test\(b\.t\);/.exec(html)[1];
  assert.equal(new RegExp(eval(isGym)).test("Shavasana (rest after workout)"), false);
  // and an event in both yesterday's and today's plan (early morning) shows once by its id, even after a move
  assert.match(html, /prev\.blocks\.some\(x => \(x\.id && x\.id === b\.id\) \|\| \(x\.s === b\.s && x\.t === b\.t\)\)/);
  // the agenda already shows a moved event once: by id, the game's copy wins
  const m = A.mergeAgenda([{ id:"g1", s:T("14:30"), e:T("15:30"), t:"Gym" }], [[{ id:"g1", s:"2026-10-19T14:00:00+02:00", e:"2026-10-19T15:00:00+02:00", t:"Gym" }]]);
  assert.equal(m.length, 1); assert.equal(hm(m[0].s), "14:30");
});

test("drop the quest log: the card and its layout slot are gone, the log itself stays", () => {
  assert.ok(!/id="log"/.test(html) && !/Quest log<\/span>/.test(html), "no card");
  assert.ok(!/put\("log"/.test(html) && !/dayXp/.test(html), "nothing draws it");
  assert.ok(!/\n\s*log: \{ x:/.test(dash), "no default slot");
  assert.ok(!/bid === "log"/.test(dash));
  // a saved layout that still names it: places are read per part on the page (lay[g.id]), so an extra name is unused
  assert.match(dash, /const pos = lay\[g\.id\] \|\| DEFAULT\[g\.id\]/);
  assert.match(html, /G\.day\.log\.unshift\(/, "log lines are still written");
});
