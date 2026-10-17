import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it, vi } from "vitest";
import { resolveLock, type RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";
import type { LockRecord, SimulationTileWireDelta } from "./runtime-types.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { CombatLockIndex } from "./combat-lock-index/combat-lock-index.js";

/**
 * Out-of-reach auto-settle: a captured/claimed town or dock beyond reach
 * tries to settle itself immediately, since SETTLE is reach-gated and it's the
 * anchor that would otherwise be needed to ever settle it. Resource/wonder
 * tiles get no such treatment; they just stay FRONTIER.
 *
 * Out-of-reach FRONTIER no longer decays, so no capture here may ever carry a
 * frontier decay timer (regression for the removed OUT_OF_REACH stamp).
 */

const ATTACKER_ID = "player-1";
const DEFENDER_ID = "player-2";
const ORIGIN_KEY = simulationTileKey(5, 5);
const TARGET_KEY = simulationTileKey(6, 5);

const makePlayer = (id: string): DomainPlayer => ({ id, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() });

type ContextOptions = {
  outOfReach: boolean;
  canAutoSettle: boolean;
};

function createContext(tiles: Map<string, DomainTileState>, options: ContextOptions) {
  const events: SimulationEvent[] = [];
  const autoSettleCapturedAnchor = vi.fn((_playerId: string, targetKey: string, target: DomainTileState) => {
    tiles.set(targetKey, target); // mirrors startSettlementProcess leaving the tile FRONTIER, in-flight
  });
  const canAutoSettleCapturedAnchor = vi.fn(() => options.canAutoSettle);
  const context: RuntimeLockResolutionContext = {
    players: new Map([[ATTACKER_ID, makePlayer(ATTACKER_ID)], [DEFENDER_ID, makePlayer(DEFENDER_ID)]]),
    tiles,
    locksByTile: new CombatLockIndex(),
    locksByCommandId: new Map(),
    musterReservedByKey: new Map(),
    barbarianTileProgress: new Map(),
    now: () => 1_000,
    emitEvent: (event) => { events.push(event); },
    emitPlayerStateUpdate: () => {},
    replaceTileState: (tileKey, tile) => { tiles.set(tileKey, tile); },
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y, ownerId: tile.ownerId, ownershipState: tile.ownershipState }) as SimulationTileWireDelta,
    buildCaptureRevealTileDeltas: () => [],
    buildLockedCombatResolution: () => undefined,
    isTileShieldedByAegisLock: () => false,
    consumeOriginMuster: () => {},
    applyLockedManpowerDelta: () => 0,
    applySettledCapturePlunder: () => {},
    playerManpowerCap: () => 0,
    extendFortPatrolGrace: () => {},
    clearFortPatrolGrace: () => {},
    onCaptureRevealBuilt: undefined,
    applyBarbarianWalkOrMultiply: () => {},
    applyEncirclement: () => {},
    applyEncirclementForExpand: () => {},
    relocateSettlementForPlayer: () => false,
    summaryForPlayer: () => ({ territoryTileKeys: new Set() }) as ReturnType<RuntimeLockResolutionContext["summaryForPlayer"]>,
    respawnPlayerOnUnownedLand: () => false,
    respawnIfEliminated: () => {},
    ensureGrossIncomeSettlementForPlayer: () => false,
    maybeActivateWatchtower: () => {},
    maybeActivateWaystation: () => {},
    maybeDrainClaimContinuation: () => {},
    isTileBeyondReach: () => options.outOfReach,
    canAutoSettleCapturedAnchor,
    autoSettleCapturedAnchor,
    tryDrainWaypointQueue: () => {}
  };
  return { context, events, autoSettleCapturedAnchor, canAutoSettleCapturedAnchor };
}

/** Registers a lock in both lock maps the way the runtime does before resolving it -- resolveLock bails out immediately otherwise. */
function lockTile(context: RuntimeLockResolutionContext, lock: LockRecord): void {
  context.locksByTile.addLock(lock);
  context.locksByCommandId.set(lock.commandId, lock);
}

