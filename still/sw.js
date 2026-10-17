/* Day Quest service worker. Scope is still/, which the iPhone needs for Home Screen web-app push.
   1. Phone pings sent by still-api (Web Push).
   2. A saved copy (Junyan, 2026-10-10, d211: "my FBS studio monitor loads easily but this app just
      struggles"). The hotel router sometimes fails to look up addresses (DNS_PROBE_FINISHED_BAD_CONFIG),
      and with no saved copy there was nothing to open. Now:
      - pages (quest.html, Stillness): the saved copy at once. Day Quest asks for a fresh one itself when
        GitHub has a newer page (checkFresh in quest.html); otherwise the page is refreshed behind it, at most
        every 10 minutes;
      - the page's own files (scripts, styles, sprites, fonts): the saved copy at once. A file with ?v= in its
        address never changes, so it is never fetched again; any other is refreshed behind it once a day;
      - his data from still-api (plan, edits, tasks, game, steps, sleep): the network first, 4 s at most,
        then the last good answer. Saves (POST) always go to the network; the page keeps them until it can.
      Everything else (YouTube, weather) is left alone.
   3. Faster opens on slow internet (Junyan, 2026-10-11, Egypt, about 65 KB/s: "it takes way too long for my
      app to load"). Before this, every open downloaded the whole page (95 KB) and fetched every script and
      sprite again behind the saved copy, which crowded out the plan. Now an open sends almost nothing.
   4. No internet at all (Junyan, 2026-10-17, Madrid: "when the internet is down it doesn't work"):
      - installing saves the whole page at once: quest.html, every ?v= script and style it names, the sprites and
        fonts. Before, only quest.html was saved up front and the rest only once used under this worker, so a
        phone could open offline to a page with a script missing;
      - his data is saved with the time it was fetched, and an answer from the saved copy says so (x-dq-saved),
        so the page can say it is offline and how old the calendar is.
   5. A ping refreshes the saved calendar (Junyan, 2026-10-17, "yes" to pings refreshing the calendar in the
      background; an iPhone web app gets no other background time). Each ping fetches today's plan and edits
      into the saved copy, under the same addresses the page asks for, so Quest opens on a fresh calendar even
      if the internet is gone by then. The ping is shown first and never waits for this (iOS takes push away
      from a web app whose push shows no notification). */
const SHELL = "dq-shell-v3", DATA = "dq-data-v1";   // v3: the whole page is saved on install (2026-10-17)
// files the page loads by name at run time (sprites by pose, fonts from the styles), saved on install as well
const EXTRA = ["quest.webmanifest", "quest-icon.svg", "quest-icon-180.png", "quest-icon-512.png",
  "fonts/figtree-latin.woff2", "fonts/cinzel-latin.woff2", "fonts/pixelify-sans-latin.woff2",
  ...["gem", "head", "palms", "radiant", "robe", "seat", "seat-low", "stand", "stand-low", "strong"]
    .flatMap((n) => n === "head" ? [n] : [n, n + "-glow"]).map((n) => `sprites/${n}.webp`)];
const API = "https://still.srv1948070.hstgr.cloud";
// a test still-api on this computer (quest.html?api=http://localhost:…) is saved like the real one, so offline can be tested
const TEST_API = (() => { try { const a = new URL(new URL(self.location.href).searchParams.get("api") || "");
  return /^(localhost|127\.0\.0\.1)$/.test(a.hostname) ? a.origin : null; } catch { return null; } })();
const DATA_PATHS = /^\/(plan|ops|tasks|steps|bedtime|sleep)(\/|$)|^\/quest\/(state|insights|skills|content|wiki|keeps|practice)(\/|$)/;

// the page's own ?v= scripts and styles, as quest.html names them
const shellFiles = (html) => [...new Set([...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^":?#]+\.(?:js|css)\?v=[^"]+)"/g)].map((m) => m[1]))];
async function precache() {
  const c = await caches.open(SHELL);
  const res = await fetch("quest.html", { cache: "no-cache" });
  if (!res.ok) throw new Error("quest.html HTTP " + res.status);
  const html = await res.clone().text();
  // a file already saved by the older worker is copied, not downloaded again (slow links, d211)
  const save = async (f) => {
    const url = new URL(f, self.registration.scope).href, had = await caches.match(url, { ignoreVary: true });
    if (had) return c.put(url, had);
    const r = await fetch(url);
    if (!r.ok) throw new Error(f + " HTTP " + r.status);
    return c.put(url, r);
  };
  // a page that cannot open offline is not worth switching to: if any of these fail, the old worker stays
  await Promise.all(shellFiles(html).map(save));
  await c.put(new URL("quest.html", self.registration.scope).href, res);
  await Promise.all(EXTRA.map((f) => save(f).catch(() => {})));   // nice to have
}
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(precache());
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  const shell = await caches.open(SHELL);
  for (const k of await caches.keys()) {
    if ([SHELL, DATA].includes(k)) continue;
    // keep what an older page cache held that this one lacks (Stillness and its files), then drop it
    if (k.startsWith("dq-shell-")) try {
      const old = await caches.open(k);
      for (const req of await old.keys()) if (!(await shell.match(req, { ignoreVary: true }))) await shell.put(req, await old.match(req));
    } catch {}
    await caches.delete(k);
  }
  await self.clients.claim();
})()));

