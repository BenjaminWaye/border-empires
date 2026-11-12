import { describe, expect, it } from "vitest";

import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore, buildSimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";
import { loadSimulationStartupRecovery } from "./startup-recovery.js";

const SEASON_START = 10_000;

const season: NonNullable<RecoveredSimulationState["season"]> = {
  seasonId: "season-test", seasonSequence: 1, rulesetId: "seasonal-default", worldSeed: 1,
  status: "active", startedAt: SEASON_START, victoryTrackers: []
};

const ship = async (store: InMemorySimulationCommandStore, n: number, queuedAt: number, x = 5, y = 287): Promise<void> => {
  const commandId = `ship-${n}`;
  await store.persistQueuedCommand(
    { commandId, sessionId: "s", playerId: "player-1", clientSeq: n, issuedAt: queuedAt, type: "SHIP_SALVAGE_TO_COURT", payloadJson: JSON.stringify({ x, y }) },
    queuedAt
  );
  await store.markResolved(commandId, queuedAt + 1);
};

const recover = async (commandStore: InMemorySimulationCommandStore) => {
  const snapshotStore = new InMemorySimulationSnapshotStore();
  await snapshotStore.saveSnapshot({
    lastAppliedEventId: 0,
    snapshotSections: buildSimulationSnapshotSections({
      // What a pre-#2723 checkpoint loads as: the emptied field's resource back from worldgen, no Works.
      initialState: {
        tiles: [{ x: 5, y: 287, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "PRECURSOR_SALVAGE" }],
        activeLocks: [],
        season
      },
      commands: [],
      eventsByCommandId: new Map()
    }),
    createdAt: 1_000
  });
  const recovery = await loadSimulationStartupRecovery({ commandStore, eventStore: new InMemorySimulationEventStore(), snapshotStore });
  return recovery.initialState.tiles.find((tile) => tile.x === 5 && tile.y === 287);
};

describe("startup recovery: emptied salvage field backfill", () => {
  it("clears a field this season's shipments show was emptied before the persisted clear", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    for (const n of [1, 2, 3]) await ship(commandStore, n, SEASON_START + n);
    const tile = await recover(commandStore);
    expect(tile).not.toHaveProperty("resource");
    expect(tile?.ownerId).toBe("player-1");
  });

  it("ignores shipments from before the current season started", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    for (const n of [1, 2, 3]) await ship(commandStore, n, SEASON_START - 100 + n);
    expect((await recover(commandStore))?.resource).toBe("PRECURSOR_SALVAGE");
  });
});
