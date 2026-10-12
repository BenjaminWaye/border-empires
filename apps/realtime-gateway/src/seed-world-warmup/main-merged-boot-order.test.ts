import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { gatewaySeedProfileFromEnv, parseRealtimeGatewayRuntimeEnv } from "../runtime-env/runtime-env.js";

// main-merged.ts is a top-level-await entrypoint (spawns the sim worker), so
// its boot order is checked on the source rather than by running it.
const mainMergedSource = readFileSync(new URL("../main-merged.ts", import.meta.url), "utf8");
const indexOf = (needle: string): number => {
  const index = mainMergedSource.indexOf(needle);
  expect(index, `main-merged.ts should contain ${needle}`).toBeGreaterThanOrEqual(0);
  return index;
};

describe("merged entrypoint boot order", () => {
  it("warms the seed world before waiting on the sim worker", () => {
    expect(indexOf("warmGatewaySeedWorld(")).toBeLessThan(indexOf("const simReady = await"));
  });

  // Regression: an early draft of the warm-up hoisted the full env parse to
  // get the seed profile, which ran before SIMULATION_ADDRESS was set from the
  // sim worker's ready message (stale address, or a managed-runtime throw).
  it("parses the full gateway env only after SIMULATION_ADDRESS is set", () => {
    expect(indexOf("parseRealtimeGatewayRuntimeEnv(process.env)")).toBeGreaterThan(indexOf("process.env.SIMULATION_ADDRESS ="));
  });
});

describe("gatewaySeedProfileFromEnv", () => {
  it("matches the full parse's seed profile", () => {
    for (const value of [undefined, "default", "season-20ai", "stress-20ai", "bogus"]) {
      const env = { SIMULATION_SEED_PROFILE: value };
      expect(gatewaySeedProfileFromEnv(env)).toBe(parseRealtimeGatewayRuntimeEnv(env).simulationSeedProfile);
    }
  });
});
