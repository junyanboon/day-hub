// node --test still/test/*.test.mjs   (d94, 2026-10-22: Junyan dragged Work and got "Could not save the move (Calendar PATCH:
// HTTP 403 { "error": { "errors": [ { "domain": "usageLimits", "reason": "rateLimitExceeded", ... } ] } }). Work is back
// where it was." Google's "too many requests" is waited out and tried again, the block stays where he put it meanwhile,
// and a failure says so in a few plain words, never JSON or an HTTP code.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(new URL("../quest-agenda.js", import.meta.url), "utf8"), ctx);
const A = ctx.QuestAgenda;
const html = fs.readFileSync(new URL("../quest.html", import.meta.url), "utf8");
const fn = name => { const i = html.indexOf(`function ${name}(`); assert.ok(i > 0, `quest.html lost ${name}`); return html.slice(i, html.indexOf("\n  }\n", i)); };
const err = (message, extra = {}) => Object.assign(new Error(message), extra);
const OLD_403 = 'Calendar PATCH: HTTP 403 { "error": { "errors": [ { "domain": "usageLimits", "reason": "rateLimitExceeded", "message": "Rate Limit Exceeded" } ] } }';

test("Google busy is told apart from other failures, from the new still-api and the old one", () => {
  assert.equal(A.calBusy(err("Google Calendar is busy. Try again in a minute.", { status:503, busy:true })), true);
  assert.equal(A.calBusy(err(OLD_403, { status:502 })), true, "the old still-api's raw answer");
  assert.equal(A.calBusy(err("Calendar PATCH: HTTP 429 ", { status:502 })), true);
  assert.equal(A.calBusy(err("x", { status:429 })), true);
  assert.equal(A.calBusy(err("Calendar PATCH: HTTP 403 forbidden", { status:502 })), false);
  assert.equal(A.calBusy(new TypeError("Failed to fetch")), false);
  assert.equal(A.calBusy(null), false);
});

test("the reason a save failed, in plain words: never JSON, never an HTTP code", () => {
  assert.equal(A.plainWhy(err(OLD_403)), "Google Calendar is busy");
  assert.equal(A.plainWhy(new TypeError("Failed to fetch")), "no connection");
  assert.equal(A.plainWhy(new TypeError("Load failed")), "no connection");
  assert.equal(A.plainWhy(err("The operation was aborted.", { name:"AbortError" })), "no answer in time");
  assert.equal(A.plainWhy(err('Calendar insert: HTTP 400 {"error":"bad"}')), "it did not go through");
  assert.equal(A.plainWhy(err("HTTP 500")), "it did not go through");
  assert.equal(A.plainWhy(err("refused: it has other guests")), "refused: it has other guests", "still-api's own plain words stay");
  assert.equal(A.plainWhy(err("calendar not in Still's list")), "calendar not in Still's list");
  assert.equal(A.plainWhy(undefined), "it did not go through");
});

test("the failed drag says it like Junyan asked", () => {
  const busy = err("Google Calendar is busy. Try again in a minute.", { status:503, busy:true });
  assert.equal(A.failSay(busy, "save the move", "Work is back where it was"),
    "Google Calendar is busy. Couldn't save the move, so Work is back where it was. Try again in a minute.");
  assert.equal(A.failSay(err(OLD_403), "save the move", "Work is back where it was"),
    "Google Calendar is busy. Couldn't save the move, so Work is back where it was. Try again in a minute.");
  assert.equal(A.failSay(new TypeError("Failed to fetch"), "save the move", "Work is back where it was"),
    "Couldn't save the move (no connection), so Work is back where it was.");
  for (const e of [err(OLD_403), err("HTTP 502"), err('x {"a":1}')]) assert.doesNotMatch(A.failSay(e, "do it", "nothing changed"), /HTTP|\{|\d{3}/);
});

test("a busy answer from the old still-api is tried again after about 2 s and 4 s; the new still-api's busy is not", async () => {
  const waits = [], busySeen = [];
  let n = 0;
  const out = await A.retryBusy(async () => { if (++n < 3) throw err(OLD_403); return "saved"; },
    { sleep: async ms => waits.push(ms), random: () => 0.5, onBusy: i => busySeen.push(i) });
  assert.equal(out, "saved"); assert.equal(n, 3);
  assert.deepEqual(waits, [2000, 4000]); assert.deepEqual(busySeen, [1, 2]);
  // gives up after 3 tries with the last error
  n = 0;
  await assert.rejects(A.retryBusy(async () => { n++; throw err(OLD_403); }, { sleep: async () => {} }), /rateLimitExceeded/);
  assert.equal(n, 3);
  // still-api already waited it out four times (busy: true): no second round on the phone
  n = 0;
  await assert.rejects(A.retryBusy(async () => { n++; throw err("Google Calendar is busy.", { busy:true, status:503 }); }, { sleep: async () => {} }));
  assert.equal(n, 1);
  // any other failure is not retried
  n = 0;
  await assert.rejects(A.retryBusy(async () => { n++; throw new TypeError("Failed to fetch"); }, { sleep: async () => {} }));
  assert.equal(n, 1);
});

test("calendar writes go through the retry, and the drag keeps the block where he put it while it waits", () => {
  const q = fn("qfetch");
  assert.match(q, /retryBusy\(/, "qfetch retries calendar writes");
  assert.match(q, /\/cal\//);
  assert.match(q, /err\.busy = !!body\.busy/, "the server's busy flag reaches the page");
  const d = fn("commitDrag");
  // PEND (where he put it) is set before the save and only taken away when the save fails for good
  assert.ok(d.indexOf("PEND[k] = pend; show();") < d.indexOf('qfetch("/cal/event"'));
  assert.match(d, /onBusy:/, "it says it is trying again");
  assert.match(d, /failSay\(err, `save the \$\{renamed \? "change" : "move"\}`, `\$\{shortName\(b\)\} is back where it was`\)/);
  assert.match(d, /was:/, "the drag tells still-api where it was, so only those days are read again");
});

test("no failure message in the app shows a raw error or an HTTP code", () => {
  // calendar and Notion failures name the reason through plainWhy/failSay, never err.message
  const shown = html.split("\n").filter(l => /calToast\(|alert\(|textContent = |\.msg\[id\] = |note:`Could|openSheet\(`<p>Could/.test(l) && /(err|e)\.message|"HTTP " \+/.test(l));
  assert.deepEqual(shown, []);
});

test("the other days of the agenda are read every 10 minutes, and at once after a calendar write", () => {
  const D = ["2026-10-21", "2026-10-23", "2026-10-24", "2026-10-25"], AG = Object.fromEntries(D.map(d => [d, []]));
  const t = Date.UTC(2026, 9, 22, 12);
  assert.equal(A.agendaDue(0, t, D, AG), true, "never read");
  assert.equal(A.agendaDue(t - 2 * 60000, t, D, AG), false, "the 2-minute pull leaves them");
  assert.equal(A.agendaDue(t - 10 * 60000, t, D, AG), true);
  assert.equal(A.agendaDue(t - 60000, t, D.concat("2026-10-26"), AG), true, "a new day in the list (after midnight)");
  const p = fn("pullAgenda");
  assert.match(p, /agendaDue\(AG_AT/);
  assert.match(fn("qfetch"), /AG_AT = 0/, "a calendar write makes the next read-back fetch them");
});
