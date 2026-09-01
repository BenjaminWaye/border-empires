import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";
import { resolveLock, type RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";
import type { LockRecord } from "./runtime-types.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

// Regression coverage for the server-side waypoint/expand-queue auto-drain
// hook: resolveLock must call tryDrainWaypointQueue for the acting player
// once an EXPAND/ATTACK lock finishes resolving -- win, loss, or stale/
// superseded -- and only for EXPAND/ATTACK (not e.g. some future lock kind
// that shouldn't touch the waypoint queue). This is the hook that lets a
// queued waypoint keep advancing while the player has no active gateway
// connection at all -- resolveLock runs off the sim's own lock-resolution
// timer, never a client-driven call.
const PLAYER_ID = "player-1";
const OTHER_ID = "player-2";
const ORIGIN_KEY = simulationTileKey(1, 1);
const TARGET_KEY = simulationTileKey(2, 1);

function makePlayer(id: string): DomainPlayer {
  return { id, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() };
}

function createContext(tiles: Map<string, DomainTileState>) {
  const events: SimulationEvent[] = [];
  const drainedForPlayerIds: string[] = [];
  const context: RuntimeLockResolutionContext = {
    players: new Map([[PLAYER_ID, makePlayer(PLAYER_ID)], [OTHER_ID, makePlayer(OTHER_ID)]]),
    tiles,
    locksByTile: new Map(),
    locksByCommandId: new Map(),
    musterReservedByKey: new Map(),
    barbarianTileProgress: new Map(),
    now: () => 0,
    emitEvent: (event) => { events.push(event); },
    emitPlayerStateUpdate: () => {},
    replaceTileState: (tileKey, tile) => { tiles.set(tileKey, tile); },
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y, ownerId: tile.ownerId, ownershipState: tile.ownershipState, musterJson: "" }),
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
    registerOutOfReachDecay: () => {},
    canAutoSettleCapturedAnchor: () => false,
    autoSettleCapturedAnchor: () => {},
    tryDrainWaypointQueue: (playerId) => { drainedForPlayerIds.push(playerId); }
  };
  return { context, events, drainedForPlayerIds };
}

function makeExpandLock(overrides: Partial<LockRecord> = {}): LockRecord {
  return {
    commandId: "expand-1",
    playerId: PLAYER_ID,
    actionType: "EXPAND",
    manpowerCost: 10,
    originX: 1,
    originY: 1,
    targetX: 2,
    targetY: 1,
    originKey: ORIGIN_KEY,
    targetKey: TARGET_KEY,
    resolvesAt: 0,
    source: "player",
    ...overrides
  };
}

describe("resolveLock waypoint-queue drain hook", () => {
  it("drains the acting player's waypoint queue after a successful EXPAND resolves", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 1, y: 1, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED" }],
      [TARGET_KEY, { x: 2, y: 1, terrain: "LAND" }]
    ]);
    const { context, drainedForPlayerIds } = createContext(tiles);
    const lock = makeExpandLock();
    context.locksByTile.set(lock.originKey, lock);
    context.locksByTile.set(lock.targetKey, lock);
    context.locksByCommandId.set(lock.commandId, lock);

    resolveLock(context, lock);

    expect(drainedForPlayerIds).toEqual([PLAYER_ID]);
  });

  it("still drains when the lock is stale/superseded (never reaches its own resolution)", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 1, y: 1, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED" }],
      [TARGET_KEY, { x: 2, y: 1, terrain: "LAND" }]
    ]);
    const { context, drainedForPlayerIds } = createContext(tiles);
    const lock = makeExpandLock();
    // Deliberately do not register the lock in locksByTile/locksByCommandId,
    // so resolveLock takes its "stale/superseded" early-return branch.

    resolveLock(context, lock);

    expect(drainedForPlayerIds).toEqual([PLAYER_ID]);
  });
});
