// The logic of `still/test/e2e/run-all.mjs` (Junyan, 2026-11-25, d65): port spacing, result reading, picking files,
// and the time limit that stops a hung file's whole process tree. The browser files themselves are not run here.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { portFor, portEnv, createPortPool, parseResult, pickFiles, runFile, makeTag, fileTag, isAlive, listTagged, killTree, formatTable, reapStaleTmp, tmpPrefix } from "./helpers/e2e-runner.mjs";

test("every file gets its own block of ports, so PORT and PORT+1 never meet another file's", () => {
  const ps = Array.from({ length: 40 }, (_, i) => portFor(i));
  for (let i = 1; i < ps.length; i++) assert.ok(ps[i] - ps[i - 1] >= 2);
  assert.equal(new Set(ps.flatMap((p) => [p, p + 1])).size, 80);
  assert.deepEqual(portEnv(9000), { PORT: "9000", PAGE_PORT: "9000", API_PORT: "9001" });
});

test("ports: blocks are claimed one file at a time, a block held by something else is skipped, a released block is reused", async () => {
  const blocker = net.createServer(); await new Promise((r) => blocker.listen(0, r));
  const held = blocker.address().port;
  try {
    const free = async (p, n) => !(held >= p && held < p + n);
    const pool = createPortPool({ base: held - 5, stride: 10, free });
    const [a, b, c] = await Promise.all([pool.claim(), pool.claim(), pool.claim()]);
    assert.equal(new Set([a, b, c]).size, 3, "three files asking at once get three blocks");
    for (const p of [a, b, c]) assert.ok(!(held >= p && held < p + 10), "no block holds the busy port");
    pool.release(b);
    assert.equal(await pool.claim(), b, "a released block comes back");
  } finally { blocker.close(); }
});

test("results: pass, fail, hung, and a skip is not a pass", () => {
  assert.equal(parseResult("PASS  a\nPASS  b\n\n2/2 checks passed\n", 0).status, "PASS");
  assert.deepEqual(parseResult("PASS  a\nFAIL  b (x)\n", 1), { status: "FAIL", passedChecks: 1, failedChecks: 1 });
  assert.equal(parseResult("PASS  a\nFAIL  b\n", 0).status, "FAIL", "a FAIL line fails the file even when the exit code is 0");
  assert.equal(parseResult("", 1).status, "FAIL");
  assert.equal(parseResult("SKIP: test browser missing\n", 0).status, "SKIP");
  assert.equal(parseResult("PASS  a\n", 0, { hung: true }).status, "HUNG");
});

test("files are picked by name with or without the suffix; unknown names are reported", () => {
  const all = ["a.e2e.mjs", "b.e2e.mjs", "c.e2e.mjs"];
  assert.deepEqual(pickFiles(all, []), { files: all, unknown: [] });
  assert.deepEqual(pickFiles(all, ["c", "a.e2e.mjs", "c"]), { files: ["c.e2e.mjs", "a.e2e.mjs"], unknown: [] });
  assert.deepEqual(pickFiles(all, ["b", "zzz"]), { files: ["b.e2e.mjs"], unknown: ["zzz"] });
});

test("a table lists file, result and seconds, then the wall time", () => {
  const t = formatTable([{ file: "a.e2e.mjs", result: "PASS", seconds: 1.234 }, { file: "b.e2e.mjs", result: "HUNG", seconds: 120 }], 130.5);
  assert.match(t, /a\.e2e\.mjs\s+PASS\s+1\.2/);
  assert.match(t, /b\.e2e\.mjs\s+HUNG\s+120\.0/);
  assert.match(t, /1 not passed\. Wall time 130\.5s/);
});

test("a file past its time limit is stopped with everything it started, and is HUNG", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-runner-test-"));
  const pidFile = path.join(dir, "grandchild.pid");
  // the "file": starts a grandchild in a group of its own (as Playwright does with its browser), then hangs
  const file = path.join(dir, "hang.e2e.mjs");
  fs.writeFileSync(file, `import { spawn } from "node:child_process"; import fs from "node:fs";
    const g = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
    fs.writeFileSync(${JSON.stringify(pidFile)}, String(g.pid)); setInterval(()=>{},1000);`);
  const tag = fileTag(makeTag(), 1);
  let child;
  try {
    const r = await runFile({ file, timeoutMs: 1500, tag, onStart: (c) => { child = c; } });
    assert.equal(r.status, "HUNG");
    assert.match(r.output, /HUNG: no exit after/);
    assert.ok(r.seconds >= 1.4 && r.seconds < 10, `took ${r.seconds}s`);
    const g = +fs.readFileSync(pidFile, "utf8");
    await new Promise((ok) => setTimeout(ok, 200));
    assert.equal(isAlive(child.pid), false, "the file's node is gone");
    assert.equal(isAlive(g), false, "the grandchild in its own group is gone too");
    assert.deepEqual(listTagged(tag), []);
  } finally { killTree(tag, {}); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a file that ends on its own is read from its output, and stopping one file leaves another's processes alone", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-runner-test-"));
  const ok = path.join(dir, "ok.e2e.mjs"), idle = path.join(dir, "idle.e2e.mjs");
  fs.writeFileSync(ok, `console.log("PASS  one"); console.log("1/1 checks passed");`);
  fs.writeFileSync(idle, `setInterval(()=>{},1000);`);
  const run = makeTag(), tagA = fileTag(run, 1), tagB = fileTag(run, 2);
  let neighbour;
  try {
    const waiting = runFile({ file: idle, timeoutMs: 20000, tag: tagB, onStart: (c) => { neighbour = c; } });
    const r = await runFile({ file: ok, timeoutMs: 20000, tag: tagA });
    assert.equal(r.status, "PASS"); assert.equal(r.passedChecks, 1);
    assert.equal(isAlive(neighbour.pid), true, "the other file is still running after this one ended");
    assert.deepEqual(listTagged(tagB).length > 0, true);
    assert.equal(listTagged(tagA).length, 0);
    killTree(run, { family: true });
    assert.equal((await waiting).status, "FAIL", "killed from outside, not by its own limit");
  } finally { killTree(run, { family: true }); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("run-all with an unknown name says so and runs nothing", () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("./e2e/run-all.mjs", import.meta.url)), "no-such-file"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no such test file: no-such-file/);
});

test("a file that crashes and leaves a server holding its output is FAIL at once, not at the time limit", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-runner-test-"));
  const file = path.join(dir, "crash.e2e.mjs");
  // like a test that throws after starting its dev server: the server inherits stderr and keeps running
  fs.writeFileSync(file, `import { spawn } from "node:child_process";
    spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: ["ignore", "ignore", "inherit"] });
    console.log("PASS  one"); throw new Error("boom");`);
  const tag = fileTag(makeTag(), 1);
  try {
    const r = await runFile({ file, timeoutMs: 20000, tag });
    assert.equal(r.status, "FAIL");
    assert.ok(r.seconds < 5, `took ${r.seconds}s`);
    assert.match(r.output, /boom/);
    assert.deepEqual(listTagged(tag), [], "the server it left running is stopped");
  } finally { killTree(tag, {}); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("temp folders of a runner that is gone are removed, a live runner's are not", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-runner-test-"));
  try {
    for (const n of [tmpPrefix(1111) + "a", tmpPrefix(2222) + "b", "something-else"]) fs.mkdirSync(path.join(dir, n));
    assert.equal(reapStaleTmp({ dir, alive: (pid) => pid === 2222 }), 1);
    assert.deepEqual(fs.readdirSync(dir).sort(), [tmpPrefix(2222) + "b", "something-else"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
