import { describe, expect, it } from "vitest";

import { InMemorySimulationSnapshotStore, buildSimulationSnapshotSections } from "./snapshot-store.js";

describe("InMemorySimulationSnapshotStore", () => {
  it("saves and loads the latest snapshot", async () => {
    const store = new InMemorySimulationSnapshotStore();
    const snapshotSections = buildSimulationSnapshotSections({
      initialState: {
        tiles: [{ x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" }],
        activeLocks: []
      },
      commands: [
        {
          commandId: "cmd-1",
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq: 1,
          type: "ATTACK",
          payloadJson: "{}",
          queuedAt: 1000,
          status: "RESOLVED",
          resolvedAt: 1200
        }
      ],
      eventsByCommandId: new Map([
        [
          "cmd-1",
          [
            {
              eventType: "COMBAT_RESOLVED" as const,
              commandId: "cmd-1",
              playerId: "player-1",
              originX: 10,
              originY: 10,
              targetX: 10,
              targetY: 11,
              attackerWon: true
            }
          ]
        ]
      ])
    });

    await store.saveSnapshot({
      lastAppliedEventId: 3,
      snapshotSections,
      createdAt: 1000
    });

    await expect(store.loadLatestSnapshot()).resolves.toMatchObject({
      snapshotId: 1,
      lastAppliedEventId: 3,
      createdAt: 1000,
      snapshotPayload: {
        initialState: {
          tiles: [{ x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" }]
        },
        commandEvents: []
      }
    });
  });
});
