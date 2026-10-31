// node --test still/test/buckets.test.mjs  (task buckets in Day Quest, Junyan 2026-10-30 d1 to d5, d10, "Your week")
import test from "node:test";
import assert from "node:assert/strict";
import "../quest-buckets.js";
const QB = globalThis.QuestBuckets;
const SEED = [
  { id: "money", name: "Money and bills", emoji: "💵", cycle: "weekly", day: "MO", start: "09:00", min: 90 },
  { id: "supply", name: "Supply run", emoji: "🛒", cycle: "weekly", day: "TU", start: "09:00", min: 90 },
  { id: "check", name: "Studio check", emoji: "🔑", cycle: "weekly", day: "TU", start: "12:30", min: 60 },
  { id: "admin", name: "Admin", emoji: "📋", cycle: "monthly", day: "MO", start: "16:00", min: 90 },
];
const TASKS = [
  { id: "t1", task: "🛒 Buy supplies", bucket: "Supply run", status: "Not Started", notes: "about\n- Paper towels (527) (Deck Action aa)" },
  { id: "t2", task: "Order soap", bucket: "Supply run", status: "Waiting for proof", notes: "" },
  { id: "t3", task: "Pay hydro", bucket: "Money and bills", status: "Not Started", notes: "" },
];
function fakeApi(over = {}) {
  const calls = [];
  return { calls, get: async (p) => { calls.push(["GET", p]); return { rev: 3, today: "2026-11-03", buckets: SEED, tasks: TASKS }; },
    post: async (p, b) => { calls.push(["POST", p, b]); if (over[p]) return over[p](b); return { ok: true, status: "Waiting for proof" }; } };
}

test("week strip: Mon to Sun, first-Monday Admin only in the first week, counts only tasks still to do", async () => {
  await QB.load(fakeApi(), true);
  assert.deepEqual(QB.weekOf("2026-11-03"), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  assert.ok(QB.fallsOn(SEED[3], "2026-11-02") && !QB.fallsOn(SEED[3], "2026-11-09"));
  const html = QB.weekHTML("2026-11-03");
  assert.equal((html.match(/class="bk-day/g) || []).length, 7);
  assert.match(html, /Supply run<\/span><i>1<\/i>/, "one task waits in Supply run (the Waiting for proof one does not count)");
  assert.match(html, /bk-day today/);
  assert.match(html, /🛒 Supply run <small>9 AM, 90 min/, "today's buckets are open");
  assert.match(html, /data-bk-did="t1"/);
  assert.ok(!/data-bk-did="t2"/.test(html), "a task waiting for proof has no Did it button");
  assert.match(html, /Paper towels/);
});

test("a calendar block title finds its bucket", () => {
  assert.equal(QB.matchTitle("🛒 Supply run").id, "supply");
  assert.equal(QB.matchTitle("Admin"), null, "a plain Admin block is his, not the bucket");
  assert.equal(QB.matchTitle("📋 Admin").id, "admin");
  assert.equal(QB.matchTitle("🛒 Buy studio supplies"), null);
});

// a tiny DOM stand-in: only what bind() touches
function box(html, fields = {}) {
  const els = [...html.matchAll(/<(button|input|select)([^>]*)>/g)].map((m) => {
    const ds = {}; for (const [, k, v] of m[2].matchAll(/data-([a-z-]+)="([^"]*)"/g)) ds[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    return { dataset: ds, onclick: null, attrs: m[2] };
  });
  return { els, querySelectorAll: (sel) => { const k = sel.match(/\[data-([a-z-]+)/); if (!k) return [];
    const key = k[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()); return els.filter((e) => key in e.dataset); } };
}

test("Did it posts Waiting for proof with the shipped email as proof; Not this time only notes", async () => {
  const api = fakeApi(); await QB.load(api, true); QB.S.open = null;
  let b = box(QB.weekHTML("2026-11-03")); QB.bind(b, api, () => {});
  await b.querySelectorAll("[data-bk-did]")[0].onclick({ stopPropagation() {} });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(api.calls.at(-1), ["POST", "/quest/buckets/did", { id: "t1", proof: "the shipped email" }]);
  assert.equal(QB.S.tasks.find((t) => t.id === "t1").status, "Waiting for proof");
  b = box(QB.listHTML(SEED[0])); QB.bind(b, api, () => {});
  await b.querySelectorAll("[data-bk-skip]")[0].onclick({ stopPropagation() {} });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(api.calls.at(-1), ["POST", "/quest/buckets/skip", { id: "t3" }]);
  assert.ok(!api.calls.some((c) => c[1] === "/tasks/done"), "nothing is marked Done");
});

test("saving sends the rev it read; a 409 reloads the other device's copy and says so", async () => {
  const api = fakeApi({ "/quest/buckets": () => { const e = new Error("changed"); e.status = 409; throw e; } });
  await QB.load(api, true);
  let b = box(QB.weekHTML("2026-11-03")); QB.bind(b, api, () => {});
  b.querySelectorAll("[data-bk-edit]")[0].onclick({ stopPropagation() {} });
  assert.equal(QB.S.edit.length, 4);
  b = box(QB.weekHTML("2026-11-03")); b.querySelectorAll = ((orig) => (sel) => sel.startsWith(".bk-ed") || sel === "[data-bk-row]" ? [] : orig(sel))(b.querySelectorAll);
  QB.bind(b, api, () => {});
  b.querySelectorAll("[data-bk-save]")[0].onclick({ stopPropagation() {} });
  await new Promise((r) => setTimeout(r, 5));
  const save = api.calls.find((c) => c[0] === "POST");
  assert.equal(save[2].rev, 3);
  assert.equal(QB.S.edit, null);
  assert.match(QB.S.msg, /changed on another device/);
  assert.equal(api.calls.filter((c) => c[0] === "GET").length, 2, "the newer copy was read again");
});
