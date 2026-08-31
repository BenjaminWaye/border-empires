import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it, vi } from "vitest";
import { resolveLock, type RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";
import type { LockRecord, SimulationTileWireDelta } from "./runtime-types.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

/**
 * Out-of-reach auto-settle: a captured/claimed town or dock tries to settle
 * itself immediately instead of decaying, since it's the reach anchor that
 * would otherwise be needed to save it -- decaying it away is a dead end.
 * Resource/wonder tiles get no such treatment; they just decay normally.
 */

const ATTACKER_ID = "player-1";
const DEFENDER_ID = "player-2";
const ORIGIN_KEY = simulationTileKey(5, 5);
const TARGET_KEY = simulationTileKey(6, 5);
const OUT_OF_REACH_DEADLINE = 120_000;

const makePlayer = (id: string, options?: { funded?: boolean }): DomainPlayer => ({
  id,
  isAi: false,
  points: options?.funded ? 1_000 : 0,
  manpower: options?.funded ? 1_000 : 0,
  techIds: new Set(),
  allies: new Set()
});

type ContextOptions = {
  outOfReach: boolean;
  canAutoSettle: boolean;
  /** Whether the attacker has enough gold/manpower to afford a settle -- see settleRejectionForActor. Defaults to false (matches the existing 0/0 makePlayer). */
  funded?: boolean;
  /** Return value for queueCapturedAnchorSettle -- whether the dev-queue enqueue actually succeeded. */
  settleQueueAccepted?: boolean;
};

function createContext(tiles: Map<string, DomainTileState>, options: ContextOptions) {
  const events: SimulationEvent[] = [];
  const registerOutOfReachDecay = vi.fn();
  const autoSettleCapturedAnchor = vi.fn((_playerId: string, targetKey: string, target: DomainTileState) => {
    tiles.set(targetKey, target); // mirrors startSettlementProcess leaving the tile FRONTIER, in-flight
  });
  const canAutoSettleCapturedAnchor = vi.fn(() => options.canAutoSettle);
  const queueCapturedAnchorSettle = vi.fn(() => options.settleQueueAccepted ?? true);
  const context: RuntimeLockResolutionContext = {
    players: new Map([[ATTACKER_ID, makePlayer(ATTACKER_ID, { funded: options.funded })], [DEFENDER_ID, makePlayer(DEFENDER_ID)]]),
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
    applyFortGarrisonAttrition: () => {},
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
    outOfReachDecayDeadline: () => (options.outOfReach ? OUT_OF_REACH_DEADLINE : undefined),
    registerOutOfReachDecay,
    canAutoSettleCapturedAnchor,
    autoSettleCapturedAnchor,
    queueCapturedAnchorSettle,
    tryDrainWaypointQueue: () => {}
  };
  return { context, events, registerOutOfReachDecay, autoSettleCapturedAnchor, canAutoSettleCapturedAnchor, queueCapturedAnchorSettle };
}

/** Registers a lock in both lock maps the way the runtime does before resolving it -- resolveLock bails out immediately otherwise. */
function lockTile(context: RuntimeLockResolutionContext, lock: LockRecord): void {
  context.locksByTile.set(lock.originKey, lock);
  context.locksByTile.set(lock.targetKey, lock);
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
    const { context, registerOutOfReachDecay, autoSettleCapturedAnchor } = createContext(tiles, { outOfReach: true, canAutoSettle: true });
    const lock = makeWonAttackLock();
    lockTile(context, lock);

    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.ownerId).toBe(ATTACKER_ID);
    expect(target?.town).toBeDefined();
    // No decay stamp -- auto-settle took the branch instead.
    expect(target?.frontierDecayAt).toBeUndefined();
    expect(target?.frontierDecayKind).toBeUndefined();
    expect(autoSettleCapturedAnchor).toHaveBeenCalledTimes(1);
    expect(autoSettleCapturedAnchor).toHaveBeenCalledWith(ATTACKER_ID, TARGET_KEY, expect.objectContaining({ town: expect.anything() }), "attack-1");
    expect(registerOutOfReachDecay).not.toHaveBeenCalled();
  });

  it("auto-settles a captured dock outside reach", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", dockId: "dock-a" }]
    ]);
    const { context, registerOutOfReachDecay, autoSettleCapturedAnchor } = createContext(tiles, { outOfReach: true, canAutoSettle: true });

    const lock = makeWonAttackLock();
    lockTile(context, lock);
    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.dockId).toBe("dock-a");
    expect(target?.frontierDecayKind).toBeUndefined();
    expect(autoSettleCapturedAnchor).toHaveBeenCalledTimes(1);
    expect(registerOutOfReachDecay).not.toHaveBeenCalled();
  });

  it("falls back to normal out-of-reach decay when the player can't afford to auto-settle", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", name: "Rival Town" } }]
    ]);
    const { context, registerOutOfReachDecay, autoSettleCapturedAnchor } = createContext(tiles, { outOfReach: true, canAutoSettle: false });

    const lock = makeWonAttackLock();
    lockTile(context, lock);
    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.ownerId).toBe(ATTACKER_ID);
    expect(target?.ownershipState).toBe("FRONTIER");
    expect(target?.frontierDecayAt).toBe(OUT_OF_REACH_DEADLINE);
    expect(target?.frontierDecayKind).toBe("OUT_OF_REACH");
    expect(autoSettleCapturedAnchor).not.toHaveBeenCalled();
    expect(registerOutOfReachDecay).toHaveBeenCalledWith(TARGET_KEY, OUT_OF_REACH_DEADLINE);
  });

  it("does not auto-settle a plain resource tile -- it just decays like any other out-of-reach capture", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", resource: "TITANIUM" }]
    ]);
    const { context, registerOutOfReachDecay, autoSettleCapturedAnchor, canAutoSettleCapturedAnchor } = createContext(tiles, { outOfReach: true, canAutoSettle: true });

    const lock = makeWonAttackLock();
    lockTile(context, lock);
    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.frontierDecayKind).toBe("OUT_OF_REACH");
    expect(autoSettleCapturedAnchor).not.toHaveBeenCalled();
    expect(canAutoSettleCapturedAnchor).not.toHaveBeenCalled(); // isAnchorStructureTile short-circuits first
    expect(registerOutOfReachDecay).toHaveBeenCalledWith(TARGET_KEY, OUT_OF_REACH_DEADLINE);
  });

  it("does not attempt auto-settle for a town captured inside reach", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", name: "Rival Town" } }]
    ]);
    const { context, registerOutOfReachDecay, autoSettleCapturedAnchor, canAutoSettleCapturedAnchor } = createContext(tiles, { outOfReach: false, canAutoSettle: true });

    const lock = makeWonAttackLock();
    lockTile(context, lock);
    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.ownershipState).toBe("FRONTIER"); // ordinary capture-then-settle flow, unchanged
    expect(target?.frontierDecayKind).toBeUndefined();
    expect(autoSettleCapturedAnchor).not.toHaveBeenCalled();
    expect(canAutoSettleCapturedAnchor).not.toHaveBeenCalled();
    expect(registerOutOfReachDecay).not.toHaveBeenCalled();
  });

  it("queues a SETTLE instead of decaying when the only blocker is a busy development slot", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", name: "Rival Town" } }]
    ]);
    // canAutoSettle: false mirrors hasAvailableDevelopmentSlot returning false
    // (dev queue busy); funded: true means the player can otherwise afford it,
    // so this must queue a SETTLE rather than fall back to decay -- the player
    // must not lose a town they just captured purely because their dev queue
    // happened to be full at the instant of capture.
    const { context, registerOutOfReachDecay, autoSettleCapturedAnchor, queueCapturedAnchorSettle } =
      createContext(tiles, { outOfReach: true, canAutoSettle: false, funded: true });

    const lock = makeWonAttackLock();
    lockTile(context, lock);
    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.ownerId).toBe(ATTACKER_ID);
    expect(target?.ownershipState).toBe("FRONTIER");
    expect(target?.frontierDecayAt).toBeUndefined();
    expect(target?.frontierDecayKind).toBeUndefined();
    expect(autoSettleCapturedAnchor).not.toHaveBeenCalled();
    expect(queueCapturedAnchorSettle).toHaveBeenCalledWith(ATTACKER_ID, TARGET_KEY, 6, 5);
    expect(registerOutOfReachDecay).not.toHaveBeenCalled();
  });

  it("falls back to decay if the SETTLE couldn't be queued (dev queue full)", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile()],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", name: "Rival Town" } }]
    ]);
    const { context, registerOutOfReachDecay, queueCapturedAnchorSettle } =
      createContext(tiles, { outOfReach: true, canAutoSettle: false, funded: true, settleQueueAccepted: false });

    const lock = makeWonAttackLock();
    lockTile(context, lock);
    resolveLock(context, lock);

    const target = tiles.get(TARGET_KEY);
    expect(target?.frontierDecayAt).toBe(OUT_OF_REACH_DEADLINE);
    expect(target?.frontierDecayKind).toBe("OUT_OF_REACH");
    expect(queueCapturedAnchorSettle).toHaveBeenCalledWith(ATTACKER_ID, TARGET_KEY, 6, 5);
    expect(registerOutOfReachDecay).toHaveBeenCalledWith(TARGET_KEY, OUT_OF_REACH_DEADLINE);
  });
});
