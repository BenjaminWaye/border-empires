import { describe, expect, it } from "vitest";

import { economicStructureBuildDurationMs, structureBuildDurationMs } from "./structure-costs.js";

describe("economicStructureBuildDurationMs", () => {
  it("matches special-case build times for wooden forts and light outposts", () => {
    expect(economicStructureBuildDurationMs("WOODEN_FORT")).toBe(10 * 60_000);
    expect(economicStructureBuildDurationMs("LIGHT_OUTPOST")).toBe(60_000);
  });

  it("keeps standard economic structures on the default build time", () => {
    expect(economicStructureBuildDurationMs("MINE")).toBe(5 * 60_000);
    expect(economicStructureBuildDurationMs("RADAR_SYSTEM")).toBe(5 * 60_000);
  });

  it("covers top-level fort, observatory, and siege outpost durations", () => {
    expect(structureBuildDurationMs("FORT")).toBe(10 * 60_000);
    expect(structureBuildDurationMs("OBSERVATORY")).toBe(10 * 60_000);
    expect(structureBuildDurationMs("SIEGE_OUTPOST")).toBe(60_000);
  });
});
