// One place that opens a browser for day planner tests and scripts (Junyan, 2026-11-20, a16).
// It is Chrome for Testing's chrome-headless-shell, installed outside the repo by `sh scripts/install-test-browser.sh`
// (same cache folder as the Deck's, so one install serves both). It never touches /Applications/Google Chrome.app
// and has no Dock icon, so nothing flashes on screen. CHROME_BIN overrides the path; the installed Chrome is refused
// even if named. HEADED is gone: the test browser has no window.
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_CACHE = join(homedir(), ".cache", "deck-test-browser");
export const INSTALL_COMMAND = "run `sh scripts/install-test-browser.sh` (installs chrome-headless-shell into ~/.cache/deck-test-browser)";
export const SKIP_MESSAGE = `test browser missing (or CHROME_BIN points at the installed Chrome or a missing file): ${INSTALL_COMMAND}`;

const isInstalledChrome = (p) => /\/Applications\/.*Google Chrome/i.test(p) || /\.app\/Contents\/MacOS\/Google Chrome/i.test(p);

export function findTestBrowser({ env = process.env, cacheDir = DEFAULT_CACHE } = {}) {
  const override = env.CHROME_BIN;
  if (override) return !isInstalledChrome(override) && existsSync(override) ? override : null;
  const root = join(cacheDir, "chrome-headless-shell");
  if (!existsSync(root)) return null;
  const num = (v) => Number((v.match(/(\d+)/) || [])[1] || 0);
  for (const v of readdirSync(root).sort((a, b) => num(b) - num(a))) {
    const vdir = join(root, v);
    if (!statSync(vdir).isDirectory()) continue;
    for (const sub of readdirSync(vdir)) {
      const bin = join(vdir, sub, "chrome-headless-shell");
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

const open = new Set();
let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  const kill = () => { for (const b of open) { try { b.process()?.kill("SIGKILL"); } catch {} } };
  process.on("exit", kill);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, async () => {
      await Promise.all([...open].map((b) => b.close().catch(() => {})));
      kill();
      process.exit(130);
    });
  }
}

// Opens the test browser. Missing browser: prints the install command and exits 0 (a skip, not a failure).
// Closes on finish (browser.close()), on failure (uncaught error) and on Ctrl-C or kill.
export async function launchTestBrowser(chromium, options = {}) {
  const executablePath = findTestBrowser();
  if (!executablePath) { console.log("SKIP: " + SKIP_MESSAGE); process.exit(0); }
  hook();
  const browser = await chromium.launch({ ...options, executablePath, headless: true });
  open.add(browser);
  browser.on("disconnected", () => open.delete(browser));
  return browser;
}
