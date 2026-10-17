// node --test still/test/*.test.mjs   (Junyan 2026-10-17: "yes" to pings refreshing the calendar in the background)
process.env.TZ = "Europe/Madrid";   // the phone's zone; the game's day runs to 4 AM there
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const API = "https://still.srv1948070.hstgr.cloud";
const src = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

// sw.js in a sandbox with a fake push service, cache and network; `net(url)` answers each fetch
function loadSw(net){
  const handlers = {}, log = [], saved = new Map();
  const cache = { put: async (u, res) => { log.push("put " + u); saved.set(String(u), res); }, match: async () => undefined };
  const c = { URL, Headers, Response, setTimeout, Promise, console,
    self:{ addEventListener:(k, f) => { handlers[k] = f; }, location:{ href:"https://junyanboon.github.io/day-hub/still/sw.js" },
      registration:{ scope:"https://junyanboon.github.io/day-hub/still/", showNotification: async (t, o) => { log.push("show " + t); } } },
    caches:{ open: async () => cache },
    fetch: (u) => { log.push("fetch " + u); return net(String(u)); } };
  vm.runInNewContext(src + "\n;globalThis.__sw = { todayUrls };", Object.assign(c, { globalThis:c }));
  const push = async (data) => {
    let wait;
    handlers.push({ data:{ json: () => data, text: () => JSON.stringify(data) }, waitUntil: (p) => { wait = p; } });
    return { wait, log };
  };
  return { sw:c.__sw, push, log, saved };
}
const ok = (body) => Promise.resolve(new Response(JSON.stringify(body), { status:200, headers:{ "content-type":"application/json" } }));

test("today's plan and edits use the page's own addresses, with the 4 AM day end", () => {
  const { sw } = loadSw(() => ok({}));
  // 3:30 AM Madrid on Sat 17 Oct is still Friday's game day
  assert.deepEqual([...sw.todayUrls(Date.parse("2026-10-17T01:30:00Z"))],
    [API + "/plan?date=2026-10-16", API + "/ops?d=" + encodeURIComponent("Fri Oct 16 2026")]);
  assert.deepEqual([...sw.todayUrls(Date.parse("2026-10-17T10:00:00Z"))],
    [API + "/plan?date=2026-10-17", API + "/ops?d=" + encodeURIComponent("Sat Oct 17 2026")]);
});

test("a ping shows first, then saves today's plan and edits, stamped like the page's fetches", async () => {
  const { push, log, saved } = loadSw((u) => ok({ u }));
  const { wait } = await push({ title:"In 15 min: Gym", body:"Starts 13:30.", tag:"soon|g", url:"quest.html" });
  assert.equal(log[0], "show In 15 min: Gym", "the notification is asked for before any fetch");
  await wait;
  const keys = [...saved.keys()];
  assert.equal(keys.length, 2);
  assert.ok(keys.some((k) => k.startsWith(API + "/plan?date=")));
  assert.ok(keys.some((k) => k.startsWith(API + "/ops?d=")));
  for (const res of saved.values()) assert.ok(+res.headers.get("x-dq-at") > 0, "stamped with when it was fetched");
});

test("no internet or a bad answer: the ping still shows, the old copy stays, and nothing throws", async () => {
  const { push, log, saved } = loadSw((u) => u.includes("/plan") ? Promise.reject(new Error("offline")) : Promise.resolve(new Response("x", { status:500 })));
  const { wait } = await push({ title:"Now: Gym" });
  await wait;   // resolves, never rejects
  assert.equal(log[0], "show Now: Gym");
  assert.equal(saved.size, 0);
});

test("a push with no readable data still shows a notification", async () => {
  const { push, log } = loadSw(() => ok({}));
  const r = await push(null);
  await r.wait;
  assert.ok(log[0].startsWith("show "));
});
