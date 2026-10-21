// node --test still/test/*.test.mjs   (Junyan, 2026-10-21, d71 to d73: the dish cards in the meal sheet use space better.
// d71: each part or ingredient is one compact row (tick box, the food, an inline "took [30] g", what is left, a small ⇄ for
// "Use something else"), on every dish card and the "Also went in" extras. d72: "drop that whole section", the intro
// paragraphs go. d73: the full recipe opens on a tap, like How to make it.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const html = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
const sheet = html.slice(html.indexOf("function openMeal(b)"), html.indexOf("function kitMealBind"));
const css = html.slice(0, html.indexOf("</style>"));
const rule = (sel) => { const i = css.indexOf(sel + " {"); assert.ok(i >= 0, `css rule ${sel}`); return css.slice(i, css.indexOf("}", i)); };

test("d72: no intro paragraphs on the dish cards", () => {
  assert.ok(!/For 2 people\. Each part/.test(sheet), "the part dish intro is gone");
  assert.ok(!/Tick what went in/.test(sheet), "the plain dish and his own dish intros are gone");
  assert.ok(!/Your usual amounts/.test(sheet));
  assert.ok(!/Tick what else went in/.test(sheet), "the From your kitchen card intro is gone too");
  assert.ok(!/class="mq-serves">\$\{d\.own/.test(sheet));
});

test("d71: a part is rows, not a heading, a card per food, a took line and a Use something else button", () => {
  const slot = sheet.slice(sheet.indexOf("const slotCard = d =>"), sheet.indexOf("const dishCard ="));
  assert.ok(!/kt-gh mq-part/.test(slot), "no part heading line");
  assert.match(slot, /class="mq-pl">\$\{esc\(p\.role\)\}/, "the part name sits on the row as a small label");
  assert.match(slot, /for \$\{esc\(r\.for\.split\(","\)\[0\]\)\}/, "a swap says what it stands in for");
  assert.match(slot, /class="mq-sw" data-dother="\$\{esc\(d\.id\)\}" data-si="\$\{si\}"/, "⇄ opens Use something else");
  assert.match(slot, /aria-label="Use something else for \$\{esc\(p\.role\)\}"/);
  assert.ok(!/>Use something else<\/button>/.test(slot), "no full width Use something else button");
});

test("d71: every row (part dishes, plain dishes, his own, extras, From your kitchen) is one mq-row with the took inline", () => {
  const wrap = html.slice(html.indexOf("function kitTakeWrap("), html.indexOf("const kitHaveWord"));
  assert.match(wrap, /return `<div class="mq-row">\$\{btn\}\$\{side \|\| ""\}<\/div>`/);
  assert.match(wrap, /<div class="mq-row tk">\$\{btn\}<label class="mq-take"><span class="mq-tqw"><span>took<\/span><input class="mq-tq"/);
  const x = sheet.slice(sheet.indexOf("const xRow ="), sheet.indexOf("const xResults"));
  assert.match(x, /<div class="mq-row tk"><button type="button" class="mq-ing" data-xoff=/);
  assert.match(x, /<label class="mq-take"><span class="mq-tqw"><span>took<\/span><input class="mq-tq"/);
  assert.ok(!/mq-ingw/.test(html), "the old two line wrapper is gone");
  // every list of tick rows sits in a one column mq-rows, not the two column grid
  assert.ok(!/<div class="mq-ings">\$\{xs\.map/.test(sheet) && /<div class="mq-rows">\$\{xs\.map/.test(sheet));
  assert.match(sheet, /<div class="mq-rows">\$\{d\.items\.map/);
  assert.match(html, /<div class="mq-rows">\$\{g\.list\.map\(row\)/);
  // the "left" words stay the label's only small, which the took handlers update in place
  assert.equal((html.match(/inp\.closest\("\.mq-take"\)\.querySelector\("small"\)/g) || []).length, 2);
});

test("d71: tap targets at least 44 px tall, and the took field fits a 375 px phone", () => {
  assert.match(rule(".mq-row"), /min-height:44px/);
  assert.match(rule(".mq-sw"), /width:44px; min-height:44px/);
  assert.match(rule(".mq-row .mq-take"), /min-height:44px/);
  assert.match(rule(".mq-row > .mq-ing"), /min-height:44px/);
  assert.match(rule(".mq-row > .mq-ing"), /min-width:0/);
  assert.match(rule(".sheet .mq-row input.mq-tq"), /width:52px/);
});

test("d73: the full recipe opens on a tap next to How to make it", () => {
  assert.ok(!/<b>Full recipe\$\{/.test(sheet), "no always-open full recipe line");
  assert.match(sheet, /const fullTo = d =>/);
  assert.match(sheet, /tog\(d, "full", "data-dfull", `Full recipe\$\{full !== d \? " \(at home\)" : ""\}`/);
  assert.match(sheet, /links\(howTo\(d, slotUse\(d\)\), fullTo\(d\)\)/);
  assert.match(sheet, /links\(howTo\(d\)\)/, "the other dishes keep How to make it");
  assert.match(html, /sh\.querySelectorAll\("\[data-dhow\], \[data-dfull\]"\)/);
  assert.match(html, /bn\.dataset\.dhow \? "how" : "full"/);
});

test("d71 to d73: no dashes in the new words", () => {
  for (const t of sheet.match(/`[^`]*`/g) || []) assert.ok(!/[—–]/.test(t), t);
});
