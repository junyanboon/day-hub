// node --test still/test/calendar-desk-location.test.mjs  (d33, Junyan 2026-11-25: "33 yes", "35 yes")
// "Add a Location box you can type in on the computer panel, with the same places list as the phone."
// The pure rule is CalCore.locationPatch (what Save sends); the page rules are read from still/calendar.html.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../calendar-core.js";
import "../calendar-commute.js";
const C = globalThis.CalCore;
const html = fs.readFileSync(new URL("../calendar.html", import.meta.url), "utf8");
const pEvent = html.slice(html.indexOf("function pEvent(ev)"), html.indexOf("/* ---------- the phone's event sheet"));
const pSheet = html.slice(html.indexOf("function pSheet(ev)"), html.indexOf("/** The words in the sheet's rows"));

test("Save sends the location only when it changed (spaces at the ends do not count)", () => {
  assert.deepEqual(C.locationPatch({ location: "Studio A" }, "Studio A"), {});
  assert.deepEqual(C.locationPatch({ location: "Studio A" }, "  Studio A  "), {});
  assert.deepEqual(C.locationPatch({ location: "Studio A" }, "Studio B, 12 Main St"), { location: "Studio B, 12 Main St" });
  assert.deepEqual(C.locationPatch({ location: "Studio A" }, ""), { location: "" }, "cleared: send the empty text so the place is removed");
  assert.deepEqual(C.locationPatch({}, ""), {}, "none before, none now");
  assert.deepEqual(C.locationPatch({ location: null }, "  "), {});
  assert.deepEqual(C.locationPatch({}, "Home"), { location: "Home" });
  assert.deepEqual(C.locationPatch({ location: "A" }, undefined), {}, "no box on the page: nothing to send");
});

test("the computer panel has a Location box wired to the same places list as the phone", () => {
  assert.match(pEvent, /<input[^>]*id="pLoc"[^>]*aria-controls="locSug"/);
  assert.match(pEvent, /id="locSug"/, "the list lives under the box");
  assert.match(pEvent, /placeholder="Add location"/);
  assert.match(pEvent, /Location/);
  assert.match(html, /const LOC = makePlaceList\(\{ id: "locSug"/, "one list piece, not a second copy");
  assert.match(html, /isLocInput = \(el\) => [^\n]*#pLoc/, "typing, focus, Enter and tapping away treat the box like the phone's row");
  const pick = html.slice(html.indexOf("async function locPick("), html.indexOf("async function cmAct("));
  assert.match(pick, /CalCommute\.locationText\(/, "a pick fills the box with the same text as on the phone");
  assert.match(pick, /#pLoc/, "and it can fill the computer box");
});
test("the box is disabled on a read-only calendar and on a suggestion, and the plain location line is dropped when the box shows", () => {
  const tag = pEvent.match(/<input[^>]*id="pLoc"[^>]*>/)[0];
  assert.match(tag, /\$\{dis\}|disabled/, "disabled by the same switch as the title");
  assert.match(pEvent, /ev\.ghost \|\| !canEdit/, "a suggestion is not edited here");
  assert.doesNotMatch(pEvent, /ev\.location \? esc\(ev\.location\)/, "no second printing of the location in the lines");
});
test("Save puts the location in a new event and in a changed one, through the one rule", () => {
  const save = html.slice(html.indexOf("async function saveEvent()"), html.indexOf("/** A plain list in the panel"));
  assert.match(save, /\$\("#pLoc"\)/);
  assert.match(save, /C\.locationPatch\(/);
  assert.match(save, /location/);
  const sheet = html.slice(html.indexOf("async function saveSheet()"), html.indexOf("/* The keyboard: on a phone"));
  assert.doesNotMatch(sheet, /pLoc/, "the phone's save is untouched");
});
test("the phone sheet's Location row is unchanged", () => {
  assert.match(pSheet, /row\("Location", `<input class="tx" type="text" data-f="location" value="\$\{esc\(f\.location\)\}" placeholder="Add location" autocomplete="off" aria-controls="locSug" \$\{dis\}>`\)/);
  assert.match(pSheet, /<div class="cmsug locsug" id="locSug" aria-live="polite"><\/div>/);
  assert.doesNotMatch(pSheet, /pLoc/);
});
