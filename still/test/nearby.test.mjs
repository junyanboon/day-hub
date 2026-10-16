// node --test still/test/*.test.mjs   (the Nearby widget, Junyan 2026-10-16)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-nearby.js", import.meta.url)), "utf8"), ctx);
const N = ctx.QuestNearby;
const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 16, h, m));
const gap = (a, b) => ({ s:a, e:b, min:(b - a) / 60000 });

test("the stay is found from the place line or a hotel calendar event; an unknown stay has no list", () => {
  assert.equal(N.stayFor(["🏨 Check in — Madrid Marriott Hotel Princesa Plaza", "Madrid"]).id, "madrid-marriott-princesa-plaza");
  assert.equal(N.stayFor(["Madrid", "Check out by 12:00 — Madrid Marriott Princesa Plaza"]).id, "madrid-marriott-princesa-plaza");
  assert.equal(N.stayFor(["Check in — ibis Styles Madrid Airport Valdebebas", "Madrid"]), null);
  assert.equal(N.stayFor(["Home", "Toronto"]), null);
  assert.equal(N.stayFor([]), null);
  assert.equal(N.stayFor([null, undefined, ""]), null);
  // the first text that names a stay wins (the place line comes first)
  const S = [{ id:"a", match:/alpha/i, places:[] }, { id:"b", match:/beta/i, places:[] }];
  assert.equal(N.stayFor(["beta hotel", "alpha hotel"], S).id, "b");
});

test("an unknown stay hides the widget: no markup at all", () => {
  assert.equal(N.html(null, {}), "");
  assert.equal(N.html({ id:"x", name:"X", places:[] }, {}), "");
});

test("the mode symbol comes from the minutes: walk up to 25 min, else the quicker ride plus the walk", () => {
  const lbl = p => N.chips(p).map(c => c.icon + " " + c.label).join(", ");
  assert.equal(lbl({ walk:10 }), "🚶 10 min");
  assert.equal(lbl({ walk:25, transit:12, car:6 }), "🚶 25 min");
  assert.equal(lbl({ walk:0 }), "🏨 In the hotel");
  assert.equal(lbl({ walk:40, transit:15 }), "🚇 15 min, 🚶 40 min");
  assert.equal(lbl({ walk:40, transit:20, car:12 }), "🚗 12 min, 🚶 40 min");
  assert.equal(lbl({ walk:90, car:15 }), "🚗 15 min, 🚶 1 hr 30 min");
  assert.equal(lbl({ transit:18 }), "🚇 18 min");
  assert.equal(N.chips({ walk:40, transit:15 })[0].mode, "transit");
  assert.equal(N.chips({ walk:12 })[0].mode, "walking");
});

test("every row is collapsed by default; a tapped row opens with what it is, a hint, Directions and Put on the plan", () => {
  const stay = N.stayFor(["Madrid Marriott Hotel Princesa Plaza"]);
  assert.ok(stay.places.length >= 7);
  const shut = N.html(stay, {});
  assert.equal((shut.match(/class="nb-row"/g) || []).length, stay.places.length);
  assert.equal((shut.match(/nb-row open/g) || []).length, 0);
  assert.ok(!/nb-body/.test(shut), "no row body is drawn while collapsed");
  assert.ok(/Nearby · Marriott Princesa Plaza/.test(N.title(stay)));
  const id = stay.places[1].id, open = N.html(stay, { open:{ [id]:true } });
  assert.equal((open.match(/nb-row open/g) || []).length, 1);
  assert.match(open, /Directions/);
  assert.match(open, /Put on the plan/);
  assert.match(open, new RegExp(`data-nbplan="${id}"`));
  // the gym's photo shows only when it is open
  const gym = stay.places.find(p => p.photo);
  assert.ok(gym && !shut.includes("<img"));
  assert.match(N.html(stay, { open:{ [gym.id]:true } }), /<img [^>]*loading="lazy"/);
  assert.ok(!/Directions/.test(N.html(stay, { open:{ [gym.id]:true } })), "no Directions to the hotel's own gym");
});

test("Directions go from the hotel with the travel mode of the first chip", () => {
  const stay = N.stayFor(["Madrid Marriott Hotel Princesa Plaza"]);
  const u = new URL(N.directionsUrl(stay, { name:"Templo de Debod", q:"Templo de Debod, Madrid", walk:13 }));
  assert.equal(u.origin + u.pathname, "https://www.google.com/maps/dir/");
  assert.equal(u.searchParams.get("api"), "1");
  assert.match(u.searchParams.get("origin"), /Serrano Jover 3/);
  assert.equal(u.searchParams.get("destination"), "Templo de Debod, Madrid");
  assert.equal(u.searchParams.get("travelmode"), "walking");
  assert.equal(new URL(N.directionsUrl(stay, { name:"Far", walk:40, transit:15 })).searchParams.get("travelmode"), "transit");
  assert.equal(new URL(N.directionsUrl(stay, { name:"Far", walk:40, car:9 })).searchParams.get("travelmode"), "driving");
});

test("Put on the plan uses the first existing free slot that fits, 60 min by default", () => {
  const gaps = [gap(at(11), at(11, 30)), gap(at(12, 30), at(13, 20)), gap(at(14), at(16)), gap(at(17), at(19))];
  let r = N.slotFor(gaps);
  assert.equal(r.s.toISOString(), at(14).toISOString());
  assert.equal(r.e.toISOString(), at(15).toISOString());
  r = N.slotFor(gaps, 30);
  assert.equal(r.s.toISOString(), at(11).toISOString());
  assert.equal(N.slotFor([gap(at(11), at(11, 45))], 60), null);
  assert.equal(N.slotFor([], 60), null);
  // a place can carry its own length (the gym, a palace visit)
  assert.equal(N.minFor({ min:90 }), 90);
  assert.equal(N.minFor({}), 60);
});

test("a row that was put on the plan says when", () => {
  const stay = N.stayFor(["Madrid Marriott Hotel Princesa Plaza"]), id = stay.places[2].id;
  const h = N.html(stay, { open:{ [id]:true }, msg:{ [id]:"On the plan at 2:00 PM, 1 hr." } });
  assert.match(h, /On the plan at 2:00 PM/);
});

test("names and notes are escaped", () => {
  const stay = { id:"t", name:"T", short:"T", origin:"o", places:[{ id:"p", icon:"x", name:"<b>&", what:"<i>", hint:"\"", walk:5 }] };
  const h = N.html(stay, { open:{ p:true } });
  assert.ok(!h.includes("<b>&") && h.includes("&lt;b&gt;&amp;") && h.includes("&lt;i&gt;"));
});

test("quest.html starts the widget hidden, loads quest-nearby.js, and the dashboard can take it out of the grid", () => {
  const page = fs.readFileSync(fileURLToPath(new URL("../quest.html", import.meta.url)), "utf8");
  const dash = fs.readFileSync(fileURLToPath(new URL("../quest-dash.js", import.meta.url)), "utf8");
  assert.match(page, /<script src="quest-nearby\.js\?v=\w+"><\/script>/);
  assert.match(page, /<h2 id="nearbyH" hidden>/);
  assert.match(page, /<div id="nearby" data-dash-optional hidden><\/div>/);
  assert.match(page, /QuestNearby\.stayFor|QN\.stayFor/);
  assert.match(page, /QuestMorning\.gapsOf\(MO_CTX\.data\(\)\)/);
  assert.match(dash, /window\.QuestDash = \{ sync \}/);
  assert.match(dash, /"w-nearby":/);
});
