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
    const before = Date.now();
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
    expect(typeof target?.town?.populationBeforeCapture).toBe("number");
    expect(target!.town!.populationBeforeCapture).toBe(800);
    expect(typeof target?.town?.captureShockUntil).toBe("number");
    expect(target!.town!.captureShockUntil).toBeGreaterThan(before);
    expect(target!.town!.captureShockUntil).toBeLessThan(before + 610_000);
    expect(typeof target?.town?.population).toBe("number");
    expect(target!.town!.population).toBeLessThan(800);
  });

  it("destroys SETTLEMENT-tier towns on COMBAT_RESOLVED replay to match live capture aftermath", () => {
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
            town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Settlement 9,270" }
          }
        ],
        activeLocks: []
      },
      [
        {
          eventType: "COMBAT_RESOLVED",
          commandId: "cmd-s1",
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
    expect(target?.town).toBeUndefined();
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
    expect(origin?.town).toEqual(expect.objectContaining({ name: "ATTACKER_HOME", populationTier: "TOWN" }));
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

  // The per-tile yield buffer was retired, but event logs written before that
  // change still hold its anchor/epoch events — replay must skip them rather
  // than throw or resurrect the removed per-tile anchor state.
  it("ignores retired yield-anchor events replayed from an old event log", () => {
    const retiredEvents = [
      { eventType: "TILE_YIELD_ANCHOR_UPDATED", commandId: "collect-1", playerId: "player-1", tileKey: "5,5", collectedAt: 9_000 },
      { eventType: "TILE_YIELD_ANCHOR_BATCH", commandId: "accrual-1", playerId: "player-1", anchors: [{ tileKey: "5,5", collectedAt: 9_500 }] },
      { eventType: "PLAYER_YIELD_COLLECTION_EPOCH_UPDATED", commandId: "collect-visible-1", playerId: "player-1", collectedAt: 9_900 }
    ] as unknown as Parameters<typeof applySimulationEventsToRecoveredState>[1];

    const recovered = applySimulationEventsToRecoveredState(
      {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Settlement 5,5" }
          }
        ],
        activeLocks: [],
        playerYieldCollectionEpochByPlayer: [{ playerId: "player-1", collectedAt: 2_000 }]
      },
      retiredEvents
    );

    expect(recovered).not.toHaveProperty("tileYieldCollectedAtByTile");
    // The passive-income epoch is only ever persisted via snapshots now.
    expect(recovered.playerYieldCollectionEpochByPlayer).toEqual([{ playerId: "player-1", collectedAt: 2_000 }]);
    expect(recovered.tiles).toHaveLength(1);
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

  it("replays TECH_UPDATE and DOMAIN_UPDATE events onto the checkpointed player instead of dropping them", () => {
    const recovered = applySimulationEventsToRecoveredState(
      {
        tiles: [],
        activeLocks: [],
        players: [
          {
            id: "player-1",
            techIds: ["masonry"],
            domainIds: [],
            points: 100
          }
        ],
        pendingSettlements: [],
        playerYieldCollectionEpochByPlayer: []
      },
      [
        {
          eventType: "TECH_UPDATE",
          commandId: "tech-cmd-1",
          playerId: "player-1",
          payloadJson: JSON.stringify({ techIds: ["masonry", "trade"], gold: 70 })
        },
        {
          eventType: "DOMAIN_UPDATE",
          commandId: "domain-cmd-1",
          playerId: "player-1",
          payloadJson: JSON.stringify({ techIds: ["masonry", "trade"], domainIds: ["mercantile"], gold: 40 })
        }
      ]
    );

    const player = recovered.players?.find((entry) => entry.id === "player-1");
    expect(player?.techIds).toEqual(["masonry", "trade"]);
    expect(player?.domainIds).toEqual(["mercantile"]);
    expect(player?.points).toBe(40);
  });

  it("replays an OUT_OF_REACH frontierDecayKind from a TILE_DELTA_BATCH, not just ENCIRCLEMENT", () => {
    // Regression: the merge below used to hardcode `=== "ENCIRCLEMENT"`, so
    // any other kind (including OUT_OF_REACH) fell into the "explicit clear"
    // branch and silently vanished on recovery -- the tile kept its
    // frontierDecayAt deadline but lost the kind that says what it means.
    const recovered = applySimulationEventsToRecoveredState(
      {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
        activeLocks: [],
        players: [],
        pendingSettlements: [],
        playerYieldCollectionEpochByPlayer: []
      },
      [
        {
          eventType: "TILE_DELTA_BATCH",
          commandId: "claim-1",
          playerId: "player-1",
          tileDeltas: [{ x: 10, y: 10, frontierDecayAt: 120_000, frontierDecayKind: "OUT_OF_REACH" }]
        }
      ]
    );

    const tile = recovered.tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.frontierDecayAt).toBe(120_000);
    expect(tile?.frontierDecayKind).toBe("OUT_OF_REACH");
  });

  it("preserves an already-decaying tile's frontierDecayKind straight through recovery with no replayed events", () => {
    // Regression: cloneRecoveredTile (used both to seed the accumulator from
    // baseState.tiles and to build the final output array) never copied
    // frontierDecayKind at all -- it silently dropped on every recovery,
    // independent of any TILE_DELTA_BATCH replay logic.
    const recovered = applySimulationEventsToRecoveredState(
      {
        tiles: [
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayAt: 60_000, frontierDecayKind: "OUT_OF_REACH" }
        ],
        activeLocks: [],
        players: [],
        pendingSettlements: [],
        playerYieldCollectionEpochByPlayer: []
      },
      []
    );

    const tile = recovered.tiles.find((t) => t.x === 20 && t.y === 20);
    expect(tile?.frontierDecayAt).toBe(60_000);
    expect(tile?.frontierDecayKind).toBe("OUT_OF_REACH");
  });

  // Regression: recovery rebuilt tiles field by field and dropped
  // prospectSignature, so every restart erased the worldgen resource clues
  // (and with them every occupation-survey hit).
  it("keeps prospectSignature through recovery and an unrelated tile delta", () => {
    const recovered = applySimulationEventsToRecoveredState(
      {
        tiles: [{ x: 30, y: 30, terrain: "LAND", prospectSignature: "FERROUS_DUST" }],
        activeLocks: [],
        players: [],
        pendingSettlements: [],
        playerYieldCollectionEpochByPlayer: []
      },
      [{ eventType: "TILE_DELTA_BATCH", commandId: "claim-2", playerId: "player-1", tileDeltas: [{ x: 30, y: 30, ownerId: "player-1", ownershipState: "FRONTIER" }] }]
    );

    expect(recovered.tiles.find((t) => t.x === 30 && t.y === 30)?.prospectSignature).toBe("FERROUS_DUST");
  });
});
