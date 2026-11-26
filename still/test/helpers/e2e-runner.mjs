// The logic behind `node still/test/e2e/run-all.mjs` (Junyan, 2026-11-25, d65): ports, time limits, result
// reading, and stopping only the processes a run started. Kept apart from the command so `node --test` can check it.
import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Every process a run starts carries this variable (its value names the run), so what a file left behind can be found
 *  and stopped by that tag, never by program name: other sessions' browsers on this Mac are never touched. */
export const TAG_VAR = "E2E_RUN_TAG";
export const TAG_PREFIX = "e2erun";

/** One block of ports per file. Files use PORT and PORT+1 (a second server, or the phone run), so any stride of 2 or
 *  more keeps them apart; 10 leaves room. Index i always gets the same ports, so a rerun reuses its own. */
export function portFor(index, { base = 18200, stride = 10 } = {}) {
  return base + index * stride;
}

/** Ports a child is told about. PORT is the main one; PAGE_PORT and API_PORT serve the two quest files that take two. */
export function portEnv(port) {
  return { PORT: String(port), PAGE_PORT: String(port), API_PORT: String(port + 1) };
}

/** Is a port (and the one after it) free right now? */
export function portsFree(port, count = 2) {
  const one = (p) => new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(p, () => s.close(() => resolve(true)));
  });
  return Promise.all(Array.from({ length: count }, (_, i) => one(port + i))).then((r) => r.every(Boolean));
}

/** Blocks of ports handed out one file at a time. A block is claimed just before its file starts, after a check that
 *  nothing else on the Mac holds it (other sessions run servers too), and given back when the file ends. */
export function createPortPool({ base = 18200, stride = 10, free = portsFree } = {}) {
  const claimed = new Set();
  return {
    async claim() {
      for (let i = 0; ; i++) {
        const p = portFor(i, { base, stride });
        if (claimed.has(p)) continue;
        claimed.add(p);                      // taken before the await, so two files asking at once never get the same block
        if (await free(p, stride)) return p;
        claimed.delete(p);                   // busy with something else: try the next block
      }
    },
    release(p) { claimed.delete(p); },
  };
}

/** Read a file's output and exit code into one result. SKIP counts as not passed (a skipped file proved nothing). */
export function parseResult(output, exitCode, { hung = false } = {}) {
  const passedChecks = (output.match(/^PASS\s/gm) || []).length;
  const failedChecks = (output.match(/^FAIL\s/gm) || []).length;
  let status;
  if (hung) status = "HUNG";
  else if (/^SKIP:/m.test(output)) status = "SKIP";
  else if (exitCode !== 0 || failedChecks > 0) status = "FAIL";
  else status = "PASS";
  return { status, passedChecks, failedChecks };
}

/** Pick files by name (with or without `.e2e.mjs`). An unknown name is returned in `unknown` so the command can say so. */
export function pickFiles(all, names) {
  if (!names.length) return { files: all, unknown: [] };
  const stem = (f) => f.replace(/\.e2e\.mjs$|\.mjs$/, "");
  const files = [], unknown = [];
  for (const n of names) {
    const hit = all.find((f) => f === n || stem(f) === stem(n));
    if (hit) { if (!files.includes(hit)) files.push(hit); } else unknown.push(n);
  }
  return { files, unknown };
}

/** The pids of this run's leftover processes, found by the tag in their environment. */
export function listTagged(tag, { exec = execFileSync, self = process.pid, family = false } = {}) {
  let text = "";
  try { text = exec("ps", ["-axE", "-ww", "-o", "pid=,command="], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }); } catch { return []; }
  const needle = `${TAG_VAR}=${tag}`;
  const pids = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(\d+)\s/);
    if (!m || +m[1] === self) continue;
    const i = line.indexOf(needle);
    // the tag must end where the next variable starts (a space) or at the line end, so run 12 never matches run 123.
    // family: also its per-file tags (`<run tag>.<n>`), for stopping everything a run started.
    const next = line[i + needle.length];
    if (i > 0 && (next === undefined || next === " " || (family && next === "."))) pids.push(+m[1]);
  }
  return pids;
}

/** Stop this run's processes: the file's process group, then anything still carrying the tag (its browser, which
 *  Playwright puts in a group of its own, and any server the file started). Returns how many it found by tag. */
export function killTree(tag, { groupPid, signal = "SIGKILL", family = false } = {}) {
  if (groupPid) { try { process.kill(-groupPid, signal); } catch {} }
  const pids = listTagged(tag, { family });
  for (const p of pids) { try { process.kill(p, signal); } catch {} }
  return pids.length;
}

