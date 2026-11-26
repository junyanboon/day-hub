// Runs the browser tests (still/test/e2e/*.e2e.mjs) several at a time, with a time limit on each (Junyan, 2026-11-25, d65).
//
//   node still/test/e2e/run-all.mjs                     every file, 6 at once, 240s limit each
//   node still/test/e2e/run-all.mjs calendar-sheet offline      just those files (names with or without .e2e.mjs)
//   node still/test/e2e/run-all.mjs --jobs 2            how many at once (1 = one after another)
//   node still/test/e2e/run-all.mjs --timeout 300       seconds a file may take before it is stopped and marked HUNG
//   node still/test/e2e/run-all.mjs --no-retry          skip the one rerun of failed files
//   node still/test/e2e/run-all.mjs --logs <folder>     keep each file's full output in <folder>
//   node still/test/e2e/run-all.mjs --list              show the files and stop
//
// Playwright: PW_DIR=<folder with node_modules/playwright-core> (default: ~/.hermes/hermes-agent when PW_DIR is unset).
// Test browser: needs `sh scripts/install-test-browser.sh` done once. The runner checks first and never downloads anything.
//
// What it does:
//  - gives every file its own block of ports (env PORT, PAGE_PORT, API_PORT; a block is 10 wide, so PORT and PORT+1 never
//    meet another file's) and its own TMPDIR, removed when the run ends;
//  - stops a file that passes the time limit with its whole process tree (node, servers, browser) and marks it HUNG;
//  - reruns a failed or hung file once, alone, at the end: it shows as FLAKY if it then passes (counts as a pass, but
//    look at it: the test has a race);
//  - SKIP ("test browser missing") is not a pass;
//  - prints one table (file, result, seconds), the wall time, and exits 1 unless every file passed (0 also for FLAKY).
//
// Leaves nothing behind, also on Ctrl-C: it stops only processes it started, found by the E2E_RUN_TAG variable it puts
// in their environment, never by program name, so other sessions' browsers are left alone.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { findTestBrowser, SKIP_MESSAGE } from "../helpers/test-browser.mjs";
import { createPortPool, portEnv, runFile, killTree, makeTag, fileTag, reapOrphans, reapStaleTmp, tmpPrefix, pickFiles, formatTable } from "../helpers/e2e-runner.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "../../..");
const DEFAULT_JOBS = 6;       // measured 2026-11-25, 10-core Mac with other sessions running: 2 at once 475s, 4: 227s, 6: 159s, 8: 125s (all passed); the longest file alone takes about 110s, so 8 is near the floor. 6 leaves cores for the others.
const DEFAULT_TIMEOUT_S = 240;

function parseArgs(argv) {
  const o = { names: [], jobs: DEFAULT_JOBS, timeout: DEFAULT_TIMEOUT_S, retry: true, logs: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], num = (name) => { const v = Number(argv[++i]); if (!(v > 0)) die(`${name} needs a number above 0`); return v; };
    if (a === "--jobs" || a === "-j") o.jobs = Math.floor(num(a));
    else if (a === "--timeout") o.timeout = num(a);
    else if (a === "--no-retry") o.retry = false;
    else if (a === "--logs") o.logs = argv[++i] || die("--logs needs a folder");
    else if (a === "--list") o.list = true;
    else if (a === "--help" || a === "-h") { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n")); process.exit(0); }
    else if (a.startsWith("-")) die(`unknown option ${a} (see --help)`);
    else o.names.push(a);
  }
  return o;
}
function die(msg) { console.error(msg); process.exit(2); }

const opts = parseArgs(process.argv.slice(2));
const all = fs.readdirSync(here).filter((f) => f.endsWith(".e2e.mjs")).sort();
const picked = pickFiles(all, opts.names);
/* Slowest first, so the long files start at once and do not end up alone at the tail (times measured 2026-11-25; a stale
   list only costs a little wall time). Table order stays alphabetical. */
const SLOW_FIRST = ["calendar-commute-remember-location", "calendar-commute-places", "calendar-commute", "calendar-sheet", "calendar-phone", "calendar-commute-suggest", "calendar-commute-ended", "calendar-location-places", "calendar-trips", "offline", "calendar-commute-tidy"];
const rank = (f) => { const i = SLOW_FIRST.indexOf(f.replace(/\.e2e\.mjs$/, "")); return i < 0 ? SLOW_FIRST.length : i; };
const { files, unknown } = { ...picked, files: [...picked.files].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)) };
if (unknown.length) die(`no such test file: ${unknown.join(", ")}. Files: ${all.map((f) => f.replace(/\.e2e\.mjs$/, "")).join(", ")}`);
if (opts.list) { console.log(files.join("\n")); process.exit(0); }

