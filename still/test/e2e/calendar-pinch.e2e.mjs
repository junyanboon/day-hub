// Pinch stretches the hours (slice 01; Junyan, 2026-11-12, d1: "all I care about is having a very smooth functional
// exprience"). Two fingers on the day grid stretch or squeeze the hour rows, from the whole day on one screen up to
// 168px an hour; the time under the fingers stays under them; the page never zooms, never changes day, never rebuilds
// the strip, and a pinch opens nothing. The height is kept on the phone. The desktop is unchanged.
// Two real touch points go through Chrome's DevTools Input.dispatchTouchEvent, each move awaited (moves sent together
// merge into one). Not part of `node --test`: it needs playwright-core and Google Chrome.
//   PW_DIR=<folder with node_modules/playwright-core> node still/test/e2e/calendar-pinch.e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8811), BASE = `http://localhost:${PORT}`;
const URL_ = `${BASE}/still/calendar.html?api=${encodeURIComponent(BASE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/** What the page shows, read from the layout itself: the hour height (the distance between two hour labels), the
    top of the hours on screen, the day at the hour gutter, the zoom, whether #strip is the node marked earlier. */
const look = (page) => page.evaluate(() => {
  const v = document.querySelector("#view"), sp = document.querySelectorAll(".gut .hours span:not(.nowlbl)");
  const hours = document.querySelector(".gut .hours").getBoundingClientRect(), gut = document.querySelector(".gut").getBoundingClientRect();
  const days = [...document.querySelectorAll(".day")].map((d) => ({ k: d.dataset.day, x: d.getBoundingClientRect().left }));
  const shown = days.reduce((a, b) => (Math.abs(b.x - gut.right) < Math.abs(a.x - gut.right) ? b : a)).k;
  return { h: sp[1].getBoundingClientRect().top - sp[0].getBoundingClientRect().top, hoursTop: hours.top, shown,
    scale: visualViewport.scale, same: document.querySelector("#strip") === window.__strip, scrollTop: v.scrollTop,
    fits: v.scrollHeight <= v.clientHeight + 1, viewTop: v.getBoundingClientRect().top,
    open: document.body.classList.contains("popen"), draft: !!document.querySelector(".ev.draft"), saved: localStorage.getItem("cal-hour") };
});
/** The minute the now pill shows ("3:27", the half of the day from the clock): the line is drawn at that whole minute
    and moved every 30 seconds, so the clock's seconds are not part of where it should be. */
const nowMin = (page) => page.evaluate(() => {
  const [h, m] = document.querySelector("#nowlbl").textContent.split(":").map(Number);
  return (h % 12) * 60 + m + (new Date().getHours() >= 12 ? 720 : 0);
});

const server = spawn(process.execPath, [path.join(here, "calendar-dev.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.once("data", ok));
const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
try {
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Toronto" };
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("quest-key", "test"); if (!localStorage.getItem("cal-n")) localStorage.setItem("cal-n", "1"); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  /** Two fingers on one up/down line through (x, y), `d0` px apart, moving to `d1` apart, one awaited move a frame. */
  async function pinch(x, y, d0, d1, steps = 14, dy = 0) {
    const pts = (d, yy) => [{ x, y: yy - d / 2, id: 1 }, { x, y: yy + d / 2, id: 2 }];
    await touch("touchStart", pts(d0, y)); await sleep(30);
    for (let i = 1; i <= steps; i++) { await touch("touchMove", pts(d0 + (d1 - d0) * i / steps, y + dy * i / steps)); await sleep(17); }
    await touch("touchEnd", []); await sleep(120);
  }
  async function tap(x, y) { await touch("touchStart", [{ x, y }]); await sleep(40); await touch("touchEnd", []); await sleep(500); }
  const mark = () => page.evaluate(() => { window.__strip = document.querySelector("#strip"); });
  /** The minute of the day under screen y, read from the layout. */
  const minuteAt = (L, y) => (y - L.hoursTop) / L.h * 60;

  await page.goto(URL_); await page.waitForSelector(".ev"); await sleep(700);
  await mark();
  let L0 = await look(page);
  check("phone: the hours start at 56px", near(L0.h, 56, 0.5), L0.h.toFixed(2));
  const X = 220, Y = 480;

  /* ---- spread: taller, the time under the fingers stays put, nothing else moves ---- */
  const m0 = minuteAt(L0, Y);
  await pinch(X, Y, 120, 240);
  let L = await look(page);
  check("spread: the rows get taller (about twice)", L.h > 100 && L.h < 125, `${L0.h.toFixed(1)} -> ${L.h.toFixed(1)}`);
  check("spread: the time under the fingers stays within 3px of them", near(L.hoursTop + m0 / 60 * L.h, Y, 3), `${(L.hoursTop + m0 / 60 * L.h - Y).toFixed(2)}px`);
  check("spread: the shown day does not change", L.shown === L0.shown, `${L0.shown} -> ${L.shown}`);
  check("spread: the page never zooms (visualViewport.scale 1)", L.scale === 1, String(L.scale));
  check("spread: #strip is the same node (no rebuild)", L.same);
  check("spread: no event opened, no new event started", !L.open && !L.draft);
  check("spread: the height is kept on the phone", L.saved && near(+L.saved, L.h, 0.6), L.saved);

  /* ---- spread past the top: stops at 168 ---- */
  const m1 = minuteAt(L, Y);
  await pinch(X, Y, 80, 400);
  L = await look(page);
  check("spread far: stops at 168px an hour", near(L.h, 168, 0.5), L.h.toFixed(2));
  check("spread far: the time under the fingers stays within 3px", near(L.hoursTop + m1 / 60 * L.h, Y, 3), `${(L.hoursTop + m1 / 60 * L.h - Y).toFixed(2)}px`);
  check("spread far: same day, no zoom, same #strip", L.shown === L0.shown && L.scale === 1 && L.same);
  const tall = await page.evaluate(() => { const el = [...document.querySelectorAll(".ev")].find((e) => e.textContent.includes("Isha Kriya")); const t2 = el.querySelector(".t2");
    return { cls: el.className, t2: t2.textContent, shows: getComputedStyle(t2).display !== "none", t1: getComputedStyle(el.querySelector(".t1")).display }; });
  check("at 168: a 20 minute card is tall and reads start and end", /\btall\b/.test(tall.cls) && tall.shows && tall.t1 === "none" && tall.t2 === "3:30 to 3:50 pm", `${tall.cls} / "${tall.t2}"`);
  const nowAt = async () => { const n = await nowMin(page), g = await page.evaluate(() => { const l = document.querySelector("#nowline").getBoundingClientRect(), p = document.querySelector("#nowlbl").getBoundingClientRect(); return { line: l.top, pill: (p.top + p.bottom) / 2 }; }); return { n, ...g }; };
  let N = await nowAt();
  check("at 168: the now line sits at the time", near(N.line, L.hoursTop + N.n / 60 * L.h, 3), `${(N.line - (L.hoursTop + N.n / 60 * L.h)).toFixed(2)}px`);
  check("at 168: the now pill sits on the now line", near(N.pill, N.line, 3), `${(N.pill - N.line).toFixed(2)}px`);

  /* ---- squeeze past the bottom: the whole day on one screen ---- */
  const m2 = minuteAt(L, Y);
  await pinch(X, Y, 420, 40, 18);
  L = await look(page);
  check("squeeze far: the rows get shorter than 56", L.h < 56, L.h.toFixed(2));
  check("squeeze far: stops where the whole day fits the screen (no up/down scroll left)", L.fits, `h ${L.h.toFixed(2)}`);
  const lo = L.h;
  await pinch(X, Y, 300, 60);
  L = await look(page);
  check("squeeze again: does not go below that", near(L.h, lo, 0.5), `${lo.toFixed(2)} -> ${L.h.toFixed(2)}`);
  check("squeeze: same day, no zoom, same #strip, nothing opened", L.shown === L0.shown && L.scale === 1 && L.same && !L.open && !L.draft);
  const small = await page.evaluate(() => [...document.querySelectorAll(".ev")].find((e) => e.textContent.includes("Isha Kriya")).className);
  check("at the smallest: the 20 minute card is title only", /\bsm\b/.test(small), small);
  N = await nowAt();
  check("at the smallest: the now line sits at the time", near(N.line, L.hoursTop + N.n / 60 * L.h, 3), `${(N.line - (L.hoursTop + N.n / 60 * L.h)).toFixed(2)}px`);
  check("at the smallest: the now pill sits on the now line", near(N.pill, N.line, 3), `${(N.pill - N.line).toFixed(2)}px`);
  void m2;

  /* ---- a moving pinch: the time under the midpoint follows the fingers ---- */
  await pinch(X, 400, 100, 200);   // about 2x the smallest
  L = await look(page);
  const m3 = minuteAt(L, 420);
  await pinch(X, 420, 100, 150, 14, 60);
  L = await look(page);
  check("pinch while the fingers move down: that time stays under the midpoint", near(L.hoursTop + m3 / 60 * L.h, 480, 3), `${(L.hoursTop + m3 / 60 * L.h - 480).toFixed(2)}px`);

  /* ---- the height survives a reload ---- */
  const before = L.h;
  await page.reload(); await page.waitForSelector(".ev"); await sleep(700); await mark();
  L = await look(page);
  check("reload: the phone opens at the pinched height", near(L.h, before, 0.6), `${before.toFixed(2)} -> ${L.h.toFixed(2)}`);
  const first = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--H").trim());
  check("reload: the height is set before the page script draws (head script)", near(parseFloat(first), before, 0.6), first);

  /* ---- a tap on an empty hour after a pinch starts the event at the tapped time ---- */
  await pinch(X, Y, 120, 200);
  L = await look(page);
  await page.evaluate((h) => { document.querySelector("#view").scrollTop = 20 * h - 200; }, L.h);
  await sleep(700);
  L = await look(page);
  const ty = L.hoursTop + (20 * 60 + 40) / 60 * L.h;   // 8:40 pm: the half hour starts 8:30 pm
  await tap(X, ty);
  const draft = await page.evaluate(() => { const d = document.querySelector(".ev.draft"); return d ? d.querySelector("small").textContent : null; });
  check("tap on an empty hour after a pinch: the new event starts at 8:30 pm", draft === "8:30 pm", String(draft));
  await page.evaluate(() => { document.body.classList.remove("popen"); document.querySelectorAll(".ev.draft").forEach((d) => d.remove()); });

  /* ---- a second finger landing mid swipe: the days slide back, no day change ---- */
  L0 = await look(page);
  await touch("touchStart", [{ x: 300, y: 500, id: 1 }]);
  for (const x of [288, 276, 262, 248, 236]) { await sleep(17); await touch("touchMove", [{ x, y: 500, id: 1 }]); }
  await sleep(17);
  await touch("touchStart", [{ x: 236, y: 500, id: 1 }, { x: 236, y: 620, id: 2 }]);
  for (let i = 1; i <= 8; i++) { await sleep(17); await touch("touchMove", [{ x: 236, y: 500 - i * 4, id: 1 }, { x: 236, y: 620 + i * 4, id: 2 }]); }
  await touch("touchEnd", []); await sleep(500);
  L = await look(page);
  const off = await page.evaluate(() => {
    const gut = document.querySelector(".gut").getBoundingClientRect().right; return Math.min(...[...document.querySelectorAll(".day")].map((x) => Math.abs(x.getBoundingClientRect().left - gut))); });
  check("second finger mid swipe: the day stays", L.shown === L0.shown, `${L0.shown} -> ${L.shown}`);
  check("second finger mid swipe: the days slide back square to the gutter", off < 2, `${off.toFixed(1)}px off`);
  check("second finger mid swipe: no zoom, nothing opened", L.scale === 1 && !L.open && !L.draft);

  /* ---- the 3 day view pinches the same way ---- */
  await page.evaluate(() => localStorage.setItem("cal-n", "3"));
  await page.reload(); await page.waitForSelector(".ev"); await sleep(700); await mark();
  L0 = await look(page);
  const m4 = minuteAt(L0, Y);
  await pinch(200, Y, 200, 120);
  L = await look(page);
  check("3 days: a squeeze makes the rows shorter", L.h < L0.h - 5, `${L0.h.toFixed(1)} -> ${L.h.toFixed(1)}`);
  check("3 days: the time under the fingers stays within 3px", near(L.hoursTop + m4 / 60 * L.h, Y, 3), `${(L.hoursTop + m4 / 60 * L.h - Y).toFixed(2)}px`);
  check("3 days: same day, no zoom, same #strip, nothing opened", L.shown === L0.shown && L.scale === 1 && L.same && !L.open && !L.draft);

  /* ---- the 7 day view too, and with a second time zone a tall card names each zone's start and end ---- */
  await page.evaluate(() => { localStorage.setItem("cal-n", "7"); localStorage.setItem("cal-tz2", "Europe/London"); });
  await page.reload(); await page.waitForSelector(".ev"); await sleep(700); await mark();
  L0 = await look(page);
  const m5 = minuteAt(L0, Y);
  await pinch(240, Y, 100, 180);
  L = await look(page);
  check("7 days: a spread makes the rows taller", L.h > L0.h + 5, `${L0.h.toFixed(1)} -> ${L.h.toFixed(1)}`);
  check("7 days: the time under the fingers stays within 3px", near(L.hoursTop + m5 / 60 * L.h, Y, 3), `${(L.hoursTop + m5 / 60 * L.h - Y).toFixed(2)}px`);
  check("7 days: same day, no zoom, same #strip, nothing opened", L.shown === L0.shown && L.scale === 1 && L.same && !L.open && !L.draft);
  await pinch(240, Y, 80, 400); await pinch(240, Y, 80, 400);
  const z = await page.evaluate(() => { const el = [...document.querySelectorAll(".ev")].find((e) => e.textContent.includes("Isha Kriya"));
    return { tall: el.classList.contains("tall"), t1: el.querySelector(".t1").textContent, t2: el.querySelector(".t2").innerText.replace(/\s+/g, " ").trim(), z2: getComputedStyle(el.querySelector(".z2")).display }; });
  check("second zone: a tall card reads each zone's start and end on its own line", z.tall && z.z2 === "block" && z.t2 === "3:30 to 3:50 pm 8:30 to 8:50 pm", `${z.tall} ${z.z2} ${z.t2}`);
  check("second zone: the short text still reads both starts", z.t1 === "3:30 pm · 8:30 pm", z.t1);
  check("phone: no page errors", !errors.length, errors.join(" | "));
  await ctx.close();

  /* ---- desktop: unchanged at 56, mouse drag lands on the right time ---- */
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: "America/Toronto" });
  const dp = await dctx.newPage();
  const derr = []; dp.on("pageerror", (e) => derr.push(e.message));
  await dp.addInitScript(() => { localStorage.setItem("quest-key", "test"); localStorage.setItem("cal-n", "3"); localStorage.setItem("cal-hour", "120"); });
  await dp.goto(URL_); await dp.waitForSelector(".ev"); await sleep(600);
  const D = await dp.evaluate(() => {
    const sp = document.querySelectorAll(".gut .hours span:not(.nowlbl)"), el = [...document.querySelectorAll(".ev")].find((e) => e.textContent.includes("Visit Mom"));
    const col = el.closest(".col").getBoundingClientRect(), r = el.getBoundingClientRect();
    return { h: sp[1].getBoundingClientRect().top - sp[0].getBoundingClientRect().top, top: r.top - col.top, ht: r.height,
      t2: getComputedStyle(el.querySelector(".t2")).display, small: el.querySelector("small").innerText, touch: document.body.classList.contains("touch") };
  });
  check("desktop: hours stay 56px even with a phone height saved", near(D.h, 56, 0.1), D.h.toFixed(2));
  check("desktop: a 12:30 to 3 pm card sits where it did (700px, 138px tall)", near(D.top, 700, 0.6) && near(D.ht, 138, 0.6), `${D.top.toFixed(1)} / ${D.ht.toFixed(1)}`);
  check("desktop: a card shows only its start time", D.t2 === "none" && D.small === "12:30 pm", `${D.small}`);
  const box = await dp.evaluate(() => { const el = [...document.querySelectorAll(".ev")].find((e) => e.textContent.includes("Isha Kriya")); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 4 }; });
  await sleep(200);
  await dp.mouse.move(box.x, box.y); await dp.mouse.down();
  for (let i = 1; i <= 8; i++) { await dp.mouse.move(box.x, box.y + 56 * i / 8); await sleep(16); }
  await dp.mouse.up(); await sleep(900);
  const moved = await dp.evaluate(() => { const el = [...document.querySelectorAll(".ev")].find((e) => e.textContent.includes("Isha Kriya")); return el.querySelector("small .t1").textContent; });
  check("desktop: a mouse drag down 56px moves the card one hour (3:30 to 4:30 pm)", moved === "4:30 pm", moved);
  const hb = await dp.evaluate(() => { const el = [...document.querySelectorAll(".ev")].find((e) => e.textContent.includes("Visit Mom")); el.scrollIntoView({ block: "center" }); const r = el.querySelector(".h").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await sleep(200);
  await dp.mouse.move(hb.x, hb.y); await dp.mouse.down();
  for (let i = 1; i <= 8; i++) { await dp.mouse.move(hb.x, hb.y + 56 * i / 8); await sleep(16); }
  await dp.mouse.up(); await sleep(900);
  const rs = await dp.evaluate(() => { const el = [...document.querySelectorAll(".ev")].find((e) => e.textContent.includes("Visit Mom")); return { ht: el.getBoundingClientRect().height, small: el.querySelector("small").innerText }; });
  check("desktop: a mouse resize down 56px adds one hour (12:30 to 4 pm, 194px tall)", near(rs.ht, 194, 0.6) && rs.small === "12:30 pm", `${rs.ht.toFixed(1)} ${rs.small}`);
  check("desktop: no page errors", !derr.length, derr.join(" | "));
  await dctx.close();
} finally {
  await browser.close(); server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
