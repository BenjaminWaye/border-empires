// Regression: the season-20ai seed world is generated at the current worldgen
// version (and may re-roll its seed), but its season used to fall back to
// seed 0 / legacy v1 -- so the server's and client's terrainAt drifted from
// the generated world, and local seed worlds had no edge rivers, springs or
// river mountains. The season now carries the generated world's seed and
// version (seedProfileWorldgen, seed-state.ts).
import { describe, expect, it } from "vitest";
import { CURRENT_WORLDGEN_VERSION, getWorldSeed, worldgenVersion } from "@border-empires/shared";
import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySeasonSummaryStore } from "../season-summary-store.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { seedProfileWorldgen } from "../seed-state/seed-state.js";
import { createSimulationService } from "./simulation-service.js";

describe("seed-profile season worldgen", () => {
  it("stamps a local season-20ai season with the generated world's seed and the current worldgen version", async () => {
    const service = await createSimulationService({
      seedProfile: "season-20ai",
      commandStore: new InMemorySimulationCommandStore(),
      eventStore: new InMemorySimulationEventStore(),
      snapshotStore: new InMemorySimulationSnapshotStore(),
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
      allowSeedRecoveryFallback: true,
      requireDurableStartupState: false,
      log: { info: () => undefined, error: () => undefined }
    });
    expect(worldgenVersion()).toBe(CURRENT_WORLDGEN_VERSION);
    expect(getWorldSeed()).toBe(seedProfileWorldgen("season-20ai")!.worldSeed);
    expect(getWorldSeed()).not.toBe(0);
    await service.close();
  }, 90_000);

  it("leaves the hand-built profiles' seasons as they were", () => {
    expect(seedProfileWorldgen("default")).toBeUndefined();
    expect(seedProfileWorldgen("stress-20ai")).toBeUndefined();
    expect(seedProfileWorldgen(undefined)).toBeUndefined();
  });
});
