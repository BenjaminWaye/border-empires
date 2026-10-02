import { describe, expect, it } from "vitest";

import { createSimulationMetrics } from "./metrics.js";

describe("rally spawn counters", () => {
  it("exposes total and fallback counters through the snapshot and prometheus output", () => {
    const metrics = createSimulationMetrics();
    metrics.incrementSimRallySpawn();
    metrics.incrementSimRallySpawn();
    metrics.incrementSimRallySpawnFallback();

    expect(metrics.snapshot()).toMatchObject({ simRallySpawnTotal: 2, simRallySpawnFallbackTotal: 1 });
    const rendered = metrics.renderPrometheus();
    expect(rendered).toContain("sim_rally_spawn_total 2");
    expect(rendered).toContain("sim_rally_spawn_fallback_total 1");
  });

  it("still counts auth_recovery respawns after the increments moved into the shared spread", () => {
    const metrics = createSimulationMetrics();
    metrics.incrementSimAuthRecoveryRespawn();
    metrics.incrementSimAuthRecoveryRespawnGuarded();
    expect(metrics.snapshot()).toMatchObject({ simAuthRecoveryRespawnTotal: 1, simAuthRecoveryRespawnGuardedTotal: 1 });
  });
});
