/* Quest core: the Day Quest look rules, shared with the desktop planner (plan.html).
   Copied from still/quest.html on 2026-10-06 (kinds, symbols, colour groups,
   shortName, groupOf, symOf, badge). Only plan.html loads this file for now;
   quest.html keeps its own copy, so a rule change there must be copied here too.
   Every function takes a block-like object { t: title, kind?, type? }.
   One planned difference (Junyan, 2026-10-06): an open-space block is "Your move"
   (a choice), never "Free time". */
(function (root) {
  const KINDS = {
    rest:     { em:"🌙", name:"Rest",     health:true },
    practice: { em:"🪷", name:"Practice", health:true },
    body:     { em:"💪", name:"Body",     health:true },
    fuel:     { em:"🥗", name:"Fuel",     health:true },
    travel:   { em:"🧳", name:"Journey" },
    call:     { em:"📞", name:"Call" },
    dance:    { em:"💃", name:"Dance" },
    open:     { em:"🗺️", name:"Open space" },
    break:    { em:"🍃", name:"Breather" },
    fixed:    { em:"📌", name:"Appointment" },
  };
  const RULES = [
    [/sleep|nap\b|nap |wind.?down|\bbed\b|rest\b/i, "rest"],
    [/shambhavi|sadhana|yoga|meditat|pooja|kriya|bhuta|breath/i, "practice"],
    [/breakfast|brunch|lunch|dinner|\beat\b|cook|meal|pudding|veggie|snack|groceries/i, "fuel"],
    [/ride|drive|flight|airport|check.?in|security|transfer|uber|\btrain\b|lounge|board|pack|\b[A-Z]{2}\d{2,4}\b/i, "travel"],
    [/gym|sauna|\brun\b|walk|mobility|swim|workout|training|stretch/i, "body"],
    [/zouk|dance|class|social|workshop|rehearsal/i, "dance"],
    [/\bcall\b|meet|zoom|chat with/i, "call"],
  ];
  function kindOf(b){
    if (b.type === "break") return "break";
    if (/^open space/i.test(b.t) || b.type === "focus") return "open";
    for (const [re, k] of RULES) if (re.test(b.t)) return k;
    return "fixed";
  }
  const isHealth = b => !!KINDS[b.kind]?.health;

  /* ---------- symbols, colours and short names (Junyan, 2026-10-06, d68 d69) ----------
     Each stop wears a Tabler outline symbol in a ring whose colour says what
     kind of block it is: food blue, body purple, travel yellow, a major event
     red, work green, everything else (sleep, free time) silver. The trail shows
     a short name; the full calendar title stays on the event. */
  const SYM = {"camera":"M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2 M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0","barbell":"M2 12h1 M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2 M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1 M9 12h6 M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1 M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2 M22 12h-1","briefcase":"M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9 M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2 M12 12l0 .01 M3 13a20 20 0 0 0 18 0","bus":"M4 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M16 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M4 17h-2v-11a1 1 0 0 1 1 -1h14a5 7 0 0 1 5 7v5h-2m-4 0h-8 M16 5l1.5 7l4.5 0 M2 10l15 0 M7 5l0 5 M12 5l0 5","car":"M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5","coffee":"M3 14c.83 .642 2.077 1.017 3.5 1c1.423 .017 2.67 -.358 3.5 -1c.83 -.642 2.077 -1.017 3.5 -1c1.423 -.017 2.67 .358 3.5 1 M8 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2 M12 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2 M3 10h14v5a6 6 0 0 1 -6 6h-2a6 6 0 0 1 -6 -6v-5 M16.746 16.726a3 3 0 1 0 .252 -5.555","compass":"M8 16l2 -6l6 -2l-2 6l-6 2 M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 3l0 2 M12 19l0 2 M3 12l2 0 M19 12l2 0","confetti":"M4 5h2 M5 4v2 M11.5 4l-.5 2 M18 5h2 M19 4v2 M15 9l-1 1 M18 13l2 -.5 M18 19h2 M19 18v2 M14 16.518l-6.518 -6.518l-4.39 9.58a1 1 0 0 0 1.329 1.329l9.579 -4.39","luggage":"M6 8a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -10 M9 6v-1a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v1 M6 10h12 M6 16h12 M9 20v1 M15 20v1","map-pin":"M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0 M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0","moon-stars":"M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008 M17 4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2 M19 11h2m-1 -1v2","motorbike":"M2 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M16 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M7.5 14h5l4 -4h-10.5m1.5 4l4 -4 M13 6h2l1.5 3l2 4","music":"M3 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0 M13 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0 M9 17v-13h10v13 M9 8h10","phone":"M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2","plane":"M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3l4 7","ship":"M2 20a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1 M4 18l-1 -5h18l-2 4 M5 13v-6h8l4 6 M7 7v-4h-1","stretching":"M15 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M5 20l5 -.5l1 -2 M18 20v-5h-5.5l2.5 -6.5l-5.5 1l1.5 2","swimming":"M15 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M6 11l4 -2l3.5 3l-1.5 2 M3 16.75a2.4 2.4 0 0 0 1 .25a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 1 -.25","tools-kitchen-2":"M19 3v12h-5c-.023 -3.681 .184 -7.406 5 -12m0 12v6h-1v-3m-10 -14v17m-3 -17v3a3 3 0 1 0 6 0v-3","train":"M21 13c0 -3.87 -3.37 -7 -10 -7h-8 M3 15h16a2 2 0 0 0 2 -2 M3 6v5h17.5 M3 11v4 M8 11v-5 M13 11v-4.5 M3 19h18","users":"M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2 M16 3.13a4 4 0 0 1 0 7.75 M21 21v-2a4 4 0 0 0 -3 -3.85","walk":"M12 4a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M7 21l3 -4 M16 21l-2 -4l-3 -3l1 -6 M6 12l2 -3l4 -1l3 3l3 1","yoga":"M4 20h4l1.5 -3 M17 20l-1 -5h-5l1 -7 M4 10l4 -1l4 -1l4 1.5l4 1.5 M10.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"};
  const GROUPS = {
    food:   { ring:"#85B7EB", fill:"#0c3a66", name:"Food" },
    body:   { ring:"#AFA9EC", fill:"#2e2a6b", name:"Body" },
    travel: { ring:"#FAC775", fill:"#5a3a0a", name:"Travel" },
    major:  { ring:"#F09595", fill:"#6b1f1f", name:"Major event" },
    work:   { ring:"#97C459", fill:"#27500A", name:"Work" },
    calm:   { ring:"#B4B2A9", fill:"#3a3f63", name:"" },
  };
  const MAJOR = /party|festival|wedding|concert|\bshow\b|congress|competition|birthday|performance|gala|\btour\b|quad|safari|\bdive\b|snorkel|excursion/i;
  function groupOf(b){
    if (MAJOR.test(b.t)) return "major";
    if (/work|meeting|admin|email|focus|annex|desk|client|video|shoot|film/i.test(b.t)) return "work";
    return { fuel:"food", body:"body", practice:"body", dance:"body", travel:"travel", call:"work" }[b.kind] || "calm";
  }
  const SYM_RULES = [
    [/^open space|^free time/i, "compass"], [/video|shoot|film/i, "camera"], [/sleep|\bbed\b|\bnap\b|wind.?down/i, "moon-stars"],
    [/gym|workout|training|weights/i, "barbell"], [/breakfast|coffee/i, "coffee"],
    [/lunch|dinner|\beat\b|meal|snack|cook|brunch/i, "tools-kitchen-2"], [/swim|pool|beach/i, "swimming"],
    [/stretch|mobility/i, "stretching"], [/yoga|shambhavi|meditat|sadhana|kriya|breath/i, "yoga"],
    [/walk|hike|trek/i, "walk"], [/quad|motor|bike/i, "motorbike"],
    [/festival|wedding|birthday|gala|celebrat/i, "confetti"], [/party|dance|zouk|sbk|social|concert/i, "music"],
    [/\bcall\b|phone/i, "phone"], [/meet|zoom|chat with/i, "users"],
    [/flight|airport|✈|\b[A-Z]{2}\d{2,4}\b/, "plane"], [/\bbus\b/i, "bus"], [/\btrain\b/i, "train"],
    [/ferry|boat|cruise/i, "ship"], [/drive|ride|uber|taxi|transfer|car\b/i, "car"],
    [/check.?out|check.?in|pack|luggage|lobby/i, "luggage"], [/work|admin|email|focus|annex|desk/i, "briefcase"],
  ];
  function symOf(b){
    if (b.kind === "open" || b.kind === "break") return "compass";
    for (const [re, k] of SYM_RULES) if (re.test(b.t)) return k;
    return { rest:"moon-stars", body:"stretching", fuel:"tools-kitchen-2", practice:"yoga", travel:"luggage", call:"phone", dance:"music" }[b.kind] || "map-pin";
  }
  const SHORT = [
    [/^open space|^free time/i, "Your move"], [/sleep/i, "Sleep"], [/gym|workout/i, "Gym"], [/breakfast/i, "Breakfast"],
    [/brunch/i, "Brunch"], [/lunch/i, "Lunch"], [/dinner/i, t => /pack/i.test(t) ? "Dinner + pack" : "Dinner"],
    [/quad/i, "Quad bikes"], [/check.?out/i, "Check-out"], [/walk/i, "Walk"], [/video|shoot|film/i, "Video shoot"],
  ];
  function shortName(b){
    const t = String(b.t || "");
    for (const [re, v] of SHORT) if (re.test(t)) return typeof v === "function" ? v(t) : v;
    let x = t.replace(/\s*[·@(].*$/, "").replace(/^(tour|trip|event)\s*[-:–]\s*/i, "").replace(/[!?.]+$/, "").trim();
    return x.length > 22 ? x.slice(0, 21).trim() + "…" : (x || t);
  }
  // the symbol in its coloured ring, as inline SVG (main card, next line, windows)
  function badge(b, px = 34, lit = false){
    const g = GROUPS[groupOf(b)];
    return `<svg class="badge" width="${px}" height="${px}" viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r="18" fill="${lit ? g.ring : g.fill}" stroke="${g.ring}" stroke-width="2"/>
      <path d="${SYM[symOf(b)] || SYM["map-pin"]}" transform="translate(-11,-11) scale(.92)" fill="none" stroke="${lit ? g.fill : g.ring}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  // plan.html blocks come straight from the calendar, so give them a kind first.
  function decorate(b){ if (!b.kind) b.kind = kindOf(b); return b; }
  root.QuestCore = { KINDS, RULES, kindOf, isHealth, SYM, GROUPS, MAJOR, groupOf, SYM_RULES, symOf, SHORT, shortName, badge, decorate };
})(typeof window !== "undefined" ? window : globalThis);
