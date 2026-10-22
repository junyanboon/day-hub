// node --test still/test/*.test.mjs   (2026-10-21: Junyan tapped yesterday's Groceries block on the calendar and got the
// plain agenda sheet, "Drag it on the calendar to move it", with nothing about the kitchen. A tap on a block opens its own
// list and nothing else (d32), and a Groceries block's list is the kitchen on its shopping list (d28), on any day: one that
// is over opens "What did you buy?" once, one still to come just the list. Every other block on another day keeps the sheet.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const html = fs.readFileSync(here + "quest.html", "utf8");
const fn = name => { const i = html.indexOf(`function ${name}(`); assert.ok(i > 0, `quest.html lost ${name}`); return html.slice(i, html.indexOf("\n  }\n", i)) + "\n  }"; };
const groc = /const isGroceries = [^\n]*;/.exec(html)[0];

// openAgendaItem and blockList as the page has them, with the page around them stubbed
function agenda(){
  const calls = { kitchen:[], sheet:[] };
  const make = new Function("calls", `
    const isGym = () => false, isMeal = () => false, basicId = () => null, INSIGHTS = {}, gk = b => b.key, QB = () => null;
    ${groc}
    const openKitchen = o => calls.kitchen.push(o), openSheet = h => calls.sheet.push(h);
    const AGD = () => ({ dragKind:() => ({ kind:"cal" }) }), dragCtx = () => ({}), winHead = b => b.t, esc = x => String(x);
    const AGLEN = { LENS:[15, 30, 60, 90], lenOf:() => 60, endFor:() => "10:00", editMode:() => null };
    const toField = () => "09:00", fromField = () => new Date(), commitDrag = () => {};
    const dayLabel = () => "Yesterday", tzYmd = () => "2026-10-20", now = () => new Date("2026-10-21T14:00:00Z");
    const gymMoveHTML = () => "", $ = () => ({ value:"09:00", querySelectorAll:() => [] }), closeSheet = () => {}, bindGymMove = () => {};
    ${fn("blockList")}
    ${fn("openAgendaItem")}
    return openAgendaItem;`);
  return { open:make(calls), calls };
}
const yday = { t:"Groceries", s:"2026-10-20T18:30:00.000Z", e:"2026-10-20T19:30:00.000Z", key:"g1", cal:"Joint Plans" };

test("a tap on a Groceries block on another day opens the kitchen on its shopping list, not the agenda sheet", () => {
  const { open, calls } = agenda();
  open(yday);
  assert.equal(calls.sheet.length, 0, "no agenda sheet");
  assert.equal(calls.kitchen.length, 1);
  const o = calls.kitchen[0];
  assert.equal(o.view, "shop");
  assert.equal(o.block.t, "Groceries");
  assert.ok(o.block.s instanceof Date && o.block.e instanceof Date, "times come as Dates, so the kt-blk line can print them");
  assert.equal(+o.block.s, Date.parse(yday.s));
});

test("any other block on another day still opens the agenda sheet, with its times to change and how to drag it", () => {
  const { open, calls } = agenda();
  open({ t:"Dentist", s:"2026-10-22T18:30:00.000Z", e:"2026-10-22T19:30:00.000Z", key:"d1", cal:"Joint Plans" });
  assert.equal(calls.kitchen.length, 0);
  assert.equal(calls.sheet.length, 1);
  assert.match(calls.sheet[0], /drag it on the calendar/);
  assert.match(calls.sheet[0], /id="agS"[\s\S]*id="agE"[\s\S]*id="agSave"/);   // d93: Start, End and Save
});

test("the calendar sends a tap on another day's block through openAgendaItem; dragging is not touched", () => {
  assert.match(html, /if \(!fixed\) return;[^\n]*\n\s*if \(!st\.blocks\[0\]\.game\) return openAgendaItem\(fixed\);/);
});

test("the kitchen asks What did you buy? for a Groceries block that is over, today or an earlier day, once per block", () => {
  const k = fn("openKitchen");
  const line = /\n\s*(if \(fresh && ob [^\n]*kitFillOpen\(S, "buy"\);)/.exec(k)[1];
  const asks = (ob, today, filled = []) => { let asked = false;
    new Function("fresh", "ob", "SI", "t", "kitFilled", "kitBlockKey", "kitFillOpen", "S", line)(
      true, ob, { today }, new Date("2026-10-21T14:00:00Z"), new Set(filled), b => `${b.t}|${+b.s}`, () => { asked = true; }, {});
    return asked; };
  const past = { t:"Groceries", s:Date.parse("2026-10-20T18:30:00Z"), e:Date.parse("2026-10-20T19:30:00Z") };
  const future = { t:"Groceries", s:Date.parse("2026-10-22T18:30:00Z"), e:Date.parse("2026-10-22T19:30:00Z") };
  assert.equal(asks(past, null), true, "yesterday's shop: What did you buy? opens");
  assert.equal(asks(past, null, [`Groceries|${past.s}`]), false, "once per block");
  assert.equal(asks(future, null), false, "a shop still to come: just the list");
  assert.equal(asks({ t:"Groceries", s:Date.parse("2026-10-21T13:30:00Z"), e:Date.parse("2026-10-21T15:00:00Z") }, {}), true, "today's, on now: as before");
});

test("the kt-blk line names the day for a block from another day and stays bare for today's", () => {
  const k = fn("openKitchen");
  assert.match(k, /class="kt-blk">\$\{esc\(shortName\(S\.block\)\)\} · \$\{kitBlkDay\(S\.block, t\)\}\$\{fmtT\(S\.block\.s\)\}/);
  const line = /const kitBlkDay = [^\n]*;/.exec(html)[0];
  const day = new Function(`const tzYmd = d => d.toISOString().slice(0, 10), esc = x => x;
    const dayLabel = (ymd, today) => ymd === "2026-10-20" && today === "2026-10-21" ? "Yesterday · Tue, Oct 20" : "Thu, Oct 22";
    ${line} return kitBlkDay;`)();
  const t = new Date("2026-10-21T14:00:00Z");
  assert.equal(day({ s:new Date("2026-10-20T18:30:00Z") }, t), "Yesterday · ");
  assert.equal(day({ s:new Date("2026-10-22T18:30:00Z") }, t), "Thu, Oct 22 · ");
  assert.equal(day({ s:new Date("2026-10-21T18:30:00Z") }, t), "", "today's block: times only, as before");
});