/** A won ATTACK lock capturing TARGET_KEY from DEFENDER_ID. */
function makeWonAttackLock(): LockRecord {
  return {
    commandId: "attack-1",
    playerId: ATTACKER_ID,
    actionType: "ATTACK",
    manpowerCost: 100,
    originX: 5,
    originY: 5,
    targetX: 6,
    targetY: 5,
    targetKey: TARGET_KEY,
    originKey: ORIGIN_KEY,
    resolvesAt: 0,
    source: "player",
    combatResolution: {
      result: {
        attackType: "ATTACK",
        attackerWon: true,
        winnerId: ATTACKER_ID,
        defenderOwnerId: DEFENDER_ID,
        origin: { x: 5, y: 5 },
        target: { x: 6, y: 5 },
        changes: [],
        pointsDelta: 0,
        manpowerDelta: -50,
        pillagedGold: 0,
        pillagedShare: 0,
        pillagedStrategic: {},
        atkEff: 2,
        defEff: 1,
        winChance: 0.9,
        levelDelta: 0
      },
      defenderGoldLoss: 0,
      targetRecentlyPillaged: false
    }
  };
}

const originTile = (): DomainTileState => ({ x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" });

describe("resolveLock — out-of-reach auto-settle for captured towns/docks", () => {
  it("auto-settles a captured town outside reach when the player can afford it", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", name: "Rival Town" } }]
    ]);
    const { context, autoSettleCapturedAnchor } = createContext(tiles, { outOfReach: true, canAutoSettle: true });
    const lock = makeWonAttackLock();
    lockTile(context, lock);

    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.ownerId).toBe(ATTACKER_ID);
    expect(target?.town).toBeDefined();
    expect(target?.frontierDecayAt).toBeUndefined();
    expect(target?.frontierDecayKind).toBeUndefined();
    expect(autoSettleCapturedAnchor).toHaveBeenCalledTimes(1);
    expect(autoSettleCapturedAnchor).toHaveBeenCalledWith(ATTACKER_ID, TARGET_KEY, expect.objectContaining({ town: expect.anything() }), "attack-1");
  });

  it("auto-settles a captured dock outside reach", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", dockId: "dock-a" }]
    ]);
    const { context, autoSettleCapturedAnchor } = createContext(tiles, { outOfReach: true, canAutoSettle: true });

    const lock = makeWonAttackLock();
    lockTile(context, lock);
    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.dockId).toBe("dock-a");
    expect(target?.frontierDecayKind).toBeUndefined();
    expect(autoSettleCapturedAnchor).toHaveBeenCalledTimes(1);
  });

  it("leaves the town FRONTIER with no decay timer when the player can't afford to auto-settle", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", name: "Rival Town" } }]
    ]);
    const { context, autoSettleCapturedAnchor } = createContext(tiles, { outOfReach: true, canAutoSettle: false });

    const lock = makeWonAttackLock();
    lockTile(context, lock);
    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.ownerId).toBe(ATTACKER_ID);
    expect(target?.ownershipState).toBe("FRONTIER");
    expect(target?.frontierDecayAt).toBeUndefined();
    expect(target?.frontierDecayKind).toBeUndefined();
    expect(autoSettleCapturedAnchor).not.toHaveBeenCalled();
  });

  it("does not auto-settle a plain resource tile -- it stays FRONTIER, with no decay timer", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", resource: "TITANIUM" }]
    ]);
    const { context, autoSettleCapturedAnchor, canAutoSettleCapturedAnchor } = createContext(tiles, { outOfReach: true, canAutoSettle: true });

    const lock = makeWonAttackLock();
    lockTile(context, lock);
    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.ownershipState).toBe("FRONTIER");
    expect(target?.frontierDecayAt).toBeUndefined();
    expect(target?.frontierDecayKind).toBeUndefined();
    expect(autoSettleCapturedAnchor).not.toHaveBeenCalled();
    expect(canAutoSettleCapturedAnchor).not.toHaveBeenCalled(); // isAnchorStructureTile short-circuits first
  });

  it("does not attempt auto-settle for a town captured inside reach", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", name: "Rival Town" } }]
    ]);
    const { context, autoSettleCapturedAnchor, canAutoSettleCapturedAnchor } = createContext(tiles, { outOfReach: false, canAutoSettle: true });

    const lock = makeWonAttackLock();
    lockTile(context, lock);
    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.ownershipState).toBe("FRONTIER"); // ordinary capture-then-settle flow, unchanged
    expect(target?.frontierDecayKind).toBeUndefined();
    expect(autoSettleCapturedAnchor).not.toHaveBeenCalled();
    expect(canAutoSettleCapturedAnchor).not.toHaveBeenCalled();
  });
});
