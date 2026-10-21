/* Recipe cards from his recipe book (Junyan, 2026-10-21, d79: "the recipe dishes below were not useful at all. Instead
   maybe just recipe cards would be of help.. (food suggestions for travel?)").
   The recipe book is the recipe wiki (personal/recipe-wiki), kept by its own agent. scripts/pull-recipes.mjs runs the
   wiki's export and writes it here as quest-recipe-data.js (window.QuestRecipeData), a ?v= script the service worker
   saves with the page, so the cards open offline too. This file turns that export into meal-sheet dishes:
   { id: "rc-<wiki id>", rid, icon, name, time, meal, tags, items: [[ingredient, amount]], steps, swaps, gut, recipe: true }.
   The id keeps to the synced-id shape (/^[\w-]{1,40}$/) because a cooked recipe's ticks live on the meal record under it.
   The two Blueprint recipes (tag "blueprint") are left out: they are the Blueprint dish cards already.
   Travel-friendly (a trip, the travel fridge in use): the wiki's "travel" tag when any recipe has it; with no recipe
   tagged, a guess from the recipe itself: no oven, 8 ingredients or fewer, 30 minutes or less. */
(function (root) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  const str = (x) => (typeof x === "string" ? x : "");
  const okId = (id) => /^[a-z0-9-]{1,37}$/.test(id);
  const OPT = /\s*\(optional\)\s*$/i;
  // "1 tbsp (optional)": an extra the recipe can do without
  const optional = (amt) => OPT.test(str(amt));
  const amtText = (amt) => str(amt).replace(OPT, "").trim();
  // "10 min + 20 min soak" is 30, "1 h 15 min" is 75; null when it names no time
  function minutes(t) {
    let n = 0, any = false;
    for (const m of str(t).matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hours?|min|mins|minutes?)\b/gi)) { any = true; n += /^h/i.test(m[2]) ? +m[1] * 60 : +m[1]; }
    return any ? Math.round(n) : null;
  }
  function shape(r) {
    if (!r || typeof r !== "object" || !okId(str(r.id)) || !str(r.name).trim()) return null;
    const items = arr(r.items).filter((x) => Array.isArray(x) && str(x[0]).trim()).map((x) => [str(x[0]).trim(), str(x[1]).trim()]);
    if (!items.length) return null;
    const tags = arr(r.tags).filter((t) => typeof t === "string").map((t) => t.toLowerCase());
    const swaps = r.swaps && typeof r.swaps === "object" ? Object.fromEntries(Object.entries(r.swaps).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.filter((s) => typeof s === "string")])) : {};
    return { id: "rc-" + r.id, rid: r.id, icon: str(r.icon) || "🍽️", name: str(r.name).trim(), time: str(r.time), meal: str(r.meal) || "any", tags,
      items, steps: arr(r.steps).filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()), swaps, gut: str(r.gut).trim(), recipe: true };
  }
  // the recipe book as dishes, Blueprint recipes left out; [] when the data did not load
  function load(data) {
    const seen = new Set();
    return arr(data && data.recipes).map(shape).filter((d) => d && !d.tags.includes("blueprint") && !seen.has(d.id) && seen.add(d.id));
  }
  let memo = { data: undefined, list: [] };
  const list = () => { const d = root.QuestRecipeData; if (d !== memo.data) memo = { data: d, list: load(d) }; return memo.list; };
  const byId = (id) => list().find((d) => d.id === id) || null;
  // how "travel-friendly" is decided for this book: "tag" (the wiki tags them) or "guess" (no recipe is tagged)
  const travelRule = (l) => (arr(l || list()).some((d) => d.tags.includes("travel")) ? "tag" : "guess");
  function isTravel(d, rule) {
    if ((rule || travelRule()) === "tag") return d.tags.includes("travel");
    const min = minutes(d.time), oven = d.tags.includes("oven") || d.steps.some((s) => /\b(oven|roast|bake)\b/i.test(s));
    return !oven && d.items.filter((x) => !optional(x[1])).length <= 8 && min != null && min <= 30;
  }
  // the meal a block's name reads as ("Dinner", "Lunch with Caney"), else null
  const mealOf = (name) => { const s = str(name).toLowerCase();
    return /breakfast|brunch/.test(s) ? "breakfast" : /lunch/.test(s) ? "lunch" : /dinner|supper/.test(s) ? "dinner" : /snack/.test(s) ? "snack" : null; };
  /* The order on the meal sheet: on a trip the travel-friendly ones first; then the ones for this meal (or "any"); the
     book's own order otherwise (the same on both devices, nothing reshuffles while he cooks). */
  function order(l, o) {
    const rule = travelRule(l), trip = !!(o && o.trip), meal = o && o.meal;
    return arr(l).map((d, i) => ({ d, i, t: trip && isTravel(d, rule) ? 0 : 1, m: !meal || d.meal === meal || d.meal === "any" ? 0 : 1 }))
      .sort((a, b) => a.t - b.t || a.m - b.m || a.i - b.i).map((x) => x.d);
  }
  // a short tag line for the card: "gentle · low oil · one pot" (book-keeping tags left out)
  const QUIET = new Set(["blueprint", "pranic", "reset", "travel"]);
  const tagLine = (d, n = 3) => d.tags.filter((t) => !QUIET.has(t)).slice(0, n).map((t) => t.replace(/-/g, " ").replace(/\bfiber\b/, "fibre")).join(" · ");
  // what "Cook this" ticks: every ingredient but the optional ones
  const cookTicks = (d) => d.items.filter((x) => !optional(x[1])).map((x) => x[0]);

  root.QuestRecipes = { load, list, byId, travelRule, isTravel, mealOf, order, tagLine, cookTicks, optional, amtText, minutes };
})(typeof window !== "undefined" ? window : globalThis);
