import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it, vi } from "vitest";
import { resolveLock, type RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";
import type { LockRecord, SimulationTileWireDelta } from "./runtime-types.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

/**
 * ATTACK captures a tile directly (context.replaceTileState), entirely
 * outside the border/anchor machinery settleOvertaken normally hooks the
 * stranded-settled-tile sweep into (see runtime-reach-stranded-sweep.ts). A
 * captured corridor tile is just as capable of stranding the previous
 * owner's other settled ground as a border retraction is, so resolveLock
 * must trigger the same sweep on a genuine capture from another player.
 */

const ATTACKER_ID = "player-1";
const DEFENDER_ID = "player-2";
const ORIGIN_KEY = simulationTileKey(5, 5);
const TARGET_KEY = simulationTileKey(6, 5);

const makePlayer = (id: string): DomainPlayer => ({ id, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() });

function createContext(tiles: Map<string, DomainTileState>) {
  const events: SimulationEvent[] = [];
  const strandedSettledSweep = vi.fn();
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
    registerOutOfReachDecay: () => {},
    canAutoSettleCapturedAnchor: () => false,
    autoSettleCapturedAnchor: () => {},
    tryDrainWaypointQueue: () => {},
    strandedSettledSweep
  };
  return { context, events, strandedSettledSweep };
}

function lockTile(context: RuntimeLockResolutionContext, lock: LockRecord): void {
  context.locksByTile.set(lock.originKey, lock);
  context.locksByTile.set(lock.targetKey, lock);
  context.locksByCommandId.set(lock.commandId, lock);
}

const originTile = (ownerId: string): DomainTileState => ({ x: 5, y: 5, terrain: "LAND", ownerId, ownershipState: "SETTLED" });

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

describe("resolveLock — stranded-settled sweep on ATTACK capture", () => {
  it("sweeps the previous owner's territory when a won ATTACK captures their settled tile", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile(ATTACKER_ID)],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED" }]
    ]);
    const { context, strandedSettledSweep } = createContext(tiles);
    const lock = makeWonAttackLock();
    lockTile(context, lock);

    resolveLock(context, lock);

    expect(strandedSettledSweep).toHaveBeenCalledTimes(1);
    const [seedKeys, ownerId, causeCommandId] = strandedSettledSweep.mock.calls[0]!;
    expect(ownerId).toBe(DEFENDER_ID);
    expect(causeCommandId).toBe("attack-1");
    // Seeded with TARGET_KEY's neighbors, not the captured tile itself.
    expect(seedKeys).toHaveLength(8);
    expect(seedKeys).toContain(ORIGIN_KEY);
    expect(seedKeys).not.toContain(TARGET_KEY);
  });

  it("does not sweep barbarian land -- it is environment, not a bordered empire", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile(ATTACKER_ID)],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }]
    ]);
    const { context, strandedSettledSweep } = createContext(tiles);
    const lock = { ...makeWonAttackLock(), combatResolution: { ...makeWonAttackLock().combatResolution!, result: { ...makeWonAttackLock().combatResolution!.result, defenderOwnerId: "barbarian-1", winnerId: ATTACKER_ID } } };
    lockTile(context, lock);

    resolveLock(context, lock);

    expect(strandedSettledSweep).not.toHaveBeenCalled();
  });

  it("does not sweep on a lost attack -- ownership never changed", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, originTile(ATTACKER_ID)],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED" }]
    ]);
    const { context, strandedSettledSweep } = createContext(tiles);
    const lock: LockRecord = {
      ...makeWonAttackLock(),
      combatResolution: {
        result: {
          attackType: "ATTACK",
          attackerWon: false,
          winnerId: DEFENDER_ID,
          defenderOwnerId: DEFENDER_ID,
          origin: { x: 5, y: 5 },
          target: { x: 6, y: 5 },
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
    lockTile(context, lock);

    resolveLock(context, lock);

    expect(strandedSettledSweep).not.toHaveBeenCalled();
  });
});
