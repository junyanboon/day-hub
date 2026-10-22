/* His recipe book (Junyan, 2026-10-22, d6, d8 to d10: Day Quest is the only place for recipes; all 401 from Paprika,
   text only; loaded only when he opens it; onion or garlic marked "needs a swap", not rewritten).
   The book is recipe-wiki/library/ (tools/import-paprika.mjs), exported by its tools/export-library.mjs and copied here
   by scripts/pull-library.mjs as quest-library.json. The page fetches it the first time the book opens
   (quest-library.json?v=V; the service worker keeps a ?v= file for good, so it opens offline after that). About 800 KB:
   nothing of it is in the saved game state, and it costs nothing until he opens the book.
   Read only: Paprika's ingredient lines are free text ("1 Onion chopped"), not the "name: amount" rows a dish ticks.
   A recipe worth cooking goes to the recipe agent (recipe-wiki), which writes a gentle version for the meal sheet.
   Short keys from the export: n name, t time, s serves, g tags, r rating, x needs a swap, i ingredients, p steps,
   o notes, u source link. Pure, so it can be tested (node --test still/test). */
(function (root) {
  "use strict";
  const V = "202610221008";   // scripts/pull-library.mjs sets this when the book changes
  const arr = (x) => (Array.isArray(x) ? x : []);
  const str = (x) => (typeof x === "string" ? x : x == null ? "" : String(x));
  function load(data) {
    return arr(data && data.recipes).filter((r) => r && str(r.id) && str(r.n)).map((r) => ({
      id: str(r.id), name: str(r.n).trim(), time: str(r.t), serves: str(r.s), tags: arr(r.g).map(str), rating: +r.r || 0,
      swap: arr(r.x).map(str), items: arr(r.i).map(str), steps: arr(r.p).map(str), notes: str(r.o), url: /^https?:\/\//.test(str(r.u)) ? r.u : "",
    }));
  }
  // the chips over the list: [id, label, test]
  const FILTERS = [
    ["all", "All", () => true],
    ["fav", "Favourites", (r) => r.rating >= 4 || r.tags.includes("favourite")],
    ["try", "To try", (r) => r.tags.includes("to-try")],
    ["sweet", "Desserts", (r) => r.tags.includes("desserts")],
    ["ok", "No swap needed", (r) => !r.swap.length],
  ];
  const norm = (s) => str(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  /* every word he typed is in the name or an ingredient line; name hits first, then the higher rating, then A to Z */
  function search(list, q, f) {
    const test = (FILTERS.find((x) => x[0] === f) || FILTERS[0])[2], words = norm(q).split(/\s+/).filter(Boolean);
    return arr(list).filter(test).map((r) => {
      const nm = norm(r.name), all = nm + "\n" + norm(r.items.join("\n"));
      if (!words.every((w) => all.includes(w))) return null;
      return { r, s: (words.length && words.every((w) => nm.includes(w)) ? 0 : 1) };
    }).filter(Boolean).sort((a, b) => a.s - b.s || b.r.rating - a.r.rating || a.r.name.localeCompare(b.r.name)).map((x) => x.r);
  }
  // the grey line under a name: "★★★★★ · 45 min · needs a swap"
  function sub(r) {
    const out = [];
    if (r.rating) out.push("★".repeat(Math.min(5, r.rating)));
    if (r.time) out.push(r.time);
    if (r.swap.length) out.push("needs a swap");
    return out.join(" · ");
  }
  const swapLine = (r) => (r.swap.length ? `Uses ${r.swap.join(", ")}. Swap before cooking: your rules have no onion or garlic.` : "");

  root.QuestLibrary = { V, FILTERS, load, search, sub, swapLine };
})(typeof window !== "undefined" ? window : globalThis);
