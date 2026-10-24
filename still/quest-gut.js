/* Day Quest gut log (Junyan, 2026-10-22, d2): one small card under the water card, once a day, about 30 seconds.
   From the gut plan (sticky stool from a fat-heavy home diet, colitis history): how many times, the Bristol type
   (1 hard to 7 watery, aim 3 to 4), sticky y/n, blood y/n, urgency 0 to 3. Day Quest is the only place he logs this.
   - G.day.gut = { n, b, sticky, blood, urg, at }: any field may be missing until he taps it; at is the last change,
     so two devices merging keep the later one (quest-merge.js).
   - The day's copy goes into G.days[date].gut for the history, like water's wt.
   - Blood shows a plain "tell a doctor" line: the gut plan lists it as a see-the-doctor sign.
   Pure, so it can be tested (node --test still/test). */
(function (root) {
  "use strict";
  const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  const BRISTOL = [
    [1, "hard lumps"], [2, "lumpy"], [3, "cracked"], [4, "smooth"], [5, "soft blobs"], [6, "mushy"], [7, "watery"],
  ];
  const URG = ["none", "a little", "some", "strong"];
  // one change: field is n | b | sticky | blood | urg; tapping the value already set clears it (b, urg) or flips it
  function set(g, field, v, at) {
    const x = { ...obj(g) };
    if (field === "n") x.n = Math.max(0, Math.min(12, v));
    else if (field === "sticky" || field === "blood") x[field] = !x[field];
    else if (field === "b" || field === "urg") { if (x[field] === v) delete x[field]; else x[field] = v; }
    else return obj(g);
    x.at = at;
    return x;
  }
  const logged = (g) => { const x = obj(g); return x.n != null || x.b != null || x.urg != null || !!x.sticky || !!x.blood; };
  // the small line under the title
  function line(g) {
    const x = obj(g);
    if (!logged(x)) return "Not logged yet · about 30 seconds";
    const out = [];
    if (x.n != null) out.push(`${x.n}×`);
    if (x.b != null) out.push(`type ${x.b} ${(BRISTOL[x.b - 1] || [])[1] || ""}`.trim());
    if (x.sticky) out.push("sticky");
    if (x.blood) out.push("blood");
    if (x.urg != null) out.push(`urgency ${x.urg}`);
    return out.join(" · ");
  }
  const warn = (g) => (obj(g).blood ? "Blood: tell a doctor soon, even if it stops." : "");
  // merging two devices' copies of the same day: the later change wins
  function merge(a, b) {
    if (!a) return b; if (!b) return a;
    return String(obj(b).at || "") >= String(obj(a).at || "") ? b : a;
  }
  /* Collapsed card (Junyan, 2026-10-24: "for gut I want this to be collapsible"). The device keeps the date the card
     was opened; it shows open only on that same day, so each new day starts closed. */
  const isOpen = (stored, date) => !!date && stored === date;
  const toggle = (stored, date) => (isOpen(stored, date) ? "" : date);
  const stamp = (g) => (logged(g) ? { gut: { ...obj(g) } } : {});

  root.QuestGut = { BRISTOL, URG, set, logged, line, warn, merge, stamp, isOpen, toggle, OPEN_KEY: "dq-gut-open" };
})(typeof window !== "undefined" ? window : globalThis);
