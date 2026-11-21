// The Cards lock (cards-vault.js): node --test still/test/cards-vault.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import "../cards-vault.js";
const V = globalThis.CardsVault;
const DATA = { v: 1, cards: [{ id: "c1", name: "Avion", last4: "6637" }], todos: [] };

test("a recovery code is 24 safe characters in groups of four", () => {
  const c = V.makeCode();
  assert.match(c, /^([A-HJ-NP-Z2-9]{4}-){5}[A-HJ-NP-Z2-9]{4}$/);
  assert.notEqual(c, V.makeCode());
  assert.ok(V.codeOk(c.toLowerCase().replace(/-/g, " ")));
  assert.ok(!V.codeOk("ABCD-EFGH"));
});
test("the locked file holds no readable card details", async () => {
  const { env } = await V.create(DATA);
  const text = JSON.stringify(env);
  assert.ok(V.isEnvelope(env));
  assert.ok(!text.includes("Avion") && !text.includes("6637"));
  assert.ok(!V.isEnvelope(DATA));
});
test("the recovery code opens it, a wrong code does not", async () => {
  const { env, code } = await V.create(DATA);
  const { data } = await V.openWithCode(env, code.toLowerCase());
  assert.deepEqual(data, DATA);
  await assert.rejects(V.openWithCode(env, V.makeCode()), /wrong code/);
});
test("a passkey's secret opens it, another secret does not", async () => {
  const { env, ses } = await V.create(DATA);
  const out = crypto.getRandomValues(new Uint8Array(32));
  const env2 = await V.addPasskey(env, ses, "cred1", out, "Mac");
  assert.equal(env2.pk.length, 1);
  assert.deepEqual((await V.openWithPrf(env2, "cred1", out)).data, DATA);
  await assert.rejects(V.openWithPrf(env2, "cred1", crypto.getRandomValues(new Uint8Array(32))), /did not open/);
  await assert.rejects(V.openWithPrf(env2, "other", out), /not set up/);
  assert.equal((await V.addPasskey(env2, ses, "cred1", out, "Mac")).pk.length, 1, "the same passkey replaces its own entry");
});
test("saving again keeps both ways in, and a new recovery code retires the old one", async () => {
  const { env, ses, code } = await V.create(DATA);
  const next = await V.seal(ses, env, { ...DATA, todos: [{ id: "t" }] });
  assert.notEqual(next.ct, env.ct);
  assert.equal((await V.openWithCode(next, code)).data.todos.length, 1);
  const { env: env3, code: code2 } = await V.newCode(next, ses);
  await assert.rejects(V.openWithCode(env3, code), /wrong code/);
  assert.equal((await V.openWithCode(env3, code2)).data.todos.length, 1);
});
test("a changed locked file is refused, not half read", async () => {
  const { env, code } = await V.create(DATA);
  const bad = { ...env, ct: env.ct.slice(0, -6) + (env.ct.slice(-6, -5) === "A" ? "B" : "A") + env.ct.slice(-5) };
  await assert.rejects(V.openWithCode(bad, code));
});
