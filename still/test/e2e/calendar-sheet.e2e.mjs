// The phone's event sheet as plain rows (slice 02, Junyan 2026-11-12, d2 "2 yes"): Day, Starts, Ends, All-day,
// Location, Notes, Type, Calendar, Delete event, with x and Save at the top. Checks at phone size against the fake
// backend (calendar-dev.mjs): a start change saves the right start and end, All-day on and off, location and notes come
// back on reopen, a read-only event has no Save or Delete, a new event from an empty hour saves, every box is 16px or
// more, and at 1280px the panel's HTML for an event equals origin/main's (a second dev server serves origin/main's page).
// Chrome cannot show the iOS date and time wheels or the iOS keyboard; those are proven on the phone.
// Not part of `node --test`: it needs playwright-core and Google Chrome.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-sheet.e2e.mjs
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "../../..");
const PORT = +(process.env.PORT || 8806), BASE = `http://localhost:${PORT}`, MAIN = `http://localhost:${PORT + 1}`;
const pageUrl = (b) => `${b}/still/calendar.html?api=${encodeURIComponent(b)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const torontoHM = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/* origin/main's page in a temp tree, served by a copy of the same fake backend, for the desktop comparison */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cal-sheet-main-"));
fs.mkdirSync(path.join(tmp, "still/test/e2e"), { recursive: true });
for (const f of ["still/calendar.html", "still/calendar-core.js"]) fs.writeFileSync(path.join(tmp, f), execFileSync("git", ["show", "origin/main:" + f], { cwd: repo }));
fs.copyFileSync(path.join(here, "calendar-dev.mjs"), path.join(tmp, "still/test/e2e/calendar-dev.mjs"));
const start = async (file, port) => { const s = spawn(process.execPath, [file, String(port)], { stdio: ["ignore", "pipe", "inherit"] }); await new Promise((ok) => s.stdout.once("data", ok)); return s; };
const server = await start(path.join(here, "calendar-dev.mjs"), PORT);
const mainServer = await start(path.join(tmp, "still/test/e2e/calendar-dev.mjs"), PORT + 1);

const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" };
const desk = { viewport: { width: 1280, height: 900 }, timezoneId: "America/Toronto" };
async function open(ctxOpts = phone, base = BASE) {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errors = [], sent = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (/\/planner\/event(\?|$)/.test(r.url()) && r.method() !== "GET") sent.push({ m: r.method(), b: JSON.parse(r.postData() || "{}") }); });
  await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", "3"); });
  await page.goto(pageUrl(base)); await page.waitForSelector(".ev"); await sleep(600);
  return { ctx, page, errors, sent };
}
/** Open an event (by title, on today + d) in the sheet or panel. */
const openEv = async (page, title, d) => { const ok = await page.evaluate(([title, d]) => { const k = C.addDays(today(), d); const ev = [...eventsFor(k, k), ...ghosts()].find((e) => e.title === title && (e.allDay ? C.coversDay(e, k) : C.wall(e.s, S.tz).day === k)); if (ev) panel("event", ev); return !!ev; }, [title, d]); await sleep(400); return ok; };
const tap = async (page, sel) => { const [x, y] = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel); await page.touchscreen.tap(x, y); await sleep(500); };
const rowText = (page, k) => page.evaluate((k) => document.querySelector(`.sheet [data-v="${k}"]`)?.textContent ?? null, k);
const last = (sent, m = "PATCH") => [...sent].reverse().find((x) => x.m === m)?.b;
const only = (b, keys) => !!b && Object.keys(b).filter((k) => !["calId", "id"].includes(k)).sort().join() === [...keys].sort().join();
const addMin = (hhmm, n) => { const m = (+hhmm.slice(0, 2) * 60 + +hhmm.slice(3) + n + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };

try {
  /* ---- desktop first, before any save changes the fake data: the panel's HTML for an event equals origin/main's ---- */
  {
    const a = await open(desk, BASE), m = await open(desk, MAIN);
    const html = async (page, title, d) => { await openEv(page, title, d); return page.evaluate(() => document.querySelector("#pbody").innerHTML); };
    for (const [title, d] of [["Work block", 2], ["Caney away", 3], ["Dinner", 2], ["Stay at FICTION", 3], ["Pack for FICTION stay", 2], ["Packing & Errands", 2]]) {
      const [x, y] = [await html(a.page, title, d), await html(m.page, title, d)];
      check(`1280px: "${title}" panel HTML equals origin/main's`, x === y && x.length > 200, x === y ? `${x.length} chars` : "differs");
    }
    const draft = (page) => page.evaluate(() => { const s = C.instant(C.addDays(today(), 2), 180, S.tz); panel("event", { isNew: true, id: "draft", calId: "joint", title: "", s, e: s + 3600000, start: new Date(s).toISOString(), end: new Date(s + 3600000).toISOString(), k: "other" }); return document.querySelector("#pbody").innerHTML; });
    check("1280px: a new event's panel HTML equals origin/main's", await draft(a.page) === await draft(m.page));
    check("no page errors (desktop)", !a.errors.length && !m.errors.length, [...a.errors, ...m.errors].join("; "));
    await a.ctx.close(); await m.ctx.close();
  }
  /* ---- the rows, a start change, Save, and back again ---- */
  {
    const { ctx, page, errors, sent } = await open();
    check("Work block opens in the sheet", await openEv(page, "Work block", 2) && await page.evaluate(() => !!document.querySelector(".sheet")));
    const labels = await page.evaluate(() => [...document.querySelectorAll(".sheet .srow:not([hidden]):not(.sub) > span")].map((s) => s.textContent));
    check("rows: Day, Starts, Ends, All-day, Location, Notes, Type, Calendar", labels.join() === "Day,Starts,Ends,All-day,Location,Notes,Type,Calendar", labels.join());
    const head = await page.evaluate(() => [document.querySelector("#pX")?.textContent, document.querySelector(".shead b")?.textContent, document.querySelector("#pSave")?.textContent, document.querySelector("#pDel")?.textContent]);
    check("x, Event, Save at the top and Delete event at the bottom", head.join("|") === "✕|Event|Save|Delete event", head.join("|"));
    check("the tabs (Now, Settings, Shortcuts) are hidden under the sheet", await page.evaluate(() => getComputedStyle(document.querySelector(".ptabs")).display === "none"));
    check("no Length chips on the phone", await page.evaluate(() => !document.querySelector("[data-dur]")));
    const [s0, st] = [await rowText(page, "start"), await rowText(page, "end")];
    check("Starts and Ends read 9:30 AM and 11:00 AM", s0 === "9:30 AM" && st === "11:00 AM", `${s0} / ${st}`);
    check("Day reads like Fri, Nov 13", /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}$/.test(await rowText(page, "day")), await rowText(page, "day"));
    const orig = await page.evaluate(() => ({ start: S.ev.start, end: S.ev.end, f: S.form.start }));
    await page.fill('.sheet [data-f="start"]', addMin(orig.f, 60)); await sleep(200);
    check("a start an hour later moves Ends by the same hour", await rowText(page, "start") === "10:30 AM" && await rowText(page, "end") === "12:00 PM", `${await rowText(page, "start")} / ${await rowText(page, "end")}`);
    await tap(page, "#pSave"); await sleep(600);
    let b = last(sent);
    const want = (iso, n) => new Date(Date.parse(iso) + n * 60000).toISOString();
    check("Save sends one PATCH with only start and end, an hour later", sent.length === 1 && only(b, ["start", "end"]) && b.start === want(orig.start, 60) && b.end === want(orig.end, 60), JSON.stringify(b));
    check("Save closes the sheet", await page.evaluate(() => S.tab === "now" && !S.ev && !document.body.classList.contains("popen")));
    check("the calendar shows the move", await page.evaluate(() => [...document.querySelectorAll(".ev")].some((e) => /Work block/.test(e.textContent) && /10:30/.test(e.textContent))));
    await openEv(page, "Work block", 2);
    check("reopened, it reads 10:30 AM to 12:00 PM", await rowText(page, "start") === "10:30 AM" && await rowText(page, "end") === "12:00 PM");
    await page.fill('.sheet [data-f="start"]', orig.f); await tap(page, "#pSave"); await sleep(600);
    b = last(sent);
    check("moved back: the PATCH has the first start and end again", b.start === new Date(orig.start).toISOString() && b.end === new Date(orig.end).toISOString(), JSON.stringify(b));
    /* an end before the start is the next day */
    await openEv(page, "Work block", 2);
    await page.fill('.sheet [data-f="end"]', "01:00"); await sleep(200);
    check("an Ends before Starts reads as the next day", /^1:00 AM · \w{3}, \w{3} \d+$/.test(await rowText(page, "end")), await rowText(page, "end"));
    /* closing without Save changes nothing */
    const n0 = sent.length; await tap(page, "#pX");
    check("x closes the sheet and sends nothing", sent.length === n0 && await page.evaluate(() => !S.ev && !document.body.classList.contains("popen")));
    await openEv(page, "Work block", 2);
    check("reopened after x: the old times", await rowText(page, "start") === "9:30 AM" && await rowText(page, "end") === "11:00 AM");
    /* the type chips */
    await tap(page, '[data-sheet="type"]');
    check("Type opens the type chips", await page.evaluate(() => !document.querySelector('[data-v="types"]').hidden && document.querySelectorAll('[data-v="types"] [data-kind]').length > 5));
    await tap(page, '[data-v="types"] [data-kind="studio"]');
    check("a type tap names it on the row and closes the chips", await rowText(page, "kind") === "Studio On-Site" && await page.evaluate(() => document.querySelector('[data-v="types"]').hidden), await rowText(page, "kind"));
    await tap(page, "#pX");
    check("no page errors (rows and times)", !errors.length, errors.join("; "));
    await ctx.close();
  }

  /* ---- All-day on and off ---- */
  {
    const { ctx, page, errors, sent } = await open();
    await openEv(page, "Close Scotia account", 2);
    const day = await page.evaluate(() => S.form.day);
    await tap(page, '.sheet [data-f="allDay"]');
    const vis = await page.evaluate(() => [...document.querySelectorAll(".sheet .srow:not([hidden]):not(.sub) > span")].map((s) => s.textContent).join());
    check("All-day on: Starts and Ends give way to an end day", vis === "Day,Ends,All-day,Location,Notes,Type,Calendar" && await rowText(page, "endDay") === await rowText(page, "day"), vis);
    await tap(page, "#pSave"); await sleep(600);
    let b = last(sent);
    const next = await page.evaluate((d) => C.addDays(d, 1), day);
    check("All-day on saves allDay with that day's dates", only(b, ["allDay", "start", "end"]) && b.allDay === true && b.start === day && b.end === next, JSON.stringify(b));
    check("reopened it is all-day", await openEv(page, "Close Scotia account", 2) && await page.evaluate(() => S.ev.allDay && S.form.allDay));
    await tap(page, '.sheet [data-f="allDay"]');
    check("All-day off: 9:00 AM to 10:00 AM", await rowText(page, "start") === "9:00 AM" && await rowText(page, "end") === "10:00 AM");
    await tap(page, "#pSave"); await sleep(600);
    b = last(sent);
    check("All-day off saves 9:00 to 10:00 Toronto on the same day", only(b, ["allDay", "start", "end"]) && b.allDay === false && torontoHM(b.start) === "09:00" && Date.parse(b.end) - Date.parse(b.start) === 3600000 && new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(b.start)) === day, JSON.stringify(b));
    check("no page errors (all-day)", !errors.length, errors.join("; "));
    await ctx.close();
  }

  /* ---- location and notes, saved and read back ---- */
  {
    const { ctx, page, errors, sent } = await open();
    await openEv(page, "Packing & Errands", 2);
    await page.fill('.sheet [data-f="location"]', "527 Bloor St W");
    await page.fill('.sheet [data-f="description"]', "Bring the keys\nand the mop");
    const big = await page.evaluate(() => [...document.querySelectorAll(".sheet input:not([type=checkbox]), .sheet textarea, .sheet select")].filter((e) => e.getClientRects().length).map((e) => `${e.dataset.f || e.id}:${parseFloat(getComputedStyle(e).fontSize)}`));
    check("every text box in the sheet is 16px or more", big.length >= 6 && big.every((x) => +x.split(":")[1] >= 16), big.join(" "));
    check("the notes box grows to two lines", await page.evaluate(() => document.querySelector('.sheet textarea').scrollHeight > 46));
    await tap(page, "#pSave"); await sleep(600);
    const b = last(sent);
    check("Save sends only location and description", only(b, ["location", "description"]) && b.location === "527 Bloor St W" && b.description === "Bring the keys\nand the mop", JSON.stringify(b));
    await openEv(page, "Packing & Errands", 2);
    const back = await page.evaluate(() => [document.querySelector('.sheet [data-f="location"]').value, document.querySelector('.sheet [data-f="description"]').value]);
    check("reopened, location and notes show again", back[0] === "527 Bloor St W" && back[1] === "Bring the keys\nand the mop", JSON.stringify(back));
    /* notes with Google formatting are read-only */
    await page.evaluate(() => { const ev = S.ev; ev.description = 'See <a href="https://x.ca">the plan</a><br>Fish &amp; chips'; panel("event", ev); });
    const rich = await page.evaluate(() => [!!document.querySelector(".sheet textarea"), document.querySelector(".sheet .snotes")?.textContent, !!document.querySelector('.sheet a[href*="calendar.google"]')]);
    check("notes with Google formatting show as text, not a box, with Open in Google", !rich[0] && rich[1] === "See the plan\nFish & chips" && rich[2], JSON.stringify(rich));
    await tap(page, "#pSave"); await sleep(400);
    check("Save with formatted notes sends no description", !("description" in (last(sent) || {})) || last(sent) === b);
    check("no page errors (location and notes)", !errors.length, errors.join("; "));
    await ctx.close();
  }

  /* ---- read-only, a repeat, a suggestion ---- */
  {
    const { ctx, page, errors, sent } = await open();
    await openEv(page, "Caney away", 3);
    const ro = await page.evaluate(() => [!!document.querySelector("#pSave"), !!document.querySelector("#pDel"), [...document.querySelectorAll(".sheet [data-f]")].every((x) => x.disabled), /read-only here/.test(document.querySelector(".sheet").textContent), [...document.querySelectorAll(".sheet .srow:not([hidden]) > span")].length >= 7]);
    check("a read-only event shows its rows with no Save and no Delete", !ro[0] && !ro[1] && ro[2] && ro[3] && ro[4], JSON.stringify(ro));
    await tap(page, "#pX");
    await openEv(page, "Dinner", 2);
    const f0 = await page.evaluate(() => S.form.start);
    await page.fill('.sheet [data-f="start"]', addMin(f0, 30)); await tap(page, "#pSave"); await sleep(300);
    const modal = await page.evaluate(() => document.querySelector(".modal")?.textContent || "");
    check('a repeating event asks "This one" or "All repeats"', /This one/.test(modal) && /All repeats/.test(modal), modal.slice(0, 80));
    await page.evaluate(() => document.querySelector('.modal [data-v=""]').click()); await sleep(300);
    check("Cancel on that question sends nothing", !sent.length);
    await openEv(page, "Pack for FICTION stay", 2);
    const g = await page.evaluate(() => [!!document.querySelector("#pAcc"), !!document.querySelector("#pSkip"), !!document.querySelector("#pSave"), !!document.querySelector("#pDel")]);
    check("a suggestion keeps Accept and Skip, no Save or Delete", g.join() === "true,true,false,false", g.join());
    await tap(page, "#pX");
    check("no page errors (read-only, repeat, suggestion)", !errors.length, errors.join("; "));
    await ctx.close();
  }

  /* ---- a new event from a tap on an empty hour ---- */
  {
    const { ctx, page, errors, sent } = await open();
    await page.evaluate(() => { document.querySelector("#view").scrollTop = 0; }); await sleep(300);
    const spot = await page.evaluate(() => { const c = [...document.querySelectorAll(".col")].find((x) => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width > 40; }); const r = c.getBoundingClientRect(); return { day: c.dataset.day, x: r.left + r.width / 2, y: r.top + 3.25 * (typeof H !== "undefined" ? H : S.h) }; });
    await page.touchscreen.tap(spot.x, spot.y); await sleep(600);
    check("a tap on 3 AM opens a new event sheet with the title ready", await page.evaluate(() => S.ev?.isNew && !!document.querySelector(".sheet") && document.activeElement?.id === "pTitle"));
    check("its rows read 3:00 AM to 4:00 AM with no Delete", await rowText(page, "start") === "3:00 AM" && await rowText(page, "end") === "4:00 AM" && await page.evaluate(() => !document.querySelector("#pDel")));
    await page.fill("#pTitle", "Sheet test"); await page.fill('.sheet [data-f="location"]', "Home");
    await tap(page, "#pSave"); await sleep(600);
    const b = last(sent, "POST");
    check("Save creates it: title, 3:00 to 4:00 Toronto, the location, Joint Plans", !!b && b.title === "Sheet test" && torontoHM(b.start) === "03:00" && Date.parse(b.end) - Date.parse(b.start) === 3600000 && b.location === "Home" && b.calId === "joint" && b.allDay === false, JSON.stringify(b));
    check("the new event is on the calendar", await page.evaluate(() => [...document.querySelectorAll(".ev")].some((e) => /Sheet test/.test(e.textContent))));
    check("no page errors (new event)", !errors.length, errors.join("; "));

    /* the keyboard: the sheet sits in the part of the screen the keyboard leaves, its top bar still showing (Junyan, 2026-11-12) */
    await page.evaluate(() => { const ev = eventsFor(today(), C.addDays(today(), 7)).find((e) => e.title === "Sheet test"); panel("event", ev); }); await sleep(400);
    const kb = await page.evaluate(() => {
      Object.defineProperty(window, "visualViewport", { configurable: true, value: { height: innerHeight - 340, offsetTop: 90, width: innerWidth, addEventListener() {} } });
      const inside = (sel) => { const p = $("#panel").getBoundingClientRect(), r = document.querySelector(sel).getBoundingClientRect(); return r.top >= p.top - 1 && r.bottom <= p.bottom + 1; };
      $("#pTitle").focus(); sheetFit();
      const p = $("#panel").getBoundingClientRect(), a = [Math.round(p.top), Math.round(p.bottom), inside("#pSave"), inside("#pTitle")];
      document.querySelector('.sheet [data-f="description"]').focus(); sheetFit();
      a.push(inside('.sheet [data-f="description"]'), inside("#pSave"));
      delete window.visualViewport; sheetFit(); a.push($("#panel").style.top === "" && !$("#panel").classList.contains("kb"));
      return a;
    });
    const vh = await page.evaluate(() => innerHeight);
    check("keyboard up: the sheet fills the space above it, from the top", kb[0] === 90 && kb[1] === 90 + vh - 340, kb.join(","));
    check("keyboard up on the title: Save and the title show", kb[2] && kb[3], kb.join(","));
    check("keyboard up on the notes: the notes box and Save show", kb[4] && kb[5], kb.join(","));
    check("keyboard down: the sheet goes back to its place", kb[6], kb.join(","));

    /* Delete event closes the sheet back to the calendar, not to the Now panel (Junyan, 2026-11-12) */
    await page.evaluate(() => document.activeElement?.blur());
    await tap(page, "#pDel"); await sleep(600);
    check("Delete event sends a DELETE and goes back to the calendar", sent.some((x) => x.m === "DELETE") && await page.evaluate(() => S.tab === "now" && !document.body.classList.contains("popen")));
    check("the deleted event is gone", await page.evaluate(() => ![...document.querySelectorAll(".ev")].some((e) => /Sheet test/.test(e.textContent))));
    await ctx.close();
  }

} finally {
  await browser.close(); server.kill(); mainServer.kill(); fs.rmSync(tmp, { recursive: true, force: true });
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
