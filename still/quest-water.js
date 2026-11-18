/* Day Quest water (Junyan, 2026-10-19, d23 and d24): water is its own card, like the steps side quest, and lives
   nowhere else (no free tile, never in a block checklist).
   - The aim: 8 glasses of 250 ml (2 L, Bryan Johnson's rough amount), with a marker at 6 glasses "by 4 PM".
   - The 💧 drop is the button (2026-10-20: "make the water symbol into the thing I press"). Each glass is saved
     against the block he is in right now, or "none" in open time, and the logged line names that block. button()
     is the drop's tooltip: "+1 glass · <block>", and after 4 PM "+1 glass (thirsty)". Sadhguru's rule is to drink
     when thirsty, so that is a gentle reminder, never a block.
   - Phones show no tooltip, so tail() puts the same two cues on the small grey line under the count (Junyan,
     2026-10-20, d76): "500 ml so far, 4 more by 4 PM · Domestics", after 4 PM "· Domestics · thirsty?". No block,
     no block part. Each part is { t, blk } so the page knows which one may shrink.
   - A glass pays what one cup of water paid before, into the same meter, up to the same daily limit.
   - G.day.glasses = { id: { at, blk, name, hour, d, off? } }: hour is his local hour when he drank, d what it paid.
     An undo marks the glass off (never deletes it), so two devices merging keep the undo (quest-merge.js).
   - Per-day totals go into G.days[date] as wt (glasses) and w4 (before 4 PM) for the day-end trend.
   - Through the day (Junyan, 2026-10-20, d16): under the bar, three tap buttons (DAY3) for supplements (aim 1, after a
     meal), fermented food (aim 1) and xylitol (aim 6 g, 1 g a tap). They moved here from the meal sheet. Each tap pays
     its own habit's value (supps, ferment, xylitol in quest.html HABITS: same values, same meter, same daily limits;
     xylitol's limit stays 10 though the aim shows 6). Each tap is saved in G.day.glasses with a kind ({ kind:"supps",
     ... }), so it merges and undoes exactly like a glass with no change to quest-merge.js or the server; a glass is an
     entry with no kind, and only those count as water.
   Pure, so it can be tested (node --test still/test). */
(function (root) {
  "use strict";
  const AIM = 8, BY4 = 6, ML = 250, CUT = 16;
  const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  const markerPct = () => Math.round((BY4 / AIM) * 100);
  // after 4 PM, and on to the game day's end at 4 AM
  const late = (hour) => hour >= CUT || hour < 4;
  function button(name, hour) {
    if (late(hour)) return "+1 glass (thirsty)";
    return name ? `+1 glass · ${name}` : "+1 glass";
  }
  // the extra bits of the small line: the block the next glass counts toward, then "thirsty?" after 4 PM
  // (none once the aim is met: the line already says so, and it would run long)
  function tail(name, hour, total) {
    if (total >= AIM) return [];
    const out = [];
    if (name) out.push({ t: name, blk: true });
    if (late(hour)) out.push({ t: "thirsty?" });
    return out;
  }
  // [habit id, icon, name, aim, unit, hint] (2026-10-20, d16)
  const DAY3 = [
    ["supps", "💊", "Supps", 1, "", "after a meal"],
    ["ferment", "🥛", "Ferment", 1, "", "100 g yogurt, kefir or kraut"],
    ["xylitol", "🍬", "Xylitol", 6, "g", "1 g after eating"],
  ];
  // every entry still counted, oldest first; kind picks the through-the-day taps, none the glasses
  function entries(g, kind) {
    return Object.entries(obj(g)).map(([id, x]) => ({ id, ...obj(x) })).filter((x) => x.at && !x.off && (x.kind || null) === (kind || null))
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }
  // the glasses still counted, oldest first
  const active = (g) => entries(g, null);
  // one through-the-day tap: c marks that it counted toward the habit's daily limit (so an undo counts it off)
  function addItem(g, o) {
    return { ...obj(g), [o.id]: { at: o.at, kind: o.kind, hour: o.hour, d: o.d || 0, ...(o.c ? { c: 1 } : {}) } };
  }
  // the small line under a through-the-day button: n is how many times the habit counts today. Just the count, so
  // the three fit a phone (Junyan, 2026-10-22: "drop words so things fit"); the hint is the button's label (hintLine)
  function itemLine(row, n) {
    const [, , , aim, unit] = row;
    return n >= aim ? "✓" : `${n}/${aim}${unit ? " " + unit : ""}`;
  }
  const hintLine = (row) => row[5];
  function add(g, o) {
    return { ...obj(g), [o.id]: { at: o.at, blk: o.blk || "none", name: o.name || "", hour: o.hour, d: o.d || 0 } };
  }
  function undo(g, id) {
    const x = obj(g)[id]; if (!x) return obj(g);
    return { ...obj(g), [id]: { ...x, off: true } };
  }
  function summary(g) {
    const a = active(g);
    return { total: a.length, before4: a.filter((x) => typeof x.hour === "number" && !late(x.hour)).length, ml: a.length * ML };
  }
  // glasses per block key ("none" for open time)
  function byBlock(g) {
    const out = {};
    for (const x of active(g)) out[x.blk || "none"] = (out[x.blk || "none"] || 0) + 1;
    return out;
  }
  // what the next glass pays: water's old value per cup, nothing past the old daily limit
  const pay = (g, value, cap) => (active(g).length >= cap ? 0 : value);

  /* Pips (Junyan, 2026-10-24, d77, design C): both cards show 8 boxes. Water: one a glass, box 6 (BY4) has the gold
     4 PM outline. Steps: one per 1,000 steps, the last box carries the prize mark (+prana at 8,000). from is the
     count before a tap or a new Oura read, so only boxes earned since then pop. */
  const STEP_BOX = 1000, STEP_GOAL = 8000, STEPS_PER_MIN = 100;
  function pips(filled, from, mark) {
    const n = Math.max(0, Math.min(AIM, filled | 0)), f = from == null ? n : Math.max(0, Math.min(AIM, from | 0));
    return Array.from({ length: AIM }, (_, i) => ({ on: i < n, pop: i < n && i >= f, mark: i + 1 === mark }));
  }
  const stepBoxes = (steps) => Math.min(AIM, Math.floor(Math.max(0, steps || 0) / STEP_BOX));
  // the shoe's pop: how far to the next box, at about 100 steps a minute
  function stepsNext(steps) {
    const s = Math.max(0, steps || 0);
    if (s >= STEP_GOAL) return "All 8 boxes full. Nice walking!";
    const left = STEP_BOX - (s % STEP_BOX), min = Math.max(1, Math.round(left / STEPS_PER_MIN));
    return `Next box: ${left.toLocaleString("en-US")} steps, about ${min} min walk`;
  }

  root.QuestWater = { AIM, BY4, ML, CUT, DAY3, STEP_GOAL, pips, stepBoxes, stepsNext, markerPct, late, button, tail, active, entries, add, addItem, itemLine, hintLine, undo, summary, byBlock, pay };
})(typeof window !== "undefined" ? window : globalThis);
