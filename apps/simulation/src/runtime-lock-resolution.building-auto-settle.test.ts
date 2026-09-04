import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it, vi } from "vitest";
import { resolveLock, type RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";
import type { LockRecord, SimulationTileWireDelta } from "./runtime-types.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

/**
 * Captured forts and economic structures auto-settle immediately (same
 * cost/dev-slot gate as a manual SETTLE, or as the anchor-town/dock case in
 * runtime-lock-resolution.out-of-reach-auto-settle.test.ts) instead of
 * sitting FRONTIER and idle -- an unsettled building produces no income and
 * is barely defensible.
 */

const ATTACKER_ID = "player-1";
const DEFENDER_ID = "player-2";
const ORIGIN_KEY = simulationTileKey(5, 5);
const TARGET_KEY = simulationTileKey(6, 5);

const makePlayer = (id: string): DomainPlayer => ({ id, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() });

function createContext(tiles: Map<string, DomainTileState>, options: { canAutoSettle: boolean }) {
  const events: SimulationEvent[] = [];
  const registerOutOfReachDecay = vi.fn();
  const autoSettleCapturedAnchor = vi.fn((_playerId: string, targetKey: string, target: DomainTileState) => {
    tiles.set(targetKey, target);
  });
  const canAutoSettleCapturedAnchor = vi.fn(() => options.canAutoSettle);
  const context: RuntimeLockResolutionContext = {
    players: new Map([[ATTACKER_ID, makePlayer(ATTACKER_ID)], [DEFENDER_ID, makePlayer(DEFENDER_ID)]]),
    tiles,
    locksByTile: new Map(),
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
    maybeDrainClaimContinuation: () => {},
    outOfReachDecayDeadline: () => undefined,
    registerOutOfReachDecay,
    canAutoSettleCapturedAnchor,
    autoSettleCapturedAnchor,
    tryDrainWaypointQueue: () => {}
  };
  return { context, autoSettleCapturedAnchor, canAutoSettleCapturedAnchor };
}

function lockTile(context: RuntimeLockResolutionContext, lock: LockRecord): void {
  context.locksByTile.set(lock.originKey, lock);
  context.locksByTile.set(lock.targetKey, lock);
  context.locksByCommandId.set(lock.commandId, lock);
}

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

describe("resolveLock — auto-settle for captured forts and economic structures", () => {
  it("auto-settles a captured active fort when the player can afford it", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", fort: { ownerId: DEFENDER_ID, status: "active", activatedAt: 0 } }]
    ]);
    const { context, autoSettleCapturedAnchor } = createContext(tiles, { canAutoSettle: true });
    const lock = makeWonAttackLock();
    lockTile(context, lock);

    resolveLock(context, lock);

    expect(autoSettleCapturedAnchor).toHaveBeenCalledTimes(1);
    expect(autoSettleCapturedAnchor).toHaveBeenCalledWith(ATTACKER_ID, TARGET_KEY, expect.objectContaining({ fort: expect.objectContaining({ ownerId: ATTACKER_ID }) }), "attack-1");
  });

  it("auto-settles a captured active economic structure when the player can afford it", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", economicStructure: { type: "MINE", ownerId: DEFENDER_ID, status: "active", activatedAt: 0 } }]
    ]);
    const { context, autoSettleCapturedAnchor } = createContext(tiles, { canAutoSettle: true });
    const lock = makeWonAttackLock();
    lockTile(context, lock);

    resolveLock(context, lock);

    expect(autoSettleCapturedAnchor).toHaveBeenCalledTimes(1);
    expect(autoSettleCapturedAnchor).toHaveBeenCalledWith(ATTACKER_ID, TARGET_KEY, expect.objectContaining({ economicStructure: expect.objectContaining({ ownerId: ATTACKER_ID }) }), "attack-1");
  });

  it("falls back to plain FRONTIER when the player can't afford to auto-settle a captured fort", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", fort: { ownerId: DEFENDER_ID, status: "active", activatedAt: 0 } }]
    ]);
    const { context, autoSettleCapturedAnchor } = createContext(tiles, { canAutoSettle: false });
    const lock = makeWonAttackLock();
    lockTile(context, lock);

    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.ownerId).toBe(ATTACKER_ID);
    expect(target?.ownershipState).toBe("FRONTIER");
    expect(autoSettleCapturedAnchor).not.toHaveBeenCalled();
  });

  it("does not attempt auto-settle for a plain resource tile with no building", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", resource: "TITANIUM" }]
    ]);
    const { context, autoSettleCapturedAnchor, canAutoSettleCapturedAnchor } = createContext(tiles, { canAutoSettle: true });
    const lock = makeWonAttackLock();
    lockTile(context, lock);

    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.ownershipState).toBe("FRONTIER");
    expect(autoSettleCapturedAnchor).not.toHaveBeenCalled();
    expect(canAutoSettleCapturedAnchor).not.toHaveBeenCalled();
  });
});
