#!/usr/bin/env node
// Login experience probe: drives a real login in Chromium (phone viewport,
// optional CPU throttle) and records what the player actually sees — every
// change to the login overlay's title/copy/progress bar, main-thread freezes
// (long tasks), and the client's own [login-timeline] (download, INIT handler,
// map-build stages, map ready). Fails when the longest single freeze or the
// time from INIT to map-ready exceeds the given thresholds.
//
// Runs against a local rewrite stack using the localhost dev-auth bypass
// (?devPlayerId=, honoured only on localhost and only when the gateway has
// GATEWAY_DEFAULT_HUMAN_PLAYER_ID set). See README "Login experience probe".
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const DEFAULTS = {
  url: "http://localhost:5173/",
  player: "ai-1",
  cpuThrottle: 4,
  timeoutMs: 180_000,
  maxFreezeMs: undefined,
  maxInitToReadyMs: undefined,
  out: undefined,
  screenshots: false,
  json: false
};

const usage = () => {
  console.log(`Usage: node scripts/login-experience-probe.mjs [options]

Options:
  --url <url>                   Client URL (default: ${DEFAULTS.url})
  --player <id>                 Player id to log in as via the dev bypass (default: ${DEFAULTS.player})
  --cpu-throttle <n>            Chromium CPU slowdown factor, ~4-6 for a mid-range phone (default: ${DEFAULTS.cpuThrottle})
  --timeout-ms <ms>             Give up if the map isn't ready by then (default: ${DEFAULTS.timeoutMs})
  --max-freeze-ms <ms>          Fail if any single main-thread block after the download exceeds this
  --max-init-to-ready-ms <ms>   Fail if INIT-arrived -> map-ready exceeds this
  --out <dir>                   Write result.json (and screenshots with --screenshots) here
  --screenshots                 Save a filmstrip of the login overlay
  --json                        Print the full result as JSON
  --help                        Show help

Environment:
  PLAYWRIGHT_CHROMIUM_EXECUTABLE  Chromium to launch (default: Playwright's own, via PLAYWRIGHT_BROWSERS_PATH)
`);
};

const parseArgs = (argv) => {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    const number = () => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`${arg} requires a number`);
      index += 1;
      return parsed;
    };
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else if (arg === "--url") (options.url = value), (index += 1);
    else if (arg === "--player") (options.player = value), (index += 1);
    else if (arg === "--out") (options.out = value), (index += 1);
    else if (arg === "--cpu-throttle") options.cpuThrottle = number();
    else if (arg === "--timeout-ms") options.timeoutMs = number();
    else if (arg === "--max-freeze-ms") options.maxFreezeMs = number();
    else if (arg === "--max-init-to-ready-ms") options.maxInitToReadyMs = number();
    else if (arg === "--screenshots") options.screenshots = true;
    else if (arg === "--json") options.json = true;
    else throw new Error(`Unknown option ${arg}`);
  }
  return options;
};

const withTimeout = (promise, ms, fallback) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);

// Runs in the page: records each distinct overlay state with its rAF time.
const installOverlayRecorder = () => {
  const recorder = { overlay: [] };
  window.__loginProbe = recorder;
  let last = "";
  const tick = (frameTime) => {
    const overlayEl = document.querySelector("#auth-overlay");
    const bar = document.querySelector("#auth-busy-progress");
    const snapshot = {
      visible: Boolean(overlayEl && getComputedStyle(overlayEl).display !== "none"),
      title: document.querySelector("#auth-busy-title")?.textContent ?? "",
      copy: document.querySelector("#auth-busy-copy")?.textContent ?? "",
      percent: bar && !bar.hidden ? Number(bar.getAttribute("aria-valuenow")) : null
    };
    const serialized = JSON.stringify(snapshot);
    if (serialized !== last) {
      last = serialized;
      recorder.overlay.push({ atMs: Math.round(frameTime), ...snapshot });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const run = async (options) => {
  if (options.out) mkdirSync(options.out, { recursive: true });
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: options.cpuThrottle });
    await page.addInitScript(installOverlayRecorder);

    let loginTimeline;
    const errors = [];
    page.on("console", async (message) => {
      if (message.text().startsWith("[login-timeline]")) {
        loginTimeline = await message.args()[1]?.jsonValue().catch(() => undefined);
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const url = new URL(options.url);
    url.searchParams.set("devPlayerId", options.player);
    const startedAt = Date.now();
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });

    let shot = 0;
    while (!loginTimeline && Date.now() - startedAt < options.timeoutMs) {
      if (options.screenshots && options.out) {
        const t = Date.now() - startedAt;
        await page.screenshot({ path: `${options.out}/shot-${String(shot).padStart(3, "0")}-${t}ms.png`, timeout: 3_000 }).catch(() => undefined);
        shot += 1;
      }
      await page.waitForTimeout(options.screenshots ? 700 : 1_000);
    }
    const recorder = await withTimeout(page.evaluate(() => window.__loginProbe), 30_000, { overlay: [] });
    return { options, loginTimeline, overlay: recorder?.overlay ?? [], errors };
  } finally {
    await browser.close();
  }
};

const summarize = ({ options, loginTimeline, overlay, errors }) => {
  const marks = loginTimeline?.marks ?? {};
  const downloadDoneAt = marks.downloadComplete ?? 0;
  const freezesAfterDownload = (loginTimeline?.longTasks ?? []).filter((task) => task.atMs + task.durationMs >= downloadDoneAt);
  const longestFreezeMs = freezesAfterDownload.reduce((max, task) => Math.max(max, task.durationMs), 0);
  const initToReadyMs = marks.mapReady !== undefined && marks.initDispatchStart !== undefined ? marks.mapReady - marks.initDispatchStart : undefined;
  const failures = [];
  if (!loginTimeline) failures.push("no [login-timeline] summary (login never completed, or the build has no timeline)");
  if (options.maxFreezeMs !== undefined && longestFreezeMs > options.maxFreezeMs) failures.push(`longest freeze ${longestFreezeMs}ms > ${options.maxFreezeMs}ms`);
  if (options.maxInitToReadyMs !== undefined && (initToReadyMs === undefined || initToReadyMs > options.maxInitToReadyMs)) {
    failures.push(`INIT -> map ready ${initToReadyMs ?? "never"}ms > ${options.maxInitToReadyMs}ms`);
  }
  return {
    player: options.player,
    cpuThrottle: options.cpuThrottle,
    initChars: loginTimeline?.facts?.initChars,
    marks,
    longestFreezeMs,
    initToReadyMs,
    freezesAfterDownload,
    overlaySteps: overlay.map((step) => `${step.atMs}ms ${step.visible ? "" : "(hidden) "}${step.title} | ${step.copy}${step.percent === null ? "" : ` [${step.percent}%]`}`),
    errors,
    failures
  };
};

const options = parseArgs(process.argv.slice(2));
const result = await run(options);
const summary = summarize(result);
if (options.out) writeFileSync(`${options.out}/result.json`, JSON.stringify({ ...result, summary }, null, 2));
if (options.json) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`Login experience probe: player=${summary.player} cpu=${summary.cpuThrottle}x init=${summary.initChars ?? "?"} chars`);
  for (const step of summary.overlaySteps) console.log(`  ${step}`);
  console.log(`  longest freeze after download: ${summary.longestFreezeMs}ms; INIT -> map ready: ${summary.initToReadyMs ?? "n/a"}ms`);
}
if (summary.failures.length > 0) {
  for (const failure of summary.failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
