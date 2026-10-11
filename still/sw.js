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
      sprite again behind the saved copy, which crowded out the plan. Now an open sends almost nothing. */
const SHELL = "dq-shell-v2", DATA = "dq-data-v1";   // v2: the smaller sprites (2026-10-11)
const API = "https://still.srv1948070.hstgr.cloud";
const DATA_PATHS = /^\/(plan|ops|tasks|steps|bedtime|sleep)(\/|$)|^\/quest\/(state|insights|skills|content|wiki|keeps|practice)(\/|$)/;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => c.add("quest.html")).catch(() => {}));
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (![SHELL, DATA].includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

const within = (ms, p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("slow")), ms))]);

// the network first, at most `ms`; keep a good answer; otherwise the saved one
async function networkFirst(req, cacheName, ms, key) {
  const cache = await caches.open(cacheName);
  const net = fetch(req).then((res) => { if (res && res.ok) cache.put(key || req, res.clone()).catch(() => {}); return res; });
  try { return await within(ms, net); }
  catch (err) {
    const hit = await cache.match(key || req, { ignoreSearch: !!key, ignoreVary: true });
    if (hit) return hit;
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
  if (url.origin === API && DATA_PATHS.test(url.pathname)) e.respondWith(networkFirst(req, DATA, 4000));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: "Day Quest", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Day Quest", {
    body: d.body || "", tag: d.tag, icon: "quest-icon-180.png", badge: "quest-icon-180.png",
    data: { url: d.url || "quest.html" },
  }));
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
