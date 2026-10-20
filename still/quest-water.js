/* Day Quest water (Junyan, 2026-10-19, d23 and d24): water is its own card, like the steps side quest, and lives
   nowhere else (no free tile, never in a block checklist).
   - The aim: 8 glasses of 250 ml (2 L, Bryan Johnson's rough amount), with a marker at 6 glasses "by 4 PM".
   - The 💧 drop is the button (2026-10-20: "make the water symbol into the thing I press"); its tooltip
     (button()) names the block he is in right now, and so does the logged line; each glass is saved against that block's key, or "none" in
     open time. After 4 PM it reads "+1 glass (thirsty)" and still works: Sadhguru's rule is to drink when thirsty,
     so this is a gentle reminder, never a block.
   - A glass pays what one cup of water paid before, into the same meter, up to the same daily limit.
   - G.day.glasses = { id: { at, blk, name, hour, d, off? } }: hour is his local hour when he drank, d what it paid.
     An undo marks the glass off (never deletes it), so two devices merging keep the undo (quest-merge.js).
   - Per-day totals go into G.days[date] as wt (glasses) and w4 (before 4 PM) for the day-end trend.
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
  // the glasses still counted, oldest first
  function active(g) {
    return Object.entries(obj(g)).map(([id, x]) => ({ id, ...obj(x) })).filter((x) => x.at && !x.off)
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }
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

  root.QuestWater = { AIM, BY4, ML, CUT, markerPct, late, button, active, add, undo, summary, byBlock, pay };
})(typeof window !== "undefined" ? window : globalThis);
