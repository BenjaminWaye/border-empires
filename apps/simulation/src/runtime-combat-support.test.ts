import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { attackerOutpostMult, buildLockedCombatResolution, previewSettledCapturePlunder, type RuntimeCombatSupportContext } from "./runtime-combat-support.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

function makePlayer(id: string, points: number): DomainPlayer {
  return { id, isAi: false, points, manpower: 0, techIds: new Set(), allies: new Set() };
}

function makeFoodTile(): DomainTileState {
  return { x: 9, y: 270, terrain: "FOREST", resource: "FOOD", ownershipState: "SETTLED" };
}

describe("previewSettledCapturePlunder", () => {
  it("does not fabricate strategic-resource plunder when capturing a FARM/FISH tile", () => {
    const plunder = previewSettledCapturePlunder({
      defender: makePlayer("player-defender", 100),
      defenderTileCountBeforeCapture: 5,
      target: makeFoodTile()
    });

    expect(plunder.strategic).toEqual({});
  });

  it("still computes gold plunder as a share of the defender's points", () => {
    const plunder = previewSettledCapturePlunder({
      defender: makePlayer("player-defender", 100),
      defenderTileCountBeforeCapture: 5,
      target: makeFoodTile()
    });

    expect(plunder.gold).toBe(20);
    expect(plunder.strategic).toEqual({});
  });

  it("barbarian captures use the fixed gold cap and never populate strategic", () => {
    const plunder = previewSettledCapturePlunder({
      defender: makePlayer("barbarian-1", 9999),
      defenderTileCountBeforeCapture: 1,
      target: makeFoodTile()
    });

    expect(plunder.gold).toBe(10);
    expect(plunder.strategic).toEqual({});
  });
});

describe("attackerOutpostMult", () => {
  const ATTACKER_ID = "player-attacker";
  const OUTPOST_KEY = simulationTileKey(10, 10);

  function makeOutpostContext(outpostTile: DomainTileState): RuntimeCombatSupportContext {
    const tiles = new Map<string, DomainTileState>([[OUTPOST_KEY, outpostTile]]);
    return {
      now: () => 0,
      players: new Map([[ATTACKER_ID, { id: ATTACKER_ID, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() }]]),
      tiles,
      locksByTile: new Map(),
      locksByCommandId: new Map(),
      barbarianTileProgress: new Map(),
      summaryForPlayer: () => ({ territoryTileKeys: new Set([OUTPOST_KEY]) }) as ReturnType<RuntimeCombatSupportContext["summaryForPlayer"]>,
      replaceTileState: () => {},
      tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
      tileDeltaRevealOnly: (tile) => ({ x: tile.x, y: tile.y }),
      emitEvent: () => {},
      emitPlayerStateUpdate: () => {},
      isStructureDormant: () => false,
      manpowerLossByTileKey: new Map(),
      ownedStructureCountForPlayer: () => 0
    };
  }

  it("still grants the attack bonus from a siege outpost sitting on a FRONTIER (unsettled) tile", () => {
    const context = makeOutpostContext({
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: ATTACKER_ID,
      ownershipState: "FRONTIER",
      siegeOutpost: { ownerId: ATTACKER_ID, status: "active", variant: "SIEGE_OUTPOST" }
    });

    // Target within the outpost's aura radius (chebyshev distance 4 <= 5).
    expect(attackerOutpostMult(context, ATTACKER_ID, 14, 10)).toBeGreaterThan(1);
  });
});

describe("buildLockedCombatResolution against a FRONTIER (undefended) target", () => {
  const ATTACKER_ID = "player-attacker";
  const DEFENDER_ID = "player-defender";
  const ORIGIN_KEY = simulationTileKey(5, 5);
  const TARGET_KEY = simulationTileKey(6, 5);

  function makeContext(tiles: Map<string, DomainTileState>, attackerManpower: number): RuntimeCombatSupportContext {
    return {
      now: () => 0,
      players: new Map([
        [ATTACKER_ID, { id: ATTACKER_ID, isAi: false, points: 0, manpower: attackerManpower, techIds: new Set(), allies: new Set() }],
        [DEFENDER_ID, { id: DEFENDER_ID, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() }]
      ]),
      tiles,
      locksByTile: new Map(),
      locksByCommandId: new Map(),
      barbarianTileProgress: new Map(),
      summaryForPlayer: () => ({ settledTileCount: 1 }) as ReturnType<RuntimeCombatSupportContext["summaryForPlayer"]>,
      replaceTileState: () => {},
      tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
      tileDeltaRevealOnly: (tile) => ({ x: tile.x, y: tile.y }),
      emitEvent: () => {},
      emitPlayerStateUpdate: () => {},
      isStructureDormant: () => false,
      manpowerLossByTileKey: new Map(),
      ownedStructureCountForPlayer: () => 0
    };
  }

  it("is a guaranteed capture, not a probabilistic roll -- even for a zero-effective-power attacker", () => {
    const tiles = new Map<string, DomainTileState>([
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "FRONTIER" }]
    ]);
    // Deliberately 0 manpower committed: with the general ATTACK combat roll
    // (resolveAttackCombat -> rollFrontierCombat), atkEff <= 0 forces
    // combatWinChance to return 0 -- an undefended tile should never be able
    // to "repel" an attack regardless of the attacker's own strength.
    const context = makeContext(tiles, 0);

    const resolution = buildLockedCombatResolution(context, {
      actionType: "ATTACK",
      commandId: "attack-1",
      playerId: ATTACKER_ID,
      manpowerCost: 0,
      originKey: ORIGIN_KEY,
      originX: 5,
      originY: 5,
      targetX: 6,
      targetY: 5,
      targetKey: TARGET_KEY
    });

    expect(resolution?.result.attackerWon).toBe(true);
  });
});
