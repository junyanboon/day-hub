/* Day Quest keepsakes (Junyan, 2026-10-09): "design me beautiful items that help me to
   remember what amazing activities I did in prior days. If I use the item it really needs
   to do something special for me that can bring me immense joy like a song, poem, etc.
   related directly to the item."

   One object per amazing moment (a stone from the Famine Stela climb, a vial of sand from
   the quad bikes). Using it opens Relive: the object large, its own tune (composed for the
   place: Hijaz on the ney for the pyramids, a bright kalimba for the Red Sea), and its poem
   appearing line by line with the music, then the facts of the day. Never used up.

   The keepsakes come from still-api /quest/keeps (written by Claude sessions and the
   insight agent's evening run). bag.js shows them on a shelf in the bag and in the quick
   slots; this file draws them and plays them.
   window.Keeps = { art(keep, uid), relive(keep), stop() } */
(function (root) {
  "use strict";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const shadow = (rx) => `<ellipse cx="60" cy="111" rx="${rx || 30}" ry="4.5" fill="#000" opacity=".38"/>`;
  const tw = (x, y, r, d) => `<path class="kp-tw" style="animation-delay:${d || 0}s" d="M${x} ${y - r}L${x + r * .24} ${y - r * .24}L${x + r} ${y}L${x + r * .24} ${y + r * .24}L${x} ${y + r}L${x - r * .24} ${y + r * .24}L${x - r} ${y}L${x - r * .24} ${y - r * .24}Z" fill="#fff8e1"/>`;
  // lighten or darken a #rrggbb colour by f (-1..1)
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), t = f < 0 ? 0 : 255, p = Math.abs(f);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round((t - v) * p + v));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- the objects, 120 x 120 ---------- */
  const ART = {
    // the festival wristband: woven loop, beads, a small metal tag
    wristband: (u, [a, b]) => {
      const bead = (deg, col, r) => { const t = deg * Math.PI / 180, x = 60 + 38 * Math.cos(t), y = 60 + 20 * Math.sin(t);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${col}"/><circle cx="${(x - r * .35).toFixed(1)}" cy="${(y - r * .35).toFixed(1)}" r="${(r * .35).toFixed(1)}" fill="#fff" opacity=".7"/>`; };
      return `<defs>
 <linearGradient id="${u}f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(a, -.35)}"/><stop offset=".45" stop-color="${a}"/><stop offset=".6" stop-color="${shade(a, .25)}"/><stop offset="1" stop-color="${shade(a, -.4)}"/></linearGradient>
 <linearGradient id="${u}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#b8bfd6"/><stop offset=".7" stop-color="#eef1ff"/><stop offset="1" stop-color="#7d86a6"/></linearGradient>
</defs>${shadow(34)}
<path d="M22 60 A38 20 0 0 1 98 60" fill="none" stroke="${shade(a, -.5)}" stroke-width="11"/>
<path d="M22 60 A38 20 0 0 1 98 60" fill="none" stroke="${b}" stroke-opacity=".35" stroke-width="2.5" stroke-dasharray="3 4"/>
<g class="kp-sway">
 <path d="M22 60 A38 20 0 0 0 98 60" fill="none" stroke="url(#${u}f)" stroke-width="12" stroke-linecap="round"/>
 <path d="M22 60 A38 20 0 0 0 98 60" fill="none" stroke="${b}" stroke-width="3" stroke-dasharray="4 3.5"/>
 <path d="M26 62 A35 17 0 0 0 94 62" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/>
 ${bead(45, b, 3.4)}${bead(65, "#fff7e6", 3)}${bead(115, "#fff7e6", 3)}${bead(135, b, 3.4)}
 <path d="M60 80 V86" stroke="url(#${u}m)" stroke-width="1.6"/>
 <circle cx="60" cy="81" r="2.6" fill="none" stroke="url(#${u}m)" stroke-width="1.4"/>
 <rect x="47" y="86" width="26" height="13" rx="3.5" fill="url(#${u}m)"/>
 <text x="60" y="95" text-anchor="middle" font-size="6.2" font-weight="700" letter-spacing=".8" fill="#3a3f5c" font-family="ui-sans-serif,system-ui">CAIRO</text>
</g>${tw(96, 34, 3.6, .3)}${tw(24, 40, 2.6, 1.4)}`;
    },
    // a limestone chip shaped like the pyramid, gold cap, the sun behind
    giza: (u, [a, b]) => `<defs>
 <radialGradient id="${u}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6d6"/><stop offset=".4" stop-color="${b}" stop-opacity=".8"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>
 <linearGradient id="${u}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(a, .35)}"/><stop offset="1" stop-color="${shade(a, -.15)}"/></linearGradient>
 <linearGradient id="${u}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(a, -.25)}"/><stop offset="1" stop-color="${shade(a, -.55)}"/></linearGradient>
 <linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b8"/><stop offset=".5" stop-color="#e8b23e"/><stop offset="1" stop-color="#8a5a12"/></linearGradient>
</defs>${shadow(36)}
<circle class="kp-glow" cx="80" cy="38" r="24" fill="url(#${u}s)"/>
<ellipse cx="60" cy="98" rx="40" ry="6" fill="${shade(a, -.3)}" opacity=".6"/>
<path d="M58 26 L24 94 L60 99 Z" fill="url(#${u}l)"/>
<path d="M58 26 L60 99 L96 91 Z" fill="url(#${u}r)"/>
<g stroke="#000" stroke-opacity=".12" stroke-width=".8">
 <path d="M48 46 L59 47 L78 45"/><path d="M41 60 L59.5 62 L84 58"/><path d="M34 74 L60 77 L89 72"/><path d="M28 87 L60 91 L93 85"/>
</g>
<path d="M58 26 L52 38 L58.6 39 L65 37 Z" fill="url(#${u}g)"/>
<path d="M58 26 L24 94" stroke="#fff" stroke-opacity=".45" stroke-width="1.2"/>
${tw(92, 20, 3.4, .6)}${tw(30, 30, 2.4, 1.8)}`,
    // a scallop shell from the Red Sea, sea-wet shine
    shell: (u, [a, b]) => {
      const tips = [[24, 54], [31, 40], [42, 30], [58, 25], [74, 29], [86, 38], [95, 52]];
      return `<defs>
 <radialGradient id="${u}f" cx="50%" cy="20%" r="85%"><stop offset="0" stop-color="#fffaf4"/><stop offset=".45" stop-color="${a}"/><stop offset="1" stop-color="${shade(a, -.35)}"/></radialGradient>
 <radialGradient id="${u}w" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${b}" stop-opacity=".5"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>
</defs>${shadow(32)}
<ellipse class="kp-glow" cx="60" cy="96" rx="44" ry="10" fill="url(#${u}w)"/>
<g class="kp-sway">
 <path d="M60 96 L21 58 Q22 44 31 37 Q35 29 43 28 Q50 22 58 23 Q67 21 74 26 Q83 26 88 34 Q98 41 99 56 Z" fill="url(#${u}f)" stroke="${shade(a, -.4)}" stroke-width="1"/>
 <g stroke="${shade(a, -.45)}" stroke-opacity=".55" stroke-width="1.3" fill="none">${tips.map(([x, y]) => `<path d="M60 95 Q${(60 + x) / 2} ${(95 + y) / 2 - 4} ${x} ${y}"/>`).join("")}</g>
 <path d="M48 96 L52 88 L68 88 L72 96 Q60 100 48 96 Z" fill="${shade(a, -.2)}" stroke="${shade(a, -.45)}" stroke-width=".8"/>
 <path d="M36 44 Q46 32 58 30" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2.2" stroke-linecap="round"/>
 <circle cx="70" cy="62" r="1.8" fill="#fff" opacity=".85"/><circle cx="46" cy="70" r="1.2" fill="#fff" opacity=".7"/>
</g>${tw(100, 30, 3.2, .2)}${tw(18, 30, 2.4, 1.2)}`;
    },
    // a glass vial of desert sand, gold on top, rose where the sun set
    sand: (u, [a, b]) => `<defs>
 <linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfe6ff" stop-opacity=".45"/><stop offset=".3" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#9ab8e8" stop-opacity=".4"/></linearGradient>
 <linearGradient id="${u}c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e4220"/><stop offset=".4" stop-color="#d9a873"/><stop offset="1" stop-color="#5f3818"/></linearGradient>
 <linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(a, .3)}"/><stop offset="1" stop-color="${a}"/></linearGradient>
 <linearGradient id="${u}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${shade(b, -.35)}"/></linearGradient>
 <clipPath id="${u}k"><rect x="38" y="34" width="44" height="70" rx="17"/></clipPath>
</defs>${shadow(26)}
<g clip-path="url(#${u}k)">
 <rect x="30" y="30" width="60" height="80" fill="#1d2550" opacity=".35"/>
 <path d="M30 70 Q44 58 56 66 T90 62 V110 H30 Z" fill="url(#${u}s)"/>
 <path d="M30 84 Q46 76 60 82 T90 80 V110 H30 Z" fill="url(#${u}r)"/>
 <path d="M30 95 Q48 90 62 94 T90 93 V110 H30 Z" fill="${shade(b, -.5)}" opacity=".85"/>
 <circle class="kp-glow" cx="68" cy="50" r="5" fill="#fff4cc" opacity=".9"/>
</g>
<rect x="38" y="34" width="44" height="70" rx="17" fill="url(#${u}g)" stroke="#e6f1ff" stroke-opacity=".7" stroke-width="1.5"/>
<path d="M45 46 C43 60 43 80 46 92" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="3" stroke-linecap="round"/>
<rect x="49" y="26" width="22" height="10" rx="2" fill="#dfeaff" opacity=".55"/>
<rect x="47" y="14" width="26" height="14" rx="4" fill="url(#${u}c)"/>
<path d="M47 30 H73 M48 32.5 H72" stroke="#c9a06a" stroke-width="1.2"/>
${tw(92, 28, 3.4, .4)}${tw(28, 56, 2.4, 1.6)}`,
    // a blue faience scarab with gold, pushing the sun
    scarab: (u, [a, b]) => `<defs>
 <radialGradient id="${u}f" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${shade(a, .5)}"/><stop offset=".55" stop-color="${a}"/><stop offset="1" stop-color="${shade(a, -.5)}"/></radialGradient>
 <linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b8"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${shade(b, -.45)}"/></linearGradient>
 <radialGradient id="${u}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff1c2"/><stop offset=".5" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ff6a3c" stop-opacity="0"/></radialGradient>
</defs>${shadow(28)}
<circle class="kp-glow" cx="60" cy="17" r="13" fill="url(#${u}s)"/>
<circle cx="60" cy="17" r="6" fill="#ffcf6b"/>
<g stroke="url(#${u}g)" stroke-width="2.4" stroke-linecap="round" fill="none">
 <path d="M38 52 L27 46 L22 50"/><path d="M36 66 L24 68"/><path d="M38 82 L27 90 L24 96"/>
 <path d="M82 52 L93 46 L98 50"/><path d="M84 66 L96 68"/><path d="M82 82 L93 90 L96 96"/>
</g>
<path d="M48 36 Q60 24 72 36 Q66 42 60 42 Q54 42 48 36 Z" fill="url(#${u}f)" stroke="url(#${u}g)" stroke-width="1.6"/>
<ellipse cx="60" cy="70" rx="25" ry="30" fill="url(#${u}f)" stroke="url(#${u}g)" stroke-width="2.4"/>
<path d="M36 54 Q60 63 84 54" fill="none" stroke="url(#${u}g)" stroke-width="2"/>
<path d="M60 58 V99" stroke="url(#${u}g)" stroke-width="2"/>
<g fill="${shade(a, -.55)}" opacity=".55"><circle cx="49" cy="72" r="1.3"/><circle cx="71" cy="72" r="1.3"/><circle cx="51" cy="84" r="1.1"/><circle cx="69" cy="84" r="1.1"/></g>
<path d="M44 66 Q46 56 54 54" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.4" stroke-linecap="round"/>
${tw(94, 26, 3.2, .7)}${tw(26, 24, 2.2, 1.5)}`,
    // a painted Nubian tile: sky blue, sunflower yellow, an arched door with a star
    tile: (u, [a, b]) => {
      const tri = (y, up) => Array.from({ length: 8 }, (_, i) => { const x = 25 + i * 8.75;
        return `<path d="M${x} ${y} L${x + 4.4} ${y + (up ? -6 : 6)} L${x + 8.75} ${y} Z"/>`; }).join("");
      return `<defs>
 <linearGradient id="${u}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(a, .25)}"/><stop offset="1" stop-color="${shade(a, -.25)}"/></linearGradient>
 <linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>${shadow(34)}
<g transform="rotate(-6 60 60)">
 <rect x="23" y="22" width="74" height="76" rx="5" fill="#f4ead8"/>
 <rect x="25" y="24" width="70" height="72" rx="4" fill="url(#${u}f)"/>
 <g fill="${b}">${tri(24, false)}${tri(96, true)}</g>
 <path d="M44 90 V60 A16 16 0 0 1 76 60 V90 Z" fill="#f7f1e3"/>
 <path d="M49 90 V61 A11 11 0 0 1 71 61 V90 Z" fill="${shade(a, -.55)}"/>
 <path d="M60 41 l2 4.6 5 .5 -3.8 3.3 1.2 4.9 -4.4 -2.6 -4.4 2.6 1.2 -4.9 -3.8 -3.3 5 -.5 Z" fill="${b}"/>
 <circle cx="84" cy="36" r="5" fill="${b}"/><path d="M33 50 a6 6 0 1 0 6 -7 a4.6 4.6 0 1 1 -6 7 Z" fill="#f7f1e3"/>
 <path d="M44 90 H76" stroke="${b}" stroke-width="2"/>
 <rect x="25" y="24" width="70" height="72" rx="4" fill="url(#${u}s)"/>
 <path d="M30 40 l6 8 M80 74 l5 -6 l3 5" stroke="#fff" stroke-opacity=".18" stroke-width=".7" fill="none"/>
</g>${tw(100, 26, 3.2, .5)}`;
    },
    // a slab of warm granite like the Famine Stela, carved with sun, water and an ankh
    stela: (u, [a, b]) => `<defs>
 <linearGradient id="${u}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(a, .3)}"/><stop offset=".6" stop-color="${a}"/><stop offset="1" stop-color="${shade(a, -.45)}"/></linearGradient>
 <radialGradient id="${u}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff2c8"/><stop offset=".5" stop-color="${b}" stop-opacity=".6"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>
</defs>${shadow(32)}
<circle class="kp-glow" cx="34" cy="28" r="22" fill="url(#${u}s)"/>
<path d="M34 100 V42 Q34 22 60 22 Q86 22 86 42 V100 Z" fill="url(#${u}f)"/>
<g fill="#000" opacity=".13"><circle cx="42" cy="50" r="1"/><circle cx="76" cy="44" r="1.2"/><circle cx="70" cy="88" r="1"/><circle cx="44" cy="84" r=".9"/><circle cx="58" cy="94" r="1.1"/><circle cx="80" cy="70" r=".8"/></g>
<g fill="#fff" opacity=".18"><circle cx="50" cy="40" r=".9"/><circle cx="66" cy="78" r=".8"/><circle cx="40" cy="66" r=".7"/></g>
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
 <g stroke="#000" stroke-opacity=".35" stroke-width="1.6" transform="translate(.6 .8)">
  <circle cx="60" cy="34" r="3.6"/><path d="M56 34 Q48 30 42 33 M64 34 Q72 30 78 33"/>
  <path d="M44 48 h32 M44 50.5 h32"/>
  <path d="M48 58 a3 3 0 1 1 0.1 0 M48 61 V70 M44 64 H52"/>
  <path d="M58 58 l3 3 l3 -3 l3 3 l3 -3 M58 64 l3 3 l3 -3 l3 3 l3 -3"/>
  <path d="M74 58 v12 M77 60 v10"/>
  <path d="M44 78 h32 M48 86 l3 -4 l3 4 M58 86 q4 -6 8 0 M70 82 h6 v4 h-6 Z"/>
 </g>
 <g stroke="#fff" stroke-opacity=".35" stroke-width="1.2">
  <circle cx="60" cy="34" r="3.6"/><path d="M56 34 Q48 30 42 33 M64 34 Q72 30 78 33"/>
  <path d="M44 48 h32"/>
  <path d="M48 58 a3 3 0 1 1 0.1 0 M48 61 V70 M44 64 H52"/>
  <path d="M58 58 l3 3 l3 -3 l3 3 l3 -3 M58 64 l3 3 l3 -3 l3 3 l3 -3"/>
  <path d="M74 58 v12 M77 60 v10"/>
  <path d="M44 78 h32 M48 86 l3 -4 l3 4 M58 86 q4 -6 8 0 M70 82 h6 v4 h-6 Z"/>
 </g>
</g>
<path d="M36 44 Q37 28 54 24" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="2" stroke-linecap="round"/>
<path d="M26 100 Q60 94 94 100 L98 104 H22 Z" fill="${shade(a, -.4)}"/>
${tw(92, 24, 3.2, 1)}`,
    // a sandboard on a golden dune, sand spraying off the tail
    board: (u, [a, b]) => `<defs>
 <linearGradient id="${u}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(a, .25)}"/><stop offset="1" stop-color="${shade(a, -.3)}"/></linearGradient>
 <linearGradient id="${u}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(b, .35)}"/><stop offset=".6" stop-color="${b}"/><stop offset="1" stop-color="${shade(b, -.4)}"/></linearGradient>
 <radialGradient id="${u}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff4cc"/><stop offset=".45" stop-color="#ffb35c" stop-opacity=".7"/><stop offset="1" stop-color="#ff8a3c" stop-opacity="0"/></radialGradient>
 <clipPath id="${u}k"><circle cx="60" cy="60" r="50"/></clipPath>
</defs>${shadow(34)}
<g clip-path="url(#${u}k)">
 <circle class="kp-glow" cx="86" cy="32" r="20" fill="url(#${u}s)"/>
 <path d="M0 86 Q30 62 62 74 T130 66 V130 H0 Z" fill="${shade(a, .1)}" opacity=".55"/>
 <path d="M0 100 Q40 76 74 90 T130 86 V130 H0 Z" fill="url(#${u}d)"/>
 <path d="M10 94 Q40 80 70 90" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/>
</g>
<g class="kp-sway">
 <g fill="${shade(a, .35)}"><circle cx="24" cy="80" r="1.6"/><circle cx="19" cy="74" r="1.1"/><circle cx="28" cy="72" r="1.3"/><circle cx="15" cy="82" r="1"/><circle cx="22" cy="66" r=".8"/></g>
 <g transform="rotate(-24 60 66)">
  <rect x="26" y="58" width="70" height="16" rx="8" fill="url(#${u}b)" stroke="${shade(b, -.5)}" stroke-width="1"/>
  <path d="M40 58 V74 M46 58 V74" stroke="#fff" stroke-opacity=".8" stroke-width="2.2"/>
  <path d="M74 58 V74" stroke="${a}" stroke-width="3"/>
  <path d="M32 61.5 H90" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/>
  <rect x="54" y="62" width="10" height="8" rx="2" fill="#262c52" opacity=".75"/><rect x="66" y="62" width="10" height="8" rx="2" fill="#262c52" opacity=".75"/>
 </g>
</g>${tw(30, 28, 3, .8)}`,
    // anything else: a glass memory orb with the day's colours swirling inside
    orb: (u, [a, b]) => `<defs>
 <radialGradient id="${u}f" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${shade(a, .55)}"/><stop offset=".5" stop-color="${a}"/><stop offset="1" stop-color="${shade(b, -.4)}"/></radialGradient>
 <clipPath id="${u}k"><circle cx="60" cy="58" r="36"/></clipPath>
</defs>${shadow(28)}
<circle cx="60" cy="58" r="36" fill="url(#${u}f)"/>
<g clip-path="url(#${u}k)" class="kp-spin"><path d="M24 64 Q42 36 60 58 T96 50" fill="none" stroke="${b}" stroke-width="7" stroke-opacity=".7" stroke-linecap="round"/>
 <path d="M28 80 Q50 60 66 74 T98 70" fill="none" stroke="#fff" stroke-width="3" stroke-opacity=".35" stroke-linecap="round"/></g>
<circle cx="60" cy="58" r="36" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4"/>
<path d="M36 44 Q44 30 60 27" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="3" stroke-linecap="round"/>
<path d="M44 94 h32 l-4 8 h-24 Z" fill="#c9a06a"/>${tw(60, 58, 3, 0)}${tw(96, 26, 2.6, 1)}`,
  };
  let uid = 0;
  function art(k, u) {
    const f = ART[k && k.art] || ART.orb, pal = (k && k.palette) || ["#e9b872", "#6b4bb8"];
    return f(u || "kp" + (++uid) + "_", pal);
  }
  const svg = (k, cls) => `<svg class="kp-art ${cls || ""}" viewBox="0 0 120 120" aria-hidden="true">${art(k)}</svg>`;

  /* ---------- the music: a soft synth, its own tune per keepsake ---------- */
  let ac = null, out = null, verbIn = null, playing = null;
  function newOut() { out = ac.createGain(); out.gain.value = .9; out.connect(ac.destination); out.connect(verbIn); }
  function audio() {
    try {
      if (!ac) {
        const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
        ac = new AC();
        // a small room: generated reverb, so the notes ring
        const len = Math.round(ac.sampleRate * 2.6), ir = ac.createBuffer(2, len, ac.sampleRate);
        for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
        const verb = ac.createConvolver(); verb.buffer = ir;
        const wet = ac.createGain(); wet.gain.value = .32;
        verb.connect(wet); wet.connect(ac.destination); verbIn = verb;
        newOut();
      }
      if (ac.state === "suspended") ac.resume();
    } catch { ac = null; }
    return ac;
  }
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(n) {
    const m = /^([A-G])(#|b)?(\d)$/.exec(n); if (!m) return 0;
    const semi = NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (+m[3] + 1) * 12;   // MIDI number
    return 440 * Math.pow(2, (semi - 69) / 12);
  }
  // "D4:1 Eb4:.5 r:1 | ..." -> [{f, beats}]
  function parse(s) {
    return String(s || "").replace(/\|/g, " ").split(/\s+/).filter(Boolean).map((t) => {
      const [n, b] = t.split(":"); return { f: n === "r" ? 0 : freq(n), beats: Math.max(.125, +b || 1) };
    });
  }
  function tone(inst, f, t, dur, vol) {
    const a = ac, g = a.createGain(); g.connect(out);
    const osc = (type, fr, det) => { const o = a.createOscillator(); o.type = type; o.frequency.value = fr; if (det) o.detune.value = det; return o; };
    if (inst === "ney") {   // breathy flute: sine with a slow vibrato and a little air
      const o = osc("sine", f), o2 = osc("triangle", f * 2), g2 = a.createGain(); g2.gain.value = .12;
      const lfo = osc("sine", 5.2), lg = a.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * .012, t + Math.min(.4, dur));
      lfo.connect(lg); lg.connect(o.frequency);
      const len = Math.max(.2, dur * .95);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .09); g.gain.setValueAtTime(vol, t + len - .12); g.gain.exponentialRampToValueAtTime(.0001, t + len + .25);
      o.connect(g); o2.connect(g2); g2.connect(g);
      const nb = a.createBuffer(1, a.sampleRate * .3, a.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const ns = a.createBufferSource(), bp = a.createBiquadFilter(), ng = a.createGain(); ns.buffer = nb; bp.type = "bandpass"; bp.frequency.value = f * 2; bp.Q.value = 2;
      ng.gain.setValueAtTime(vol * .35, t); ng.gain.exponentialRampToValueAtTime(.0001, t + .25); ns.connect(bp); bp.connect(ng); ng.connect(out);
      [o, o2, lfo].forEach((x) => { x.start(t); x.stop(t + len + .3); }); ns.start(t);
      return;
    }
    if (inst === "oud") {   // plucked: bright sawtooth through a closing filter
      const o = osc("sawtooth", f, -4), o2 = osc("sawtooth", f, 5), lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3;
      lp.frequency.setValueAtTime(Math.min(6000, f * 9), t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.2), t + .5);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol * .55, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + Math.max(.5, dur * 1.4));
      o.connect(lp); o2.connect(lp); lp.connect(g); [o, o2].forEach((x) => { x.start(t); x.stop(t + dur * 1.4 + .6); });
      return;
    }
    // kalimba and bell: struck partials that ring and fade
    const parts = inst === "bell" ? [[1, 1, 3.2], [2.76, .35, 1.6], [5.4, .18, .9], [8.93, .08, .5]] : [[1, 1, 1.6], [3.0, .08, .25], [5.4, .12, .12]];
    for (const [m, amp, dec] of parts) {
      const o = osc("sine", f * m), pg = a.createGain();
      pg.gain.setValueAtTime(.0001, t); pg.gain.exponentialRampToValueAtTime(vol * amp, t + .004); pg.gain.exponentialRampToValueAtTime(.0001, t + dec);
      o.connect(pg); pg.connect(out); o.start(t); o.stop(t + dec + .05);
    }
  }
  // plays the song (twice if it is short); returns its length in seconds
  function play(song) {
    stop();
    const a = audio(); if (!a || !song) return 0;
    const notes = parse(song.notes), spb = 60 / (song.bpm || 72);
    let beats = notes.reduce((s, n) => s + n.beats, 0);
    const reps = beats * spb < 26 ? 2 : 1, t0 = a.currentTime + .15, inst = song.inst || "kalimba";
    const vol = inst === "ney" ? .16 : inst === "oud" ? .2 : .22;
    let t = t0;
    for (let r = 0; r < reps; r++) for (const n of notes) { if (n.f) tone(inst, n.f, t, n.beats * spb, vol); t += n.beats * spb; }
    const total = t - t0;
    const df = freq(song.drone || "");
    const nodes = [];
    if (df) {   // a soft drone under it all, like a tanpura or the hum of the place
      const g = a.createGain(); g.connect(out);
      g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.05, t0 + 2.5); g.gain.setValueAtTime(.05, t0 + total - 1); g.gain.exponentialRampToValueAtTime(.0001, t0 + total + 2.5);
      for (const [m, type] of [[1, "sine"], [1.5, "sine"], [2, "triangle"]]) {
        const o = a.createOscillator(); o.type = type; o.frequency.value = df * m; o.detune.value = m === 1.5 ? 2 : 0;
        const og = a.createGain(); og.gain.value = m === 1 ? 1 : .35; o.connect(og); og.connect(g); o.start(t0); o.stop(t0 + total + 3); nodes.push(o);
      }
      nodes.push(g);
    }
    playing = { stopAt: t0 + total, nodes };
    return total + .15;
  }
  function stop() {
    if (!playing || !ac) return;
    try { out.gain.cancelScheduledValues(ac.currentTime); out.gain.setValueAtTime(out.gain.value, ac.currentTime); out.gain.linearRampToValueAtTime(0, ac.currentTime + .4); } catch {}
    const old = out;
    setTimeout(() => { try { old.disconnect(); } catch {} }, 500);
    // a fresh output for the next song (the old one carries the scheduled notes away)
    newOut();
    playing = null;
  }

  /* ---------- Relive: the object, its tune, its poem ---------- */
  const fmtDay = (ymd) => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  let ov = null, timers = [];
  function close() {
    stop(); timers.forEach(clearTimeout); timers = [];
    if (!ov) return; const o = ov; ov = null;
    o.classList.remove("open"); setTimeout(() => o.remove(), 450);
  }
  function relive(k, opts) {
    if (!k) return;
    close();
    const el = document.createElement("div");
    el.className = "kp-ov";
    el.style.setProperty("--k1", k.palette[0]); el.style.setProperty("--k2", k.palette[1]);
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", k.name);
    const motes = Array.from({ length: 18 }, (_, i) => `<i style="left:${(i * 53) % 100}%;animation-delay:${(i * .7) % 9}s;animation-duration:${9 + (i % 5) * 2}s"></i>`).join("");
    el.innerHTML = `<div class="kp-motes">${motes}</div>
      <div class="kp-top"><span>Keepsake</span><span><button class="kp-b" data-k="mute" aria-label="Sound">🔊</button><button class="kp-b" data-k="x" aria-label="Close">×</button></span></div>
      <div class="kp-body">
        <div class="kp-hero"><span class="kp-halo"></span>${svg(k, "kp-big")}</div>
        <div class="kp-name">${esc(k.name)}</div>
        <div class="kp-when">${esc(fmtDay(k.date))}${k.place ? " · " + esc(k.place) : ""}${k.title ? "<br>" + esc(k.title) : ""}</div>
        <div class="kp-poem">${k.poem.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
        <div class="kp-facts">${(k.facts || []).map((l) => `<div>${esc(l)}</div>`).join("")}</div>
        <div class="kp-acts"><button class="kp-again" data-k="again">↻ Play it again</button></div>
      </div>`;
    document.body.appendChild(el); ov = el;
    requestAnimationFrame(() => el.classList.add("open"));
    let muted = false;
    const lines = [...el.querySelectorAll(".kp-poem p")], facts = el.querySelector(".kp-facts"), acts = el.querySelector(".kp-acts");
    const run = () => {
      timers.forEach(clearTimeout); timers = [];
      lines.forEach((p) => p.classList.remove("on")); facts.classList.remove("on"); acts.classList.remove("on");
      const secs = muted ? 0 : play(k.song);
      const span = Math.max(lines.length * 2.6, secs || 0), lead = 1.6, step = (span - lead - 2) / Math.max(1, lines.length);
      lines.forEach((p, i) => timers.push(setTimeout(() => { p.classList.add("on"); p.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, (lead + i * step) * 1000)));
      timers.push(setTimeout(() => { facts.classList.add("on"); acts.classList.add("on"); facts.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, (lead + lines.length * step + 1) * 1000));
    };
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-k]"); if (!b) return;
      if (b.dataset.k === "x") close();
      if (b.dataset.k === "again") { el.querySelector(".kp-body").scrollTo({ top: 0, behavior: "smooth" }); run(); }
      if (b.dataset.k === "mute") { muted = !muted; b.textContent = muted ? "🔇" : "🔊"; if (muted) stop(); else run(); }
    });
    document.addEventListener("keydown", function esc1(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc1); } });
    run();
    if (opts && opts.onOpen) opts.onOpen();
  }

  const css = document.createElement("style");
  css.textContent = `
  @keyframes kp-tw { 0%,100% { opacity:.15; transform:scale(.6) } 50% { opacity:1; transform:scale(1) } }
  @keyframes kp-glow { 0%,100% { opacity:.75 } 50% { opacity:1 } }
  @keyframes kp-sway { 0%,100% { transform:rotate(-2deg) } 50% { transform:rotate(2deg) } }
  @keyframes kp-spin { to { transform:rotate(360deg) } }
  .kp-art .kp-tw { transform-box:fill-box; transform-origin:center; animation:kp-tw 2.8s ease-in-out infinite; }
  .kp-art .kp-glow { animation:kp-glow 4s ease-in-out infinite; }
  .kp-art .kp-sway { transform-box:view-box; transform-origin:60px 70px; animation:kp-sway 6s ease-in-out infinite; }
  .kp-art .kp-spin { transform-box:view-box; transform-origin:60px 58px; animation:kp-spin 24s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .kp-art * { animation:none !important } }
  .kp-ov { position:fixed; inset:0; z-index:90; color:#fff7ea; opacity:0; transition:opacity .45s;
    background: radial-gradient(90% 55% at 50% 22%, color-mix(in srgb, var(--k1) 38%, transparent), transparent 70%),
      radial-gradient(80% 50% at 50% 100%, color-mix(in srgb, var(--k2) 30%, transparent), transparent 70%), #0e1028;
    display:flex; flex-direction:column; padding-top:env(safe-area-inset-top); }
  .kp-ov.open { opacity:1; }
  .kp-motes { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
  .kp-motes i { position:absolute; bottom:-10px; width:3px; height:3px; border-radius:50%; background:color-mix(in srgb, var(--k1) 70%, white);
    opacity:.0; animation:kp-rise linear infinite; }
  @keyframes kp-rise { 0% { transform:translateY(0); opacity:0 } 15% { opacity:.7 } 100% { transform:translateY(-105vh) translateX(30px); opacity:0 } }
  .kp-top { position:relative; display:flex; justify-content:space-between; align-items:center; padding:12px 16px; font-size:11px;
    letter-spacing:.16em; text-transform:uppercase; color:rgba(255,247,234,.6); }
  .kp-b { background:rgba(255,255,255,.1); border:0; color:#fff; width:36px; height:36px; border-radius:50%; font-size:18px; margin-left:8px; cursor:pointer; }
  .kp-body { position:relative; flex:1; overflow:auto; padding:0 20px calc(env(safe-area-inset-bottom) + 40px); text-align:center; scrollbar-width:none; }
  .kp-hero { position:relative; width:210px; height:210px; margin:4px auto 0; }
  .kp-halo { position:absolute; inset:-20px; border-radius:50%; background:radial-gradient(circle, color-mix(in srgb, var(--k1) 55%, transparent), transparent 66%);
    animation:kp-glow 4s ease-in-out infinite; }
  .kp-big { position:relative; width:100%; height:100%; animation:kp-float 6s ease-in-out infinite; filter:drop-shadow(0 18px 30px rgba(0,0,0,.45)); }
  @keyframes kp-float { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-8px) } }
  .kp-name { font-size:26px; font-weight:700; margin-top:6px; text-shadow:0 0 22px color-mix(in srgb, var(--k1) 60%, transparent); }
  .kp-when { font-size:13px; color:rgba(255,247,234,.62); margin-top:6px; line-height:1.5; }
  .kp-poem { max-width:440px; margin:26px auto 0; font-family:ui-serif, Georgia, "Iowan Old Style", serif; font-size:19px; line-height:1.55; }
  .kp-poem p { margin:0 0 6px; opacity:0; transform:translateY(8px); filter:blur(4px); transition:opacity 1.4s, transform 1.4s, filter 1.4s; }
  .kp-poem p.on { opacity:1; transform:none; filter:none; }
  .kp-facts { max-width:420px; margin:26px auto 0; font-size:13px; color:rgba(255,247,234,.7); opacity:0; transition:opacity 1.2s;
    border-top:1px solid rgba(255,255,255,.12); padding-top:14px; line-height:1.7; }
  .kp-facts.on, .kp-acts.on { opacity:1; }
  .kp-acts { margin-top:18px; opacity:0; transition:opacity 1.2s; }
  .kp-again { background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2); color:#fff; padding:10px 18px; border-radius:999px; font:inherit; font-size:14px; cursor:pointer; }
  /* in the bag: keepsakes have a rose-gold rim and sit on their own shelf */
  .r-keep .bag-rim > b { background:conic-gradient(#f0a6c0, #ffe2b8, #e9b872, #c58fd6, #ffd6e6, #f0a6c0); animation:bag-spin 12s linear infinite; }
  .r-keep .bag-glow { background:radial-gradient(circle at 50% 56%, rgba(240,166,192,.36), transparent 66%); }
  .bag-sheet.r-keep { background:radial-gradient(120% 55% at 50% 0%, rgba(240,166,192,.22), transparent 62%), linear-gradient(180deg, #2c2c5e 0%, #1d2149 60%, #171a3c 100%); }
  .bag-hero.r-keep .bag-hero-glow { background:radial-gradient(circle, rgba(255,214,190,.55), rgba(197,143,214,.16) 45%, transparent 68%); }
  .bag-sheet.r-keep .bag-dname { color:#ffe9dc; text-shadow:0 0 18px rgba(240,166,192,.45); }
  .bag-tag.r-keep { color:#3a1a2a; background:linear-gradient(90deg, #f0a6c0, #ffe2b8, #f0a6c0); box-shadow:0 0 16px rgba(240,166,192,.5); }
  .bag-sheet.r-keep .bag-use { background:linear-gradient(180deg, #ffe9dc, #f0a6c0) !important; color:#3a1a2a; }
  .bag-toast-art.r-keep { background:radial-gradient(circle, rgba(240,166,192,.5), #161a3c 72%); }
  .bag-shelf { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; }
  .bag-shelf .bag-sock { aspect-ratio:1; }
  .bag-shelf-when { position:absolute; left:0; right:0; bottom:3px; text-align:center; font-size:9.5px; color:rgba(255,247,234,.7); text-shadow:0 1px 2px #000; pointer-events:none; }
  .bag-shelf-empty { grid-column:1 / -1; font-size:12px; color:rgba(255,255,255,.5); padding:6px 2px; }
  `;
  document.head.appendChild(css);
  root.Keeps = { art, svg, relive, stop: close, fmtDay };
})(window);
