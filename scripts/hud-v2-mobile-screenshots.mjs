#!/usr/bin/env node
// HUD v2 phone screenshots: signs in to a local rewrite stack (the localhost
// dev-auth bypass, as in login-experience-probe.mjs) at phone viewports and
// saves one screenshot per viewport, plus the body classes that
// decided the layout. Used for before/after images in the HUD v2 mobile PRs
// (docs/hud-v2-mobile-plan.md).
//
//   GATEWAY_DEFAULT_HUMAN_PLAYER_ID=probe-human pnpm dev
//   pnpm shots:hud-v2-mobile --out .local-data/hud-v2-mobile
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const VIEWPORTS = [
  { name: "portrait-390x844", width: 390, height: 844 },
  { name: "small-360x780", width: 360, height: 780 },
  { name: "landscape-932x430", width: 932, height: 430 }
];
const DEFAULTS = { url: "http://localhost:5173/", player: "ai-1", out: ".local-data/hud-v2-mobile", timeoutMs: 180_000, settleMs: 2_500 };

const usage = () => {
  console.log(`Usage: node scripts/hud-v2-mobile-screenshots.mjs [options]

Options:
  --url <url>          Client URL (default: ${DEFAULTS.url})
  --player <id>        Player id for the dev bypass (default: ${DEFAULTS.player})
  --out <dir>          Where screenshots and result.json go (default: ${DEFAULTS.out})
  --viewports <list>   Comma-separated viewport names (default: ${VIEWPORTS.map((v) => v.name).join(", ")})
  --timeout-ms <ms>    Give up on a viewport if the map isn't up by then (default: ${DEFAULTS.timeoutMs})
  --help               Show help

Environment:
  PLAYWRIGHT_CHROMIUM_EXECUTABLE  Chromium to launch (default: Playwright's own)
`);
};

const parseArgs = (argv) => {
  const options = { ...DEFAULTS };
  const pick = (arg, value, known) => {
    const picked = value.split(",").filter(Boolean);
    const unknown = picked.filter((name) => !known.includes(name));
    if (unknown.length > 0 || picked.length === 0) throw new Error(`${arg}: unknown ${unknown.join(", ") || "(empty)"}; choose from ${known.join(", ")}`);
    return picked;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg !== "--help" && arg !== "-h" && (value === undefined || value.startsWith("--"))) throw new Error(`${arg} needs a value`);
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else if (arg === "--url") options.url = value;
    else if (arg === "--player") options.player = value;
    else if (arg === "--out") options.out = value;
    else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(value);
      if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error(`--timeout-ms needs a positive number, got ${value}`);
    } else if (arg === "--viewports") options.viewports = pick(arg, value, VIEWPORTS.map((v) => v.name));
    else throw new Error(`Unknown option ${arg}`);
    index += 1;
  }
  return options;
};

/** The game is up once the first map chunk has drawn and the HUD layer shows. */
const gameUp = () => document.body.classList.contains("hud-v2") && !document.body.classList.contains("hud-v2-waiting");

const shoot = async (browser, options, viewport) => {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const url = new URL(options.url);
    url.searchParams.set("devPlayerId", options.player);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    const deadline = Date.now() + options.timeoutMs;
    let up = false;
    while (!up && Date.now() < deadline) {
      up = await page.evaluate(gameUp).catch(() => false);
      // A player id the dev bypass has not seen yet stops at name/colour setup; accept the defaults.
      const save = page.locator("#auth-profile-save");
      if (!up && (await save.isVisible().catch(() => false))) await save.click().catch(() => undefined);
      if (!up) await page.waitForTimeout(1_000);
    }
    await page.waitForTimeout(options.settleMs);
    const file = `${options.out}/${viewport.name}.png`;
    await page.screenshot({ path: file });
    const bodyClasses = await page.evaluate(() => [...document.body.classList].filter((name) => name.startsWith("hud-v2")));
    return { viewport: viewport.name, up, file, bodyClasses, errors };
  } finally {
    await context.close();
  }
};

const options = parseArgs(process.argv.slice(2));
mkdirSync(options.out, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
});
const results = [];
try {
  for (const viewport of VIEWPORTS.filter((v) => !options.viewports || options.viewports.includes(v.name))) {
    const result = await shoot(browser, options, viewport);
    results.push(result);
    console.log(`${result.up ? "ok  " : "FAIL"} ${viewport.name}: [${result.bodyClasses.join(" ")}] -> ${result.file}${result.errors.length ? ` (${result.errors.length} page errors)` : ""}`);
  }
} finally {
  await browser.close();
}
writeFileSync(`${options.out}/result.json`, JSON.stringify(results, null, 2));
if (results.some((result) => !result.up)) process.exitCode = 1;
