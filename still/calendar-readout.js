/* The calendar's hidden readout (Junyan, 2026-11-12, d18: "18 yes"). calendar.html loads this file only after five
   quick taps on the month name; five more taps, or the x, close it. It is for a screenshot from his phone:
   - the top lines never change while open: the build, the phone's answers (touch, hover, pointer, standalone, the
     service worker, Last-Modified);
   - the geometry lines refresh live: the window, the visual viewport, the safe areas, where the bars and the day
     header sit, the shown day and the strip's slide;
   - the log, newest first, 12 lines: day changes with their cause, swipe lock decisions, scrolls, wheel, resize and
     visual viewport moves, strip slides. Pause freezes it for the screenshot.
   Times in the log are seconds since the readout opened. */
(function () {
  "use strict";
  const H = window.CalHook;
  if (!H || window.CalReadout) return;
  const t0 = performance.now(), log = [];
  let lastDay = "none yet", paused = false, open = false, timer = 0, lastWinY = null, lastL = null, lastT = null;
  const css = document.createElement("style");
  /* Taps go through the box to whatever is under it (the event sheet sits there on a phone); only its two buttons take
     taps (Junyan, 2026-11-12: "when I click stuff nothing happens"). */
  css.textContent = `#readout{position:fixed;left:4px;right:4px;bottom:calc(64px + env(safe-area-inset-bottom,0px));max-height:52vh;z-index:2147483000;
background:rgba(0,0,0,.84);color:#d6ffd6;font:10px/1.32 ui-monospace,Menlo,monospace;border-radius:8px;padding:5px 7px;
white-space:pre-wrap;word-break:break-all;overflow:hidden;pointer-events:none;-webkit-text-size-adjust:100%}
#readout .rb{display:flex;gap:6px;justify-content:flex-end;margin:-2px 0 2px}
#readout button{pointer-events:auto;font:600 11px/1 -apple-system,sans-serif;background:#333;color:#fff;border:1px solid #666;border-radius:6px;padding:5px 9px}
#readout .hd{color:#fff}#readout .geo{color:#bfe3ff}#readout #readoutLog{color:#ffe9a8}
#readoutProbe{position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;
padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}
.readoutVh{position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none}`;
  const box = document.createElement("div"), probe = document.createElement("div");
  box.id = "readout"; box.setAttribute("data-noswipe", ""); box.hidden = true;
  box.innerHTML = `<div class="rb"><button id="readoutFill">Fill</button><button id="readoutTop">Top</button><button id="readoutPause">Pause</button><button id="readoutClose" aria-label="Close readout">x</button></div><div class="hd" id="readoutHead"></div><div class="geo" id="readoutGeo"></div><div id="readoutLog"></div>`;
  probe.id = "readoutProbe";
  /* one hidden bar per height unit, so the readout says what 100vh, 100dvh, 100lvh and 100svh come to on the phone */
  const VH = ["vh", "dvh", "lvh", "svh"].map((u) => { const d = document.createElement("div"); d.className = "readoutVh"; d.style.height = "100" + u; return [u, d]; });
  document.head.appendChild(css); document.body.append(box, probe, ...VH.map((x) => x[1]));
  const $ = (id) => document.getElementById(id);
  const r = (n) => (n == null || Number.isNaN(n) ? "-" : Math.round(n));
  const mm = (q) => { try { return matchMedia(q).matches ? "y" : "n"; } catch { return "?"; } };

  /** The functions that made a change, from a stack ("goTo<step<clickRouter"), skipping the hook frames. */
  function cause(stack) {
    const names = [];
    for (const line of String(stack || "").split("\n")) {
      const m = line.match(/^\s*at (?:async )?([\w$.<> ]+?)(?: \[as [\w$]+\])? \(/) || line.match(/^([\w$.<> ]+)@/);   // Chrome, then Safari
      if (m && /^(get|set) /.test(m[1])) continue;   // the S.cur setter itself
      if (!m) { if (/^\s*at |@/.test(line)) names.push("?"); continue; }
      const n = m[1].split(".").pop();
      if (n === "Error" || n === "set" || n === "slideTo" || n === "on") continue;
      names.push(n);
    }
    while (names[0] === "?") names.shift();
    return names.slice(0, 4).join("<") || "?";
  }
  function add(line) {
    if (paused) return;
    log.unshift(((performance.now() - t0) / 1000).toFixed(2) + " " + line);
    if (log.length > 12) log.length = 12;
    if (open) $("readoutLog").textContent = log.join("\n");
  }
  function onHook(kind, m) {
    if (kind === "day") { const l = `DAY ${m.from}>${m.to} by ${cause(m.stack)}`; add(l); if (!paused) lastDay = l; }
    else if (kind === "slide") { const c = cause(m.stack); if (!/^swipeMove/.test(c)) add(`SLIDE x ${r(m.x)}${m.ms ? " " + m.ms + "ms" : ""} by ${c}`); }   // the finger-follow slides would fill the log
    else if (kind === "lock") add(`LOCK ${m}`);
    else if (kind === "swipe") add(`SWIPE ${m}`);
    else add(`${kind.toUpperCase()} ${m}`);
  }

  function head() {
    const st = H.state ? H.state() : {};
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    const standalone = mm("(display-mode: standalone)"), nav = "standalone" in navigator ? String(navigator.standalone) : "-";
    return [`BUILD ${H.BUILD}   TOUCH ${st.touch}`,
      `hover ${mm("(hover: hover)")}/none ${mm("(hover: none)")}  pointer coarse ${mm("(pointer: coarse)")} fine ${mm("(pointer: fine)")}`,
      `any-hover ${mm("(any-hover: hover)")}  any-pointer coarse ${mm("(any-pointer: coarse)")} fine ${mm("(any-pointer: fine)")}`,
      `standalone mq ${standalone} nav ${nav}   sw ${sw ? sw.scriptURL.split("/").pop() : "none"}`,
      `lastMod ${document.lastModified}   api ${String(st.api || "").replace(/^https?:\/\//, "")}`].join("\n");
  }
  function rect(sel) {
    const el = document.querySelector(sel); if (!el) return `${sel} -`;
    const b = el.getBoundingClientRect(); return `${sel} ${r(b.top)}..${r(b.bottom)}`;
  }
  function geo() {
    const vv = window.visualViewport, cs = getComputedStyle(probe), v = document.getElementById("view");
    const st = H.state ? H.state() : {};
    const ins = ["Top", "Right", "Bottom", "Left"].map((k) => r(parseFloat(cs["padding" + k])));
    let shownDay = "-";
    if (st.shown != null && st.dw) { const i = Math.round(st.shown / st.dw); const d = new Date(Date.parse(st.win0 + "T12:00:00Z") + i * 86400000); shownDay = d.toISOString().slice(0, 10); }
    return [`inner ${innerWidth}x${innerHeight}  docH ${document.documentElement.clientHeight}  screen ${screen.width}x${screen.height}`,
      `vv h ${vv ? r(vv.height) : "-"} offTop ${vv ? r(vv.offsetTop) : "-"} pageTop ${vv ? r(vv.pageTop) : "-"}  winY ${r(window.scrollY)} docTop ${r(document.scrollingElement && document.scrollingElement.scrollTop)}`,
      `safe t ${ins[0]} r ${ins[1]} b ${ins[2]} l ${ins[3]}`,
      fitLine(),
      `html h ${r(parseFloat(getComputedStyle(document.documentElement).height))} body h ${r(parseFloat(getComputedStyle(document.body).height))}  ${VH.map(([u, d]) => `100${u} ${r(d.getBoundingClientRect().height)}`).join(" ")}`,
      `${rect(".drop")}  ${rect("#newTask")}`,
      `${rect(".app")}  ${rect(".bar")}  ${rect(".pane")}`,
      `${rect("#view")}  ${rect(".dhead")}  sc L ${v ? r(v.scrollLeft) : "-"} T ${v ? r(v.scrollTop) : "-"}`,
      `last ${lastDay}`,
      `cur ${st.cur} n ${st.n} win0 ${st.win0} dw ${r(st.dw)} slideX ${r(st.slideX)} shownX ${r(st.shown)} shown ${shownDay}`].join("\n");
  }
  /** The home screen fit (calendar.html homeFit): his two switches, the gap it stretched by, and which rule is on. */
  function fitLine() {
    if (!H.fit) return "fit - (this page has no home screen fit)";
    const f = H.fit.get(), c = document.documentElement.classList, ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    return `fit ${ls("cal-hsfill") || "auto"} gap ${f.gap} shift ${f.shift ?? "-"} top ${f.top || "-"}  rules ${["hs", "hsclear", "hsfill"].filter((k) => c.contains(k)).join(" ") || "none"}`;
  }
  function labels() {
    if (!H.fit) return;
    const ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    $("readoutFill").textContent = "Fill " + (ls("cal-hsfill") || "auto");
    $("readoutTop").textContent = "Top " + (ls("cal-hstop") || "clear");
  }
  function paint() { if (!open) return; $("readoutHead").textContent = head(); if (!paused) $("readoutGeo").textContent = geo(); }

  /* listeners: only while open */
  const L = {
    view() { const v = document.getElementById("view"); if (!v) return; const l = r(v.scrollLeft), t = r(v.scrollTop);
      if (l !== lastL) add(`SC L ${lastL}>${l} T ${t}`); else if (lastT == null || Math.abs(t - lastT) >= 120) add(`SC T ${t}`); else return;
      lastL = l; lastT = t; },
    win() { const y = r(window.scrollY); if (y !== lastWinY) { add(`WIN scrollY ${y}`); lastWinY = y; } },
    wheel(e) { add(`WHEEL dx ${r(e.deltaX)} dy ${r(e.deltaY)}`); },
    resize() { add(`RESIZE ${innerWidth}x${innerHeight}`); },
    vvr() { add(`VV resize h ${r(visualViewport.height)}`); },
    vvs() { add(`VV scroll offTop ${r(visualViewport.offsetTop)} pageTop ${r(visualViewport.pageTop)}`); },
  };
  function wire(on) {
    const f = on ? "addEventListener" : "removeEventListener", v = document.getElementById("view");
    document[f]("scroll", L.view, { capture: true, passive: true });   // the view is rebuilt on a re-render, so listen at the document
    window[f]("scroll", L.win, { passive: true });
    window[f]("wheel", L.wheel, { capture: true, passive: true });
    window[f]("resize", L.resize);
    if (window.visualViewport) { visualViewport[f]("resize", L.vvr); visualViewport[f]("scroll", L.vvs); }
    void v;
  }
  function show() {
    open = true; box.hidden = false; H.on = onHook; wire(true);
    lastWinY = r(window.scrollY); const v = document.getElementById("view"); lastL = v ? r(v.scrollLeft) : null; lastT = v ? r(v.scrollTop) : null;
    add("OPEN"); $("readoutLog").textContent = log.join("\n"); paint();
    clearInterval(timer); timer = setInterval(paint, 250);
  }
  function hide() { open = false; box.hidden = true; H.on = null; wire(false); clearInterval(timer); }
  $("readoutPause").onclick = (e) => { e.stopPropagation(); paused = !paused; e.target.textContent = paused ? "Resume" : "Pause"; if (!paused) paint(); };
  /* his switches (home screen app only; they do nothing visible in a Safari tab): Fill auto > on > off, Top clear (default) > close */
  $("readoutFill").onclick = (e) => { e.stopPropagation(); if (!H.fit) return; let v; try { v = localStorage.getItem("cal-hsfill"); } catch {}
    H.fit.set("fill", { auto: "on", on: "off", off: "auto" }[v || "auto"] || "auto"); labels(); add(`FIT ${fitLine()}`); paint(); };
  $("readoutTop").onclick = (e) => { e.stopPropagation(); if (!H.fit) return; let v; try { v = localStorage.getItem("cal-hstop"); } catch {}
    H.fit.set("top", (v || "clear") === "clear" ? "close" : "clear"); labels(); add(`FIT ${fitLine()}`); paint(); };
  labels();
  $("readoutClose").onclick = (e) => { e.stopPropagation(); hide(); };
  window.CalReadout = { toggle() { open ? hide() : show(); }, show, hide, cause };
  show();
})();
