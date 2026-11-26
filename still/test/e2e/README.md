# Browser tests (e2e)

Each `*.e2e.mjs` here opens the calendar or Day Quest page in the test browser against a fake backend
(`calendar-dev.mjs`) and clicks through it. They are not part of `node --test`.

## Run them: one command

```
PW_DIR=/Users/jboon/.hermes/hermes-agent node still/test/e2e/run-all.mjs
```

(`PW_DIR` is the folder holding `node_modules/playwright-core`; without it the runner tries `~/.hermes/hermes-agent`.)

It runs the files several at a time (6 by default), gives each its own ports and temp folder, stops a file that
takes longer than 240 seconds (whole process tree, browser included) and marks it HUNG, reruns each failed or hung
file once alone (FLAKY if it then passes), and prints one table with the wall time. Exit code 0 only when every file
passed. A skipped file ("test browser missing") is not a pass.

| Want | Command |
|---|---|
| Just some files | `node still/test/e2e/run-all.mjs calendar-sheet offline` |
| One after another | `--jobs 1` |
| More or fewer at once | `--jobs 6` |
| Longer time limit | `--timeout 300` (seconds, per file) |
| No rerun of failures | `--no-retry` |
| Keep each file's full output (a rerun goes to `<name>.retry.log`) | `--logs <folder>` |
| List the files | `--list` |

Needs the test browser once: `sh scripts/install-test-browser.sh`. The runner checks first and never downloads.

Ctrl-C, a hang or a crash of a test file leaves nothing behind (if the runner itself is killed with `kill -9`, the next run cleans up after it). The runner stops only what it started (each process carries an
`E2E_RUN_TAG` variable), never by program name, so other sessions' browsers are left alone.

## Writing a file

- Take the port from `process.env.PORT`. A file owns `PORT` to `PORT + 9` (a second server is `PORT + 1`, a third `PORT + 2`; never `PORT + 10`, that is another file's). Two-server files may also read
  `PAGE_PORT` and `API_PORT`. Never hard-code a port without that fallback form: the runner runs files side by side.
- Put temp files under `os.tmpdir()`, with `fs.mkdtempSync`: the runner points `TMPDIR` at a folder of its own per file.
- Open the browser with `launchTestBrowser` from `../helpers/test-browser.mjs`, never your own Chrome.
- Wait for a thing to be there (`waitForSelector`, `waitForFunction`), never a fixed sleep to hide a race.
- Exit 1 when any check fails (print `FAIL  <name>` lines) and 0 when all pass.
