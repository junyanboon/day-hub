// node --test still/test/*.test.mjs   (Junyan 2026-10-17, Madrid: "when the internet is down it doesn't work")
// The real-browser check (servers shut, service worker on) is still/test/e2e/offline.e2e.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const dir = new URL("..", import.meta.url);
const read = f => fs.readFileSync(new URL(f, dir), "utf8");
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(read("quest-offline.js"), ctx);
const O = ctx.QuestOffline;
const plain = x => JSON.parse(JSON.stringify(x));

const day = (ymd, t) => [{ s:`${ymd}T08:00:00+02:00`, e:`${ymd}T09:00:00+02:00`, t }];
const snap = { at:1000, ymd:"2026-10-17", plan:{ tz:"Europe/Madrid", where:{ place:"Madrid" }, blocks:day("2026-10-17", "Pages") },
  ops:{ edits:{}, drops:[], adds:[{ key:"x1", t:"Upa Yoga" }], ts:5 }, tasks:[{ id:"t1" }],
  ag:{ "2026-10-16":day("2026-10-16", "Fri"), "2026-10-18":day("2026-10-18", "Sun"), "2026-10-19":day("2026-10-19", "Mon") } };

test("the saved day shows on its own date however old it is (the 3 hour limit is gone)", () => {
  const d = O.savedDay({ ...snap, at:1 }, "2026-10-17");
  assert.equal(d.plan.blocks[0].t, "Pages");
  assert.equal(d.ops.adds[0].t, "Upa Yoga");
  assert.equal(d.at, 1);
  assert.deepEqual(plain(d.tasks), [{ id:"t1" }]);
});

test("on a later date the saved agenda gives that day, and the saved day joins the agenda", () => {
  const d = O.savedDay(snap, "2026-10-18");
  assert.equal(d.ymd, "2026-10-18");
  assert.equal(d.plan.blocks[0].t, "Sun");
  assert.equal(d.plan.tz, "Europe/Madrid");
  assert.equal(d.plan.where.place, "Madrid");
  assert.equal(d.ops, null, "yesterday's edits do not carry to a new day");
  assert.deepEqual(Object.keys(d.ag).sort(), ["2026-10-16", "2026-10-17", "2026-10-19"]);
  assert.equal(d.ag["2026-10-17"][0].t, "Pages");
  assert.ok(snap.ag["2026-10-18"], "the saved snapshot itself is not changed");
});

test("no saved day for a date the agenda never held, or a broken snapshot", () => {
  assert.equal(O.savedDay(snap, "2026-10-25"), null);
  assert.equal(O.savedDay(null, "2026-10-17"), null);
  assert.equal(O.savedDay({ ymd:"2026-10-17", plan:{} }, "2026-10-17"), null);
});

test("an offline calendar edit waits per day, and only the copy that was sent leaves the outbox", () => {
  let out = O.queueOps({}, "Sat Oct 17 2026", { adds:[{ key:"a" }], ts:10 });
  out = O.queueOps(out, "Sun Oct 18 2026", { drops:["k"], ts:11 });
  assert.equal(O.pendingOps(out, "Sat Oct 17 2026").adds[0].key, "a");
  assert.equal(O.pendingOps(out, "Mon Oct 19 2026"), null);
  const sent = out["Sat Oct 17 2026"];
  // a newer edit for the same day came in while the first was on its way: it stays
  const newer = O.queueOps(out, "Sat Oct 17 2026", { adds:[{ key:"a" }, { key:"b" }], ts:12 });
  assert.equal(O.settleOps(newer, sent)["Sat Oct 17 2026"].ts, 12);
  const after = O.settleOps(out, sent);
  assert.deepEqual(Object.keys(after), ["Sun Oct 18 2026"]);
});

test("the offline note says offline and how old the calendar is", () => {
  assert.equal(O.offlineNote(true, 5, "3:12 PM", "4 hr 30 min"), "Offline · calendar from 3:12 PM (4 hr 30 min ago)");
  assert.match(O.offlineNote(true, 0, "", ""), /^Offline/);
  assert.match(O.offlineNote(false, 0, "", ""), /^Offline · no calendar saved/);
});

/* ---------- the service worker saves the whole page on install ---------- */
function loadSw(){
  const handlers = {};
  const c = { self:{ addEventListener:(k, f) => { handlers[k] = f; }, location:{ href:"https://junyanboon.github.io/day-hub/still/sw.js" } },
    URL, Headers, Response:class {}, caches:{}, fetch:() => Promise.reject(new Error("no network in tests")), setTimeout, Promise };
  vm.runInNewContext(read("sw.js") + "\n;globalThis.__sw = { shellFiles, EXTRA, SHELL, TEST_API };", Object.assign(c, { globalThis:c }));
  return c.__sw;
}

test("install saves every ?v= script and style quest.html names, and nothing from another site", () => {
  const sw = loadSw(), html = read("quest.html");
  const files = sw.shellFiles(html);
  const named = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+\?v=[^"]+)"/g)].map(m => m[1]);
  assert.ok(named.length >= 15, "quest.html names its scripts");
  for (const f of named) assert.ok(files.includes(f), `install skips ${f}`);
  assert.ok(files.includes("quest-offline.js?v=20261017a"));
  for (const f of files) {
    assert.ok(!/^[a-z]+:|^\/\//i.test(f), `${f} is from another site`);
    assert.ok(fs.existsSync(new URL(f.split("?")[0], dir)), `${f} does not exist`);
  }
});

test("install also saves every sprite and font, and each listed file exists", () => {
  const sw = loadSw();
  for (const sub of ["sprites", "fonts"])
    for (const f of fs.readdirSync(new URL(sub + "/", dir))) assert.ok(sw.EXTRA.includes(`${sub}/${f}`), `install skips ${sub}/${f}`);
  for (const f of sw.EXTRA) assert.ok(fs.existsSync(new URL(f, dir)), `${f} does not exist`);
  assert.equal(sw.SHELL, "dq-shell-v3");
  assert.equal(sw.TEST_API, null, "the live page saves only the real still-api's answers");
});

test("every script the page loads up front is one the service worker saves, and none come from another site", () => {
  const html = read("quest.html");
  for (const m of html.matchAll(/<script\b[^>]*src="([^"]+)"/g)) assert.ok(!/^https?:|^\/\//.test(m[1]), `${m[1]} loads from another site`);
  for (const m of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) assert.ok(!/^https?:|^\/\//.test(m[1]), `${m[1]} loads from another site`);
});
