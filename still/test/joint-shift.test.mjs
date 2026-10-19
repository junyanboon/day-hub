// node --test still/test/*.test.mjs   (Junyan, 2026-10-19: d38 "it needs to move everything together", d40 "only for the
// joint plans calendar specifically. the other calendars don't conflict with this one", d41 adds go to Joint Plans)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const load = f => { const ctx = {}; ctx.globalThis = ctx; vm.runInNewContext(fs.readFileSync(here + f, "utf8"), ctx); return ctx; };
const A = load("quest-agenda.js").QuestAgenda;
const html = fs.readFileSync(here + "quest.html", "utf8");
const T = (hm) => new Date(`2026-10-19T${hm}:00+02:00`);
const hm = d => new Date(+d + 2 * 3600000).toISOString().slice(11, 16);
const J = (key, s, e, t, extra = {}) => ({ key, id:"ev-" + key, calId:A.JOINT, cal:"Joint Plans", s:T(s), e:T(e), cs:T(s).toISOString(), ce:T(e).toISOString(), t, kind:"fixed", ...extra });
const Y = (key, s, e, t) => ({ key, id:"ev-" + key, calId:A.JUNYAN, cal:"Junyan", s:T(s), e:T(e), t, kind:"fixed" });
const Q = (key, s, e, t) => ({ key, s:T(s), e:T(e), t, extra:true, kind:"task" });
const shown = moves => [...moves].map(m => `${m.b.t} ${hm(m.s)}-${hm(m.e)}`);

test("d40: only Joint Plans events and Quest blocks keep apart; Junyan events overlap anything and never move", () => {
  const day = [J("gym", "14:00", "15:00", "Gym"), Y("call", "14:30", "15:00", "Call"), J("rest", "15:00", "16:00", "Rest"), Q("read", "15:30", "16:00", "Read")];
  // Gym (Joint) moved to 14:30: the Junyan call under it stays; Rest (Joint) and Read (Quest) are pushed
  assert.deepEqual(shown(A.roomJoint(day, { ...day[0], s:T("14:30"), e:T("15:30") })), ["Rest 15:30-16:30", "Read 16:30-17:00"]);
  // a Junyan event moved onto Joint Plans pushes nothing
  assert.equal(A.roomJoint(day, { ...day[1], s:T("14:00"), e:T("14:30") }).length, 0);
  // a Quest add pushes a Joint event
  assert.deepEqual(shown(A.roomJoint(day, { key:"new", extra:true, s:T("13:45"), e:T("14:15") })), ["Gym 14:15-15:15", "Rest 15:15-16:15", "Read 16:15-16:45"]);
  // a new Joint add (key "new", no id yet) pushes too; a 13-hour stay on Joint Plans is a booking and never moves
  const stay = J("stay", "12:00", "23:30", "Hotel"); stay.e = new Date(+T("12:00") + 13 * 3600000);
  assert.deepEqual(shown(A.roomJoint([stay, ...day], { key:"new", calId:A.JOINT, s:T("14:00"), e:T("14:15") })).map(x => x.split(" ")[0]), ["Gym", "Rest", "Read"]);
  assert.equal(A.inRoom(stay), false);
});

test("settle: overlaps already among Joint Plans are pushed apart, the earlier one stays, the past and Junyan stay put", () => {
  const day = [J("past1", "09:00", "10:00", "Breakfast"), J("past2", "09:30", "10:30", "Plan"),   // before now: left alone
    J("a", "12:00", "13:00", "Lunch"), J("b", "12:30", "13:00", "Walk"), Y("y", "12:15", "12:45", "Call"),
    J("c", "13:10", "13:40", "Shop"), J("d", "15:00", "16:00", "Rest")];
  const r = A.settle(day, T("11:00"));
  assert.deepEqual(shown(r), ["Walk 13:00-13:30", "Shop 13:30-14:00"]);
  const after = day.map(b => { const m = r.find(x => x.b.key === b.key); return m ? { ...b, s:m.s, e:m.e } : b; });
  assert.equal(A.settle(after, T("11:00")).length, 0, "settling twice moves nothing the second time");
  assert.equal(A.settle([J("a", "12:00", "13:00", "A"), J("b", "13:00", "14:00", "B")], T("11:00")).length, 0, "touching is fine");
});

