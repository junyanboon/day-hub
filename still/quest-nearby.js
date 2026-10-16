/* Day Quest Nearby: places near where he is staying (Junyan, 2026-10-16: "create a new widget on my quest with
   the options you presented. Everything should be collapsed and show the distance in terms of travel time (make
   a symbol to show walking, transit or car)").
   One small list per stay (STAYS). The stay is found from the place line still-api sends (where.from.place, the
   hotel's check-in event) or a hotel event on today's calendar; no list for the stay means no widget.
   Each row is shut by default: icon, name, travel time with its symbol (🚶 walking, 🚇 transit, 🚗 car).
   Tapping opens what it is, a hint (hours, booking, cost), Directions from the hotel, and Put on the plan, which
   goes into the next free slot that fits (the same free gaps as Fill it and the add box), 60 min unless the
   place says otherwise. Walking times: OSRM foot profile (routing.openstreetmap.de) from the hotel's door,
   2026-10-16, rounded. Pure apart from the styles it adds, so it can be tested (node --test still/test).
   Eat (Junyan, 2026-10-16: "I also need nearby suggestions as well for food in this widget ... don't make a separate
   widget put it seamlessly into the same widget"): a second tab in the same card, See & do | Eat. Food rows carry who
   they suit (he is vegetarian, egg-free, garlic-light; Caney likes soup and seafood; both eat healthy) and a rating.
   Near meal times the card opens on Eat. Which stay: each one carries its check-in and check-out from the calendar's
   hotel events, so the days between (no hotel event on them) still know the hotel; the text match is the fallback. */
