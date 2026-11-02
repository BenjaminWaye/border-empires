import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { WAR_SCAR_DURATION_MS } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { resolveLock, type RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";
import type { LockRecord, SimulationTileWireDelta } from "./runtime-types.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { CombatLockIndex } from "./combat-lock-index/combat-lock-index.js";

// Battle scars (shared war-scars.ts) through the real resolveLock pipeline,
// with the same bare-Maps fixture as runtime-lock-resolution.frontier-instant-capture.test.ts.
const NOW = 5_000_000;

const ATTACKER_ID = "player-1";
const DEFENDER_ID = "player-2";
const ORIGIN_KEY = simulationTileKey(5, 5);
const TARGET_KEY = simulationTileKey(6, 5);

function makePlayer(id: string): DomainPlayer {
  return { id, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() };
}

/** Same bare-Maps RuntimeLockResolutionContext fixture as the sibling
 * force-visible-muster test -- resolveLock exercised directly with a
 * pre-baked combatResolution, bypassing combat RNG entirely. */
function createContext(
  tiles: Map<string, DomainTileState>,
  isTileShieldedByAegisLock: () => boolean = () => false,
  maybeActivateWaystation: RuntimeLockResolutionContext["maybeActivateWaystation"] = () => {}
) {
  const events: SimulationEvent[] = [];
  const context: RuntimeLockResolutionContext = {
    players: new Map([[ATTACKER_ID, makePlayer(ATTACKER_ID)], [DEFENDER_ID, makePlayer(DEFENDER_ID)]]),
    tiles,
    locksByTile: new CombatLockIndex(),
    locksByCommandId: new Map(),
    musterReservedByKey: new Map(),
    barbarianTileProgress: new Map(),
    now: () => NOW,
    emitEvent: (event) => { events.push(event); },
    emitPlayerStateUpdate: () => {},
    replaceTileState: (tileKey, tile) => { tiles.set(tileKey, tile); },
    tileDeltaFromState: (tile) => ({
      x: tile.x,
      y: tile.y,
      ownerId: tile.ownerId,
      ownershipState: tile.ownershipState,
      musterJson: tile.muster ? JSON.stringify(tile.muster) : "",
      ...(tile.waystation ? { waystationJson: JSON.stringify(tile.waystation) } : {})
    }) as SimulationTileWireDelta,
    buildCaptureRevealTileDeltas: () => [],
    buildLockedCombatResolution: () => undefined,
    isTileShieldedByAegisLock,
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
    maybeActivateWaystation,
    maybeDrainClaimContinuation: () => {},
    isTileBeyondReach: () => false,
    canAutoSettleCapturedAnchor: () => false,
    autoSettleCapturedAnchor: () => {},
    tryDrainWaypointQueue: () => {}
  };
  return { context, events };
}

function makeWonAttackLock(overrides?: Partial<LockRecord>): LockRecord {
  return {
    commandId: "attack-1",
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
        atkEff: 0,
        defEff: 0,
        winChance: 1,
        levelDelta: 0
      },
      defenderGoldLoss: 0,
      targetRecentlyPillaged: false
    },
    ...overrides
  };
}


const resolve = (target: Omit<DomainTileState, "x" | "y" | "terrain">, attackerWon = true) => {
  const tiles = new Map<string, DomainTileState>([
    [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" }],
    [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ...target }]
  ]);
  const { context } = createContext(tiles);
  const base = makeWonAttackLock();
  const lock = attackerWon ? base : makeWonAttackLock({ combatResolution: { ...base.combatResolution!, result: { ...base.combatResolution!.result, attackerWon: false, winnerId: DEFENDER_ID } } });
  context.locksByTile.addLock(lock);
  context.locksByCommandId.set(lock.commandId, lock);
  resolveLock(context, lock);
  return tiles.get(TARGET_KEY)!;
};

describe("resolveLock battle scars", () => {
  it("scars a garrisoned tile captured in battle for 24h", () => {
    const tile = resolve({ ownerId: DEFENDER_ID, ownershipState: "SETTLED" });
    expect(tile.ownerId).toBe(ATTACKER_ID);
    expect(tile.warScarLevel).toBe(1);
    expect(tile.warScarUntil).toBe(NOW + WAR_SCAR_DURATION_MS);
  });

  it("deepens scars already there on the next capture", () => {
    expect(resolve({ ownerId: DEFENDER_ID, ownershipState: "SETTLED", warScarLevel: 2, warScarUntil: NOW + 10 }).warScarLevel).toBe(3);
  });

  it("deepens scars when an attack on scarred ground is repelled", () => {
    const tile = resolve({ ownerId: DEFENDER_ID, ownershipState: "SETTLED", warScarLevel: 1, warScarUntil: NOW + 10 }, false);
    expect(tile.ownerId).toBe(DEFENDER_ID);
    expect(tile.warScarLevel).toBe(2);
    expect(tile.warScarUntil).toBe(NOW + WAR_SCAR_DURATION_MS);
  });

  it("doesn't scar unscarred ground when an attack is repelled, or undefended frontier taken without a fight", () => {
    expect(resolve({ ownerId: DEFENDER_ID, ownershipState: "SETTLED" }, false).warScarLevel).toBeUndefined();
    expect(resolve({ ownerId: DEFENDER_ID, ownershipState: "FRONTIER" }).warScarLevel).toBeUndefined();
  });

  it("keeps scars on the ground through a capture that adds none", () => {
    const tile = resolve({ ownerId: DEFENDER_ID, ownershipState: "FRONTIER", warScarLevel: 2, warScarUntil: NOW + 10 });
    expect(tile.ownerId).toBe(ATTACKER_ID);
    expect(tile).toMatchObject({ warScarLevel: 2, warScarUntil: NOW + 10 });
  });
});