test("shiftPlan: Joint events go in one /cal/shift batch from where the calendar has them; Quest blocks stay in today's plan", () => {
  const gym = J("gym", "14:00", "15:00", "Gym"), read = Q("read", "15:00", "15:30", "Read");
  // an earlier today-only shift: shown at 14:15, the calendar still has it at 14:00, so from is 14:00
  const shifted = { ...J("rest", "15:00", "16:00", "Rest"), s:T("15:15"), e:T("16:15") };
  const moves = [{ b:gym, s:T("14:30"), e:T("15:30") }, { b:read, s:T("15:30"), e:T("16:00") }, { b:shifted, s:T("16:00"), e:T("17:00") }];
  const P = A.shiftPlan(moves, true, m => "note " + m.b.t);
  assert.equal(P.refuse, false);
  assert.deepEqual([...P.cal].map(x => x.body.id), ["ev-gym", "ev-rest"]);
  assert.deepEqual({ ...P.cal[0].body.from }, { s:T("14:00").toISOString(), e:T("15:00").toISOString() });
  assert.equal(P.cal[0].body.calId, A.JOINT); assert.equal(P.cal[0].body.note, "note Gym");
  assert.deepEqual({ ...P.cal[1].body.from }, { s:T("15:00").toISOString(), e:T("16:00").toISOString() });
  assert.deepEqual([...P.ops].map(m => m.b.key), ["read"]);
  // not paired or test mode: everything stays in today's plan, nothing for the calendar
  const off = A.shiftPlan(moves, false);
  assert.equal(off.cal.length, 0); assert.equal(off.ops.length, 3);
  // a Junyan event never goes to the calendar batch, even if a bug hands it in
  assert.equal(A.shiftPlan([{ b:Y("y", "14:00", "15:00", "Call"), s:T("15:00"), e:T("16:00") }], true).cal.length, 0);
});

test("shiftPlan: more than MAX_SHIFT moves is refused whole, so a bug cannot mass-move the calendar", () => {
  const many = Array.from({ length:A.MAX_SHIFT + 1 }, (_, i) => ({ b:J("k" + i, "10:00", "11:00", "E" + i), s:T("12:00"), e:T("13:00") }));
  const P = A.shiftPlan(many, true);
  assert.equal(P.refuse, true); assert.equal(P.cal.length + P.ops.length, 0);
  assert.equal(A.shiftPlan(many.slice(0, A.MAX_SHIFT), true).cal.length, A.MAX_SHIFT);
});

test("the page: calendar moves only from shiftBlocks, after his move or add, and the once-a-day settle cannot loop", () => {
  // the only /cal/shift call is inside shiftBlocks
  assert.equal((html.match(/"\/cal\/shift"/g) || []).length, 1);
  const sb = html.slice(html.indexOf("async function shiftBlocks("), html.indexOf("const canShift"));
  assert.match(sb, /"\/cal\/shift"/); assert.match(sb, /if \(P\.refuse\)/);
  assert.match(sb, /err\.status === 404/, "an old still-api falls back to today's plan");
  // shiftBlocks is called from roomFor and settleDay only
  assert.equal((html.match(/shiftBlocks\(/g) || []).length, 3, "definition, roomFor, settleDay");
  const sd = html.slice(html.indexOf("async function settleDay("), html.indexOf("async function settleDay(") + 900);
  assert.match(sd, /visibilityState !== "visible"/);
  assert.match(sd, /store\.get\(mark\) \|\| \(G\.day && G\.day\.settled\)/);
  // the mark is set before any write
  assert.ok(sd.indexOf("store.set(mark") < sd.indexOf("shiftBlocks("));
  assert.match(sd, /AGD\(\)\.settle\(blocks\(\), now\(\)\)/);
  // settleDay runs from the fresh pull only
  assert.equal((html.match(/settleDay\(/g) || []).length, 2, "its definition and one call");
  assert.match(html, /if \(SAVED_AT == null\) \{[\s\S]{0,400}settleDay\(\)/);
});

test("d41: the Add sheet, the suggestions and the idea sheet add to Joint Plans by default; the Add sheet can pick another", () => {
  assert.equal(A.ADD_CALS[0].name, "Joint Plans"); assert.equal(A.ADD_CALS[0].id, A.JOINT);
  assert.match(html, /async function addBlockCal\(t, s, e, makeRoom, calId = AGD\(\) \? AGD\(\)\.JOINT : undefined\)/);
  assert.match(html, /<select id="aWhere" class="awhere">\$\{AGD\(\)\.ADD_CALS\.map/);
  assert.match(html, /Today only \(not in Google Calendar\)/);
  const sug = html.slice(html.indexOf("async function sugAdd("), html.indexOf("async function sugAdd(") + 700);
  assert.match(sug, /calId:AGD\(\) \? AGD\(\)\.JOINT/);
  assert.match(html, /title, calId:AGD\(\) \? AGD\(\)\.JOINT : undefined \}\) \}\); \}/, "the idea sheet, another day");
  assert.ok(!/Google Calendar \(Junyan\)/.test(html), "no Junyan-only wording left");
});