export function isAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } }

/** Each file gets its own tag under the run's, so stopping one file never touches a neighbour that is still running. */
export const fileTag = (runTag, n) => `${runTag}.${n}`;

/** A run's tag names the runner's pid, so a later run can tell a crashed runner's leftovers from a live run's. */
export const makeTag = (pid = process.pid) => `${TAG_PREFIX}-${pid}-${Math.random().toString(36).slice(2, 8)}`;

/** Stop leftovers of runners that are no longer running (e.g. a run killed with kill -9). Returns the count stopped. */
export function reapOrphans({ exec = execFileSync, self = process.pid } = {}) {
  let text = "";
  try { text = exec("ps", ["-axE", "-ww", "-o", "pid=,command="], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }); } catch { return 0; }
  const re = new RegExp(`${TAG_VAR}=${TAG_PREFIX}-(\\d+)-[a-z0-9]+(?:\\.\\d+)?(?= |$)`);
  let n = 0;
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(\d+)\s/), t = line.match(re);
    if (!m || !t || +m[1] === self) continue;
    if (isAlive(+t[1])) continue;
    try { process.kill(+m[1], "SIGKILL"); n++; } catch {}
  }
  return n;
}

/** Run one file with a time limit. A file that passes the limit is stopped whole (node, servers, browser) and is HUNG.
 *  `onStart` is handed the child while it runs so an interrupt can stop it. */
export function runFile({ node = process.execPath, file, args = [], env = {}, cwd, timeoutMs, tag, onStart, keep = 4000000 }) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(node, [file, ...args], { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env, [TAG_VAR]: tag } });
    onStart?.(child);
    let out = "", hung = false, done = false;
    const add = (d) => { out += d; if (out.length > keep * 2) out = out.slice(-keep); };
    child.stdout.on("data", add); child.stderr.on("data", add);
    const timer = setTimeout(() => { hung = true; out += `\nHUNG: no exit after ${Math.round(timeoutMs / 1000)}s, stopped its whole process tree\n`; killTree(tag, { groupPid: child.pid }); }, timeoutMs);
    const finish = (code) => {
      if (done) return; done = true; clearTimeout(timer);
      // whatever the file left running (a server after a crash, a browser) goes now; the tag is this run's own
      killTree(tag, { groupPid: child.pid });
      resolve({ ...parseResult(out, code ?? 1, { hung }), exitCode: code, seconds: (Date.now() - t0) / 1000, output: out });
    };
    child.on("error", (e) => { out += `\nspawn error: ${e.message}\n`; finish(1); });
    // "exit", not "close": a server the file left running holds the output pipe open, and "close" would wait for it
    // until the time limit. Output still in flight is read until both pipes end (at most 1s), then whatever is left running is stopped.
    child.on("exit", (code) => {
      const ended = (st) => new Promise((ok) => (st.readableEnded || st.destroyed ? ok() : (st.once("end", ok), st.once("close", ok))));
      Promise.race([Promise.all([ended(child.stdout), ended(child.stderr)]), new Promise((ok) => setTimeout(ok, 1000))]).then(() => finish(code));
    });
    child.on("close", (code) => finish(code));
  });
}

/** The end-of-run table: file, result, seconds. */
export function formatTable(rows, wall) {
  const w = Math.max(4, ...rows.map((r) => r.file.length));
  const lines = [`${"file".padEnd(w)}  result  seconds`];
  for (const r of rows) lines.push(`${r.file.padEnd(w)}  ${r.result.padEnd(6)}  ${r.seconds.toFixed(1).padStart(7)}${r.note ? "  " + r.note : ""}`);
  const bad = rows.filter((r) => !["PASS", "FLAKY"].includes(r.result)).length;
  lines.push(`${rows.length} files, ${rows.filter((r) => r.result === "PASS").length} passed, ${rows.filter((r) => r.result === "FLAKY").length} flaky, ${bad} not passed. Wall time ${wall.toFixed(1)}s`);
  return lines.join("\n");
}

/** A run's temp folder is named for its runner's pid. Folders left by runners that are gone (killed with kill -9) are removed. */
export const tmpPrefix = (pid = process.pid) => `e2e-run-${pid}-`;
export function reapStaleTmp({ dir = os.tmpdir(), alive = isAlive } = {}) {
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    const m = name.match(/^e2e-run-(\d+)-/);
    if (!m || alive(+m[1])) continue;
    try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }); n++; } catch {}
  }
  return n;
}
