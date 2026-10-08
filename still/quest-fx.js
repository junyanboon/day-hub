/* Day Quest habit taps that feel good (Junyan, 2026-10-08: "find a way to make
   clicking these really fun").
   - a burst of the habit's own icon and sparks from the tile, water falls as drops;
   - a soft "bloop" that climbs a pentatonic scale while he keeps tapping
     (a combo: taps less than 6 s apart), and a little run of notes when a
     habit is full for the day;
   - a "Combo x3" tag from the third quick tap on.
   Effects live in a fixed layer on top of the page, so the page redrawing the
   tiles every second never cuts them off. Sound can be switched off per device
   (localStorage quest-fx-sound = "off"). No files, WebAudio only. */
(function (root) {
  "use strict";
  let audio = null, combo = 0, lastTap = 0;
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];   // major pentatonic, semitones
  const soundOn = () => { try { return localStorage.getItem("quest-fx-sound") !== "off"; } catch { return true; } };
  function setSound(on) { try { localStorage.setItem("quest-fx-sound", on ? "on" : "off"); } catch {} }
  function ctx() {
    try {
      if (!audio) { const AC = root.AudioContext || root.webkitAudioContext; if (AC) audio = new AC(); }
      if (audio && audio.state === "suspended") audio.resume();
    } catch { audio = null; }
    return audio;
  }
  function note(semi, at, len, vol, type) {
    const a = ctx(); if (!a) return;
    const f = 440 * Math.pow(2, (semi - 9) / 12) * 2;   // around C5
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f * 0.92, at);
    o.frequency.exponentialRampToValueAtTime(f, at + 0.04);   // a little upward "bloop"
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(a.destination);
    o.start(at); o.stop(at + len + 0.02);
  }
  function play(step, full) {
    if (!soundOn()) return;
    const a = ctx(); if (!a) return;
    const t = a.currentTime + 0.01, s = SCALE[Math.min(step, SCALE.length - 1)];
    note(s, t, 0.22, 0.16, "sine");
    note(s + 12, t, 0.12, 0.04, "triangle");
    if (full) [4, 7, 12, 16].forEach((d, i) => note(s + d, t + 0.09 + i * 0.07, 0.3, 0.09, "sine"));
  }

  let layer = null;
  function getLayer() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement("div");
    layer.className = "fx-layer";
    document.body.appendChild(layer);
    return layer;
  }
  // one particle: emoji or a coloured spark, thrown out and pulled down
  function particle(x, y, content, opts) {
    const p = document.createElement("span");
    p.className = "fx-p" + (content ? "" : " spark");
    if (content) p.textContent = content; else p.style.background = opts.color;
    p.style.left = x + "px"; p.style.top = y + "px";
    getLayer().appendChild(p);
    const ang = opts.ang != null ? opts.ang : Math.random() * Math.PI * 2;
    const sp = opts.speed * (0.6 + Math.random() * 0.7);
    const dx = Math.cos(ang) * sp, dy = Math.sin(ang) * sp - opts.lift;
    const rot = (Math.random() - 0.5) * 120, sc = opts.scale * (0.7 + Math.random() * 0.6);
    const anim = p.animate([
      { transform: `translate(-50%,-50%) scale(${sc * 0.4}) rotate(0deg)`, opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${dy * 0.6}px)) scale(${sc}) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + opts.fall}px)) scale(${sc * 0.8}) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: opts.dur + Math.random() * 200, easing: "cubic-bezier(.2,.7,.4,1)" });
    anim.onfinish = () => p.remove();
  }
  function tag(x, y, text, cls) {
    const t = document.createElement("span");
    t.className = "fx-tag " + (cls || "");
    t.textContent = text;
    t.style.left = x + "px"; t.style.top = y + "px";
    getLayer().appendChild(t);
    const a = t.animate([
      { transform: "translate(-50%,0) scale(.6)", opacity: 0 },
      { transform: "translate(-50%,-14px) scale(1.12)", opacity: 1, offset: 0.25 },
      { transform: "translate(-50%,-46px) scale(1)", opacity: 0 },
    ], { duration: 1100, easing: "ease-out" });
    a.onfinish = () => t.remove();
  }

  /* tap(rect, {icon, gain, full, water, color}): call with the tile's box from
     before the page redraws it. Returns the combo count. */
  function tap(rect, o) {
    const nowT = Date.now();
    combo = nowT - lastTap < 6000 ? combo + 1 : 1;
    lastTap = nowT;
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const reduce = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      if (o.water) {
        for (let i = 0; i < 9; i++) particle(x, y, "💧", { speed: 46, lift: 40, fall: 90, scale: 0.75, dur: 900 });
        const r = document.createElement("span"); r.className = "fx-ring"; r.style.left = x + "px"; r.style.top = y + "px";
        getLayer().appendChild(r); r.animate([{ transform: "translate(-50%,-50%) scale(.3)", opacity: .9 }, { transform: "translate(-50%,-50%) scale(2.6)", opacity: 0 }],
          { duration: 700, easing: "ease-out" }).onfinish = () => r.remove();
      } else {
        const n = o.full ? 7 : 4;
        for (let i = 0; i < n; i++) particle(x, y, o.icon, { speed: 70, lift: 50, fall: 70, scale: 0.9, dur: 900 });
      }
      const sparks = o.full ? 22 : 12;
      for (let i = 0; i < sparks; i++)
        particle(x, y, "", { color: o.full ? "#ffd479" : (o.color || "#8fe3b0"), speed: o.full ? 110 : 80, lift: 20, fall: 40, scale: 1, dur: 700 });
    }
    if (o.gain) tag(x, rect.top - 6, `+${o.gain}`, "gain");
    if (combo >= 3) tag(x, rect.top - 30, `Combo x${combo}`, "combo");
    if (o.full) tag(x, rect.bottom + 4, "Full for today ✨", "full");
    play(combo - 1, o.full);
    if (navigator.vibrate) navigator.vibrate(o.full ? [20, 40, 30] : 15);
    return combo;
  }
  // a tap on a habit that is already full: a small shake and a low note
  function nope(el) {
    if (el && el.animate) el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }], { duration: 220 });
    if (soundOn()) { const a = ctx(); if (a) note(-5, a.currentTime + 0.01, 0.18, 0.08, "triangle"); }
  }
  // the new tile after the redraw gets a springy pop
  function pop(el) {
    if (el && el.animate) el.animate([{ transform: "scale(.82)" }, { transform: "scale(1.12)", offset: 0.45 }, { transform: "scale(.97)", offset: 0.75 }, { transform: "scale(1)" }],
      { duration: 420, easing: "ease-out" });
  }

  root.QuestFx = { tap, nope, pop, soundOn, setSound };
})(window);
