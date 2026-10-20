// node --test still/test/*.test.mjs   (Junyan, 2026-10-20, d72: take the Journal tile off Right now, "but let's make
// it so that it's collapsed": the past check-ins and conflicts sit in a closed "Past entries" section at the
// bottom of the How am I? and Conflict sheets, and load only when he opens it. Entries stay saved.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const html = fs.readFileSync(here + "quest.html", "utf8");
const fn = name => { const i = html.indexOf(name); assert.ok(i >= 0, name); return html.slice(i, html.indexOf("\n  }\n", i)); };

test("Right now has two tiles and no Journal tile", () => {
  const s = fn("function suggestHTML(");
  assert.match(s, /data-nvc="checkin"/);
  assert.match(s, /data-nvc="conflict"/);
  assert.doesNotMatch(s, /data-nvc="journal"|📓/);
  assert.doesNotMatch(fn("function bindHabits("), /openJournal/);
  // the two tiles keep whole words ("Conflict" never breaks mid-word)
  assert.match(s, /class="actions nvc-go"/);
  assert.match(html, /\.nvc-go \.btn \{[^}]*overflow-wrap:normal/);
});

test("both sheets end with a collapsed Past entries section that loads only when opened", () => {
  for (const name of ["function openCheckin(", "function openConflict("]) {
    const s = fn(name);
    assert.match(s, /nvPastHTML\(S\)/, name);
    assert.match(s, /nvPastBind\(S/, name);
    // the section comes after the sheet body, at the bottom
    assert.ok(s.indexOf("nvPastHTML(S)") > s.indexOf("body"), name);
  }
  const h = fn("function nvPastHTML(");
  assert.match(h, /<details class="nvc-past"\$\{S\.past \? " open" : ""\}>/);
  assert.match(h, /<summary>[^<]*Past entries/);
  const b = fn("function nvPastBind(");
  assert.match(b, /ontoggle/);
  assert.match(b, /\/quest\/nvc|nvJournalLoad/);
  // the fetch is only reached from the toggle, never on sheet open
  assert.doesNotMatch(fn("function openCheckin("), /qfetch\("\/quest\/nvc"\)(?!, \{)/);
  assert.doesNotMatch(fn("function openConflict("), /qfetch\("\/quest\/nvc"\)(?!, \{)/);
});

test("the past entries read the same store the journal did", () => {
  const l = fn("async function nvJournalLoad(");
  assert.match(l, /qfetch\("\/quest\/nvc"\)/);
  assert.match(l, /G\.day\.feel/);
});
