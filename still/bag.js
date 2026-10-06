/*
  Day Quest bag (inventory), d103, 2026-10-06.

  Items are practical aids Junyan uses in the moment, not rewards.
  window.Bag = { ITEMS, mount(el, ctx), mountQuick(el, ctx?), render(), give(id, n, why), openItem(id), use(id) }

  ctx = {
    getState: () => G,          // the game state; the bag lives at G.bag (created if missing).
                                // Returning the bag object itself also works.
    save: () => {},             // persist G
    actions: { water: async (item, opts) => "result text", ... },
    openBag: () => {}           // optional: tap on an empty main-screen quick slot
  }
  G.bag = { slots:[id|null x16], quick:[id|null x3], counts:{id:n}, seen:{id:true}, log:[], timer? }

  Breath Card and Focus Bell run inside the bag (breath overlay, 50 min timer with a soft chime);
  their actions are still called (breath at the end with {completed, seconds}, bell at the start
  with {minutes, endsAt}) so the game can log them. Recovery Lotus asks which practice first and
  passes {choice}. Every other item just calls its action. Using an item uses up one.
*/
(function () {
  'use strict';

  const ITEMS = {
    breath: { id: 'breath', name: 'Breath Card', rarity: 'common',
      flavour: 'A card that remembers how slow air feels.',
      does: 'A 3-minute guided breath: in 4, hold 4, out 6.',
      found: 'After Shambhavi.',
      done: 'Three slow minutes. Notice how you feel now.' },
    water: { id: 'water', name: 'Water Flask', rarity: 'common',
      flavour: 'Cold, clear, and always lighter than you think.',
      does: 'Logs 500 ml of water.',
      found: 'At each meal.',
      done: '500 ml of water logged.' },
    buffer: { id: 'buffer', name: 'Buffer Stone', rarity: 'rare',
      flavour: 'A smooth stone that holds a little extra time.',
      does: 'Adds 15 minutes before your next block.',
      found: 'After 3 on-time starts.',
      done: '15 minutes added before your next block.' },
    map: { id: 'map', name: 'Trail Map', rarity: 'rare',
      flavour: 'The trail bends. The map bends with it.',
      does: 'Replans the rest of your day.',
      found: 'After you log that something came up.',
      done: 'The rest of your day is replanned.' },
    scout: { id: 'scout', name: 'Scout Owl', rarity: 'rare',
      flavour: 'Flies ahead and comes back knowing more.',
      does: 'Asks the insight agent to research an upcoming event.',
      found: 'After you finish a prep list.',
      done: 'The Scout Owl is off to research.' },
    lantern: { id: 'lantern', name: 'Lantern', rarity: 'rare',
      flavour: 'Its light says the day is done.',
      does: 'Starts your wind-down now.',
      found: 'After an on-time bedtime.',
      done: 'Wind-down starts now.' },
    bell: { id: 'bell', name: 'Focus Bell', rarity: 'rare',
      flavour: 'One clear note, fifty minutes on.',
      does: 'A 50-minute focus timer with a soft chime at the end.',
      found: 'After you close a work block.',
      done: 'Focus Bell set for 50 minutes.' },
    lotus: { id: 'lotus', name: 'Recovery Lotus', rarity: 'sacred',
      flavour: 'It opens only when you need rest.',
      does: 'Turns this block into recovery: Isha Kriya, Upa Yoga or NSDR.',
      found: 'Given when your energy is low.',
      done: 'This block is now recovery.',
      choices: ['Isha Kriya', 'Upa Yoga', 'NSDR'] }
  };
  const RARITY = { common: 'Common', rare: 'Rare', sacred: 'Sacred' };
  const GRID = 16, QUICK = 3;
  const BREATH_SECS = 180, FOCUS_MIN = 50;

  let ctx = { getState: null, save: null, actions: {} };
  const mounts = [];          // { el, kind: 'bag' | 'quick' }
  let layer = null, sheet = null, overlay = null;
  let uid = 0, drag = null, lastDragEnd = 0, pendingRender = false;
  let ticker = null, audio = null, wakeLock = null;
  const fallback = {};

  /* ---------------- state ---------------- */
  function bag() {
    let s = null;
    try { s = ctx.getState ? ctx.getState() : null; } catch (e) { console.warn('Bag getState failed', e); }
    if (!s || typeof s !== 'object') s = fallback;
    let b;
    if (Array.isArray(s.slots)) b = s;
    else { if (!s.bag || typeof s.bag !== 'object') s.bag = {}; b = s.bag; }
    normalise(b);
    return b;
  }
  function normalise(b) {
    if (!Array.isArray(b.slots)) b.slots = [];
    if (!Array.isArray(b.quick)) b.quick = [];
    if (!b.counts || typeof b.counts !== 'object') b.counts = {};
    if (!b.seen || typeof b.seen !== 'object') b.seen = {};
    if (!Array.isArray(b.log)) b.log = [];
    for (let i = 0; i < GRID; i++) if (b.slots[i] === undefined) b.slots[i] = null;
    for (let i = 0; i < QUICK; i++) if (b.quick[i] === undefined) b.quick[i] = null;
    b.slots.length = GRID; b.quick.length = QUICK;
    const placed = {};
    const fix = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        const id = arr[i];
        if (id == null) { arr[i] = null; continue; }
        if (!ITEMS[id] || !(b.counts[id] > 0) || placed[id]) arr[i] = null; else placed[id] = true;
      }
    };
    fix(b.quick); fix(b.slots);
    for (const id of Object.keys(b.counts)) {
      if (!ITEMS[id] || !(b.counts[id] > 0)) { delete b.counts[id]; continue; }
      if (!placed[id]) {
        let i = b.slots.indexOf(null);
        if (i >= 0) b.slots[i] = id; else if ((i = b.quick.indexOf(null)) >= 0) b.quick[i] = id; else continue;
        placed[id] = true;
      }
    }
  }
  function save() { try { ctx.save && ctx.save(); } catch (e) { console.warn('Bag save failed', e); } }
  function logEv(b, ev) { ev.t = Date.now(); b.log.push(ev); if (b.log.length > 60) b.log.splice(0, b.log.length - 60); }
  function getLoc(b, loc) { const p = loc.split(':'); return (p[0] === 'q' ? b.quick : b.slots)[+p[1]] || null; }
  function setLoc(b, loc, v) { const p = loc.split(':'); (p[0] === 'q' ? b.quick : b.slots)[+p[1]] = v || null; }
  function locOf(b, id) {
    let i = b.quick.indexOf(id); if (i >= 0) return 'q:' + i;
    i = b.slots.indexOf(id); return i >= 0 ? 's:' + i : null;
  }
  function consume(b, id) {
    const n = (b.counts[id] || 0) - 1;
    if (n > 0) b.counts[id] = n;
    else { delete b.counts[id]; const loc = locOf(b, id); if (loc) setLoc(b, loc, null); }
  }

  /* ---------------- illustrations ---------------- */
  const star = (x, y, r) => `M${x} ${y - r}L${x + r * .24} ${y - r * .24}L${x + r} ${y}L${x + r * .24} ${y + r * .24}L${x} ${y + r}L${x - r * .24} ${y + r * .24}L${x - r} ${y}L${x - r * .24} ${y - r * .24}Z`;
  function wave(y, a) { let d = `M-60 ${y} q7.5 ${-a} 15 0 `; for (let i = 1; i < 16; i++) d += 't15 0 '; return d + 'V124 H-60 Z'; }
  const FLASK = 'M52 26 L52 48 C37 53 28 64 28 78 C28 96 42 108 60 108 C78 108 92 96 92 78 C92 64 83 53 68 48 L68 26 Z';
  const STONE = 'M24 70 C22 52 38 39 60 38 C84 37 99 50 98 67 C97 85 80 95 58 95 C38 95 25 86 24 70 Z';
  const RUNE = 'M51 55 H69 L60 66 L69 77 H51 L60 66 Z';
  const SHEET = 'M24 26 C38 23 50 28 60 25 C70 22 82 27 96 24 L96 94 C82 97 70 92 60 95 C50 98 38 93 24 96 Z';
  const OWL = 'M60 20 C80 20 91 38 91 60 C91 84 78 98 60 98 C42 98 29 84 29 60 C29 38 40 20 60 20 Z';
  const BELL = 'M60 24 C46 24 41 36 41 51 C41 65 37 73 28 80 H92 C83 73 79 65 79 51 C79 36 74 24 60 24 Z';
  const PETAL = 'M60 88 C46 76 44 54 60 30 C76 54 74 76 60 88 Z';
  const LOW_L = 'M60 88 C46 88 30 80 23 66 C40 63 54 71 60 88 Z';
  const LOW_R = 'M60 88 C74 88 90 80 97 66 C80 63 66 71 60 88 Z';
  const ptf = (a, s) => `transform="rotate(${a} 60 88) translate(60 88) scale(${s}) translate(-60 -88)"`;

  const ART = {
    breath: (u) => `
<defs>
 <linearGradient id="${u}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3489ad"/><stop offset=".5" stop-color="#27457f"/><stop offset="1" stop-color="#2a2163"/></linearGradient>
 <linearGradient id="${u}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22306a"/><stop offset="1" stop-color="#141a3e"/></linearGradient>
 <linearGradient id="${u}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#9aa6c6"/><stop offset=".62" stop-color="#eef2ff"/><stop offset="1" stop-color="#8590b2"/></linearGradient>
 <radialGradient id="${u}o" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f2fdff"/><stop offset=".35" stop-color="#9fe8ff"/><stop offset=".75" stop-color="#4aa8ff" stop-opacity=".45"/><stop offset="1" stop-color="#4aa8ff" stop-opacity="0"/></radialGradient>
 <radialGradient id="${u}v" cx="50%" cy="40%" r="72%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#050a26" stop-opacity=".6"/></radialGradient>
 <linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
 <clipPath id="${u}k"><rect x="30" y="13" width="60" height="90" rx="8"/></clipPath>
</defs>
<ellipse cx="60" cy="111" rx="31" ry="4.5" fill="#000" opacity=".38"/>
<g transform="rotate(-8 60 58)">
 <rect x="30" y="13" width="60" height="90" rx="8" fill="url(#${u}b)" stroke="url(#${u}f)" stroke-opacity=".5" stroke-width="1.4" transform="rotate(15 60 100)"/>
 <rect x="30" y="13" width="60" height="90" rx="8" fill="url(#${u}c)"/>
 <g clip-path="url(#${u}k)">
  <circle cx="40" cy="25" r=".9" fill="#fff" opacity=".75"/><circle cx="79" cy="30" r=".7" fill="#fff" opacity=".6"/>
  <circle cx="75" cy="92" r=".8" fill="#fff" opacity=".5"/><circle cx="43" cy="95" r=".6" fill="#fff" opacity=".6"/>
  <circle cx="60" cy="52" r="27" fill="none" stroke="#bfefff" stroke-opacity=".25" stroke-width=".8" stroke-dasharray="1.5 2.5"/>
  <circle cx="60" cy="52" r="21" fill="none" stroke="#bfefff" stroke-opacity=".38" stroke-width="1"/>
  <g class="ba-core"><circle cx="60" cy="52" r="18" fill="url(#${u}o)"/></g>
  <circle cx="60" cy="52" r="4.6" fill="#f4feff" opacity=".92"/>
  <path d="M37 79 c7 -6 15 -6 21 -1 s15 5 24 -1" fill="none" stroke="#d2f1ff" stroke-opacity=".75" stroke-width="1.7" stroke-linecap="round"/>
  <path d="M41 87.5 c5 -4 11 -4 15 -1 s11 4 17 -1" fill="none" stroke="#d2f1ff" stroke-opacity=".45" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M82 78 c3 -1 4.5 -4 2.5 -6 c-2 -2 -5 0 -4 2.2" fill="none" stroke="#d2f1ff" stroke-opacity=".6" stroke-width="1.3" stroke-linecap="round"/>
  <rect width="120" height="120" fill="url(#${u}v)"/>
  <g class="ba-sheen"><rect x="0" y="0" width="22" height="130" fill="url(#${u}s)" transform="skewX(-18)"/></g>
 </g>
 <rect x="30" y="13" width="60" height="90" rx="8" fill="none" stroke="url(#${u}f)" stroke-width="2.3"/>
 <rect x="35" y="18" width="50" height="80" rx="5" fill="none" stroke="#dcecff" stroke-opacity=".42" stroke-width=".8"/>
 <path d="${star(35, 18, 3)}${star(85, 18, 3)}${star(35, 98, 3)}${star(85, 98, 3)}" fill="#eef3ff"/>
 <path d="M36 14.4 H80" stroke="#fff" stroke-opacity=".6" stroke-width="1" stroke-linecap="round"/>
</g>`,

    water: (u) => `
<defs>
 <radialGradient id="${u}g" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#e8f6ff" stop-opacity=".38"/><stop offset=".6" stop-color="#9fd0ff" stop-opacity=".12"/><stop offset="1" stop-color="#3a6fb0" stop-opacity=".38"/></radialGradient>
 <linearGradient id="${u}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86ecff"/><stop offset=".42" stop-color="#2f9bea"/><stop offset="1" stop-color="#163a92"/></linearGradient>
 <radialGradient id="${u}i" cx="50%" cy="45%" r="58%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#06143a" stop-opacity=".55"/></radialGradient>
 <linearGradient id="${u}c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e4220"/><stop offset=".35" stop-color="#dcae78"/><stop offset="1" stop-color="#5f3818"/></linearGradient>
 <linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
 <clipPath id="${u}k"><path d="${FLASK}"/></clipPath>
</defs>
<ellipse cx="60" cy="111" rx="28" ry="4.5" fill="#000" opacity=".38"/>
<g clip-path="url(#${u}k)">
 <rect width="120" height="120" fill="url(#${u}g)"/>
 <g class="ba-wave2"><path d="${wave(69, 4)}" fill="#47b6f6" opacity=".55"/></g>
 <g class="ba-wave"><path d="${wave(72, 3.5)}" fill="url(#${u}w)"/></g>
 <g class="ba-shim"><rect x="20" y="66" width="14" height="50" fill="url(#${u}s)" transform="skewX(-20)"/></g>
 <circle class="ba-bub" cx="50" cy="102" r="1.7" fill="#e3f8ff"/>
 <circle class="ba-bub" cx="66" cy="104" r="1.2" fill="#e3f8ff" style="animation-delay:1.1s"/>
 <circle class="ba-bub" cx="58" cy="100" r="1" fill="#e3f8ff" style="animation-delay:2.2s"/>
 <rect width="120" height="120" fill="url(#${u}i)"/>
</g>
<path d="${FLASK}" fill="none" stroke="#d8efff" stroke-opacity=".8" stroke-width="1.6"/>
<path d="M37 70 C34 82 39 95 49 101" fill="none" stroke="#fff" stroke-opacity=".62" stroke-width="3.2" stroke-linecap="round"/>
<path d="M55.5 29 L55.5 46" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>
<circle cx="43" cy="63" r="2.4" fill="#fff" opacity=".85"/>
<path d="M86 69 C89.5 82 84 96 73 102" fill="none" stroke="#a6e4ff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/>
<rect x="49" y="21" width="22" height="6" rx="3" fill="#cfe9ff" fill-opacity=".35" stroke="#e6f4ff" stroke-opacity=".85" stroke-width="1.2"/>
<path d="M52 9 h16 a2 2 0 0 1 2 2 l-1 12 h-18 l-1 -12 a2 2 0 0 1 2 -2z" fill="url(#${u}c)"/>
<ellipse cx="60" cy="9.6" rx="8" ry="2" fill="#ecc795"/>
<circle cx="56" cy="15" r=".7" fill="#5a3416" opacity=".6"/><circle cx="63" cy="18" r=".6" fill="#5a3416" opacity=".6"/>
<path d="M51 32.5 q9 3 18 0 M51 36 q9 3 18 0" fill="none" stroke="#c9a46a" stroke-width="1.8"/>
<path d="M68 35 l6 8" stroke="#c9a46a" stroke-width="1.2"/>
<rect x="71.5" y="41.5" width="10" height="7.5" rx="1.6" transform="rotate(22 76 45)" fill="#efdcb2"/>`,

    buffer: (u) => `
<defs>
 <radialGradient id="${u}s" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#eef0ff"/><stop offset=".28" stop-color="#a3a6dc"/><stop offset=".68" stop-color="#5a5aa0"/><stop offset="1" stop-color="#28285a"/></radialGradient>
 <radialGradient id="${u}h" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 <radialGradient id="${u}g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#cdbfff" stop-opacity=".95"/><stop offset="1" stop-color="#7a63ff" stop-opacity="0"/></radialGradient>
 <radialGradient id="${u}i" cx="45%" cy="35%" r="68%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0a0c24" stop-opacity=".65"/></radialGradient>
 <clipPath id="${u}k"><path d="${STONE}"/></clipPath>
</defs>
<ellipse cx="60" cy="103" rx="42" ry="5" fill="#000" opacity=".42"/>
<g transform="translate(60 67) scale(1.12) translate(-60 -67)">
<ellipse class="ba-orbit" cx="60" cy="68" rx="52" ry="15" fill="none" stroke="#a796ff" stroke-opacity=".45" stroke-width="1.4" stroke-dasharray="3 5"/>
<path d="${STONE}" fill="url(#${u}s)"/>
<g clip-path="url(#${u}k)">
 <circle cx="38" cy="78" r="1.2" fill="#1d2245" opacity=".45"/><circle cx="82" cy="58" r="1" fill="#1d2245" opacity=".4"/>
 <circle cx="74" cy="84" r="1.4" fill="#1d2245" opacity=".35"/><circle cx="46" cy="86" r=".9" fill="#e6eaff" opacity=".3"/>
 <circle cx="88" cy="74" r=".8" fill="#e6eaff" opacity=".3"/><circle cx="34" cy="62" r=".8" fill="#e6eaff" opacity=".35"/>
 <rect width="120" height="120" fill="url(#${u}i)"/>
 <ellipse cx="44" cy="50" rx="17" ry="7" fill="url(#${u}h)" transform="rotate(-18 44 50)"/>
</g>
<path d="M95.5 72 C92 86 78 95 58 95" fill="none" stroke="#b3a4ff" stroke-width="2" stroke-linecap="round" opacity=".85"/>
<path d="M30 58 C36 45 48 39.5 60 38.6" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="1.2" stroke-linecap="round"/>
<circle class="ba-rune" cx="60" cy="66" r="19" fill="url(#${u}g)" opacity=".6"/>
<path d="${RUNE}" fill="none" stroke="#151935" stroke-width="2.6" stroke-linejoin="round" transform="translate(.6 .9)" opacity=".75"/>
<g class="ba-rune">
 <path d="${RUNE}" fill="none" stroke="#b9a9ff" stroke-width="4.6" stroke-linejoin="round" opacity=".42"/>
 <path d="${RUNE}" fill="none" stroke="#f3efff" stroke-width="1.6" stroke-linejoin="round"/>
 <path d="M55.5 75.2 L64.5 75.2 L60 70.4 Z" fill="#ebe4ff" opacity=".9"/><circle cx="60" cy="67.2" r=".9" fill="#fff"/>
</g>
<path class="ba-orbit" d="M8 68 A52 15 0 0 0 112 68" fill="none" stroke="#cfc3ff" stroke-opacity=".8" stroke-width="1.6" stroke-dasharray="3 5"/>
</g>`,

    map: (u) => `
<defs>
 <linearGradient id="${u}p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9ecc9"/><stop offset=".5" stop-color="#ecd29d"/><stop offset="1" stop-color="#d4ad72"/></linearGradient>
 <radialGradient id="${u}e" cx="50%" cy="50%" r="64%"><stop offset=".58" stop-color="#7a4a1c" stop-opacity="0"/><stop offset="1" stop-color="#6b3c12" stop-opacity=".6"/></radialGradient>
 <linearGradient id="${u}r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e4420"/><stop offset=".42" stop-color="#f5ddac"/><stop offset=".7" stop-color="#c79a5e"/><stop offset="1" stop-color="#5e3916"/></linearGradient>
 <radialGradient id="${u}g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff2b8"/><stop offset=".5" stop-color="#ffd479" stop-opacity=".55"/><stop offset="1" stop-color="#ffb84a" stop-opacity="0"/></radialGradient>
 <clipPath id="${u}k"><path d="${SHEET}"/></clipPath>
</defs>
<ellipse cx="60" cy="105" rx="44" ry="5" fill="#000" opacity=".38"/>
<path d="${SHEET}" fill="url(#${u}p)"/>
<g clip-path="url(#${u}k)">
 <path d="M48 20 V100 M72 20 V100" stroke="#a87a45" stroke-opacity=".38" stroke-width="1"/>
 <path d="M49 20 V100 M73 20 V100" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/>
 <path d="M26 60 C36 55 42 67 52 63 S68 55 76 66 S88 71 98 64" fill="none" stroke="#5b9bd1" stroke-width="3.2" stroke-linecap="round" opacity=".75"/>
 <path d="M26 59 C36 54 42 66 52 62" fill="none" stroke="#e8f4ff" stroke-width=".8" opacity=".6"/>
 <path d="M30 49 L38 35 L46 49 Z M39 49 L48 31 L57 49 Z" fill="#8a6a44"/>
 <path d="M38 35 L46 49 H41 Z M48 31 L57 49 H51 Z" fill="#5e4528" opacity=".55"/>
 <path d="M38 35 L40.4 39.2 H35.6 Z M48 31 L50.7 36.4 H45.3 Z" fill="#fffaf0"/>
 <circle cx="66" cy="40" r="3.2" fill="#4f7c4a"/><circle cx="71.5" cy="43.5" r="2.6" fill="#5f8f55"/><circle cx="38" cy="73" r="2.8" fill="#4f7c4a"/>
 <path class="ba-trail" d="M33 88 C42 84 46 76 55 77 C66 78 64 62 74 56 C80 52 82 46 85 41" fill="none" stroke="#a3322a" stroke-width="2.1" stroke-linecap="round" stroke-dasharray="3 3"/>
 <circle cx="33" cy="88" r="2.4" fill="#a3322a"/>
 <g transform="translate(83 82)"><circle r="7.5" fill="#f6e6bf" stroke="#8a5a2a" stroke-width="1"/><path d="M0 -6.2 L1.7 0 L0 6.2 L-1.7 0 Z" fill="#a3322a"/><path d="M-6 0 L0 1.4 L6 0 L0 -1.4 Z" fill="#6b4a2a" opacity=".8"/><circle r="1" fill="#f6e6bf"/></g>
 <rect width="120" height="120" fill="url(#${u}e)"/>
</g>
<circle class="ba-pulse" cx="86" cy="38" r="10" fill="url(#${u}g)"/>
<path d="M82.5 34.5 L89.5 41.5 M89.5 34.5 L82.5 41.5" stroke="#b3261e" stroke-width="2.7" stroke-linecap="round"/>
<rect x="17.5" y="21" width="10" height="78" rx="5" fill="url(#${u}r)"/>
<ellipse cx="22.5" cy="21.6" rx="5" ry="2" fill="#5a3412"/><ellipse cx="22.5" cy="98.4" rx="5" ry="2" fill="#7e5226"/>
<rect x="92.5" y="19" width="10" height="78" rx="5" fill="url(#${u}r)"/>
<ellipse cx="97.5" cy="19.6" rx="5" ry="2" fill="#5a3412"/><ellipse cx="97.5" cy="96.4" rx="5" ry="2" fill="#7e5226"/>
<path d="M21 25 V95 M96 23 V93" stroke="#fff6dc" stroke-opacity=".7" stroke-width="1" stroke-linecap="round"/>
<path d="M102 24 V92" stroke="#b3a4ff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>`,

    scout: (u) => {
      const chev = [[54, 68], [66, 68], [48, 76], [60, 76], [72, 76], [54, 84], [66, 84]]
        .map(([x, y]) => `M${x - 2.6} ${y} l2.6 2.6 l2.6 -2.6`).join(' ');
      const eye = (cx) => `<circle cx="${cx}" cy="48" r="9" fill="url(#${u}e)"/><circle cx="${cx}" cy="48" r="9" fill="none" stroke="#2a1a0e" stroke-width="1.2"/>
 <circle cx="${cx}" cy="48.6" r="4.4" fill="#120b06"/><circle cx="${cx - 2.6}" cy="45.6" r="2" fill="#fff"/><circle cx="${cx + 2.3}" cy="51" r=".9" fill="#fff" opacity=".7"/>`;
      return `
<defs>
 <radialGradient id="${u}b" cx="50%" cy="28%" r="78%"><stop offset="0" stop-color="#cdb597"/><stop offset=".45" stop-color="#8b6b4f"/><stop offset="1" stop-color="#3a291e"/></radialGradient>
 <linearGradient id="${u}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5c45"/><stop offset="1" stop-color="#2b1e16"/></linearGradient>
 <radialGradient id="${u}y" cx="50%" cy="38%" r="62%"><stop offset="0" stop-color="#fcf3e0"/><stop offset="1" stop-color="#cdae88"/></radialGradient>
 <radialGradient id="${u}d" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f4e9d3"/><stop offset=".78" stop-color="#cbad88"/><stop offset="1" stop-color="#8b6b4f"/></radialGradient>
 <radialGradient id="${u}e" cx="45%" cy="40%" r="62%"><stop offset="0" stop-color="#fff7bf"/><stop offset=".45" stop-color="#ffc83d"/><stop offset="1" stop-color="#d06a0c"/></radialGradient>
 <linearGradient id="${u}k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#b8741a"/></linearGradient>
 <linearGradient id="${u}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d5435"/><stop offset="1" stop-color="#3b2414"/></linearGradient>
</defs>
<ellipse cx="60" cy="109" rx="36" ry="4" fill="#000" opacity=".35"/>
<path d="M10 100 C36 93 78 98 110 90" fill="none" stroke="url(#${u}r)" stroke-width="7" stroke-linecap="round"/>
<path d="M14 97.6 C38 91 76 95.6 106 88" fill="none" stroke="#b08458" stroke-width="1.1" opacity=".6" stroke-linecap="round"/>
<path d="M97 91 C103 82 113 81 116 83 C112 92 104 94 97 91 Z" fill="#62a05d"/><path d="M97 91 L114 83.6" stroke="#3a6a37" stroke-width=".8"/>
<path d="M52 92 L60 104 L68 92 Z" fill="#3a291e"/>
<path d="M37 33 L30 12 L50 27 Z" fill="url(#${u}w)"/><path d="M83 33 L90 12 L70 27 Z" fill="url(#${u}w)"/>
<path d="${OWL}" fill="url(#${u}b)"/>
<path d="M31 52 C21 66 23 86 38 95 C35 81 37 66 43 56 Z" fill="url(#${u}w)"/>
<path d="M89 52 C99 66 97 86 82 95 C85 81 83 66 77 56 Z" fill="url(#${u}w)"/>
<path d="M29 66 C30 76 33 84 37 90 M33 62 C34 72 36 80 39 86 M91 66 C90 76 87 84 83 90 M87 62 C86 72 84 80 81 86" fill="none" stroke="#c9b193" stroke-opacity=".28" stroke-width="1"/>
<ellipse cx="60" cy="76" rx="18" ry="19" fill="url(#${u}y)"/>
<path d="${chev}" fill="none" stroke="#8b6b4f" stroke-width="1.15" stroke-linecap="round" opacity=".85"/>
<circle cx="47" cy="47" r="14" fill="url(#${u}d)"/><circle cx="73" cy="47" r="14" fill="url(#${u}d)"/>
<path d="M33 40 C40 33 52 34 59 42 M87 40 C80 33 68 34 61 42" fill="none" stroke="#3a291e" stroke-width="2.4" stroke-linecap="round"/>
${eye(47)}${eye(73)}
<g class="ba-lid"><ellipse cx="47" cy="48" rx="9.7" ry="9.7" fill="#7b5c43"/><ellipse cx="73" cy="48" rx="9.7" ry="9.7" fill="#7b5c43"/></g>
<path d="M56.5 53 L63.5 53 L60 62 Z" fill="url(#${u}k)"/><path d="M57.6 53.6 L60 55.2 L62.4 53.6" stroke="#fff3c4" stroke-width=".8" fill="none" opacity=".75"/>
<path d="M50 96 l-2 5 M53 97 l0 5 M56 96 l2 5 M64 96 l-2 5 M67 97 l0 5 M70 96 l2 5" stroke="#e6a94a" stroke-width="2" stroke-linecap="round"/>
<path d="M86 40 C91 54 92 72 86 86" fill="none" stroke="#b3a4ff" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>
<path d="M89.5 14 L83.5 32" stroke="#b3a4ff" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
<ellipse cx="52" cy="27" rx="10" ry="4" fill="#fff" opacity=".2"/>`;
    },

    lantern: (u) => `
<defs>
 <linearGradient id="${u}m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a3a12"/><stop offset=".3" stop-color="#f7dc8f"/><stop offset=".55" stop-color="#c08a33"/><stop offset="1" stop-color="#4f3210"/></linearGradient>
 <radialGradient id="${u}h" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd27a" stop-opacity=".8"/><stop offset=".45" stop-color="#ff9a3c" stop-opacity=".26"/><stop offset="1" stop-color="#ff7a2a" stop-opacity="0"/></radialGradient>
 <radialGradient id="${u}g" cx="50%" cy="62%" r="66%"><stop offset="0" stop-color="#fff4cf"/><stop offset=".42" stop-color="#ffc35c" stop-opacity=".92"/><stop offset="1" stop-color="#9c4515" stop-opacity=".8"/></radialGradient>
 <radialGradient id="${u}f" cx="50%" cy="76%" r="72%"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#fff2a8"/><stop offset=".66" stop-color="#ff9a2a"/><stop offset="1" stop-color="#e24a1a"/></radialGradient>
</defs>
<circle class="ba-flick" cx="60" cy="62" r="56" fill="url(#${u}h)"/>
<ellipse cx="60" cy="108" rx="27" ry="4" fill="#000" opacity=".42"/>
<path d="M45 26 C45 7 75 7 75 26" fill="none" stroke="url(#${u}m)" stroke-width="3.2" stroke-linecap="round"/>
<circle cx="60" cy="8.5" r="3.2" fill="none" stroke="#e8c46e" stroke-width="2"/>
<rect x="55" y="17" width="10" height="6" rx="2" fill="url(#${u}m)"/>
<path d="M41 33 L49 22 H71 L79 33 Z" fill="url(#${u}m)"/>
<path d="M51 27 H55 M58 27 H62 M65 27 H69" stroke="#3a2408" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
<rect x="37" y="32" width="46" height="5" rx="2.5" fill="url(#${u}m)"/>
<rect x="42" y="37" width="36" height="50" rx="4" fill="url(#${u}g)"/>
<g class="ba-flame">
 <path d="M60 50 C67 60 71 67 67 75 C64.5 80 55.5 80 53 75 C49 67 53 60 60 50 Z" fill="url(#${u}f)"/>
 <path d="M60 61 C63.5 66 64.5 70 62.5 74 C61.5 76 58.5 76 57.5 74 C55.5 70 56.5 66 60 61 Z" fill="#fffdf0"/>
</g>
<path d="M60 76 V80" stroke="#3a2410" stroke-width="1.6"/>
<rect x="54" y="79" width="12" height="8" rx="1.5" fill="#fff1d6"/><rect x="54" y="79" width="12" height="2" rx="1" fill="#fff"/>
<rect x="42" y="37" width="36" height="50" rx="4" fill="none" stroke="#7a4310" stroke-opacity=".5" stroke-width="2"/>
<path d="M51 37 V87 M69 37 V87" stroke="#8a5f1f" stroke-width="1" opacity=".7"/>
<rect x="40" y="36" width="4" height="52" rx="2" fill="url(#${u}m)"/><rect x="76" y="36" width="4" height="52" rx="2" fill="url(#${u}m)"/>
<path d="M47 41 V82" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>
<path d="M73 44 V60" stroke="#fff" stroke-opacity=".28" stroke-width="1.4" stroke-linecap="round"/>
<path d="M37 87 H83 L79 97 H41 Z" fill="url(#${u}m)"/><rect x="39" y="96" width="42" height="5" rx="2.5" fill="url(#${u}m)"/>
<path d="M38.5 87.7 H81.5 M43 33 H77" stroke="#fff3c8" stroke-opacity=".7" stroke-width="1"/>
<path d="M80.6 39 V86 M81 88 L78 96" stroke="#b3a4ff" stroke-opacity=".75" stroke-width="1.2" stroke-linecap="round"/>`,

    bell: (u) => `
<defs>
 <linearGradient id="${u}m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6b4710"/><stop offset=".28" stop-color="#ffe7a3"/><stop offset=".5" stop-color="#e0a53a"/><stop offset=".8" stop-color="#9a6716"/><stop offset="1" stop-color="#5a3a0c"/></linearGradient>
 <radialGradient id="${u}i" cx="50%" cy="0%" r="100%"><stop offset="0" stop-color="#1e1206"/><stop offset="1" stop-color="#5a3a0c"/></radialGradient>
 <linearGradient id="${u}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b2a5ff"/><stop offset="1" stop-color="#5a46c8"/></linearGradient>
 <radialGradient id="${u}g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe39a" stop-opacity=".55"/><stop offset="1" stop-color="#c9b6ff" stop-opacity="0"/></radialGradient>
</defs>
<ellipse cx="60" cy="110" rx="28" ry="4" fill="#000" opacity=".38"/>
<circle cx="60" cy="58" r="46" fill="url(#${u}g)"/>
<g fill="none" stroke="#cdbcff" stroke-width="1.8" stroke-linecap="round">
 <g class="ba-ring"><path d="M21 52 C15 60 15 72 21 80 M99 52 C105 60 105 72 99 80"/></g>
 <g class="ba-ring" style="animation-delay:.3s"><path d="M13 45 C5 57 5 75 13 87 M107 45 C115 57 115 75 107 87"/></g>
</g>
<path d="M44 10 H76" stroke="#8f97bf" stroke-width="3" stroke-linecap="round"/><path d="M45 9.4 H75" stroke="#eef0ff" stroke-width=".9" opacity=".6"/>
<g class="ba-sway">
 <path d="M60 10 V19" stroke="url(#${u}r)" stroke-width="3"/>
 <path d="M60 19 C52 12 47 20 54 22.5 Z M60 19 C68 12 73 20 66 22.5 Z" fill="url(#${u}r)"/>
 <path d="M53 27 C53 18.5 67 18.5 67 27" fill="none" stroke="url(#${u}m)" stroke-width="4"/>
 <path d="${BELL}" fill="url(#${u}m)"/>
 <path d="M41.6 60 C52 64 68 64 78.4 60" stroke="#7a5214" stroke-width="1.4" fill="none" opacity=".8"/>
 <path d="M41.6 61.7 C52 65.7 68 65.7 78.4 61.7" stroke="#fff0bf" stroke-width=".8" fill="none" opacity=".5"/>
 <ellipse cx="60" cy="81" rx="32" ry="5.5" fill="url(#${u}m)"/>
 <ellipse cx="60" cy="82" rx="28" ry="3.6" fill="url(#${u}i)"/>
 <g class="ba-clap"><path d="M60 82 V87" stroke="#5a3a0c" stroke-width="2"/><circle cx="60" cy="89" r="4.6" fill="url(#${u}m)"/><circle cx="58.6" cy="87.6" r="1.3" fill="#fff6d0"/></g>
 <path d="M51 29 C46 38 45 56 42 72" stroke="#fff" stroke-opacity=".62" stroke-width="3.2" fill="none" stroke-linecap="round"/>
 <circle cx="54.5" cy="29.5" r="1.6" fill="#fff"/>
 <path d="M77 36 C80 48 79 64 90 77" stroke="#b3a4ff" stroke-opacity=".8" stroke-width="1.6" fill="none" stroke-linecap="round"/>
</g>`,

    lotus: (u) => `
<defs>
 <radialGradient id="${u}a" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff1c2" stop-opacity=".95"/><stop offset=".38" stop-color="#ffd479" stop-opacity=".45"/><stop offset=".7" stop-color="#ff9cc6" stop-opacity=".15"/><stop offset="1" stop-color="#ff9cc6" stop-opacity="0"/></radialGradient>
 <linearGradient id="${u}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6fa6"/><stop offset=".45" stop-color="#ffb8d5"/><stop offset="1" stop-color="#fff5ec"/></linearGradient>
 <linearGradient id="${u}q" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9447f"/><stop offset=".5" stop-color="#f08ab4"/><stop offset="1" stop-color="#ffd9e8"/></linearGradient>
 <radialGradient id="${u}c" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffd35a" stop-opacity=".9"/><stop offset="1" stop-color="#ffb02e" stop-opacity="0"/></radialGradient>
 <linearGradient id="${u}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fae84"/><stop offset="1" stop-color="#1f5f4a"/></linearGradient>
</defs>
<circle class="ba-aura" cx="60" cy="62" r="56" fill="url(#${u}a)"/>
<ellipse class="ba-ripple" cx="60" cy="94" rx="44" ry="8" fill="none" stroke="#a6e6ff" stroke-width="1.2"/>
<ellipse cx="60" cy="94" rx="30" ry="5" fill="none" stroke="#a6e6ff" stroke-opacity=".45" stroke-width="1"/>
<ellipse cx="25" cy="98" rx="15" ry="4.5" fill="url(#${u}l)"/><path d="M25 98 L38 96" stroke="#0e3a2c" stroke-width="1.2"/>
<ellipse cx="97" cy="100" rx="12" ry="3.6" fill="url(#${u}l)"/><path d="M97 100 L86 98.6" stroke="#0e3a2c" stroke-width="1"/>
<g fill="url(#${u}q)">
 <path d="${PETAL}" ${ptf(-70, .82)}/><path d="${PETAL}" ${ptf(70, .82)}/>
 <path d="${PETAL}" ${ptf(-46, .9)}/><path d="${PETAL}" ${ptf(46, .9)}/>
</g>
<g fill="url(#${u}p)"><path d="${PETAL}" ${ptf(-23, .96)}/><path d="${PETAL}" ${ptf(23, .96)}/></g>
<circle cx="60" cy="62" r="17" fill="url(#${u}c)"/>
<path d="${PETAL}" fill="url(#${u}p)"/>
<path d="${LOW_L}" fill="url(#${u}p)"/><path d="${LOW_R}" fill="url(#${u}p)"/>
<g class="ba-petal" fill="none" stroke="#fff3c4" stroke-width="1.3">
 <path d="${PETAL}"/><path d="${PETAL}" ${ptf(-23, .96)}/><path d="${PETAL}" ${ptf(23, .96)}/><path d="${LOW_L}"/><path d="${LOW_R}"/>
</g>
<path d="M60 84 V40 M60 80 C56 70 55 58 57 48 M60 80 C64 70 65 58 63 48" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".8"/>
<path d="M60 30 C76 54 74 76 60 88" fill="none" stroke="#ffe6a0" stroke-opacity=".6" stroke-width="1"/>
<g fill="#fff6d0">
 <path class="ba-tw" d="${star(24, 36, 4.5)}"/>
 <path class="ba-tw" d="${star(95, 30, 3.6)}" style="animation-delay:.8s"/>
 <path class="ba-tw" d="${star(90, 58, 2.8)}" style="animation-delay:1.6s"/>
 <path class="ba-tw" d="${star(30, 60, 2.6)}" style="animation-delay:2.1s"/>
</g>`
  };

  function art(id, cls) {
    const u = 'bq' + (++uid) + '_';
    return `<svg class="bag-art ba-${id}${cls ? ' ' + cls : ''}" viewBox="0 0 120 120" aria-hidden="true" focusable="false">${ART[id](u)}</svg>`;
  }
  const SPARK_POS = [[16, 20, 0], [80, 14, .9], [74, 76, 1.7], [20, 72, 2.4], [50, 8, 1.2], [88, 46, .4], [8, 46, 2.0], [46, 88, 2.8], [30, 34, 3.1], [66, 30, 1.5]];
  function sparks(n) {
    return SPARK_POS.slice(0, n).map(([x, y, d]) => `<span class="bag-spark" style="left:${x}%;top:${y}%;animation-delay:${d}s"></span>`).join('');
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mmss = (secs) => { secs = Math.max(0, Math.ceil(secs)); return Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'); };

  /* ---------------- rendering ---------------- */
  function sockHTML(b, loc, key) {
    const id = getLoc(b, loc), it = id && ITEMS[id], n = it ? b.counts[id] : 0;
    if (!it) return `<div class="bag-sock" data-bag-loc="${loc}" aria-label="Empty slot">${key ? `<span class="bag-key">${key}</span>` : ''}</div>`;
    return `<div class="bag-sock has r-${it.rarity}" data-bag-loc="${loc}" role="button" tabindex="0" aria-label="${esc(it.name)}${n > 1 ? ', ' + n : ''}">
      <span class="bag-glow"></span><i class="bag-rim"><b></b></i>${key ? `<span class="bag-key">${key}</span>` : ''}
      ${art(id)}${it.rarity === 'sacred' ? sparks(4) : ''}${n > 1 ? `<span class="bag-n">${n}</span>` : ''}${b.seen[id] ? '' : '<span class="bag-new"></span>'}</div>`;
  }
  function timerChip(b) {
    if (!b.timer || !(b.timer.end > Date.now())) return '';
    return `<button class="bag-timer" data-bag-timer>${art('bell', 'bag-timer-ico')}<span data-bag-tleft>${mmss((b.timer.end - Date.now()) / 1000)}</span></button>`;
  }
  function bagHTML(b) {
    const used = b.slots.filter(Boolean).length;
    return `<div class="bag-panel">
      <span class="bag-rivet tl"></span><span class="bag-rivet tr"></span><span class="bag-rivet bl"></span><span class="bag-rivet br"></span>
      <div class="bag-head"><div class="bag-title">Bag</div><div class="bag-cap">${used} / ${GRID}</div></div>
      <div class="bag-grid">${b.slots.map((_, i) => sockHTML(b, 's:' + i)).join('')}</div>
      <div class="bag-qhead"><span class="bag-qlabel">Quick bar</span>${timerChip(b)}</div>
      <div class="bag-quick">${b.quick.map((_, i) => sockHTML(b, 'q:' + i, i + 1)).join('')}</div>
      <div class="bag-hint">Tap an item to look closer. Hold it to move it.</div>
    </div>`;
  }
  function quickHTML(b) {
    return `<div class="bag-qbar">${b.quick.map((_, i) => sockHTML(b, 'q:' + i, i + 1)).join('')}${timerChip(b)}</div>`;
  }
  function render() {
    if (!mounts.length) return;
    if (drag && drag.picked) { pendingRender = true; return; }
    const b = bag();
    for (const m of mounts) m.el.innerHTML = m.kind === 'bag' ? bagHTML(b) : quickHTML(b);
  }
  function landAt(loc) {
    for (const m of mounts) {
      const s = m.el.querySelector(`[data-bag-loc="${loc}"]`);
      if (s) { s.classList.remove('bag-land'); void s.offsetWidth; s.classList.add('bag-land'); }
    }
  }

  /* ---------------- mounting ---------------- */
  function setCtx(c) {
    if (!c) return;
    ctx = Object.assign({}, ctx, c);
    ctx.actions = c.actions || ctx.actions || {};
  }
  function attach(el, kind) {
    if (!el) throw new Error('Bag: mount needs an element');
    ensureLayer();
    let m = mounts.find((x) => x.el === el);
    if (!m) {
      m = { el, kind };
      mounts.push(m);
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('click', onClick);
      el.addEventListener('keydown', onKey);
      el.addEventListener('contextmenu', (e) => { if (e.target.closest('.bag-sock')) e.preventDefault(); });
      el.addEventListener('touchmove', (e) => { if (drag && drag.picked) e.preventDefault(); }, { passive: false });
    }
    m.kind = kind;
    el.classList.remove('bag-root', 'bag-qroot');
    el.classList.add(kind === 'bag' ? 'bag-root' : 'bag-qroot');
    startTicker();
  }
  function mount(el, c) { setCtx(c); attach(el, 'bag'); render(); return api; }
  function mountQuick(el, c) { setCtx(c); attach(el, 'quick'); render(); return api; }

  function ensureLayer() {
    if (layer && document.body.contains(layer)) return;
    layer = document.createElement('div');
    layer.className = 'bag-layer';
    layer.innerHTML = '<div class="bag-toasts" aria-live="polite"></div>';
    document.body.appendChild(layer);
  }
  let globalsBound = false;
  function bindGlobals() {
    if (globalsBound) return; globalsBound = true;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet) closeSheet(); });
    document.addEventListener('touchmove', (e) => { if (drag && drag.picked) e.preventDefault(); }, { passive: false });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  }

  /* ---------------- drag and drop ---------------- */
  function onDown(e) {
    if (e.button > 0) return;
    const s = e.target.closest('.bag-sock'); if (!s) return;
    const loc = s.dataset.bagLoc, id = getLoc(bag(), loc);
    if (!id) return;
    endDrag();
    drag = { loc, id, sock: s, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse', picked: false, over: null, maxMove: 0 };
    drag.timer = setTimeout(pickUp, 200);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }
  function onMove(e) {
    if (!drag) return;
    drag.x = e.clientX; drag.y = e.clientY;
    const d = Math.hypot(drag.x - drag.x0, drag.y - drag.y0);
    drag.maxMove = Math.max(drag.maxMove, d);
    if (!drag.picked) {
      if (d > 8) { if (drag.mouse) pickUp(); else endDrag(); }
      return;
    }
    e.preventDefault();
    moveGhost(); hover();
  }
  function pickUp() {
    if (!drag || drag.picked) return;
    clearTimeout(drag.timer);
    drag.picked = true;
    const r = drag.sock.getBoundingClientRect();
    const size = Math.max(64, Math.min(84, r.width));
    const it = ITEMS[drag.id];
    const g = document.createElement('div');
    g.className = 'bag-ghost r-' + it.rarity;
    g.style.width = g.style.height = size + 'px';
    g.innerHTML = art(drag.id);
    layer.appendChild(g);
    drag.ghost = g; drag.size = size;
    drag.sock.classList.add('bag-src');
    for (const m of mounts) m.el.classList.add('bag-dragging');
    try { navigator.vibrate && navigator.vibrate(12); } catch (_) {}
    moveGhost(); hover();
  }
  function moveGhost() {
    const s = drag.size;
    drag.ghost.style.transform = `translate(${drag.x - s / 2}px, ${drag.y - s * 0.8}px) scale(1.18) rotate(-4deg)`;
  }
  function hover() {
    const el = document.elementFromPoint(drag.x, drag.y);
    let s = el && el.closest ? el.closest('.bag-sock') : null;
    if (s && !mounts.some((m) => m.el.contains(s))) s = null;
    if (s !== drag.over) {
      if (drag.over) drag.over.classList.remove('bag-over');
      drag.over = s;
      if (s && s !== drag.sock) s.classList.add('bag-over');
    }
  }
  function onUp() {
    if (!drag) return;
    if (!drag.picked) { endDrag(); return; }      // a plain tap: the click handler opens the item
    const d = drag, tLoc = d.over && d.over.dataset.bagLoc;
    lastDragEnd = Date.now();
    if (tLoc && tLoc !== d.loc) {
      const b = bag(), other = getLoc(b, tLoc);
      setLoc(b, tLoc, d.id); setLoc(b, d.loc, other);
      logEv(b, { ev: 'move', id: d.id, from: d.loc, to: tLoc });
      save();
      endDrag(); render(); landAt(tLoc); if (other) landAt(d.loc);
      return;
    }
    const tap = d.maxMove < 10;
    const g = d.ghost, r = d.sock.getBoundingClientRect();
    g.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s';
    g.style.transform = `translate(${r.left + r.width / 2 - d.size / 2}px, ${r.top + r.height / 2 - d.size / 2}px) scale(1)`;
    d.ghost = null;
    setTimeout(() => g.remove(), 240);
    endDrag();
    if (tap) openItem(d.id);
  }
  function onCancel() { endDrag(); }
  function endDrag() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    if (!drag) return;
    clearTimeout(drag.timer);
    if (drag.ghost) drag.ghost.remove();
    if (drag.over) drag.over.classList.remove('bag-over');
    drag.sock.classList.remove('bag-src');
    for (const m of mounts) m.el.classList.remove('bag-dragging');
    drag = null;
    if (pendingRender) { pendingRender = false; render(); }
  }
  function onClick(e) {
    if (Date.now() - lastDragEnd < 450) return;
    if (e.target.closest('[data-bag-timer]')) { openBell(); return; }
    const s = e.target.closest('.bag-sock'); if (!s) return;
    const id = getLoc(bag(), s.dataset.bagLoc);
    if (id) openItem(id);
    else if (s.closest('.bag-qroot') && typeof ctx.openBag === 'function') ctx.openBag();
  }
  function onKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const s = e.target.closest('.bag-sock'); if (!s) return;
    const id = getLoc(bag(), s.dataset.bagLoc);
    if (id) { e.preventDefault(); openItem(id); }
  }

  /* ---------------- detail card ---------------- */
  function openItem(id) {
    const it = ITEMS[id]; if (!it) return;
    ensureLayer(); bindGlobals();
    closeSheet(true);
    const b = bag(), n = b.counts[id] || 0;
    if (n > 0 && !b.seen[id]) { b.seen[id] = true; save(); render(); }
    const sc = document.createElement('div'); sc.className = 'bag-scrim';
    const sh = document.createElement('div');
    sh.className = 'bag-sheet r-' + it.rarity;
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', it.name);
    sh.innerHTML = `
      <div class="bag-grab"></div>
      <button class="bag-x" data-act="close" aria-label="Close">&times;</button>
      <div class="bag-hero r-${it.rarity}"><span class="bag-hero-glow"></span>${it.rarity === 'sacred' ? sparks(10) : ''}
        <div class="bag-hero-float">${art(id, 'bag-hero-art')}</div></div>
      <div class="bag-dname">${esc(it.name)}</div>
      <div class="bag-dmeta"><span class="bag-tag r-${it.rarity}">${RARITY[it.rarity]}</span><span class="bag-count">${n > 0 ? 'You have ' + n : 'None in your bag'}</span></div>
      <p class="bag-flav">${esc(it.flavour)}</p>
      <div class="bag-lines"><div><b>What it does</b><span>${esc(it.does)}</span></div><div><b>Found</b><span>${esc(it.found)}</span></div></div>
      <div class="bag-acts"></div>`;
    layer.appendChild(sc); layer.appendChild(sh);
    sheet = { el: sh, scrim: sc, id };
    setActs('main');
    sc.addEventListener('click', () => closeSheet());
    sh.addEventListener('click', onSheetClick);
    requestAnimationFrame(() => { sc.classList.add('open'); sh.classList.add('open'); });
    const use = sh.querySelector('.bag-use'); if (use && !use.disabled) setTimeout(() => { try { use.focus({ preventScroll: true }); } catch (_) {} }, 320);
  }
  function setActs(mode) {
    if (!sheet) return;
    const it = ITEMS[sheet.id], b = bag(), n = b.counts[it.id] || 0, loc = locOf(b, it.id);
    const dis = n > 0 ? '' : ' disabled';
    let h = '';
    if (mode === 'main') {
      const running = it.id === 'bell' && b.timer && b.timer.end > Date.now();
      h = `<button class="bag-use" data-act="use"${running ? '' : dis}>${running ? 'Show the running timer' : 'Use'}</button>
        <div class="bag-row"><button class="bag-btn" data-act="move"${dis}>${loc && loc[0] === 'q' ? 'Move to bag' : 'Move to quick bar'}</button>
        <button class="bag-btn bag-drop" data-act="drop"${dis}>Drop</button></div>`;
    } else if (mode === 'confirm') {
      h = `<div class="bag-confirm"><p>Drop ${n > 1 ? 'all ' + n + ' of the ' : 'the '}${esc(it.name)}? It leaves your bag.</p>
        <div class="bag-row"><button class="bag-btn" data-act="back">Keep it</button><button class="bag-btn bag-drop-yes" data-act="drop-yes">Drop</button></div></div>`;
    } else if (mode === 'choose') {
      h = `<p class="bag-ask">Which recovery fits right now?</p><div class="bag-choices">${it.choices.map((c) => `<button class="bag-btn bag-choice" data-act="choice" data-choice="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <button class="bag-btn bag-ghostbtn bag-wide" data-act="back">Back</button>`;
    } else if (mode === 'busy') {
      h = `<button class="bag-use bag-busy" disabled><span class="bag-spin"></span>Using the ${esc(it.name)}</button>`;
    }
    sheet.el.querySelector('.bag-acts').innerHTML = h;
  }
  function onSheetClick(e) {
    const a = e.target.closest('[data-act]'); if (!a || !sheet) return;
    const id = sheet.id;
    switch (a.dataset.act) {
      case 'close': closeSheet(); break;
      case 'use': use(id); break;
      case 'move': moveToggle(id); break;
      case 'drop': setActs('confirm'); break;
      case 'back': setActs('main'); break;
      case 'choice': use(id, { choice: a.dataset.choice }); break;
      case 'drop-yes': dropItem(id); break;
    }
  }
  function closeSheet(instant) {
    if (!sheet) return;
    const s = sheet; sheet = null;
    s.el.classList.remove('open'); s.scrim.classList.remove('open');
    if (instant) { s.el.remove(); s.scrim.remove(); }
    else setTimeout(() => { s.el.remove(); s.scrim.remove(); }, 320);
  }
  function moveToggle(id) {
    const b = bag(), loc = locOf(b, id); if (!loc) return;
    let to;
    if (loc[0] === 'q') {
      const i = b.slots.indexOf(null);
      if (i < 0) { toast({ head: 'Bag', body: 'The bag grid is full. Hold the item and drag it onto another to swap.', kind: 'info' }); return; }
      to = 's:' + i;
    } else {
      let i = b.quick.indexOf(null); if (i < 0) i = QUICK - 1;
      to = 'q:' + i;
    }
    const other = getLoc(b, to);
    setLoc(b, to, id); setLoc(b, loc, other);
    logEv(b, { ev: 'move', id, from: loc, to });
    save(); closeSheet(); render(); landAt(to); if (other) landAt(loc);
  }
  function dropItem(id) {
    const b = bag(), loc = locOf(b, id), n = b.counts[id] || 0;
    if (loc) setLoc(b, loc, null);
    delete b.counts[id];
    logEv(b, { ev: 'drop', id, n });
    save(); closeSheet(); render();
    toast({ id, head: 'Dropped', body: `${ITEMS[id].name} left your bag.`, kind: 'info' });
  }

  /* ---------------- using items ---------------- */
  async function use(id, opts) {
    const it = ITEMS[id]; if (!it) return;
    opts = opts || {};
    const b = bag();
    if (id === 'bell' && b.timer && b.timer.end > Date.now()) { closeSheet(); openBell(); return; }
    if (!(b.counts[id] > 0)) { toast({ id, head: it.name, body: 'None in your bag right now.', kind: 'info' }); return; }
    if (it.choices && !opts.choice) { if (sheet && sheet.id === id) setActs('choose'); else { openItem(id); setActs('choose'); } return; }

    if (id === 'breath') {
      consume(b, id); logEv(b, { ev: 'use', id }); save(); closeSheet(); render();
      runBreath(it);
      return;
    }
    if (id === 'bell') {
      unlockAudio();
      consume(b, id);
      const end = Date.now() + FOCUS_MIN * 60000;
      b.timer = { id: 'bell', start: Date.now(), end };
      logEv(b, { ev: 'use', id }); save(); closeSheet(); render();
      openBell();
      let msg = it.done;
      const fn = ctx.actions && ctx.actions.bell;
      if (fn) { try { const r = await fn(it, { minutes: FOCUS_MIN, endsAt: end }); if (r) msg = String(r); } catch (e) { msg = 'The timer runs, but the game could not log it: ' + (e && e.message || e); } }
      if (overlay && overlay.kind === 'bell') { const sub = overlay.el.querySelector('[data-k="sub"]'); if (sub) sub.textContent = msg; }
      return;
    }
    const fn = ctx.actions && ctx.actions[id];
    if (typeof fn !== 'function') { toast({ id, head: it.name, body: 'This item is not connected to the game yet. Nothing was used.', kind: 'info' }); return; }
    if (sheet && sheet.id === id) setActs('busy');
    let r;
    try { r = await fn(it, opts); }
    catch (e) {
      if (sheet && sheet.id === id) setActs('main');
      toast({ id, head: it.name, body: 'That did not go through: ' + (e && e.message || e) + '. The item is still in your bag.', kind: 'info' });
      return;
    }
    const b2 = bag();
    consume(b2, id);
    const body = r ? String(r) : (opts.choice ? `This block is now recovery: ${opts.choice}.` : it.done);
    logEv(b2, { ev: 'use', id, choice: opts.choice, result: body });
    save(); closeSheet(); render();
    toast({ id, head: it.name, body, kind: 'used' });
  }

  /* ---------------- toasts ---------------- */
  function toast(o) {
    ensureLayer();
    const host = layer.querySelector('.bag-toasts');
    const t = document.createElement('div');
    const it = o.id && ITEMS[o.id];
    t.className = 'bag-toast bag-toast-' + (o.kind || 'info') + (it ? ' r-' + it.rarity : '');
    t.innerHTML = (it ? `<span class="bag-toast-art r-${it.rarity}">${art(o.id)}</span>` : '') +
      `<span class="bag-toast-tx"><span class="bag-toast-h">${esc(o.head || '')}</span><span class="bag-toast-b">${esc(o.body || '')}</span></span>`;
    host.appendChild(t);
    while (host.children.length > 3) host.firstChild.remove();
    const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 420); };
    t.addEventListener('click', kill);
    setTimeout(kill, o.ms || 4600);
  }

  /* ---------------- give ---------------- */
  function give(id, n, why) {
    const it = ITEMS[id];
    if (!it) { console.warn('Bag.give: unknown item', id); return false; }
    n = Math.max(1, Math.floor(n || 1));
    const b = bag();
    let loc = locOf(b, id);
    if (!loc) {
      let i = b.slots.indexOf(null);
      if (i >= 0) loc = 's:' + i;
      else if ((i = b.quick.indexOf(null)) >= 0) loc = 'q:' + i;
    }
    if (!loc) {
      logEv(b, { ev: 'full', id, n, why: why || '' }); save();
      toast({ id, head: 'Bag is full', body: `Use or drop something to make room for the ${it.name}.`, kind: 'full' });
      return false;
    }
    setLoc(b, loc, id);
    b.counts[id] = (b.counts[id] || 0) + n;
    delete b.seen[id];
    logEv(b, { ev: 'give', id, n, why: why || '' });
    save(); render(); landAt(loc);
    toast({ id, head: n > 1 ? `Found ${n} x ${it.name}` : `Found: ${it.name}`, body: why || it.found, kind: 'found' });
    return true;
  }

  /* ---------------- overlays: breath and bell ---------------- */
  function closeOverlay() {
    if (!overlay) return;
    const o = overlay; overlay = null;
    try { o.stop && o.stop(); } catch (_) {}
    o.el.classList.remove('open');
    setTimeout(() => o.el.remove(), 420);
  }
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
      else if (!on && wakeLock) { const w = wakeLock; wakeLock = null; await w.release(); }
    } catch (_) {}
  }

  function runBreath(it) {
    ensureLayer(); closeOverlay();
    const ov = document.createElement('div');
    ov.className = 'bag-ov bag-ov-breath';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Breath reset');
    ov.innerHTML = `
      <div class="bag-ov-top"><span class="bag-ov-name">${art('breath', 'bag-ov-ico')}Breath Card</span><span class="bag-ov-left" data-k="left">3:00 left</span></div>
      <div class="bag-ov-mid">
        <div class="bag-bstage">
          <svg class="bag-bring" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="96" class="bg"/><circle cx="100" cy="100" r="96" class="fg" data-k="ring"/></svg>
          <div class="bag-bhalo" data-k="halo"></div>
          <div class="bag-borb" data-k="orb"></div>
          <div class="bag-btext"><div class="bag-bword" data-k="word" aria-live="polite">Breathe in</div><div class="bag-bnum" data-k="num">4</div></div>
        </div>
        <div class="bag-ov-sub" data-k="sub">In 4, hold 4, out 6. Let the circle lead.</div>
      </div>
      <div class="bag-ov-btns" data-k="btns"><button class="bag-btn bag-ghostbtn" data-act="end">End now</button></div>`;
    layer.appendChild(ov);
    const q = (k) => ov.querySelector(`[data-k="${k}"]`);
    const ring = q('ring'), orb = q('orb'), halo = q('halo'), wordEl = q('word'), numEl = q('num'), leftEl = q('left');
    const C = 2 * Math.PI * 96;
    ring.style.strokeDasharray = C; ring.style.strokeDashoffset = 0;
    const ease = (p) => 0.5 - 0.5 * Math.cos(Math.PI * p);
    const start = Date.now();
    let raf = 0, done = false, lastWord = '', lastNum = '', lastLeft = '';
    function frame() {
      const t = (Date.now() - start) / 1000;
      if (t >= BREATH_SECS) { finish(true); return; }
      const c = t % 14;
      let word, left, s;
      if (c < 4) { word = 'Breathe in'; left = 4 - c; s = 0.55 + 0.45 * ease(c / 4); }
      else if (c < 8) { word = 'Hold'; left = 8 - c; s = 1; }
      else { word = 'Breathe out'; left = 14 - c; s = 1 - 0.45 * ease((c - 8) / 6); }
      orb.style.transform = `scale(${s.toFixed(4)})`;
      halo.style.transform = `scale(${(0.75 + s * 0.55).toFixed(4)})`;
      halo.style.opacity = (0.35 + s * 0.65).toFixed(3);
      if (word !== lastWord) { wordEl.textContent = word; lastWord = word; ov.dataset.phase = word === 'Hold' ? 'hold' : (word === 'Breathe in' ? 'in' : 'out'); }
      const nn = String(Math.ceil(left)); if (nn !== lastNum) { numEl.textContent = nn; lastNum = nn; }
      const lt = mmss(BREATH_SECS - t) + ' left'; if (lt !== lastLeft) { leftEl.textContent = lt; lastLeft = lt; }
      ring.style.strokeDashoffset = (C * (t / BREATH_SECS)).toFixed(2);
      raf = requestAnimationFrame(frame);
    }
    async function finish(completed) {
      if (done) return; done = true;
      cancelAnimationFrame(raf); keepAwake(false);
      const secs = Math.round(Math.min(BREATH_SECS, (Date.now() - start) / 1000));
      ov.classList.add('done');
      orb.style.transform = 'scale(.8)'; halo.style.transform = 'scale(1.1)'; halo.style.opacity = '.8';
      ring.style.strokeDashoffset = completed ? C : ring.style.strokeDashoffset;
      wordEl.textContent = completed ? 'Done' : 'Paused here'; numEl.textContent = '';
      leftEl.textContent = completed ? '3:00 done' : mmss(secs) + ' done';
      let msg = completed ? it.done : `${mmss(secs)} of slow breath. Notice how you feel now.`;
      const sub = q('sub'), btns = q('btns');
      sub.textContent = msg;
      btns.innerHTML = '<button class="bag-use" data-act="close">Close</button>';
      const fn = ctx.actions && ctx.actions.breath;
      if (fn) {
        try { const r = await fn(it, { completed, seconds: secs }); if (r) msg = String(r); }
        catch (e) { msg += ' (The game could not log it: ' + (e && e.message || e) + '.)'; }
        sub.textContent = msg;
      }
      const b = bag(); logEv(b, { ev: 'breath', id: 'breath', completed, seconds: secs, result: msg }); save();
    }
    ov.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'end') finish(false);
      if (a.dataset.act === 'close') closeOverlay();
    });
    overlay = { el: ov, kind: 'breath', stop: () => { cancelAnimationFrame(raf); keepAwake(false); } };
    keepAwake(true);
    requestAnimationFrame(() => ov.classList.add('open'));
    raf = requestAnimationFrame(frame);
  }

  function openBell() {
    const b = bag();
    if (!b.timer || !(b.timer.end > Date.now())) { tick(); return; }
    ensureLayer(); bindGlobals(); closeOverlay();
    const ov = document.createElement('div');
    ov.className = 'bag-ov bag-ov-bell';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Focus Bell');
    ov.innerHTML = `
      <div class="bag-ov-top"><span class="bag-ov-name">${art('bell', 'bag-ov-ico')}Focus Bell</span><span class="bag-ov-left">${FOCUS_MIN} min</span></div>
      <div class="bag-ov-mid">
        <div class="bag-bell-stage"><span class="bag-hero-glow"></span>${art('bell', 'bag-bell-art')}</div>
        <div class="bag-bell-t" data-bag-tleft>${mmss((b.timer.end - Date.now()) / 1000)}</div>
        <div class="bag-ov-sub" data-k="sub">One thing at a time. A soft chime rings at the end.</div>
      </div>
      <div class="bag-ov-btns" data-k="btns">
        <button class="bag-use" data-act="hide">Hide, keep it running</button>
        <button class="bag-btn bag-ghostbtn" data-act="stop">Stop the timer</button>
      </div>`;
    layer.appendChild(ov);
    ov.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'hide' || a.dataset.act === 'close') closeOverlay();
      if (a.dataset.act === 'stop') {
        const bb = bag(); if (!bb.timer) { closeOverlay(); return; }
        const mins = Math.floor((Date.now() - bb.timer.start) / 60000);
        delete bb.timer; logEv(bb, { ev: 'bell-stop', id: 'bell', minutes: mins }); save(); render(); closeOverlay();
        toast({ id: 'bell', head: 'Focus Bell', body: `Stopped after ${mins} min.`, kind: 'info' });
      }
    });
    overlay = { el: ov, kind: 'bell', stop: () => keepAwake(false) };
    keepAwake(true);
    requestAnimationFrame(() => ov.classList.add('open'));
  }
  function ringBell() {
    const b = bag();
    delete b.timer; logEv(b, { ev: 'bell-done', id: 'bell' }); save(); render();
    chime();
    try { navigator.vibrate && navigator.vibrate([180, 120, 180]); } catch (_) {}
    if (overlay && overlay.kind === 'bell') {
      overlay.el.classList.add('done');
      const t = overlay.el.querySelector('[data-bag-tleft]'); if (t) { t.textContent = '0:00'; t.removeAttribute('data-bag-tleft'); }
      const sub = overlay.el.querySelector('[data-k="sub"]'); if (sub) sub.textContent = 'The bell rang. Fifty minutes of focus are done.';
      const btns = overlay.el.querySelector('[data-k="btns"]'); if (btns) btns.innerHTML = '<button class="bag-use" data-act="close">Close</button>';
      keepAwake(false);
    } else {
      toast({ id: 'bell', head: 'Focus Bell', body: 'The bell rang. Fifty minutes of focus are done.', kind: 'used', ms: 9000 });
    }
  }
  function tick() {
    if (!mounts.length && !overlay) return;
    let b; try { b = bag(); } catch (_) { return; }
    if (!b.timer) return;
    const left = (b.timer.end - Date.now()) / 1000;
    if (left <= 0) { ringBell(); return; }
    const txt = mmss(left);
    document.querySelectorAll('[data-bag-tleft]').forEach((el) => { if (el.textContent !== txt) el.textContent = txt; });
  }
  function startTicker() { bindGlobals(); if (!ticker) ticker = setInterval(tick, 1000); }

  /* soft chime, WebAudio, no files */
  function unlockAudio() {
    try {
      if (!audio) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); }
      if (audio && audio.state === 'suspended') audio.resume();
    } catch (_) {}
  }
  function chime() {
    try {
      unlockAudio(); if (!audio) return;
      const t0 = audio.currentTime + 0.05;
      [[0, 1], [1.7, 0.6]].forEach(([dt, amp]) => {
        [[523.25, 1], [1046.5, 0.32], [1567.98, 0.16], [2637, 0.06]].forEach(([f, a]) => {
          const o = audio.createOscillator(), g = audio.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t0 + dt);
          g.gain.exponentialRampToValueAtTime(0.14 * a * amp, t0 + dt + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 4.5);
          o.connect(g); g.connect(audio.destination);
          o.start(t0 + dt); o.stop(t0 + dt + 4.6);
        });
      });
    } catch (_) {}
  }

  const api = { ITEMS, mount, mountQuick, render, give, openItem, use, close: () => { closeSheet(); closeOverlay(); }, art: (id) => (ITEMS[id] ? art(id) : '') };
  window.Bag = api;
})();
