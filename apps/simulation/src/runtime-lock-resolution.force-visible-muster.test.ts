import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";
import { resolveLock, type RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";
import type { LockRecord, SimulationTileWireDelta } from "./runtime-types.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

const ATTACKER_ID = "player-1";
const DEFENDER_ID = "player-2";
const ORIGIN_KEY = simulationTileKey(5, 5);
const TARGET_KEY = simulationTileKey(6, 5);

function makePlayer(id: string): DomainPlayer {
  return { id, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() };
}

/** Builds a fake RuntimeLockResolutionContext backed by plain Maps, with every
 * side-effect a no-op except replaceTileState/emitEvent, so resolveLock can be
 * exercised directly with a pre-baked combatResolution (bypassing combat RNG). */
function createContext(tiles: Map<string, DomainTileState>) {
  const events: SimulationEvent[] = [];
  const context: RuntimeLockResolutionContext = {
    players: new Map([[ATTACKER_ID, makePlayer(ATTACKER_ID)], [DEFENDER_ID, makePlayer(DEFENDER_ID)]]),
    tiles,
    locksByTile: new Map(),
    locksByCommandId: new Map(),
    musterReservedByKey: new Map(),
    barbarianTileProgress: new Map(),
    now: () => 0,
    emitEvent: (event) => { events.push(event); },
    emitPlayerStateUpdate: () => {},
    replaceTileState: (tileKey, tile) => { tiles.set(tileKey, tile); },
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y, ownerId: tile.ownerId, ownershipState: tile.ownershipState, musterJson: tile.muster ? JSON.stringify(tile.muster) : "" }) as SimulationTileWireDelta,
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
    tryDrainWaypointQueue: () => {}
  };
  return { context, events };
}

function makeLostAttackLock(): LockRecord {
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
        attackerWon: false,
        winnerId: DEFENDER_ID,
        defenderOwnerId: DEFENDER_ID,
        origin: { x: 5, y: 5 },
        target: { x: 6, y: 5 },
        // Mirrors buildLockedCombatResolution's real shape for a lost attack
        // against a real owner whose origin isn't fort-held: the origin flips
        // to the defender.
        changes: [{ x: 5, y: 5, ownerId: DEFENDER_ID, ownershipState: "FRONTIER" }],
        pointsDelta: 0,
        manpowerDelta: -50,
        pillagedGold: 0,
        pillagedShare: 0,
        pillagedStrategic: {},
        atkEff: 1,
        defEff: 2,
        winChance: 0.1,
        levelDelta: 0
      },
      defenderGoldLoss: 0,
      targetRecentlyPillaged: false
    }
  };
}

function makeWonAttackLock(): LockRecord {
  return {
    commandId: "attack-2",
    playerId: ATTACKER_ID,
    actionType: "ATTACK",
    manpowerCost: 20,
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
        manpowerDelta: -20,
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

describe("resolveLock deep-raid capture muster visibility", () => {
  it("forces the resolved target visible to the attacker too, not just the defender who lost it", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" }],
      // The defender staged a muster flag on the target before losing it --
      // this is the tile an attacker whose own reach/vision doesn't extend
      // this deep (a raid chained through their own out-of-reach frontier
      // ground) must still see resolved, muster flag and all.
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", muster: { ownerId: DEFENDER_ID, amount: 30, mode: "HOLD", updatedAt: 0 } }]
    ]);
    const { context, events } = createContext(tiles);
    const lock = makeWonAttackLock();
    context.locksByTile.set(lock.originKey, lock);
    context.locksByTile.set(lock.targetKey, lock);
    context.locksByCommandId.set(lock.commandId, lock);

    resolveLock(context, lock);

    const resolvedTarget = tiles.get(TARGET_KEY);
    expect(resolvedTarget?.ownerId).toBe(ATTACKER_ID);
    expect(resolvedTarget?.muster).toBeUndefined();

    const targetBatch = events.find(
      (event): event is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> =>
        event.eventType === "TILE_DELTA_BATCH" && event.commandId === lock.commandId
    );
    const targetDeltas = targetBatch?.tileDeltas.filter((d) => d.x === 6 && d.y === 5) as
      | Array<SimulationTileWireDelta & { forceVisibleForPlayerId?: string | readonly string[] }>
      | undefined;
    // The regression this guards: without forcing this delta visible to the
    // attacker specifically, ATTACK's own visibility check (whether the
    // target is currently inside the attacker's live vision) can drop the
    // whole delta for them once their in-flight lock on this tile is deleted
    // (which happens before this batch is even built) -- leaving their own
    // client showing the defender's stale muster flag on ground that's now
    // theirs. Both the attacker and the defender who lost the tile need this
    // forced past their own visibility check, so it's one delta carrying
    // both ids rather than a duplicate delta per forced viewer.
    expect(targetDeltas).toHaveLength(1);
    expect(targetDeltas?.[0]?.musterJson).toBe("");
    expect(targetDeltas?.[0]?.forceVisibleForPlayerId).toEqual(
      expect.arrayContaining([ATTACKER_ID, DEFENDER_ID])
    );
  });
});

describe("resolveLock origin-overrun muster visibility", () => {
  it("tags the origin's resolved delta forceVisibleForPlayerId for the attacker who just lost it", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED", muster: { ownerId: ATTACKER_ID, amount: 50, mode: "HOLD", updatedAt: 0 } }],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED" }]
    ]);
    const { context, events } = createContext(tiles);
    const lock = makeLostAttackLock();
    context.locksByTile.set(lock.originKey, lock);
    context.locksByTile.set(lock.targetKey, lock);
    context.locksByCommandId.set(lock.commandId, lock);

    resolveLock(context, lock);

    const resolvedOrigin = tiles.get(ORIGIN_KEY);
    expect(resolvedOrigin?.ownerId).toBe(DEFENDER_ID);
    expect(resolvedOrigin?.muster).toBeUndefined();

    const originBatch = events.find(
      (event): event is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> =>
        event.eventType === "TILE_DELTA_BATCH" && event.commandId === "attack-1"
    );
    const originDelta = originBatch?.tileDeltas.find((d) => d.x === 5 && d.y === 5);
    // The regression this guards: without forceVisibleForPlayerId, this delta
    // gets silently dropped by tile-delta-visibility-filter.ts for the
    // attacker once the origin falls out of their fog-of-war coverage (it no
    // longer belongs to them and carries a live, non-empty ownerId) — leaving
    // their client's stale muster flag on the tile forever.
    expect((originDelta as { forceVisibleForPlayerId?: string } | undefined)?.forceVisibleForPlayerId).toBe(ATTACKER_ID);
    expect(originDelta?.musterJson).toBe("");
  });
});
