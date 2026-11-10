import { describe, expect, it } from "vitest";

import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore, buildSimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";
import { InMemorySeasonSummaryStore } from "../season-summary-store.js";
import { createSimulationService } from "./simulation-service.js";

const PLAYER_ID = "player-1";

const bootSim = (stores: {
  commandStore: InMemorySimulationCommandStore;
  eventStore: InMemorySimulationEventStore;
  snapshotStore: InMemorySimulationSnapshotStore;
  seasonSummaryStore: InMemorySeasonSummaryStore;
}) =>
  createSimulationService({
    ...stores,
    checkpointEveryEvents: 1_000_000_000,
    seedProfile: "default",
    enableAiAutopilot: false,
    enableSystemAutopilot: false,
    allowSeedRecoveryFallback: true,
    port: 0
  });

describe("score history across a restart", () => {
  // Regression for bug report 364334a9 (season-41): the boot-time forced
  // summary persist wrote the fresh, empty sampler over the stored timeline,
  // so every deploy reset the Score Graph to a single sample per empire.
  it("keeps the persisted score timeline through the boot-time summary persist", async () => {
    const stores = {
      commandStore: new InMemorySimulationCommandStore(),
      eventStore: new InMemorySimulationEventStore(),
      snapshotStore: new InMemorySimulationSnapshotStore(),
      seasonSummaryStore: new InMemorySeasonSummaryStore()
    };
    await stores.snapshotStore.saveSnapshot({
      lastAppliedEventId: 0, createdAt: Date.now(),
      snapshotSections: buildSimulationSnapshotSections({
        initialState: {
          tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED" }],
          activeLocks: [],
          players: [{ id: PLAYER_ID, points: 100 }]
        }, commands: [], eventsByCommandId: new Map()
      })
    });
    const first = await bootSim(stores);
    await first.close();
    const stored = await stores.seasonSummaryStore.loadCurrentSummary();
    expect(stored).toBeDefined();
    const now = Date.now();
    const scoreHistory = [{ playerId: PLAYER_ID, playerName: "Waypoint", points: [
      { t: now - 2_000, score: 10 }, { t: now - 1_000, score: 20 }, { t: now - 500, score: 30 }
    ] }];
    await stores.seasonSummaryStore.saveCurrentSummary({ ...stored!, scoreHistory });

    const second = await bootSim(stores);
    const afterBoot = await stores.seasonSummaryStore.loadCurrentSummary();
    await second.close();

    expect(afterBoot?.scoreHistory?.[0]?.points.map((p) => p.score)).toEqual([10, 20, 30]);
  }, 90_000);
});
