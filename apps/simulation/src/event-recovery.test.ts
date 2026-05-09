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

  it("preserves terrain, resource, dockId, and town on COMBAT_RESOLVED replay when capture follow-up tile delta is missing", () => {
    const recovered = applySimulationEventsToRecoveredState(
      {
        tiles: [
          {
            x: 9,
            y: 270,
            terrain: "FOREST",
            resource: "FOOD",
            dockId: "dock-7",
            ownerId: "player-defender",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "TOWN", name: "SAND" }
          }
        ],
        activeLocks: []
      },
      [
        {
          eventType: "COMBAT_RESOLVED",
          commandId: "cmd-3",
          playerId: "player-attacker",
          originX: 8,
          originY: 270,
          targetX: 9,
          targetY: 270,
          attackerWon: true
        }
      ]
    );

    const target = recovered.tiles.find((tile) => tile.x === 9 && tile.y === 270);
    expect(target).toBeDefined();
    expect(target?.ownerId).toBe("player-attacker");
    expect(target?.ownershipState).toBe("FRONTIER");
    expect(target?.terrain).toBe("FOREST");
    expect(target?.resource).toBe("FOOD");
    expect(target?.dockId).toBe("dock-7");
    expect(target?.town?.name).toBe("SAND");
    expect(target?.town?.populationTier).toBe("TOWN");
  });

  it("transfers origin to defender on COMBAT_RESOLVED replay when origin was lost in a failed attack", () => {
    const recovered = applySimulationEventsToRecoveredState(
      {
        tiles: [
          {
            x: 8,
            y: 270,
            terrain: "FOREST",
            resource: "FOOD",
            ownerId: "player-attacker",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "TOWN", name: "ATTACKER_HOME" }
          },
          {
            x: 9,
            y: 270,
            terrain: "LAND",
            ownerId: "player-defender",
            ownershipState: "SETTLED"
          }
        ],
        activeLocks: []
      },
      [
        {
          eventType: "COMBAT_RESOLVED",
          commandId: "cmd-4",
          playerId: "player-attacker",
          actionType: "ATTACK",
          originX: 8,
          originY: 270,
          targetX: 9,
          targetY: 270,
          attackerWon: false,
          combatResult: {
            attackType: "ATTACK",
            attackerWon: false,
            defenderOwnerId: "player-defender",
            origin: { x: 8, y: 270 },
            target: { x: 9, y: 270 },
            changes: [{ x: 8, y: 270, ownerId: "player-defender", ownershipState: "FRONTIER" }],
            pointsDelta: 0,
            manpowerDelta: 0,
            pillagedGold: 0,
            pillagedShare: 0,
            pillagedStrategic: {},
            atkEff: 0,
            defEff: 0,
            winChance: 0,
            levelDelta: 0
          }
        }
      ]
    );

    const origin = recovered.tiles.find((tile) => tile.x === 8 && tile.y === 270);
    expect(origin).toBeDefined();
    expect(origin?.ownerId).toBe("player-defender");
    expect(origin?.ownershipState).toBe("FRONTIER");
    expect(origin?.terrain).toBe("FOREST");
    expect(origin?.resource).toBe("FOOD");
    expect(origin?.town).toBeUndefined();
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

  it("clears cancelled accepted frontier locks from recovered state", () => {
    const recovered = recoverSimulationStateFromEvents([
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "expand-cmd-1",
        playerId: "player-1",
        actionType: "EXPAND",
        originX: 10,
        originY: 10,
        targetX: 11,
        targetY: 10,
        resolvesAt: 3000
      },
      {
        eventType: "COMBAT_CANCELLED",
        commandId: "cancel-capture-1",
        playerId: "player-1",
        count: 1,
        cancelledCommandIds: ["expand-cmd-1"]
      }
    ]);

    expect(recovered.activeLocks).toEqual([]);
  });
});
