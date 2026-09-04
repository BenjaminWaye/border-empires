import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it, vi } from "vitest";
import { handleAetherLanceCommand, type RuntimeAbilityCommandContext } from "./runtime-ability-command-handlers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

/**
 * Aether Lance purges a hostile tile's ownership directly via
 * context.replaceTileState, entirely outside the border/anchor machinery
 * settleOvertaken normally hooks the stranded-settled-tile sweep into (see
 * runtime-reach-stranded-sweep.ts). A purged corridor tile is just as capable
 * of stranding the previous owner's other settled ground as a border
 * retraction or an ATTACK capture is, so handleAetherLanceCommand must
 * trigger the same sweep.
 */

const ACTOR_ID = "player-1";
const DEFENDER_ID = "player-2";
const TARGET_X = 6;
const TARGET_Y = 5;
const TARGET_KEY = simulationTileKey(TARGET_X, TARGET_Y);
const OBSERVATORY_KEY = simulationTileKey(5, 5);

const makePlayer = (id: string): DomainPlayer =>
  ({ id, isAi: false, points: 0, manpower: 0, techIds: new Set(["crystal-lattices"]), allies: new Set(), strategicResources: {} }) as DomainPlayer;

function createContext(tiles: Map<string, DomainTileState>) {
  const events: unknown[] = [];
  const strandedSettledSweep = vi.fn();
  const context: RuntimeAbilityCommandContext = {
    players: new Map([[ACTOR_ID, makePlayer(ACTOR_ID)], [DEFENDER_ID, makePlayer(DEFENDER_ID)]]),
    tiles,
    activeAetherBridgesByPlayer: new Map(),
    activeAetherWallsByPlayer: new Map(),
    now: () => 1_000,
    emitEvent: (event) => { events.push(event); },
    emitPlayerMessage: () => {},
    revealTargetsForPlayer: () => new Set(),
    revealCapacityForPlayer: () => 0,
    spendStrategicResource: () => true,
    pickReadyOwnedObservatoryAny: () => undefined,
    pickReadyOwnedObservatoryForTarget: () => OBSERVATORY_KEY,
    stampObservatoryCooldown: () => {},
    buildRevealEmpireStats: () => ({}),
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y, ownerId: tile.ownerId, ownershipState: tile.ownershipState }),
    filterTileDeltasForPlayer: () => [],
    isTileShieldedByEnemyAegisDome: () => false,
    isStructureDormant: () => false,
    replaceTileState: (tileKey, tile) => { tiles.set(tileKey, tile); },
    isCoastalLand: () => false,
    closestAetherBridgeOrigin: () => undefined,
    wallSegments: () => [],
    activeAetherBridgesForPlayer: () => [],
    activeAetherWallsForPlayer: () => [],
    crossingBlockedByAetherWall: () => false,
    reachBorderOwnerAt: () => undefined,
    grantAetherBridgeReach: () => {},
    strandedSettledSweep
  };
  return { context, events, strandedSettledSweep };
}

function makeCommand(): CommandEnvelope {
  return {
    commandId: "lance-1",
    playerId: ACTOR_ID,
    type: "AETHER_LANCE",
    payloadJson: JSON.stringify({ x: TARGET_X, y: TARGET_Y })
  } as CommandEnvelope;
}

describe("handleAetherLanceCommand — stranded-settled sweep", () => {
  it("sweeps the previous owner's territory when purging their settled tile", () => {
    const tiles = new Map<string, DomainTileState>([
      [TARGET_KEY, { x: TARGET_X, y: TARGET_Y, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED" }]
    ]);
    const { context, strandedSettledSweep } = createContext(tiles);

    handleAetherLanceCommand(context, makeCommand());

    expect(strandedSettledSweep).toHaveBeenCalledTimes(1);
    const [seedKeys, ownerId, causeCommandId] = strandedSettledSweep.mock.calls[0]!;
    expect(ownerId).toBe(DEFENDER_ID);
    expect(causeCommandId).toBe("lance-1");
    expect(seedKeys).toHaveLength(8);
    expect(seedKeys).not.toContain(TARGET_KEY);
  });

  it("does not sweep barbarian land -- it is environment, not a bordered empire", () => {
    const tiles = new Map<string, DomainTileState>([
      [TARGET_KEY, { x: TARGET_X, y: TARGET_Y, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }]
    ]);
    const { context, strandedSettledSweep } = createContext(tiles);

    handleAetherLanceCommand(context, makeCommand());

    expect(strandedSettledSweep).not.toHaveBeenCalled();
  });
});