/* Up front: the test browser and playwright, so a missing one is one clear message, not 30 skips. */
if (!findTestBrowser()) die(`SKIP: ${SKIP_MESSAGE}\nNothing was run and nothing was downloaded.`);
const PW_DIR = process.env.PW_DIR || (fs.existsSync(path.join(os.homedir(), ".hermes/hermes-agent/node_modules/playwright-core")) ? path.join(os.homedir(), ".hermes/hermes-agent") : process.cwd());
try { createRequire(path.join(PW_DIR, "x.js")).resolve("playwright-core"); }
catch { die(`playwright-core not found from PW_DIR=${PW_DIR}. Set PW_DIR=<folder with node_modules/playwright-core>.`); }

const reaped = reapOrphans(), staleTmp = reapStaleTmp();
if (reaped || staleTmp) console.log(`cleaned up after an earlier run that was killed: ${reaped} process(es), ${staleTmp} temp folder(s)`);

const tag = makeTag();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), tmpPrefix()));
if (opts.logs) fs.mkdirSync(opts.logs, { recursive: true });
const live = new Set();
let cleaned = false;
function cleanup() {
  if (cleaned) return; cleaned = true;
  for (const c of live) { try { process.kill(-c.pid, "SIGKILL"); } catch {} }
  killTree(tag, { family: true });
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { console.error(`\n${sig}: stopping every test this run started`); cleanup(); process.exit(130); });

const pool = createPortPool();
const jobs = Math.max(1, Math.min(opts.jobs, files.length));
const t0 = Date.now();
let runs = 0;
const attempt = async (file) => {
  const port = await pool.claim(), dir = fs.mkdtempSync(path.join(tmp, "t-"));
  try {
    const r = await runFile({
      file: path.join(here, file), cwd: repo, timeoutMs: opts.timeout * 1000, tag: fileTag(tag, ++runs),
      env: { ...portEnv(port), TMPDIR: dir, PW_DIR },
      onStart: (c) => live.add(c),
    });
    if (opts.logs) fs.writeFileSync(path.join(opts.logs, file.replace(/\.mjs$/, "") + ".log"), r.output);
    return r;
  } finally {
    for (const c of [...live]) if (c.exitCode !== null || c.signalCode) live.delete(c);
    pool.release(port);
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

console.log(`${files.length} file(s), ${jobs} at a time, ${opts.timeout}s limit each`);
const first = new Map();
let done = 0;
const queue = [...files];  // slowest first
await Promise.all(Array.from({ length: jobs }, async () => {
  while (queue.length) {
    const f = queue.shift(), r = await attempt(f);
    first.set(f, r);
    console.log(`[${++done}/${files.length}] ${r.status.padEnd(4)} ${f}  ${r.seconds.toFixed(1)}s${r.failedChecks ? `  (${r.failedChecks} checks failed)` : ""}`);
  }
}));

/* A failed or hung file gets one more go, alone, so a clash with its neighbours cannot be the reason. */
const rows = [], again = new Map();
for (const f of [...files].sort()) {
  const r = first.get(f);
  if (r.status === "PASS" || !opts.retry || r.status === "SKIP") continue;
  console.log(`rerunning ${f} alone (it was ${r.status})`);
  again.set(f, await attempt(f));
}
for (const f of [...files].sort()) {
  const r = first.get(f), r2 = again.get(f);
  if (!r2) rows.push({ file: f, result: r.status, seconds: r.seconds });
  else rows.push({ file: f, result: r2.status === "PASS" ? "FLAKY" : r2.status, seconds: r.seconds + r2.seconds, note: r2.status === "PASS" ? `first run ${r.status}` : `failed again (first ${r.status})` });
  if (r2 && r2.status !== "PASS") console.log(`\n--- ${f}: last output ---\n${r2.output.trim().split("\n").slice(-25).join("\n")}\n`);
  else if (!r2 && r.status !== "PASS") console.log(`\n--- ${f}: last output ---\n${r.output.trim().split("\n").slice(-25).join("\n")}\n`);
}
const wall = (Date.now() - t0) / 1000;
console.log("\n" + formatTable(rows, wall));
const leftovers = killTree(tag, { family: true });
if (leftovers) console.log(`note: stopped ${leftovers} process(es) a file left running`);
cleanup();
process.exit(rows.every((r) => r.result === "PASS" || r.result === "FLAKY") ? 0 : 1);
