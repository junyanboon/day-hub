/* Day Quest on a wide screen is a dashboard (Junyan, 2026-10-08: "widgets that I
   can move around and fill up the whole page").
   At 1100 px and wider, each part of the page (prana, right now, habits, the
   mountain, skills, the log, and any part added later) becomes a widget on a
   12-column grid. Drag a widget by its title bar, resize it from any edge or
   corner; the others make room. The layout is kept per device (localStorage
   quest-dash-v1); "Reset layout" brings back the default. The phone keeps the
   single column. Grid engine: gridstack 10.3.1 (still/vendor/); if it fails to
   load, the page stays a single column. ?nodash=1 turns it off. */
(function () {
  "use strict";
  const MIN_W = 1100, KEY = "quest-dash-v2", ROWS = 16;   // v2: the calendar column layout (d216, 2026-10-10)
  const mq = window.matchMedia(`(min-width: ${MIN_W}px)`);
  if (!mq.matches || /[?&]nodash=1/.test(location.search)) {
    mq.addEventListener && mq.addEventListener("change", (e) => { if (e.matches) location.reload(); });
    return;
  }
  mq.addEventListener && mq.addEventListener("change", (e) => { if (!e.matches) location.reload(); });

  // known parts of the page, by the ids quest.html draws into
  const KNOWN = [
    { id: "hud", title: "", pick: [".hud"] },
    { id: "being", title: "", pick: ["#being"] },
    { id: "now", title: "Right now", pick: ["#brief", "#loose", "#main", "#nextLine"] },
    { id: "habits", title: "", pick: ["#habits"] },
  ];
  // d216 (2026-10-10): Today's calendar down the left, the two figures in the middle with right now under them,
  // prana actions and skills on the right
  const DEFAULT = {
    hud: { x: 0, y: 0, w: 12, h: 1 },   // one quiet line (2026-10-10)
    mtn: { x: 0, y: 1, w: 4, h: 15 },
    being: { x: 4, y: 1, w: 5, h: 10 },
    now: { x: 4, y: 11, w: 5, h: 5 },
    habits: { x: 9, y: 1, w: 3, h: 10 },
    skills: { x: 9, y: 11, w: 3, h: 5 },
    log: { x: 4, y: 16, w: 5, h: 4 },
  };
  const load = (tag, attrs) => new Promise((ok, fail) => {
    const el = document.createElement(tag);
    Object.assign(el, attrs); el.onload = ok; el.onerror = fail;
    document.head.appendChild(el);
  });
  const saved = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

  // group #app's children into widgets: the known ones, then one per <h2> section
  function groups(app) {
    const kids = [...app.children], used = new Set(), out = [];
    for (const k of KNOWN) {
      const nodes = k.pick.map((sel) => app.querySelector(`:scope > ${sel}`)).filter(Boolean);
      if (!nodes.length) continue;
      nodes.forEach((n) => used.add(n));
      out.push({ id: k.id, title: k.title, nodes, head: null });
    }
    let cur = null;
    for (const n of kids) {
      if (used.has(n)) { cur = null; continue; }
      if (n.tagName === "H2") {
        const body = n.nextElementSibling, bid = body && body.id;
        const id = bid === "mtn" ? "mtn" : bid === "log" ? "log" : bid === "skillsRow" ? "skills" : "w-" + (bid || out.length);
        cur = { id, title: n.textContent.trim(), nodes: [n], head: n };
        out.push(cur);
      } else if (cur) cur.nodes.push(n);
      else out.push(cur = { id: "w-" + (n.id || out.length), title: "", nodes: [n], head: null });
    }
    return out;
  }

  async function build() {
    await Promise.all([
      // served with the page (d212, 2026-10-10): one less address to look up on a shaky network
      load("link", { rel: "stylesheet", href: "vendor/gridstack.min.css" }),
      load("script", { src: "vendor/gridstack-all.js" }),
    ]);
    const app = document.getElementById("app");
    if (!app || !window.GridStack) return;
    const css = document.createElement("style");
    css.textContent = `
      body.dash #app { max-width:none; padding:10px 12px 84px; }
      body.dash .grid-stack-item-content { background:var(--glass); border:1px solid var(--glass-border); border-radius:18px;
        padding:8px 14px 12px; overflow:auto; backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); scrollbar-width:thin; }
      body.dash .w-head { cursor:grab; user-select:none; -webkit-user-select:none; }
      body.dash .w-head:active { cursor:grabbing; }
      body.dash .w-grip { display:flex; justify-content:space-between; font-size:11px; letter-spacing:.12em; text-transform:uppercase;
        color:var(--ink-faint); margin:0 -4px 6px; padding:2px 4px; }
      body.dash .w-hud { background:none; border:0; backdrop-filter:none; -webkit-backdrop-filter:none; padding:0 10px; overflow:hidden; display:flex; align-items:center; }
      body.dash .w-hud > .w-grip { display:none; } body.dash .w-hud > .hud { flex:1; min-width:0; }
      body.dash .grid-stack-item-content > h2.w-head { margin-top:2px; }
      body.dash .w-now .card:first-of-type, body.dash .w-now > div > .card:first-child { margin-top:4px; }
      body.dash .grid-stack-placeholder > .placeholder-content { background:rgba(255,255,255,.08); border:1px dashed rgba(255,255,255,.35); border-radius:18px; }
      body.dash .ui-resizable-handle { opacity:0; transition:opacity .2s; } body.dash .grid-stack-item:hover .ui-resizable-handle { opacity:.6; }
      /* the quick slots grow and shrink with their widget, so they always fit without scrolling (2026-10-09) */
      body.dash .w-quick { display:flex; flex-direction:column; overflow:hidden; padding-bottom:8px; }
      body.dash .w-quick > #questQuick { flex:1; min-height:0; margin:0 !important; }
      body.dash .w-quick .bag-qbar { height:100%; max-height:70px; padding:6px; }
      body.dash .w-quick .bag-qbar .bag-sock { flex:0 0 auto; height:100%; width:auto; aspect-ratio:1; max-height:56px; }
      body.dash .w-being { padding:6px; overflow:hidden; } body.dash .w-being > #being { height:100%; margin:0; }
      body.dash .w-being .bg-stage { height:100%; border:0; }
      .dash-reset { position:fixed; left:14px; bottom:14px; z-index:50; background:var(--glass); border:1px solid var(--glass-border);
        color:var(--ink-soft); font-size:12px; padding:7px 12px; border-radius:999px; backdrop-filter:blur(10px); opacity:.35; transition:opacity .2s; }
      .dash-reset:hover { opacity:1; }
      body.dash .w-grip:has(> span:first-child:empty) { position:absolute; top:4px; right:10px; margin:0; z-index:2; }`;
    document.head.appendChild(css);
    const lay = saved(), grid = document.createElement("div");
    if (lay.hud) { lay.hud.h = 1; lay.hud.y = 0; }   // the top bar is one line now; the widgets below move up to fill

    grid.className = "grid-stack";
    let nextY = ROWS;
    for (const g of groups(app)) {
      const pos = lay[g.id] || DEFAULT[g.id] || { x: 0, y: nextY, w: 4, h: 5 };
      if (!lay[g.id] && !DEFAULT[g.id]) nextY += 5;
      const item = document.createElement("div");
      item.className = "grid-stack-item";
      item.setAttribute("gs-id", g.id);
      ["x", "y", "w", "h"].forEach((k) => item.setAttribute("gs-" + k, pos[k]));
      const box = document.createElement("div");
      box.className = "grid-stack-item-content w-" + g.id;
      if (g.head) g.head.classList.add("w-head");
      else {
        const h = document.createElement("div");
        h.className = "w-head w-grip";
        h.innerHTML = `<span>${g.title}</span><span aria-hidden="true">⋮⋮</span>`;
        box.appendChild(h);
      }
      g.nodes.forEach((n) => box.appendChild(n));
      item.appendChild(box);
      grid.appendChild(item);
    }
    app.appendChild(grid);
    document.body.classList.add("dash");
    const fit = () => Math.max(36, Math.floor((window.innerHeight - 24) / ROWS));
    const gs = window.GridStack.init({ column: 12, cellHeight: fit(), margin: 6, handle: ".w-head", float: false, animate: true,
      resizable: { handles: "e,se,s,sw,w" } }, grid);
    gs.on("change", () => {
      const out = {};
      for (const n of gs.save(false)) out[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h };
      try { localStorage.setItem(KEY, JSON.stringify(out)); } catch {}
    });
    let rt = null;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => gs.cellHeight(fit()), 150); });
    const reset = document.createElement("button");
    reset.className = "dash-reset"; reset.textContent = "↺ Reset layout";
    reset.onclick = () => { try { localStorage.removeItem(KEY); } catch {} location.reload(); };
    document.body.appendChild(reset);
  }
  const go = () => build().catch((e) => console.warn("dashboard off:", e));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
