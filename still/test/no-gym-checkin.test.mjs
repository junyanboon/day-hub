// node --test still/test/*.test.mjs   (Junyan 2026-10-17: "Can we drop the check ins for the Gym "How was Gym?"
// I already recorded the details"). A gym block (the same isGym test the gym log uses) never offers the
// "How was ...?" activity check-in: not the button on the Now card, not the "Check ›" tag on the calendar.
// Other activities keep it. Meals keep their own quiz (isMeal, untouched).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const html = fs.readFileSync(here + "quest.html", "utf8");

// pull the page's own isGym and actRatable out and run them with simple stand-ins for the rest
function pageFns(){
  const grab = re => { const m = html.match(re); assert.ok(m, `quest.html lost ${re}`); return m[0]; };
  const isGym = grab(/const isGym = b => [^\n]+;/);
  const act = grab(/const actRatable = b => [^\n]+\n[^\n]+;/);
  return new Function(`
    const isMeal = b => /lunch|dinner|breakfast/i.test(b.t), isSleep = b => /sleep/i.test(b.t), blockHabits = () => [], basicId = b => /yoga|domestic|wind.?down|groom|shower/i.test(b.t) ? "x" : null;
    ${isGym}
    ${act}
    return { isGym, actRatable };`)();
}
const H = 3600000, blk = (t, kind) => ({ t, kind, s:0, e:H });

test("gym blocks are not offered the activity check-in", () => {
  const { actRatable } = pageFns();
  for (const t of ["Gym", "Gym · Jack Woods Day 2", "Workout", "Calisthenics", "Rings practice"])
    assert.equal(actRatable(blk(t)), false, t);
});

test("other activities keep their check-in", () => {
  const { actRatable } = pageFns();
  for (const t of ["Hike to the falls", "Deep work", "Dance class", "Walk by the river"]) assert.equal(actRatable(blk(t)), true, t);
});

test("checklist blocks (Morning Yoga, Domestics, Grooming, Wind-down) have their checklist, not the check-in", () => {
  const { actRatable } = pageFns();
  for (const t of ["Morning Yoga", "Domestics", "Wind down", "Grooming"]) assert.equal(actRatable(blk(t)), false, t);
});

test("every place the check-in shows goes through actRatable", () => {
  assert.ok(/function unratedActivity\(\)\{[\s\S]{0,120}actRatable\(b\)/.test(html), "unratedActivity must filter with actRatable");
  assert.ok(/const ask = [^\n]*actRatable\(b0\)/.test(html), "the calendar Check tag must use actRatable");
  assert.equal((html.match(/data-actq="/g) || []).length, 2, "a new data-actq entry point needs the gym rule too");
});
