import { describe, expect, it } from "vitest";
import { createSimulationMetrics } from "../metrics/metrics.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { sampleBarbarianMetrics } from "./simulation-service-barbarian-metrics.js";

describe("barbarian state gauges", () => {
  it("exposes Planetary Defense camp gauges and counters in the prometheus output", () => {
    const metrics = createSimulationMetrics();
    const sizes = { camps: 12, tiles: 300, dirtyCamps: 1, awakeCamps: 4, watchers: 9, awakeDriftTotal: 2, releasedTotal: 17 };
    sampleBarbarianMetrics({ barbarianStateSizes: () => sizes }, metrics);
    const rendered = metrics.renderPrometheus();
    expect(rendered).toContain("sim_barbarian_tiles 300");
    expect(rendered).toContain("sim_barbarian_camps 12");
    expect(rendered).toContain("sim_barbarian_awake_camps 4");
    expect(rendered).toContain("sim_barbarian_dirty_camps 1");
    expect(rendered).toContain("sim_barbarian_camp_awake_drift_total 2");
    expect(rendered).toContain("sim_barbarian_camp_tiles_released_total 17");
  });

  it("the runtime reports its real camp sizes, converting pre-camp barbarian tiles at boot", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["barbarian-1", { id: "barbarian-1", isAi: true, points: 0, manpower: 0, techIds: new Set<string>(), domainIds: new Set<string>(), mods: { attack: 1, defense: 1, income: 1, vision: 1 }, techRootId: "rewrite-local", allies: new Set<string>() }]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 1, y: 1, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" },
          { x: 5, y: 5, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    // Two separate pre-camp tiles become two one-tile camps.
    expect(runtime.barbarianStateSizes()).toMatchObject({ tiles: 2, camps: 2, dirtyCamps: 0, releasedTotal: 0 });
  });
});
