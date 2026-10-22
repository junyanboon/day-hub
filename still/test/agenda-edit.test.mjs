// node --test still/test/*.test.mjs   (Junyan, 2026-10-22, d93: he tapped tomorrow's 15 min "Hotel shuttle to MAD" and the
// sheet only said to drag it; the edges of a short block are too thin to drag on a phone, so he could not change its length.
// A calendar event on another day now opens with its name, Start, End, length chips and Save, saved the way a drag saves it.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const html = fs.readFileSync(here + "quest.html", "utf8");
// the sheet's time helpers as the page has them
const lenSrc = /const AGLEN = \(\(\) => \{[\s\S]*?\n  \}\)\(\);/.exec(html)[0];
const A = vm.runInNewContext(lenSrc + "\nAGLEN", {});
const fn = name => { const i = html.indexOf(name); assert.ok(i >= 0, name); return html.slice(i, html.indexOf("\n  }\n", i)); };

test("the length chips are 15m, 30m, 1h and 1.5h, and a chip sets End from Start", () => {
  assert.deepEqual([...A.LENS], [15, 30, 60, 90]);
  assert.equal(A.endFor("09:40", 15), "09:55");
  assert.equal(A.endFor("09:40", 30), "10:10");
  assert.equal(A.endFor("09:40", 60), "10:40");
  assert.equal(A.endFor("09:40", 90), "11:10");
  assert.equal(A.endFor("23:30", 60), "00:30");   // past midnight
});

test("lenOf reads the length the fields show, past midnight too", () => {
  assert.equal(A.lenOf("09:40", "09:55"), 15);
  assert.equal(A.lenOf("23:30", "00:30"), 60);
  assert.equal(A.lenOf("10:00", "10:00"), 1440);
});

test("editMode: what the save changes, so a new end alone stretches and a name alone moves nothing", () => {
  const b = { s:new Date("2026-10-23T08:00:00Z"), e:new Date("2026-10-23T08:15:00Z") };
  const at = iso => new Date(`2026-10-23T${iso}:00Z`);
  assert.equal(A.editMode(b, at("08:00"), at("08:15")), null);
  assert.equal(A.editMode(b, at("08:00"), at("08:30")), "bottom");
  assert.equal(A.editMode(b, at("07:45"), at("08:15")), "top");
  assert.equal(A.editMode(b, at("09:00"), at("09:15")), "move");
});

test("a calendar event on another day opens with name, Start, End, the chips and Save", () => {
  const f = fn("function openAgendaItem(b){");
  assert.match(f, /ed = dk\.kind === "cal"/);
  for (const id of ["agT", "agS", "agE", "agLen", "agSave"]) assert.ok(f.includes(`id="${id}"`), id);
  assert.match(f, /data-len=/);
  assert.match(f, /len = \+c\.dataset\.len; ef\.value = A\.endFor\(sf\.value, len\)/, "a chip sets End from Start, and a later Start keeps that length");
  // Save goes the drag's way: same calendar event, the change shown at once, Google Calendar after
  assert.match(f, /commitDrag\(b, dk, s, e, mode \|\| "move", t\)/);
  assert.match(f, /if \(e <= s\) e = new Date\(e\.getTime\(\) \+ 86400000\)/);
});

test("a block that cannot be changed from here still says why, with Close only", () => {
  const f = fn("function openAgendaItem(b){");
  assert.match(f, /esc\(dk\.why \|\| ""\)/);
  assert.match(f, /ed \? "Cancel" : "Close"/);
});

test("the gym move and the Groceries kitchen routing stay as they were", () => {
  const f = fn("function openAgendaItem(b){");
  assert.ok(f.indexOf('blockList(b) === "kitchen"') < f.indexOf("openSheet("), "Groceries opens the kitchen before the sheet");
  assert.match(f, /\$\{gymMoveHTML\(b\)\}/);
  assert.match(f, /bindGymMove\(\$\("sheet"\)/);
});

test("commitDrag takes a new name and sends it as the event title; a drag sends none", () => {
  const f = fn("async function commitDrag(");
  assert.match(f, /mode = "move", t = b\.t\)/);
  assert.match(f, /renamed = t !== b\.t/);
  assert.match(f, /title:renamed \? t : ""/);
  assert.match(f, /const pend = \{ s:\+s, e:\+e, \.\.\.\(renamed \? \{ t \} : \{\}\), at:Date\.now\(\) \}/);
  assert.match(f, /PEND\[k\] = pend; show\(\);/);
  // a name alone does not move the event to a free slot
  assert.match(f, /!timeMoved\(b, s, e\) \? \{ s, e, hit:null \}/);
});
