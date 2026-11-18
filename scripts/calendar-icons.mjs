// Draws the Calendar app's PNG icons from still/calendar-icon.svg (2026-11-11). Run again after changing the SVG:
//   PW_DIR=<folder with node_modules/playwright-core> node scripts/calendar-icons.mjs
// - calendar-icon-180.png  apple-touch-icon: square, no transparency (the iPhone rounds the corners itself)
// - calendar-icon-192.png, -512.png  web manifest "any": the rounded tile as drawn
// - calendar-icon-maskable-512.png  web manifest "maskable": square, the art shrunk into the 80% safe circle
// - calendar-icon-32.png  PNG favicon for browsers without SVG favicons
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), "x.js"));
const { chromium } = require("playwright-core");
const still = fileURLToPath(new URL("../still/", import.meta.url));
const svg = fs.readFileSync(still + "calendar-icon.svg", "utf8");
const square = svg.replace(/ rx="112"/, "");
const maskable = square.replace('<g id="art">', '<g id="art" transform="translate(256 256) scale(.8) translate(-256 -256)">');
const jobs = [["calendar-icon-180.png", square, 180], ["calendar-icon-192.png", svg, 192], ["calendar-icon-512.png", svg, 512],
  ["calendar-icon-maskable-512.png", maskable, 512], ["calendar-icon-32.png", svg, 32]];

const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const [name, art, px] of jobs) {
    const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
    const sized = art.replace("<svg ", `<svg width="${px}" height="${px}" `);
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${sized}`);
    await page.screenshot({ path: still + name, omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
    await page.close();
    console.log("wrote", name);
  }
} finally { await browser.close(); }
