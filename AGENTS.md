# day-hub agent notes

## Clean up after yourself (Junyan, 2026-11-02)

Day Quest (the quest app) lives in two places: the web pages in the `day-hub` repo
(`still/quest*.html`, `still/quest-*.js`) and the live backend in
`/Users/jboon/Agent Workspace/personal/still-api` (deployed with its `deploy.sh`). The backend
is in git (github.com/junyanboon/still-api): change it on a branch in a worktree and open a PR.
The `day-hub/still-api` copy is stale (last touched 2026-08-08). Since 2026-11-21 the backend
also serves the calendar page itself at junyan.danceannex.ca, with password and Face ID sign-in.

How the calendar goes live: merging to day-hub `main` is the deploy. still-api (`src/site.mjs`) fetches
`still/` from GitHub at main's newest commit, checking at most every 2 minutes, so no server step is needed.
Check it: `curl -sI https://junyan.danceannex.ca/ | grep -i x-site-commit` shows the live short sha, and the page
is at `/calendar.html` (not `/still/calendar.html`, which is 404). Only a still-api code change needs `deploy.sh`.

1. After a change is merged or verified live, remove every working copy or worktree you made
   (`git worktree remove <path>`, and any extra folder or deploy copy).
2. Do not make a full backup folder before every change when git history already covers it.
   Work on a branch in a worktree instead. Until `still-api` is in git, back up only the files
   you are about to change, into `personal/still-api-backups/`, not the whole tree.
3. Keep at most the newest 5 backups in `personal/still-api-backups/` (and `still-api/backups/`);
   delete older ones once your change is verified.
4. Keep a copy only if it holds unsaved or unpushed work, and say so in your report (path and why).
