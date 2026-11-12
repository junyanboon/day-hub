// node --test still/test/calendar-travel-tab.test.mjs
// Junyan, 2026-11-12 (t9, "9 yes"): the calendar's Travel tab opens the Day Quest Trips page once the trip is planned.
// The Montreal trip is planned, so the Travel tab and an event's "Open the Travel page" go to quest.html#trips, and
// Day Quest opens on its Trips page when the address ends in #trips. Day Quest has no link to one trip yet, so every
// travel event lands on the Trips list (one click from its trip).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import "../calendar-core.js";

const C = globalThis.CalCore;
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL("../quest-trips.js", import.meta.url)), "utf8"), ctx);
const T = ctx.QuestTrips;

test("the Travel kind's page is the Day Quest Trips page, with its own button label", () => {
  assert.deepEqual({ ...C.pageLink("travel", "") }, { href: "quest.html#trips", label: "Open Trips in Day Quest" });
});

test("the calendar's ?api= goes along to Day Quest, word for word", () => {
  assert.equal(C.pageLink("travel", "?api=http://localhost:8787").href, "quest.html?api=http://localhost:8787#trips");
  assert.equal(C.pageLink("travel", "?api=x$&y$'z").href, "quest.html?api=x$&y$'z#trips", "a $ in the address is kept as is");
  assert.equal(C.pageLink("travel").href, "quest.html#trips");
});

test("every other kind keeps the calendar's own page", () => {
  for (const [k] of C.KINDS) if (k !== "travel") assert.equal(C.pageLink(k, ""), null, k);
  assert.equal(C.pageLink(undefined, ""), null);
  assert.equal(C.pageLink("constructor", ""), null);
});

test("Day Quest opens on the Trips page when the address ends in #trips", () => {
  assert.equal(T.startView("#trips"), "trips");
  assert.equal(T.startView("#Trips"), "trips");
});

test("any other address opens Day Quest on Today as before", () => {
  for (const h of ["", "#", "#pair=abc123", "#tripsx", "#gym"]) assert.equal(T.startView(h), null, h);
});
