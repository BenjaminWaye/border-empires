import { describe, expect, it } from "vitest";

import { applySimulationEventsToRecoveredState, recoverSimulationStateFromEvents } from "./event-recovery.js";

describe("recoverSimulationStateFromEvents", () => {
  it("rebuilds tile ownership and clears completed locks from event history", () => {
    const recovered = recoverSimulationStateFromEvents([
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-1",
        playerId: "player-1",
        actionType: "ATTACK",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        resolvesAt: 2000
      },
      {
        eventType: "COMBAT_RESOLVED",
        commandId: "cmd-1",
        playerId: "player-1",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        attackerWon: true
      }
    ]);

    expect(recovered.activeLocks).toEqual([]);
    expect(recovered.tiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x: 10,
          y: 11,
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      ])
    );
  });

  it("keeps unresolved accepted locks in recovered state", () => {
    const recovered = recoverSimulationStateFromEvents([
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-2",
        playerId: "player-1",
        actionType: "ATTACK",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        resolvesAt: 3000
      }
    ]);

    expect(recovered.activeLocks).toEqual([
      {
        commandId: "cmd-2",
        playerId: "player-1",
        actionType: "ATTACK",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        originKey: "10,10",
        targetKey: "10,11",
        resolvesAt: 3000
      }
    ]);
  });

  it("applies tile-delta batches so post-checkpoint settle/capture state survives restart recovery", () => {
    const recovered = applySimulationEventsToRecoveredState(
      {
        tiles: [{ x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "FISH" }],
        activeLocks: []
      },
      [
        {
          eventType: "TILE_DELTA_BATCH",
          commandId: "settle-1",
          playerId: "player-1",
          tileDeltas: [
            {
              x: 5,
              y: 5,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              resource: "FISH",
              townType: "FARMING",
              townName: "Settlement 5,5",
              townPopulationTier: "SETTLEMENT"
            }
          ]
        }
      ]
    );

    expect(recovered.tiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x: 5,
          y: 5,
          ownerId: "player-1",
          ownershipState: "SETTLED",
          resource: "FISH",
          town: expect.objectContaining({
            type: "FARMING",
            name: "Settlement 5,5",
            populationTier: "SETTLEMENT"
          })
        })
      ])
    );
  });

  it("replays player updates and tech/domain payloads into recovered player state", () => {
    const recovered = applySimulationEventsToRecoveredState(
      {
        tiles: [],
        activeLocks: [],
        players: [{ id: "ai-1", isAi: true, points: 0, manpower: 150, vision: 1, incomeMultiplier: 1 }]
      },
      [
        {
          eventType: "PLAYER_MESSAGE",
          commandId: "player-1",
          playerId: "ai-1",
          messageType: "PLAYER_UPDATE",
          payloadJson: JSON.stringify({
            type: "PLAYER_UPDATE",
            gold: 42,
            manpower: 120,
            manpowerCap: 200,
            strategicResources: { FOOD: 7, IRON: 1 }
          })
        },
        {
          eventType: "TECH_UPDATE",
          commandId: "tech-1",
          playerId: "ai-1",
          payloadJson: JSON.stringify({
            techIds: ["cartography", "breach-doctrine"],
            mods: { vision: 1.5, income: 1.2 }
          })
        }
      ]
    );

    expect(recovered.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ai-1",
          points: 42,
          manpower: 120,
          manpowerCapSnapshot: 200,
          vision: 1.5,
          incomeMultiplier: 1.2,
          techIds: ["cartography", "breach-doctrine"],
          strategicResources: expect.objectContaining({ FOOD: 7, IRON: 1 })
        })
      ])
    );
  });
});
