import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
// tsx is a devDependency of this package, so its bin lives in the package's own node_modules.
const tsxBin = path.join(path.resolve(here, "../.."), "node_modules", ".bin", "tsx");

type WatchdogLogLine = { msg?: string; [key: string]: unknown };
type StallStack = { ok: boolean; frames?: Array<{ functionName: string }> };

const parseLogLines = (stderr: string): WatchdogLogLine[] =>
  stderr
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as WatchdogLogLine];
      } catch {
        return [];
      }
    });

const functionNames = (stack: unknown): string[] =>
  ((stack as StallStack | undefined)?.frames ?? []).map((frame) => frame.functionName);

describe("event-loop watchdog stall stacks", () => {
  // Regression: staging logins froze the gateway for 20-30s+ with no trace of
  // where -- the in-memory login trace died with the SIGKILL, and the worker's
  // own kill log went through the frozen main thread and was lost.
  it("logs the blocked main thread's JS stack straight to stderr, and again on recovery", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "watchdog-stall-"));
    try {
      const run = spawnSync(
        tsxBin,
        [path.join(here, "watchdog-stall-harness.ts"), path.join(dir, "last-kill"), path.join(dir, "forensics.json")],
        { encoding: "utf8", timeout: 30_000 }
      );
      expect(run.status, run.stderr).toBe(0);
      const lines = parseLogLines(run.stderr);

      const stackLine = lines.find((line) => line.msg === "event_loop_stall_stack");
      expect(stackLine, run.stderr).toBeDefined();
      expect(functionNames(stackLine?.stack)).toContain("harnessBlockedInLoginStep");

      const rateLimited = lines.find((line) => line.msg === "event_loop_watchdog_rate_limited");
      expect(rateLimited, run.stderr).toBeDefined();
      expect((rateLimited?.stallStacks as unknown[] | undefined)?.length ?? 0).toBeGreaterThan(0);

      const recovered = lines.find((line) => line.msg === "event_loop_stall_recovered");
      expect(recovered, run.stderr).toBeDefined();
      expect(Number(recovered?.stalledMs)).toBeGreaterThanOrEqual(1_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
