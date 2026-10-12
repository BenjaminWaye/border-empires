// Child-process harness for watchdog-stall-stack.integration.test.ts: arms a
// real event-loop watchdog, blocks the main thread past its stall threshold,
// and lets the worker's fd-2 logs show what it captured. The kill-state file is
// pre-stamped so the stall is rate-limited instead of SIGKILLing the harness.
import { writeFileSync } from "node:fs";

import { startEventLoopWatchdog } from "../event-loop-watchdog.js";

const [killStatePath, deathForensicsPath] = process.argv.slice(2);
if (!killStatePath || !deathForensicsPath) throw new Error("usage: watchdog-stall-harness <killStatePath> <deathForensicsPath>");
writeFileSync(killStatePath, String(Date.now()), "utf8");

function harnessBlockedInLoginStep(ms: number): number {
  const end = Date.now() + ms;
  let spins = 0;
  while (Date.now() < end) spins += 1;
  return spins;
}

const watchdog = startEventLoopWatchdog({
  enabled: true,
  label: "stall-harness",
  heartbeatIntervalMs: 50,
  stallThresholdMs: 900,
  bootGraceMs: 60_000,
  minKillIntervalMs: 3_600_000,
  stackCaptureMs: 300,
  killStatePath,
  deathForensicsPath
});
if (!watchdog) throw new Error("watchdog did not start");
watchdog.arm();
setTimeout(() => {
  harnessBlockedInLoginStep(1_600);
  setTimeout(() => {
    void watchdog.stop().then(() => process.exit(0));
  }, 400);
}, 300);
