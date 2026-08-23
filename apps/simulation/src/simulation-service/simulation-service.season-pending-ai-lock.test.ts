/**
 * Regression test for: AI players kept acting during the season lobby
 * countdown (a "pending" season, before scheduledStartAt) even though new
 * human joins are correctly locked out by prepare-and-join-player.ts.
 *
 * Fix: aiShouldRun() must also refuse to run while the season is pending,
 * mirroring the existing "ended" guard, so AI empires stay locked out until
 * the season actually activates.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSimulationMetrics } from "../metrics/metrics.js";
import { AI_TICK_THROTTLE_REASONS } from "../metrics/metrics-types.js";

const source = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "simulation-service.ts"), "utf8");
};

describe("AI players are locked out during a pending (lobby countdown) season", () => {
  it("simulation-service.ts wires aiShouldRun/systemShouldRun through the shared should-run factory", () => {
    const file = source();
    expect(file).toContain('import { createAiAndSystemShouldRun } from "./ai-and-system-should-run.js";');
    expect(file).toContain("const { aiShouldRun, systemShouldRun } = createAiAndSystemShouldRun({");
  });

  it("the shared should-run factory refuses to run (for both AI and system) while the season is pending", () => {
    const factorySource = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "ai-and-system-should-run.ts"),
      "utf8"
    );
    expect(factorySource).toContain('import { isSeasonPending } from "../season-lifecycle.js";');
    expect(factorySource).toContain(
      [
        "    if (isSeasonPending(seasonState)) {",
        '      deps.incrementThrottled("season_pending");',
        "      return true;",
        "    }"
      ].join("\n")
    );
    // Both aiShouldRun and systemShouldRun consult the same season gate.
    expect(factorySource).toContain("const aiShouldRun = (): boolean => {\n    if (seasonGateBlocksRun()) return false;");
    expect(factorySource).toContain("const systemShouldRun = (): boolean => {\n    if (seasonGateBlocksRun()) return false;");
  });

  it("season_pending is a valid AiTickThrottleReason registered in the const tuple", () => {
    expect(AI_TICK_THROTTLE_REASONS).toContain("season_pending");
  });

  it("simulationMetrics records season_pending throttle increments correctly", () => {
    const metrics = createSimulationMetrics();
    const before = metrics.snapshot().simAiTickThrottledTotal;
    expect(before["season_pending"]).toBe(0);

    metrics.incrementSimAiTickThrottled("season_pending");
    metrics.incrementSimAiTickThrottled("season_pending");
    const after = metrics.snapshot().simAiTickThrottledTotal;
    expect(after["season_pending"]).toBe(2);

    // Other reasons must be unaffected
    expect(after["season_ended"]).toBe(0);
    expect(after["loop_lag"]).toBe(0);
  });
});
