/* Day Quest Nearby: places near where he is staying (Junyan, 2026-10-16: "create a new widget on my quest with
   the options you presented. Everything should be collapsed and show the distance in terms of travel time (make
   a symbol to show walking, transit or car)").
   One small list per stay (STAYS). The stay is found from the place line still-api sends (where.from.place, the
   hotel's check-in event) or a hotel event on today's calendar; no list for the stay means no widget.
   Each row is shut by default: icon, name, travel time with its symbol (🚶 walking, 🚇 transit, 🚗 car).
   Tapping opens what it is, a hint (hours, booking, cost), Directions from the hotel, and Put on the plan, which
   goes into the next free slot that fits (the same free gaps as Fill it and the add box), 60 min unless the
   place says otherwise. Walking times: OSRM foot profile (routing.openstreetmap.de) from the hotel's door,
   2026-10-16, rounded. Pure apart from the styles it adds, so it can be tested (node --test still/test). */
(function (root) {
  "use strict";
  const MIN = 60000, WALK_MAX = 25;   // walking over 25 min also shows the quicker ride
  const STAYS = [
    { id:"madrid-marriott-princesa-plaza", match:/princesa\s+plaza/i, name:"Madrid Marriott Hotel Princesa Plaza", short:"Marriott Princesa Plaza",
      origin:"Madrid Marriott Hotel Princesa Plaza, Calle de Serrano Jover 3, 28015 Madrid",
      places:[
        { id:"gym", icon:"🏋️", name:"Hotel gym", walk:0, q:"Madrid Marriott Hotel Princesa Plaza, Madrid",
          what:"Free for guests: treadmills, bikes, elliptical, free weights, medicine balls, a bench and weight machines.",
          hint:"Hours are not published: ask the front desk.",
          photo:"https://cache.marriott.com/is/image/marriotts7prod/mc-madpp-fitness-area-35961:Feature-Hor?wid=1400&fit=constrain" },
        { id:"debod", icon:"🏛️", name:"Templo de Debod", walk:13, q:"Templo de Debod, Madrid",
          what:"A real ancient Egyptian temple on a hilltop park, with wide views over the city.",
          hint:"Free and outdoors. Lovely at sunset." },
        { id:"oeste", icon:"🌳", name:"Parque del Oeste", walk:14, q:"Rosaleda Ramón Ortiz, Parque del Oeste, Madrid",
          what:"A big green park right next to the temple, with a rose garden. An easy walk.",
          hint:"Free and outdoors." },
        { id:"liria", icon:"🖼️", name:"Palacio de Liria", walk:6, q:"Palacio de Liria, Calle de la Princesa 20, Madrid",
          what:"The House of Alba's 18th-century palace: Goya, Velázquez and Titian on the walls.",
          hint:"Visits are usually booked ahead. Hotel guests get a special rate: ask the desk." },
        { id:"cerralbo", icon:"🏠", name:"Museo Cerralbo", walk:11, q:"Museo Cerralbo, Madrid",
          what:"A rich family's 1800s mansion, kept just as they left it. About an hour inside.",
          hint:"Check today's hours before you go (closed Mondays)." },
        { id:"condeduque", icon:"☕", name:"Conde Duque and Malasaña", walk:10, q:"Centro Cultural Conde Duque, Madrid",
          what:"A cultural centre in an old barracks, then the lively café streets of Malasaña. Good for a bite.",
          hint:"Plaza del Dos de Mayo, the heart of Malasaña, is about 16 min on foot." },
        { id:"palacio", icon:"👑", name:"Royal Palace and Plaza de España", walk:23, q:"Palacio Real de Madrid",
          what:"Plaza de España on the way (11 min), then the Royal Palace and its gardens.",
          hint:"Palace tickets are best booked online. The metro is no quicker: walking is about as fast as Line 3 plus the walk from the station." },
      ] },
  ];

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  const hm = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}`;   // the page's own "1 hr 30 min"

  // texts: the place line first, then today's hotel events; the first one that names a stay wins
  function stayFor(texts, stays){
    const S = stays || STAYS;
    for (const t of texts || []) { if (!t) continue; const hit = S.find(s => s.match.test(String(t))); if (hit) return hit; }
    return null;
  }
  const title = stay => stay ? `Nearby · ${stay.short || stay.name}` : "Nearby";

  /* The travel-time chips for one place, quickest sensible first: walking when it is 25 min or less (0 is the
     hotel itself); else the quicker of transit and car, then the walk. */
  const ICON = { walking:"🚶", transit:"🚇", driving:"🚗" };
  function chips(p){
    const c = (mode, min) => ({ mode, icon:ICON[mode], min, label:hm(min) });
    if (p.walk === 0) return [{ mode:"walking", icon:"🏨", min:0, label:"In the hotel" }];
    const rides = [p.transit != null && c("transit", p.transit), p.car != null && c("driving", p.car)].filter(Boolean).sort((a, b) => a.min - b.min);
    if (p.walk != null && (p.walk <= WALK_MAX || !rides.length)) return [c("walking", p.walk)];
    return p.walk != null ? [rides[0], c("walking", p.walk)] : rides.slice(0, 1);
  }
  function directionsUrl(stay, p){
    const mode = (chips(p)[0] || {}).mode || "walking";
    return "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(stay.origin || stay.name) +
      "&destination=" + encodeURIComponent(p.q || p.name) + "&travelmode=" + mode;
  }
  const minFor = p => (p && p.min > 0 ? p.min : 60);
  // the first free gap (from the morning planner, already from now on) that fits, at its start
  function slotFor(gaps, min){
    const m = min || 60, g = (gaps || []).find(x => x.min >= m);
    return g ? { s:new Date(+g.s), e:new Date(+g.s + m * MIN) } : null;
  }

  /* The widget's inside. st: { open:{ id:true }, msg:{ id:text } }. Empty when the stay has no list. */
  function html(stay, st){
    if (!stay || !(stay.places || []).length) return "";
    const open = (st && st.open) || {}, msg = (st && st.msg) || {};
    return stay.places.map(p => {
      const on = !!open[p.id], cs = chips(p);
      const chip = cs.map(c => `<span class="nb-chip">${c.icon} ${esc(c.label)}</span>`).join("");
      const body = on ? `<div class="nb-body">
          ${p.photo ? `<img class="nb-photo" src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">` : ""}
          <div class="nb-what">${esc(p.what)}</div>${p.hint ? `<div class="nb-hint">${esc(p.hint)}</div>` : ""}
          <div class="nb-acts">${p.walk === 0 ? "" : `<a class="nb-btn" href="${esc(directionsUrl(stay, p))}" target="_blank" rel="noopener">Directions</a>`}
          <button class="nb-btn" data-nbplan="${esc(p.id)}">Put on the plan</button></div>
          ${msg[p.id] ? `<div class="nb-msg">${esc(msg[p.id])}</div>` : ""}</div>` : "";
      return `<div class="nb-row${on ? " open" : ""}"><button class="nb-head" data-nb="${esc(p.id)}" aria-expanded="${on}">
        <span class="nb-i">${esc(p.icon)}</span><span class="nb-n">${esc(p.name)}</span><span class="nb-chips">${chip}</span></button>${body}</div>`;
    }).join("");
  }

  const CSS = `
    #nearby .nb-row { border-bottom:1px solid rgba(255,255,255,.08); }
    #nearby .nb-row:last-child { border-bottom:0; }
    #nearby .nb-head { display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:9px 4px; background:none; color:inherit; border-radius:12px; }
    #nearby .nb-head:active { background:rgba(255,255,255,.08); }
    #nearby .nb-i { font-size:19px; width:26px; text-align:center; flex:none; }
    #nearby .nb-n { flex:1; min-width:0; font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #nearby .nb-chips { display:flex; gap:4px; flex:none; }
    #nearby .nb-chip { font-size:12px; color:var(--ink-soft); background:rgba(255,255,255,.1); border-radius:999px; padding:2px 8px; white-space:nowrap; }
    #nearby .nb-body { padding:0 4px 12px 40px; font-size:13px; color:var(--ink-soft); line-height:1.4; }
    #nearby .nb-what { color:var(--ink); } #nearby .nb-hint { margin-top:4px; color:var(--ink-faint); }
    #nearby .nb-photo { display:block; width:100%; max-width:260px; aspect-ratio:16/9; object-fit:cover; border-radius:12px; margin:2px 0 8px; background:rgba(255,255,255,.06); }
    #nearby .nb-acts { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
    #nearby .nb-btn { font-size:12px; font-weight:600; color:var(--ink); background:rgba(255,255,255,.18); border-radius:999px; padding:6px 12px; text-decoration:none; }
    #nearby .nb-msg { margin-top:6px; color:var(--good); }`;
  function addCss(doc){
    if (!doc || doc.getElementById("nb-css")) return;
    const s = doc.createElement("style"); s.id = "nb-css"; s.textContent = CSS; doc.head.appendChild(s);
  }

  root.QuestNearby = { STAYS, stayFor, title, chips, directionsUrl, minFor, slotFor, html, addCss, hm };
})(typeof window !== "undefined" ? window : globalThis);
