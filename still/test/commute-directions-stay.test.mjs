// node --test still/test/commute-directions-stay.test.mjs
// d45 (Junyan, 2026-11-25: "45 yes I want to be able to see it still"): directions stay on screen after a block is over, and a re-check that
// comes back not ok never throws away a good answer for the same trip. d46: the Open in Google link is gone. The rules are pure
// (calendar-commute.js); the page wiring is read from the source; the clicks are in e2e/calendar-commute-ended.e2e.mjs.
// No test reads the real clock: every time here is a fixed instant.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../calendar-core.js";
import "../calendar-commute.js";
const K = globalThis.CalCommute;
const fmt = (ms) => new Date(ms).toISOString().slice(11, 16);
const ok = (checkedAt = Date.parse("2026-11-25T17:20:00Z")) => ({ state: "ok", checkedAt, ways: { walk: { minutes: 20 } } });
const SIG = "100 Queen St W|Gladstone Hotel|1";

test("keptAnswer: the ok answer in memory wins, else the one kept in this browser, only for the same trip", () => {
  const a = ok(1), b = ok(2);
  assert.equal(K.keptAnswer({ mem: { res: a, sig: SIG }, stored: { res: b, sig: SIG }, sig: SIG }).res, a);
  assert.equal(K.keptAnswer({ mem: null, stored: { at: 5, res: b, sig: SIG }, sig: SIG }).res, b);
});
test("keptAnswer: another trip, a not-ok answer or no signature is never returned", () => {
  const a = ok(1);
  assert.equal(K.keptAnswer({ mem: { res: a, sig: "other" }, stored: { res: a, sig: "other" }, sig: SIG }), null, "a changed From, To or arrive time");
  assert.equal(K.keptAnswer({ mem: { res: { state: "stopped" }, sig: SIG }, stored: null, sig: SIG }), null);
  assert.equal(K.keptAnswer({ mem: { res: { state: "stopped" }, sig: SIG }, stored: { res: a, sig: SIG }, sig: SIG }).res, a, "a not-ok one in memory does not hide an ok one kept in the browser");
  assert.equal(K.keptAnswer({ mem: { res: a, sig: "" }, stored: null, sig: "" }), null);
  assert.equal(K.keptAnswer({ mem: undefined, stored: undefined, sig: SIG }), null);
});
test("endedView: a kept answer shows with 'Checked TIME' and no Check again; none shows nothing (no 'This block is over.' line)", () => {
  const v = K.endedView({ kept: { res: ok(Date.parse("2026-11-25T17:20:00Z")) }, fmt });
  assert.deepEqual(v, { show: "answer", checked: "Checked 17:20" });
  const none = K.endedView({ kept: null, fmt });
  assert.deepEqual(none, { show: "none", checked: "" });
  assert.equal(K.endedView({ kept: { res: { state: "ok" } }, fmt }).checked, "", "an answer with no time says no time");
});
test("replacesHeld: a not-ok answer never replaces an ok one for the same trip; everything else replaces", () => {
  const good = ok();
  for (const bad of [{ state: "stopped", message: "x" }, { state: "no-key" }, { state: "error" }]) {
    assert.equal(K.replacesHeld({ held: good, heldSig: SIG, sig: SIG, res: bad }), false, bad.state);
    assert.equal(K.replacesHeld({ held: good, heldSig: "other", sig: SIG, res: bad }), true, "the held answer is for another trip, so it is not kept");
    assert.equal(K.replacesHeld({ held: null, heldSig: "", sig: SIG, res: bad }), true, "nothing held: behaves as before");
    assert.equal(K.replacesHeld({ held: bad, heldSig: SIG, sig: SIG, res: bad }), true, "a not-ok one held is replaced by a not-ok one");
  }
  assert.equal(K.replacesHeld({ held: good, heldSig: SIG, sig: SIG, res: ok(9) }), true);
  assert.equal(K.replacesHeld({ held: { state: "stopped" }, heldSig: SIG, sig: SIG, res: good }), true);
});
test("notOkText: the server's message, the missing key, or a plain fallback", () => {
  assert.equal(K.notOkText({ state: "stopped", message: "Directions are off for the rest of this month. They come back on the 1st." }), "Directions are off for the rest of this month. They come back on the 1st.");
  assert.equal(K.notOkText({ state: "no-key", message: "ignored" }), "Directions need the Google key");
  assert.equal(K.notOkText({ state: "error" }), "Directions are not available.");
});
test("this file reads no real clock", () => {
  assert.equal(/new Date\(\)|Date\.now\(\)/.test(fs.readFileSync(new URL(import.meta.url), "utf8")), false);
});

