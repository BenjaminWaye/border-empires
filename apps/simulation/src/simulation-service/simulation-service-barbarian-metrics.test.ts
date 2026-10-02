import { describe, expect, it } from "vitest";
import { createSimulationMetrics } from "../metrics/metrics.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { sampleBarbarianMetrics } from "./simulation-service-barbarian-metrics.js";

describe("barbarian state gauges", () => {
  it("exposes barbarian tile and multiply-progress counts in the prometheus output", () => {
    const metrics = createSimulationMetrics();
    sampleBarbarianMetrics({ barbarianStateSizes: () => ({ tiles: 100, progressEntries: 7 }) }, metrics);
    const rendered = metrics.renderPrometheus();
    expect(rendered).toContain("sim_barbarian_tiles 100");
    expect(rendered).toContain("sim_barbarian_tile_progress_entries 7");
  });

  it("the runtime reports its real barbarian sizes", () => {
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
    expect(runtime.barbarianStateSizes()).toEqual({ tiles: 2, progressEntries: 0 });
  });
});
