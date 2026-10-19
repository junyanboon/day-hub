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

test("d41: the Add sheet, the suggestions and the idea sheet add to Joint Plans by default; the Add sheet can pick another", () => {
  assert.equal(A.ADD_CALS[0].name, "Joint Plans"); assert.equal(A.ADD_CALS[0].id, A.JOINT);
  assert.match(html, /async function addBlockCal\(t, s, e, calId = jointId\(\)\)/);
  assert.match(html, /<select id="aWhere" class="awhere">\$\{AGD\(\)\.ADD_CALS\.map/);
  assert.match(html, /Today only \(not in Google Calendar\)/);
  const sug = html.slice(html.indexOf("async function sugAdd("), html.indexOf("async function sugAdd(") + 700);
  assert.match(sug, /calId:jointId\(\)/);
  assert.match(html, /title, calId:jointId\(\) \}\) \}\); \}/, "the idea sheet, another day");
  assert.ok(!/Google Calendar \(Junyan\)/.test(html), "no Junyan-only wording left");
});