const html = fs.readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
const box = html.slice(html.indexOf("/* commute:start */"), html.indexOf("/* commute:end */"));
test("the page: an ended block draws from the rule, sends no request, and the old trip is never shown", () => {
  const ended = box.slice(box.indexOf("function cmEndedParts("), box.indexOf("/** The drawn parts of an ok answer"));
  assert.match(ended, /K\.keptAnswer\(\{ mem: CM\.dir\[key\], stored: cmLast\(\)\[key\], sig: c\.sig \}\)/);
  assert.match(ended, /\[S\.cmEarly, \.\.\.K\.EARLY_CHOICES\]/, "the kept answer is found under whichever pick it was made with");
  assert.match(ended, /K\.endedView\(/);
  assert.doesNotMatch(html, /This block is over|OVER_TEXT|id="cmOver"/, "the line is gone everywhere it was drawn");
  assert.match(ended, /if \(v\.show === "none"\) return out;/, "no kept answer: the Leave by area shows nothing");
  assert.doesNotMatch(ended, /send\(|cmDirections\(/, "no request from an ended block");
  assert.match(box, /function cmDirInput\(ev\) \{[^}]*CalCommute\.blockEnded\(ev\.e, Date\.now\(\)\)\) return null;/, "the page's own check and every request still stop at the end");
  assert.match(box, /if \(!d\.res \|\| d\.sig !== inp\.sig\) \{ if \(d\.error\)/, "a changed From or To never shows the old trip's answer");
  assert.match(box, /Try again<\/button><\/div>`; out\.leave = chips\(\); return out;/, "a failed ask after a new pick keeps the chips so he can tap back");
  assert.match(box, /CalCommute\.replacesHeld\(\{ held: d\.res, heldSig: d\.sig, sig: inp\.sig, res \}\)/);
});
test("d46: the Open in Google link is gone from the computer panel and the phone sheet (Open in Google Maps stays)", () => {
  assert.doesNotMatch(html, /Open in Google<\/a>/);
  assert.doesNotMatch(html, /ev\.htmlLink/);
  assert.match(html, /Open in Google Maps/);
  assert.match(html, /<button class="btn del" id="pDel">Delete<\/button>'\}<span class="spacer"><\/span>\$\{canEdit \? '<button class="btn pri" id="pSave">Save<\/button>'/, "the foot is Delete, then the spacer, then Save");
});
test("restoredAfterFail: a failed first check falls back to the good answer kept in this browser for the same trip", () => {
  const good = ok(3), stored = { at: 5, res: good, sig: SIG };
  assert.equal(K.restoredAfterFail({ held: null, heldSig: "", stored, sig: SIG }).res, good, "nothing held after a reload: the stored one");
  assert.equal(K.restoredAfterFail({ held: { state: "stopped" }, heldSig: SIG, stored, sig: SIG }).res, good, "a not-ok one held does not hide the stored ok one");
});
test("restoredAfterFail: a different trip, nothing stored or a not-ok stored answer gives null (today's error stays)", () => {
  const good = ok(3);
  assert.equal(K.restoredAfterFail({ held: null, heldSig: "", stored: { res: good, sig: "other" }, sig: SIG }), null, "he changed the place or the way");
  assert.equal(K.restoredAfterFail({ held: null, heldSig: "", stored: undefined, sig: SIG }), null, "nothing stored");
  assert.equal(K.restoredAfterFail({ held: null, heldSig: "", stored: { res: { state: "stopped" }, sig: SIG }, sig: SIG }), null);
  assert.equal(K.restoredAfterFail({ held: ok(9), heldSig: SIG, stored: { res: good, sig: SIG }, sig: SIG }), null, "an ok answer already held for this trip stays as it is");
});
test("the page: a failed first check (not ok or no answer) restores from this browser, asks for nothing extra", () => {
  assert.match(box, /function cmRestored\(d, stored, inp\) \{[^}]*CalCommute\.restoredAfterFail\(\{ held: d\.res, heldSig: d\.sig, stored, sig: inp\.sig \}\)/);
  assert.match(box, /res && res\.state !== "ok" \? cmRestored\(d, stored, inp\) : null/);
  assert.match(box, /d\.error = "Directions could not be loaded[^}]*cmRestored\(d, stored, inp\); \}/);
  const fn = box.slice(box.indexOf("function cmRestored("), box.indexOf("const cmDirOf"));
  assert.doesNotMatch(fn, /send\(|cmDirections\(/);
});
test("the build stamp and the script number name this copy", () => {
  assert.match(html, /const BUILD = "2026-11-25l commute trip bar";/);
  assert.match(html, /calendar-commute\.js\?v=11/);
});