const within = (ms, p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("slow")), ms))]);

// a copy to save, stamped with when it was fetched (x-dq-at)
async function stamped(res) {
  const h = new Headers(res.headers);
  h.set("x-dq-at", String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}
/* the saved copy, marked as one: x-dq-saved is when it was fetched (0 when saved before the stamp existed);
   x-dq-slow when the network is there but slower than the wait (then the page carries on as online, as before).
   The page reads these across origins, so the copy allows that itself. */
function marked(hit, slow) {
  const h = new Headers(hit.headers);
  h.set("x-dq-saved", hit.headers.get("x-dq-at") || "0");
  if (slow) h.set("x-dq-slow", "1");
  h.set("Access-Control-Allow-Origin", self.location.origin);
  h.set("Access-Control-Expose-Headers", "x-dq-saved, x-dq-slow");
  return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h });
}
// the network first, at most `ms`; keep a good answer; otherwise the saved one
async function networkFirst(req, cacheName, ms, key) {
  const cache = await caches.open(cacheName);
  const net = fetch(req).then((res) => {
    if (res && res.ok) stamped(res.clone()).then((s) => cache.put(key || req, s)).catch(() => {});
    return res; });
  try { return await within(ms, net); }
  catch (err) {
    const hit = await cache.match(key || req, { ignoreSearch: !!key, ignoreVary: true });
    if (hit) return marked(hit, err && err.message === "slow");
    return net;   // nothing saved yet: wait for the network after all
  }
}
// how old a saved copy is, from the Date GitHub stamped on it
const age = (res) => Date.now() - (Date.parse(res.headers.get("date") || "") || 0);
// the saved copy at once; fetched again behind it only when older than `maxAge` (never for a ?v= file)
async function savedFirst(req, maxAge, key) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(key || req, { ignoreVary: true });
  const fetchIt = () => fetch(req).then((res) => { if (res && res.ok) cache.put(key || req, res.clone()).catch(() => {}); return res; });
  if (!hit) return fetchIt();
  if (age(hit) > maxAge) fetchIt().catch(() => {});
  return hit;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
    if (req.mode === "navigate" || /\.html$/.test(url.pathname)) {
      // one saved copy per page, whatever its ?query
      const key = new Request(url.origin + url.pathname);
      // Day Quest found a newer page on GitHub: fetch it and finish saving it before the page reloads
      if (req.headers.get("x-dq-fresh")) e.respondWith(fetch(req).then(async (res) => {
        if (res.ok) await (await caches.open(SHELL)).put(key, res.clone()).catch(() => {});
        return res; }));
      // quest.html checks for a newer copy itself (a tiny HEAD), so it is never fetched again behind it
      else e.respondWith(savedFirst(req, /quest\.html$/.test(url.pathname) ? Infinity : 10 * 60000, key));
      return;
    }
    e.respondWith(savedFirst(req, url.search.includes("v=") ? Infinity : 86400000));
    return;
  }
  if ((url.origin === API || url.origin === TEST_API) && DATA_PATHS.test(url.pathname)) e.respondWith(networkFirst(req, DATA, 4000));
});

// today's /plan and /ops as the page asks for them: the game's day runs to 4 AM (d67), in the phone's own zone;
// the /ops key has the shape of Date.toDateString() (dayKey in quest.html)
function todayUrls(now = Date.now()) {
  const ymd = new Date(now - 4 * 3600000).toLocaleDateString("en-CA");
  const key = new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "2-digit", year: "numeric" }).replace(/,/g, "");
  return [API + "/plan?date=" + ymd, API + "/ops?d=" + encodeURIComponent(key)];
}
// fetch them into the saved copy, stamped like the page's own fetches; any failure keeps the old copy
async function refreshSaved() {
  const cache = await caches.open(DATA);
  await Promise.all(todayUrls().map((u) => within(15000, fetch(u, { cache: "no-store" }))
    .then(async (res) => { if (res && res.ok) await cache.put(u, await stamped(res)); })
    .catch(() => {})));
}

self.addEventListener("push", (e) => {
  let d = {};
  try { d = (e.data && e.data.json()) || {}; } catch { d = { title: "Day Quest", body: e.data ? e.data.text() : "" }; }
  // the notification is asked for first; the refresh runs beside it and its errors are swallowed
  const shown = self.registration.showNotification(d.title || "Day Quest", {
    body: d.body || "", tag: d.tag, icon: "quest-icon-180.png", badge: "quest-icon-180.png",
    data: { url: d.url || "quest.html" },
  });
  let fresh = Promise.resolve();
  try { fresh = refreshSaved().catch(() => {}); } catch {}
  e.waitUntil(Promise.all([shown, fresh]));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "quest.html", self.registration.scope);
  const key = url.searchParams.get("open");   // the block whose window should open (2026-10-09)
  const page = url.href.split("?")[0];
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const w of wins) if (w.url.startsWith(page) && "focus" in w) {
      if (key) w.postMessage({ type: "open", key });
      return w.focus();
    }
    return self.clients.openWindow(url.href);
  }));
});
