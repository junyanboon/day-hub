/* Recipe cards from his recipe book (Junyan, 2026-10-21, d79: "the recipe dishes below were not useful at all. Instead
   maybe just recipe cards would be of help.. (food suggestions for travel?)").
   The recipe book is the recipe wiki (personal/recipe-wiki), kept by its own agent. scripts/pull-recipes.mjs runs the
   wiki's export and writes it here as quest-recipe-data.js (window.QuestRecipeData), a ?v= script the service worker
   saves with the page, so the cards open offline too. This file turns that export into meal-sheet dishes:
   { id: "rc-<wiki id>", rid, icon, name, time, meal, tags, items: [[ingredient, amount]], steps, swaps, gut, recipe: true }.
   The id keeps to the synced-id shape (/^[\w-]{1,40}$/) because a cooked recipe's ticks live on the meal record under it.
   The two Blueprint recipes (tag "blueprint") are left out: they are the Blueprint dish cards already.
   Travel-friendly (a trip, the travel fridge in use): the wiki's "travel" tag when any recipe has it; with no recipe
   tagged, a guess from the recipe itself: no oven, 8 ingredients or fewer, 30 minutes or less.
   2026-10-22 (d89, d90, d91):
   - A step's wiki link ("[[techniques/soft-broccoli]]") reads as "soft broccoli" and carries the technique's "how" steps
     from the export's techniques (stepParts); one the data does not have is just the readable name. Never [[ ]] text.
   - An ingredient whose NAME ends "(optional)" has it moved onto its amount, so every place that asks optional() sees it
     and the name shows without it.
   - The recipe agent's latest run (data.run, from recipe-wiki/runs/, brought in by the pull): a recipe it adapted shows the
     run's kitchen version (name, icon, time, ingredients, steps; the book's tags, swaps and gut notes stay), and its new
     ideas are cards too. Tonight's ideas come first. A recipe the run did not touch stays plain. */
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
  // d90: "Pumpkin seeds (optional)" is ["Pumpkin seeds", "<amount> (optional)"]
  const item = (x) => { let n = str(x[0]).trim(), a = str(x[1]).trim();
    if (OPT.test(n)) { n = n.replace(OPT, "").trim(); if (!OPT.test(a)) a = a ? `${a} (optional)` : "(optional)"; }
    return [n, a]; };
  function shape(r) {
    if (!r || typeof r !== "object" || !okId(str(r.id)) || !str(r.name).trim()) return null;
    const items = arr(r.items).filter((x) => Array.isArray(x) && str(x[0]).trim()).map(item).filter((x) => x[0]);
    if (!items.length) return null;
    const tags = arr(r.tags).filter((t) => typeof t === "string").map((t) => t.toLowerCase());
    const swaps = r.swaps && typeof r.swaps === "object" ? Object.fromEntries(Object.entries(r.swaps).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.filter((s) => typeof s === "string")])) : {};
    return { id: "rc-" + r.id, rid: r.id, icon: str(r.icon) || "🍽️", name: str(r.name).trim(), time: str(r.time), meal: str(r.meal) || "any", tags,
      items, steps: arr(r.steps).filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()), swaps, gut: str(r.gut).trim(), recipe: true,
      run: str(r.run) || null };
  }
  /* d91: the run's ideas over the book. An idea with ingredients and steps that names a book recipe (from, else its own
     id) replaces that recipe's name, icon, time, ingredients and steps; one that names none is a new card. */
  function withRun(data) {
    const book = arr(data && data.recipes), run = data && data.run, day = str(run && run.day) || "run";
    const ideas = arr(run && run.ideas).filter((i) => i && typeof i === "object" && arr(i.items).length && arr(i.steps).length);
    if (!ideas.length) return book;
    const ids = new Set(book.map((r) => r && r.id)), front = [], used = new Set();
    for (const i of ideas) {
      const from = str(i.from) && i.from !== "new" && ids.has(i.from) ? i.from : ids.has(i.id) ? i.id : null;
      if (from) { if (used.has(from)) continue; used.add(from); const r = book.find((x) => x && x.id === from);
        front.push({ ...r, name: str(i.name).trim() || r.name, icon: str(i.icon) || r.icon, time: str(i.time) || r.time, items: i.items, steps: i.steps, run: day }); }
      else front.push({ id: str(i.id), icon: i.icon, name: i.name, time: i.time, meal: "dinner", tags: [], items: i.items, steps: i.steps, run: day });
    }
    return front.concat(book.filter((r) => !(r && used.has(r.id))));
  }
  // the recipe book as dishes, Blueprint recipes left out; [] when the data did not load
  function load(data) {
    const seen = new Set();
    return withRun(data).map(shape).filter((d) => d && !d.tags.includes("blueprint") && !seen.has(d.id) && seen.add(d.id));
  }
  /* d89: a step in parts: { text } and { name, tech } for each wiki link, tech { id, name, how: [steps] } or null when the
     data has no such technique. data: the export (default the loaded one). */
  const LINK = /\[\[([^\]]*)\]\]/g;
  function technique(ref, data) {
    const id = str(ref).split("/").pop().trim(), t = arr((data || root.QuestRecipeData || {}).techniques).find((x) => x && x.id === id);
    const how = t ? str(t.how).split(/\n+/).map((l) => l.replace(/^\s*(\d+[.)]|[-*])\s*/, "").trim()).filter(Boolean) : [];
    return how.length ? { id, name: str(t.name) || id, how } : null;
  }
  function stepParts(s, data) {
    const out = [], txt = str(s); let at = 0;
    for (const m of txt.matchAll(LINK)) {
      if (m.index > at) out.push({ text: txt.slice(at, m.index) });
      const name = str(m[1]).split("/").pop().replace(/[-_]+/g, " ").trim();
      if (name) out.push({ name, tech: technique(m[1], data) });
      at = m.index + m[0].length;
    }
    if (at < txt.length) out.push({ text: txt.slice(at) });
    return out;
  }
  const stepText = (s, data) => stepParts(s, data).map((p) => p.text != null ? p.text : p.name).join("").replace(/\s+/g, " ").trim();
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
  // d91: the run's kitchen version says so first
  const tagLine = (d, n = 3) => (d.run ? ["for your kitchen"] : []).concat(d.tags.filter((t) => !QUIET.has(t)).slice(0, n).map((t) => t.replace(/-/g, " ").replace(/\bfiber\b/, "fibre"))).join(" · ");
  // what "Cook this" ticks: every ingredient but the optional ones
  const cookTicks = (d) => d.items.filter((x) => !optional(x[1])).map((x) => x[0]);

  root.QuestRecipes = { load, list, byId, travelRule, isTravel, mealOf, order, tagLine, cookTicks, optional, amtText, minutes, stepParts, stepText, technique };
})(typeof window !== "undefined" ? window : globalThis);
