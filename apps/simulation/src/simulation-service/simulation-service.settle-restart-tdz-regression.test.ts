import { describe, it, expect, beforeEach } from "vitest";

import { createSimulationService } from "./simulation-service.js";
import { createSeedWorld } from "../seed-state/seed-state.js";
import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";

const FIXED_NOW_MS = 1_000;

/**
 * Reproduces the staging crash (2026-08-31): `ReferenceError: Cannot access
 * 'simulationMetrics' before initialization` inside
 * trackSyncMainThreadTaskWithMetrics, reached via
 * `new SimulationRuntime(...)`'s constructor synchronously walking world-init
 * reach anchors (runtime.ts's gatherReachAnchors loop at construction time)
 * and cancelling out-of-reach decay on any FRONTIER tile already inside that
 * anchor's disk. Recovering a world where a player already owns a FRONTIER
 * tile with an OUT_OF_REACH timer, sitting inside their own town's reach
 * disk, exercises exactly that path.
 */
const recoveredStateWithFrontierTileInTownDisk = (): RecoveredSimulationState => {
  const seedWorld = createSeedWorld("default");
  const townTile = [...seedWorld.tiles.values()].find((tile) => tile.town && tile.ownershipState === "SETTLED");
  if (!townTile) throw new Error("seed world has no settled town tile to anchor the regression against");

  const tiles: RecoveredSimulationState["tiles"] = [...seedWorld.tiles.values()].map((tile) => ({
    x: tile.x,
    y: tile.y,
    terrain: tile.terrain,
    ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
    ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
    ...(tile.town ? { town: tile.town } : {})
  }));

  // Adjacent to the town (within TOWN_REACH_RADIUS=3), already owned, already
  // FRONTIER with a live OUT_OF_REACH decay timer -- exactly the state
  // cancelOutOfReachDecayInAnchorDisk looks for when the town anchor
  // reactivates at world-init.
  tiles.push({
    x: townTile.x + 1,
    y: townTile.y,
    terrain: "LAND",
    ownerId: townTile.ownerId,
    ownershipState: "FRONTIER",
    frontierDecayAt: FIXED_NOW_MS + 9_999_999,
    frontierDecayKind: "OUT_OF_REACH"
  });

  return { tiles, activeLocks: [] };
};

describe("simulation-service startup recovery — settled-anchor TDZ regression", () => {
  let commandStore: InMemorySimulationCommandStore;
  let eventStore: InMemorySimulationEventStore;
  let snapshotStore: InMemorySimulationSnapshotStore;

  beforeEach(async () => {
    commandStore = new InMemorySimulationCommandStore();
    eventStore = new InMemorySimulationEventStore();
    snapshotStore = new InMemorySimulationSnapshotStore();
    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 0,
      snapshotSections: { initialState: recoveredStateWithFrontierTileInTownDisk(), commandEvents: [] },
      createdAt: FIXED_NOW_MS
    });
  });

  it("does not throw 'Cannot access simulationMetrics before initialization' recovering a world with an owned FRONTIER/OUT_OF_REACH tile inside a settled town's reach disk", async () => {
    await expect(
      createSimulationService({
        commandStore,
        eventStore,
        snapshotStore,
        checkpointEveryEvents: 1,
        runtimeOptions: { now: () => FIXED_NOW_MS },
        seedProfile: "default",
        enableAiAutopilot: false,
        enableSystemAutopilot: false,
        allowSeedRecoveryFallback: true,
        port: 0
      })
    ).resolves.toBeDefined();
  }, 30_000);
});
