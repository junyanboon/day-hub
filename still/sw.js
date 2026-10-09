/* Day Quest service worker: shows phone pings sent by still-api (Web Push).
   No fetch handler on purpose, so it never changes how Stillness or Day Quest
   load. Scope is still/, which the iPhone needs for Home Screen web-app push. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