(function (root) {
  "use strict";
  const MIN = 60000, WALK_MAX = 25;   // walking over 25 min also shows the quicker ride
  const STAYS = [
    { id:"madrid-marriott-princesa-plaza", match:/princesa\s+plaza/i, name:"Madrid Marriott Hotel Princesa Plaza", short:"Marriott Princesa Plaza",
      tz:"Europe/Madrid", in:"2026-10-16T13:00", out:"2026-10-20T12:00",   // early check-in 13:00; checkout by 12:00
      origin:"Madrid Marriott Hotel Princesa Plaza, Calle de Serrano Jover 3, 28015 Madrid",
      places:[
        { id:"gym", lat:40.4297, lng:-3.7144, icon:"🏋️", name:"Hotel gym", walk:0, q:"Madrid Marriott Hotel Princesa Plaza, Madrid",
          what:"Free for guests: treadmills, bikes, elliptical, free weights, medicine balls, a bench and weight machines.",
          hint:"Hours are not published: ask the front desk.",
          photo:"https://cache.marriott.com/is/image/marriotts7prod/mc-madpp-fitness-area-35961:Feature-Hor?wid=1400&fit=constrain" },
        { id:"debod", lat:40.4240689, lng:-3.7176131, icon:"🏛️", name:"Templo de Debod", walk:13, q:"Templo de Debod, Madrid",
          what:"A real ancient Egyptian temple on a hilltop park, with wide views over the city.",
          hint:"Free and outdoors. Lovely at sunset." },
        { id:"oeste", lat:40.4296961, lng:-3.7251884, icon:"🌳", name:"Parque del Oeste", walk:14, q:"Rosaleda Ramón Ortiz, Parque del Oeste, Madrid",
          what:"A big green park right next to the temple, with a rose garden. An easy walk.",
          hint:"Free and outdoors." },
        { id:"liria", lat:40.4276959, lng:-3.7123479, icon:"🖼️", name:"Palacio de Liria", walk:6, q:"Palacio de Liria, Calle de la Princesa 20, Madrid",
          what:"The House of Alba's 18th-century palace: Goya, Velázquez and Titian on the walls.",
          hint:"Visits are usually booked ahead. Hotel guests get a special rate: ask the desk." },
        { id:"cerralbo", lat:40.4237115, lng:-3.7145146, icon:"🏠", name:"Museo Cerralbo", walk:11, q:"Museo Cerralbo, Madrid",
          what:"A rich family's 1800s mansion, kept just as they left it. About an hour inside.",
          hint:"Check today's hours before you go (closed Mondays)." },
        { id:"condeduque", lat:40.427015, lng:-3.7108373, icon:"☕", name:"Conde Duque and Malasaña", walk:10, q:"Centro Cultural Conde Duque, Madrid",
          what:"A cultural centre in an old barracks, then the lively café streets of Malasaña. Good for a bite.",
          hint:"Plaza del Dos de Mayo, the heart of Malasaña, is about 16 min on foot." },
        { id:"palacio", lat:40.4167403, lng:-3.7136222, icon:"👑", name:"Royal Palace and Plaza de España", walk:23, q:"Palacio Real de Madrid",
          what:"Plaza de España on the way (11 min), then the Royal Palace and its gardens.",
          hint:"Palace tickets are best booked online. The metro is no quicker: walking is about as fast as Line 3 plus the walk from the station." },
      ],
      // Eat (2026-10-16): checked open with ratings and hours from each place's site, Google or HappyCow; walking
      // times OSRM foot from the hotel door. Best for both of them first.
      eat:[
        { id:"e-ramen-shifu", icon:"🍜", name:"Ramen Shifu Plaza España", walk:17, lat:40.42157, lng:-3.70938, q:"Ramen Shifu Plaza España, Calle de Isabel la Católica 15, Madrid", fits:"Vegan ramen for you, prawn for Caney", what:"A busy ramen bar with a real vegan list: you get the Miso Pinattsu or Dragon ramen (vegetable broth, plant protein, no egg), Caney gets the Ebi Shoyu prawn ramen.", hint:"Daily 1 to 4 pm and 7:30 to 11:15 pm. About €14 a bowl. Book for dinner (TheFork, or 911 44 84 02). Ask for no garlic oil.", rating:"4.7 Google (2,619 reviews)" },
        { id:"e-frutas", icon:"🥞", name:"Frutas Prohibidas", walk:8, lat:40.42747, lng:-3.71035, q:"Frutas Prohibidas, Calle del Conde Duque 26, Madrid", fits:"Healthy brunch for you both", what:"A much loved all plant based brunch café: the Benedict uses a plant egg (no real egg), or the seitan chilaquiles, with good coffee.", hint:"Wed to Sun 10 am to 6 pm, closed Mon and Tue. No bookings: get there at 10 to skip the queue.", rating:"4.8 Google (12,511 reviews)" },
        { id:"e-honest-greens", icon:"🥗", name:"Honest Greens Gran Vía", walk:19, lat:40.42112, lng:-3.70688, q:"Honest Greens, Gran Vía 52, Madrid", fits:"Healthy plates for you both", what:"A bright healthy food hall where you build a plate: herb tofu for you, salmon for Caney, both with roast veg and grains.", hint:"Every day from 8:30 am (9:30 weekends) to 11 pm, so it works for breakfast too. Order at the counter, no booking.", rating:"4.4 Google (2,367 reviews)" },
        { id:"e-vallehermoso", icon:"🏪", name:"Mercado de Vallehermoso", walk:12, lat:40.43417, lng:-3.70823, q:"Mercado de Vallehermoso, Calle de Vallehermoso 36, Madrid", fits:"Market stalls for you both", what:"A local market with good food stalls: seafood tostadas at Barra Lucas or a fish poke at Poké Friendly for Caney, tofu hand pulled noodles at Biáng Biáng Bar (ask for less garlic) or a vegan poke for you.", hint:"Mon to Sat 9 am to 11 pm, Sunday 12:30 to 5 pm only. Biáng Biáng is shut Monday, Poké Friendly Tuesday. Cheap.", rating:"4.4 Google (6,963 reviews)" },
        { id:"e-be-banh-mi", icon:"🍲", name:"Be Banh Mi", walk:17, lat:40.4229, lng:-3.70768, q:"Be Banh Mi Es Vietnam, Calle de San Bernardo 25, Madrid", fits:"Pho for Caney, tofu pho for you", what:"A small Vietnamese spot: you get the Pho Chay (vegetarian pho with tofu), Caney gets a big bowl of classic pho.", hint:"Every day 11 am to about 11 pm. Cheap, walk in. Ask them to leave off the fried garlic.", rating:"4.8 Google (2,587 reviews)" },
        { id:"e-hakuna", icon:"🥙", name:"Hakuna Matata Veggie", walk:6, lat:40.43092, lng:-3.7103, q:"Hakuna Matata Veggie, Calle de Galileo 12, Madrid", fits:"Hearty vegan food for you", what:"A cosy vegan place six minutes away: the lentil and shiitake burger or the Heura and almond pastela, filling plant protein mains.", hint:"Every day 1:30 to 5 pm and 7:30 to 11:30 pm. Book on their website for dinner. Mains €13 to €19.", rating:"4.6 Google (2,148 reviews)" },
        { id:"e-vega", icon:"🌱", name:"VEGA Álamo", walk:14, lat:40.42384, lng:-3.70912, q:"VEGA Alamo, Calle del Álamo 3, Madrid", fits:"Organic vegan dinner for you", what:"Organic vegan restaurant by Plaza de España: tofu meatballs or the chickpea and mushroom stew for you; Caney can share the artichokes.", hint:"Every day from 1:30 pm (1 pm weekends) to about 11:30 pm. Book online for dinner.", rating:"4.7 Google (2,620 reviews)" },
        { id:"e-thani", icon:"🦐", name:"Thani Cevichería", walk:13, lat:40.42483, lng:-3.71079, q:"Thani Cevicheria, Calle de San Leonardo 7, Madrid", fits:"Seafood soup and ceviche for Caney", what:"Peruvian seafood: Caney gets the chupe (creamy shrimp soup) or parihuela (seafood soup) and a ceviche. Few protein choices for you here.", hint:"Daily noon to 11 pm (Sunday to 5 pm). Book for Friday or Saturday night.", rating:"4.5 Google (1,668 reviews)" },
        { id:"e-sakana", icon:"🍣", name:"Sakana", walk:5, lat:40.43153, lng:-3.71592, q:"Sakana Restaurante, Calle de Gaztambide 11, Madrid", fits:"Sushi and fish for Caney", what:"Japanese two blocks from the hotel, with a good value lunch menu: sushi and sashimi for Caney. Tofu dishes not confirmed, so ask.", hint:"Closed Monday. 1:30 to 4:30 pm and 8:30 to 11:30 pm. Book on their website (it gives a discount).", rating:"4.8 Google (4,330 reviews)" },
      ] },
    { id:"manzanares-estudio-maeso", match:/maeso|isaac\s+peral/i, name:"ESTUDIO MAESO, Manzanares el Real", short:"La Pedriza", kind:"apartment",
      tz:"Europe/Madrid", in:"2026-10-20T18:00", out:"2026-10-22T13:00",   // check-in from 18:00; checkout by 13:00
      origin:"Calle de Isaac Peral 10, 28410 Manzanares el Real",
      places:[],
      // Eat (2026-10-16): the village is about 15 min on foot; midweek most kitchens serve lunch only, so dinner is
      // the hostel or the brewery bar. Walking OSRM foot from the apartment, Kapivar OSRM car.
      eat:[
        { id:"e-hostel", icon:"🌱", name:"Hostel La Pedriza", walk:18, lat:40.7261298, lng:-3.8662505, q:"Hostel La Pedriza, Calle Real 12, Manzanares el Real", fits:"Best veggie menu in the village", what:"A homey hostel restaurant with a real vegan section: hummus, vegan croquettes, ratatouille or a pumpkin burger for you; salmorejo or gazpacho (cold tomato soups), seafood pasta or salmon tartare for Caney.", hint:"Hours are not posted online: call 917 04 99 13 to check lunch and dinner. Mains €10 to €18.", rating:"4.5 Google (1,085 reviews)" },
        { id:"e-cervezas", icon:"🍺", name:"La Pedriza Cervezas Artesanas", walk:16, lat:40.7270615, lng:-3.8645898, q:"La Pedriza Cervezas Artesanas, Calle Cañada 24, Manzanares el Real", fits:"Easy dinner, good vegan food", what:"The village brewery's bar: chickpea and spinach curry or a chickpea burger with tabbouleh for you. Caney gets a relaxed meal, but little seafood or soup.", hint:"Every day 9 am to 11 pm, one of the few dinner spots Tue to Thu. No booking needed.", rating:"4.6 Google (269 reviews)" },
        { id:"e-los-morales", icon:"🐟", name:"Los Morales", walk:19, lat:40.728044, lng:-3.858766, q:"Restaurante Los Morales, Avenida de Madrid 24, Manzanares el Real", fits:"Fish for Caney, cheese plates for you", what:"The village's top rated grill house with a good fish list: grilled octopus, cuttlefish or corvina for Caney; burrata and tomato salad or the vegetable rice for you.", hint:"Lunch only Tue to Thu (9 am to 5 pm), closed Monday. Book ahead: 918 53 06 41. Mains €22 to €28.", rating:"4.5 Google (2,270 reviews)", min:90 },
        { id:"e-parra", icon:"🦐", name:"Restaurante Parra", walk:15, lat:40.7275195, lng:-3.865068, q:"Restaurante Parra, Calle de los Panaderos 13, Manzanares el Real", fits:"Lobster rice and fish for Caney", what:"A classic family restaurant in the centre: sea bass, scallops or the brothy lobster rice for Caney; burrata and avocado salad or baked provolone for you (ask for less garlic).", hint:"Lunch only Tue to Thu (8 am to 5 pm), closed Monday. Book on 918 53 95 77 and order the lobster rice ahead (for 2).", rating:"4.5 Google (1,861 reviews)", min:90 },
        { id:"e-kapivar", icon:"🥗", name:"Kapivar", car:20, lat:40.6654292, lng:-3.7711106, q:"Kapivar, Calle Molino de Viento 8, Colmenar Viejo", fits:"All vegan, a treat for you", what:"A fully vegan restaurant in Colmenar Viejo: the egg-free tofu potato omelette, burgers or artichokes for you; konjac 'calamari' for Caney to try.", hint:"Wed to Sat 12:30 to 5 pm and 8 pm to midnight, closed Mon and Tue. Call 643 895 106 to book.", rating:"4.9 Google (177 reviews)" },
        { id:"e-bm", icon:"🧺", name:"BM supermarket (picnic)", walk:14, lat:40.7284023, lng:-3.8649895, q:"BM Supermercados, Calle de los Panaderos 18, Manzanares el Real", fits:"Hike lunch for you both", what:"The village supermarket: bread, local Guadarrama cheese, hummus, fruit, nuts and tinned octopus or fish for a La Pedriza picnic.", hint:"Mon to Sat 9:30 am to 9 pm, Sunday to 2:30 pm. A Dia on Avenida de Madrid is the backup.", min:30 },
      ] },
    { id:"madrid-ac-hotel-airport", match:/\bAC\s+Hotel\s+Madrid\s+Airport|Calle\s+Rejas/i, name:"AC Hotel Madrid Airport", short:"AC Hotel Madrid Airport",
      tz:"Europe/Madrid", in:"2026-10-22T15:00", out:"2026-10-23T12:00",   // check-in from 15:00; flight home 12:00 on the 23rd
      origin:"AC Hotel Madrid Airport, Calle Rejas 5, Coslada, Madrid",
      places:[],
      // Eat (2026-10-16): the hotel sits in Coslada with nothing good on foot, so these are car or taxi times (OSRM car).
      eat:[
        { id:"e-daawat", icon:"🍛", name:"Daawat Indian", car:8, lat:40.4193526, lng:-3.5698289, q:"Daawat Indian, Calle Océano Atlántico 4, Coslada", fits:"Best dinner for you both", what:"Indian food: chana masala, dal or saag paneer for you (ask for little garlic); king prawn bhuna or salmon tikka for Caney.", hint:"Thursday dinner 8 to 11 pm (closed Tuesdays). Book on daawatindian.es. Mains €12 to €20.", rating:"4.9 Google (about 2,050 reviews)", min:75 },
        { id:"e-jumbo", icon:"🦐", name:"Restaurante Jumbo", car:9, lat:40.4708262, lng:-3.579162, q:"Restaurante Jumbo, Calle Gonzalo de Céspedes 20, Barajas, Madrid", fits:"Seafood soup for Caney", what:"Spanish and Peruvian in Barajas old town: parihuela seafood soup, ceviche or octopus for Caney; potatoes in cheese sauce and egg-free veggie fried rice for you.", hint:"Open about 8:30 am to 11 pm daily. Book on restaurantejumbo.es, it gets busy. Mains €15 to €20.", rating:"4.7 Google (6,780 reviews)", min:75 },
        { id:"e-healthy-poke", icon:"🥗", name:"Healthy Poke Plenilunio", car:9, lat:40.4469146, lng:-3.5871477, q:"Healthy Poke, Centro Comercial Plenilunio, Calle de Aracne 3, Madrid", fits:"Quick light dinner for you both", what:"Build your own poke bowl: soy protein, chickpeas, edamame and goat cheese for you; salmon or tuna for Caney.", hint:"Inside Plenilunio mall, open to about 11 pm. No booking. Under €15 each.", rating:"4.7 Google (1,186 reviews)", min:45 },
        { id:"e-ac-lounge", icon:"🏨", name:"AC Lounge (in the hotel)", walk:0, lat:40.4450413, lng:-3.5402316, q:"AC Hotel Madrid Airport, Calle Rejas 5, Coslada", fits:"Breakfast, or an easy night in", what:"The hotel's own bar and buffet breakfast. Fine for Caney; little real protein for you, so a backup if you are tired.", hint:"Breakfast 6:30 to 10 am weekdays, about €16.50 each. Free airport shuttle from about 7:10 am.", rating:"8.6/10 Trip.com (hotel overall)", min:45 },
        { id:"e-flax-kale", icon:"✈️", name:"Flax & Kale, T4 J gates", car:12, lat:40.4913335, lng:-3.59203, q:"Flax & Kale, Terminal 4, Aeropuerto Adolfo Suárez Madrid-Barajas", fits:"Breakfast before the flight", what:"A healthy café after security in T4: plant based bowls, salads and toasts for you, salmon dishes for Caney.", hint:"Opens 5:10 am. No booking, airport prices. The S gates branch is open 24 hours but rated lower.", rating:"4.7 Google (214 reviews)", min:45 },
      ] },
  ];

  /* Stays the weekly Nearby job adds (d3, 2026-10-16: "we already have brazil trip coming up"): it reads the
     calendar's stays for the weeks ahead, researches See & do and Eat for any stay not here yet, and keeps them on the Still
     server (GET /quest/nearby, behind the pairing code), same shape as above with match as a string. Added after the hand-made ones; an id
     already here is skipped. Returns how many were added. */
  function addStays(list, stays){
    const S = stays || STAYS; let n = 0;
    for (const x of list || []) {
      if (!x || !x.id || !x.in || !x.out || S.some(s => s.id === x.id)) continue;
      let match; try { match = new RegExp(x.match || x.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); } catch (e) { continue; }
      S.push({ ...x, match, places:x.places || [], eat:x.eat || [] }); n++;
    }
    return n;
  }

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  const hm = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}`;   // the page's own "1 hr 30 min"

  /* The wall clock at the stay, "2026-10-16T13:05", so a check-in time from the calendar compares as text. */
  function wall(at, tz){
    const d = at || new Date();
    try {
      const f = new Intl.DateTimeFormat("sv-SE", { timeZone:tz || "Europe/Madrid", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" });
      return f.format(d).replace(" ", "T");
    } catch (e) { return d.toISOString().slice(0, 16); }
  }
  /* By the calendar's stay times: the stay he is checked into now; between a checkout and the next check-in on the
     same day (moving day), the stay he is heading to. Stays without times are skipped here. */
  function stayAt(at, stays){
    const S = (stays || STAYS).filter(s => s.in && s.out);
    const here = S.find(s => { const w = wall(at, s.tz); return s.in <= w && w < s.out; });
    if (here) return here;
    return S.find(s => { const w = wall(at, s.tz); return s.in > w && s.in.slice(0, 10) === w.slice(0, 10); }) || null;
  }
  // texts: the place line first, then today's hotel events; the first one that names a stay wins.
  // at: now. When given, the calendar's stay times win over the text.
  function stayFor(texts, stays, at){
    const S = stays || STAYS;
    if (at) { const hit = stayAt(at, S); if (hit) return hit; }
    for (const t of texts || []) { if (!t) continue; const hit = S.find(s => s.match.test(String(t))); if (hit) return hit; }
    return null;
  }
  const title = stay => stay ? `Nearby · ${stay.short || stay.name}` : "Nearby";

  /* Distances. Straight-line distance times 1.3 for the streets, walked at 80 m a minute; past a 25 min walk, a
     ride at about 300 m a minute plus 3 to get going. Estimates, so the chip says "~". Used from the phone's position
     (read quietly when the page already may, kept in the page only, never saved or sent) and from a picked place. */
  const rad = d => d * Math.PI / 180;
  function metres(a, b){
    const dLa = rad(b.lat - a.lat), dLn = rad(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLn / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  }
  function fromHere(p, here){
    if (!here || !p || p.lat == null || p.lng == null) return null;
    const m = metres(here, p), walk = Math.max(1, Math.round(m * 1.3 / 80));
    return { m, walk, car: walk > WALK_MAX ? Math.round(m * 1.3 / 300) + 3 : null };
  }
  /* Always nearest first (d7, 2026-10-16: "it should just be ordered by distance automatically"): from the point
     when there is one, else by the stay's own travel minutes. A place with no position goes last, in its order. */
  function ordered(list, here){
    const d = here ? (p => { const f = fromHere(p, here); return f ? f.m : Infinity; })
      : (p => { const c = chips(p)[0]; return c ? c.min : Infinity; });
    return (list || []).map((p, i) => ({ p, i, d:d(p) })).sort((a, b) => a.d - b.d || a.i - b.i).map(x => x.p);
  }
  // the phone counts only when it is near the lists (within 15 km of a place), not from home or the airport
  const phoneNear = (list, here) => !!here && (list || []).some(p => p.lat != null && metres(here, p) < 15000);

  /* The day's places (d8, 2026-10-16: "a drop down tab where marriott princesa plaza is so I can choose the
     locations of that specific day"): the stay, then each of today's calendar events the daily Nearby job
     researched ahead (a spot: the event's address, with places to see and eat near it, kept on the Still server).
     A spot with `same` sits next to a stay or another spot and borrows its lists, sorted from the spot. */
  const SPOTS = [];
  function addSpots(list, spots){
    const S = spots || SPOTS; let n = 0;
    for (const x of list || []) {
      if (!x || !x.id || !x.name || !x.date || x.lat == null || x.lng == null || S.some(s => s.id === x.id)) continue;
      S.push(x); n++;
    }
    return n;
  }
  const dayOf = (at, tz) => wall(at, tz).slice(0, 10);
  function choices(stay, at, spots){
    const out = stay ? [{ id:"stay", label:stay.short || stay.name }] : [];
    for (const s of spots || SPOTS) if (s.date === dayOf(at, s.tz) && !out.some(o => o.id === s.id)) out.push({ id:s.id, label:s.name, ev:s.ev || "" });
    return out;
  }
  // what the card shows for a pick: its lists, where times are measured from, and where Directions start
  function view(stay, pick, at, spots, stays){
    const S = spots || SPOTS, ch = choices(stay, at, S), id = ch.some(c => c.id === pick) ? pick : (ch[0] || {}).id;
    const sp = id && id !== "stay" ? S.find(s => s.id === id) : null;
    if (!sp) return stay ? { key:stay.id, label:stay.short || stay.name, places:stay.places || [], eat:stay.eat || [], tz:stay.tz,
      from:null, origin:stay.origin || stay.name } : null;
    const src = sp.same ? ((stays || STAYS).find(x => x.id === sp.same) || S.find(x => x.id === sp.same) || null) : sp;
    if (!src) return null;
    return { key:sp.id, label:sp.name, places:src.places || [], eat:src.eat || [], tz:sp.tz || src.tz || (stay && stay.tz),
      from:{ lat:sp.lat, lng:sp.lng }, origin:sp.loc || sp.name };
  }
  /* The title: "Nearby · <the place>", a drop-down when the day has more than one place. when(ev) gives an event's
     time ("2:30 PM") so each event place says when they are there. */
  function picker(stay, st, at, spots, when){
    const ch = choices(stay, at, spots), v = view(stay, st && st.pick, at, spots);
    if (!v) return "Nearby";
    if (ch.length < 2) return `Nearby · ${esc(v.label)}`;
    const cur = v.key === (stay && stay.id) ? "stay" : v.key;
    return `Nearby · <select class="nb-pick" data-nbpick aria-label="Choose a place of the day">${ch.map(c => {
      const t = c.ev && when ? when(c.ev) : "";
      return `<option value="${esc(c.id)}"${c.id === cur ? " selected" : ""}>${esc(c.label)}${t ? ` · ${esc(t)}` : ""}</option>`;
    }).join("")}</select>`;
  }

  /* The travel-time chips for one place, quickest sensible first: walking when it is 25 min or less (0 is the
     hotel itself); else the quicker of transit and car, then the walk. */
  const ICON = { walking:"🚶", transit:"🚇", driving:"🚗" };
  function chips(p, here){
    const f = fromHere(p, here);
    if (f) {   // from where he is: the same rule on estimated minutes, marked "~"
      if (p.walk === 0 && f.m < 120) return [{ mode:"walking", icon:"🏨", min:0, label:"In the hotel" }];
      const est = chips({ walk:f.walk, car:f.car });
      return est.map(c => ({ ...c, label:"~" + c.label }));
    }
    const c = (mode, min) => ({ mode, icon:ICON[mode], min, label:hm(min) });
    if (p.walk === 0) return [{ mode:"walking", icon:"🏨", min:0, label:"In the hotel" }];
    const rides = [p.transit != null && c("transit", p.transit), p.car != null && c("driving", p.car)].filter(Boolean).sort((a, b) => a.min - b.min);
    if (p.walk != null && (p.walk <= WALK_MAX || !rides.length)) return [c("walking", p.walk)];
    return p.walk != null ? [rides[0], c("walking", p.walk)] : rides.slice(0, 1);
  }
  /* From the stay's door or the picked place; from the phone (a point marked phone), no origin, so Maps starts from
     where the phone is. */
  function directionsUrl(stay, p, here){
    const mode = (chips(p, here)[0] || {}).mode || "walking", phone = here && here.phone && fromHere(p, here);
    return "https://www.google.com/maps/dir/?api=1" + (phone ? "" : "&origin=" + encodeURIComponent(stay.origin || stay.name)) +
      "&destination=" + encodeURIComponent(p.q || p.name) + "&travelmode=" + mode;
  }
  const minFor = p => (p && p.min > 0 ? p.min : 60);
  // the first free gap (from the morning planner, already from now on) that fits, at its start
  function slotFor(gaps, min){
    const m = min || 60, g = (gaps || []).find(x => x.min >= m);
    return g ? { s:new Date(+g.s), e:new Date(+g.s + m * MIN) } : null;
  }

  /* d22 (later 2026-10-16, "the calendars need to simply stay synced"): Put on the plan for a gym makes a real
     "Gym · Jack Woods" event on his Junyan calendar, Grape (colorId 3) with a Day Quest note, as the weekly planner
     does. The /cal/event body for a place, or null when the place is not a gym (those stay today-only blocks). */
  const isGymPlace = p => !!p && (p.id === "gym" || /\bgym\b|fitness/i.test(p.name || ""));
  function gymEvent(stay, p, slot){
    if (!isGymPlace(p) || !slot) return null;
    const where = [p.name, stay && (stay.short || stay.name)].filter(Boolean).join(", ");
    return { s:new Date(+slot.s).toISOString(), e:new Date(+slot.e).toISOString(), title:"Gym · Jack Woods", color:"3",
      desc:`Placed by Day Quest from Nearby (${where}): this week's training (d109). Move it or delete it.` };
  }

  const TABS = [{ id:"see", label:"🗺️ See & do", list:"places" }, { id:"eat", label:"🍽️ Eat", list:"eat" }];
  const listOf = (stay, tab) => (stay && stay[(TABS.find(t => t.id === tab) || TABS[0]).list]) || [];
  const tabsOf = stay => TABS.filter(t => listOf(stay, t.id).length);
  // a place by id, from either list (ids are unique across a stay's lists)
  const find = (stay, id) => stay ? [].concat(stay.places || [], stay.eat || []).find(p => p.id === id) || null : null;
  /* The tab the card opens on: Eat around meal times at the stay (breakfast 8 to 10, lunch 13 to 15:30, dinner 20 to
     22:30, Spanish hours), else See & do; whichever the stay has. */
  function defaultTab(stay, at){
    const tabs = tabsOf(stay); if (!tabs.length) return null;
    if (tabs.length === 1) return tabs[0].id;
    const t = wall(at, stay.tz).slice(11), meal = (t >= "08:00" && t < "10:00") || (t >= "13:00" && t < "15:30") || (t >= "20:00" && t < "22:30");
    return meal ? "eat" : "see";
  }

  /* The widget's inside. st: { tab, pick, here, open:{ id:true }, msg:{ id:text } }. Empty when there is no list.
     Two tabs (See & do, Eat) when the place has both lists; a food row shows who it suits under its name. Rows are
     nearest first: from the picked event place, else from the phone when it is near, else by the stay's minutes. */
  function html(stay, st, at, spots){
    const v = view(stay, st && st.pick, at, spots), tabs = tabsOf(v); if (!v || !tabs.length) return "";
    const open = (st && st.open) || {}, msg = (st && st.msg) || {};
    const tab = tabs.some(t => t.id === (st && st.tab)) ? st.tab : defaultTab(v, at);
    const list = listOf(v, tab), phone = st && st.here ? { ...st.here, phone:true } : null;
    const pt = v.from || (phoneNear(list, phone) ? phone : null);
    const bar = tabs.length < 2 ? "" : `<div class="nb-bar"><div class="nb-tabs" role="tablist">${tabs.map(t =>
      `<button class="nb-tab${t.id === tab ? " on" : ""}" role="tab" aria-selected="${t.id === tab}" data-nbtab="${t.id}">${esc(t.label)}</button>`).join("")}</div></div>`;
    const note = v.from ? `<div class="nb-from">Rough times from ${esc(v.label)}.</div>`
      : pt ? `<div class="nb-from">Rough times from where you are.</div>` : "";
    return bar + note + ordered(list, pt).map(p => {
      const on = !!open[p.id], cs = chips(p, pt);
      const chip = cs.map(c => `<span class="nb-chip">${c.icon} ${esc(c.label)}</span>`).join("");
      const name = p.fits ? `<span class="nb-nm"><span class="nb-n">${esc(p.name)}</span><span class="nb-fit">${esc(p.fits)}</span></span>`
        : `<span class="nb-n">${esc(p.name)}</span>`;
      const body = on ? `<div class="nb-body">
          ${p.photo ? `<img class="nb-photo" src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">` : ""}
          <div class="nb-what">${esc(p.what)}</div>${p.hint ? `<div class="nb-hint">${esc(p.hint)}</div>` : ""}
          ${p.rating ? `<div class="nb-rate">⭐ ${esc(p.rating)}</div>` : ""}
          <div class="nb-acts">${p.walk === 0 && !v.from ? "" : `<a class="nb-btn" href="${esc(directionsUrl(v, p, pt))}" target="_blank" rel="noopener">Directions</a>`}
          <button class="nb-btn" data-nbplan="${esc(p.id)}">Put on the plan</button></div>
          ${msg[p.id] ? `<div class="nb-msg">${esc(msg[p.id])}</div>` : ""}</div>` : "";
      return `<div class="nb-row${on ? " open" : ""}"><button class="nb-head" data-nb="${esc(p.id)}" aria-expanded="${on}">
        <span class="nb-i">${esc(p.icon)}</span>${name}<span class="nb-chips">${chip}</span></button>${body}</div>`;
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
    #nearby .nb-msg { margin-top:6px; color:var(--good); }
    #nearby .nb-bar { display:flex; gap:6px; align-items:center; margin:0 0 6px; }
    #nearby .nb-tabs { flex:1; display:flex; gap:4px; padding:3px; background:rgba(255,255,255,.08); border-radius:999px; }
    #nearbyH .nb-pick { font:inherit; letter-spacing:inherit; text-transform:inherit; color:inherit; max-width:min(70vw, 340px);
      background:rgba(255,255,255,.12) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23fff' stroke-width='1.6' fill='none'/%3E%3C/svg%3E") no-repeat right 8px center;
      border:0; border-radius:8px; padding:3px 24px 3px 8px; -webkit-appearance:none; appearance:none; text-overflow:ellipsis; cursor:pointer; }
    #nearbyH .nb-pick option { color:#111; text-transform:none; letter-spacing:normal; }
    #nearby .nb-from { font-size:12px; color:var(--ink-faint); margin:0 4px 4px; }
    #nearby .nb-tab { flex:1; font-size:13px; font-weight:600; color:var(--ink-soft); background:none; border-radius:999px; padding:6px 10px; white-space:nowrap; }
    #nearby .nb-tab.on { color:var(--ink); background:rgba(255,255,255,.2); }
    #nearby .nb-nm { flex:1; min-width:0; display:flex; flex-direction:column; }
    #nearby .nb-nm .nb-n { flex:none; }
    #nearby .nb-fit { font-size:12px; color:var(--ink-faint); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #nearby .nb-rate { margin-top:4px; color:var(--ink-soft); }`;
  function addCss(doc){
    if (!doc || doc.getElementById("nb-css")) return;
    const s = doc.createElement("style"); s.id = "nb-css"; s.textContent = CSS; doc.head.appendChild(s);
  }

  root.QuestNearby = { STAYS, SPOTS, TABS, addStays, addSpots, choices, view, picker, phoneNear, metres, fromHere, ordered, stayFor, stayAt, wall, defaultTab, tabsOf, find, title, chips, directionsUrl, minFor, slotFor, isGymPlace, gymEvent, html, addCss, hm };
})(typeof window !== "undefined" ? window : globalThis);
