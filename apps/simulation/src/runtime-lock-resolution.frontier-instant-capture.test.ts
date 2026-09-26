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
    locksByTile: new Map(),
    locksByCommandId: new Map(),
    musterReservedByKey: new Map(),
    barbarianTileProgress: new Map(),
    now: () => 0,
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
    outOfReachDecayDeadline: () => undefined,
    registerOutOfReachDecay: () => {},
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

function makeWonExpandLock(overrides?: Partial<LockRecord>): LockRecord {
  return makeWonAttackLock({
    commandId: "expand-1",
    actionType: "EXPAND",
    manpowerCost: 10,
    combatResolution: {
      result: {
        attackType: "EXPAND",
        attackerWon: true,
        winnerId: ATTACKER_ID,
        origin: { x: 5, y: 5 },
        target: { x: 6, y: 5 },
        changes: [],
        pointsDelta: 0,
        manpowerDelta: -10,
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
  });
}

function tileDeltaBatches(events: SimulationEvent[]): Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>[] {
  return events.filter((e): e is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> => e.eventType === "TILE_DELTA_BATCH");
}

describe("resolveLock ATTACK on a FRONTIER (undefended) target", () => {
  it("emits no combatJson on the resolved tile delta -- no combat, no battle overlay FX", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" }],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "FRONTIER" }]
    ]);
    const { context, events } = createContext(tiles);
    const lock = makeWonAttackLock();
    context.locksByTile.set(lock.originKey, lock);
    context.locksByTile.set(lock.targetKey, lock);
    context.locksByCommandId.set(lock.commandId, lock);

    resolveLock(context, lock);

    const batches = tileDeltaBatches(events);
    const targetDelta = batches.flatMap((b) => b.tileDeltas).find((d) => d.x === 6 && d.y === 5);
    expect(targetDelta).toBeDefined();
    expect(targetDelta?.combatJson).toBeUndefined();
    expect(tiles.get(TARGET_KEY)?.ownerId).toBe(ATTACKER_ID);
  });

  it("still emits combatJson for an ATTACK on a SETTLED (defended) target -- the FRONTIER exclusion doesn't over-broaden", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" }],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED" }]
    ]);
    const { context, events } = createContext(tiles);
    const lock = makeWonAttackLock();
    context.locksByTile.set(lock.originKey, lock);
    context.locksByTile.set(lock.targetKey, lock);
    context.locksByCommandId.set(lock.commandId, lock);

    resolveLock(context, lock);

    const batches = tileDeltaBatches(events);
    const targetDelta = batches.flatMap((b) => b.tileDeltas).find((d) => d.x === 6 && d.y === 5);
    expect(targetDelta).toBeDefined();
    expect(targetDelta?.combatJson).toBeDefined();
    const payload = JSON.parse(targetDelta!.combatJson!) as { attackerOwnerId: string; defenderOwnerId: string };
    expect(payload.attackerOwnerId).toBe(ATTACKER_ID);
    expect(payload.defenderOwnerId).toBe(DEFENDER_ID);
  });

  it("records truthful town-captured and town-lost impacts for both players", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" }],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", population: 1_000, maxPopulation: 2_000, name: "Rivergate" } }]
    ]);
    const { context } = createContext(tiles);
    const impacts: unknown[] = [];
    context.recordPersonalImpact = (impact) => { impacts.push(impact); };
    const lock = makeWonAttackLock();
    context.locksByTile.set(lock.originKey, lock);
    context.locksByTile.set(lock.targetKey, lock);
    context.locksByCommandId.set(lock.commandId, lock);

    resolveLock(context, lock);

    expect(impacts).toEqual([
      expect.objectContaining({ kind: "TOWN_CAPTURED", playerId: ATTACKER_ID, townName: "Rivergate", townSurvived: true, populationBefore: 1_000 }),
      expect.objectContaining({ kind: "TOWN_LOST", playerId: DEFENDER_ID, townName: "Rivergate", townSurvived: true, populationBefore: 1_000 })
    ]);
  });

  // Regression: Aegis Lock (runtime-ability-helpers.ts) is an independent
  // defensive ability, unrelated to defenderBattle's frontier-defense-zero
  // combat math -- it can still block an ATTACK on undefended FRONTIER
  // ground. Without accounting for it, hasDefendingForce's FRONTIER
  // exclusion would silently drop the combat broadcast for a blocked
  // attack, leaving the defender/bystanders with no visual signal it was
  // ever repelled.
  it("still emits combatJson when Aegis Lock blocks an ATTACK on a FRONTIER target", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" }],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "FRONTIER" }]
    ]);
    const { context, events } = createContext(tiles, () => true);
    const lock = makeWonAttackLock();
    context.locksByTile.set(lock.originKey, lock);
    context.locksByTile.set(lock.targetKey, lock);
    context.locksByCommandId.set(lock.commandId, lock);

    resolveLock(context, lock);

    const batches = tileDeltaBatches(events);
    const targetDelta = batches.flatMap((b) => b.tileDeltas).find((d) => d.x === 6 && d.y === 5);
    expect(targetDelta?.combatJson).toBeDefined();
    const payload = JSON.parse(targetDelta!.combatJson!) as { attackerWon: boolean };
    expect(payload.attackerWon).toBe(false);
    // Blocked by Aegis Lock: ownership never actually transfers.
    expect(tiles.get(TARGET_KEY)?.ownerId).toBe(DEFENDER_ID);
  });
});

describe("resolveLock EXPAND waystation activation", () => {
  it("emits the activated waystation state in the final capture delta", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" }],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", waystation: { activated: false } }]
    ]);
    const { context, events } = createContext(tiles, () => false, (targetKey, x, y, playerId) => {
      const tile = tiles.get(targetKey);
      if (!tile?.waystation) return;
      tiles.set(targetKey, {
        ...tile,
        waystation: { activated: true, activatedByPlayerId: playerId, grantedEffect: "RESOURCE_SLOT" },
        x,
        y
      });
    });
    const lock = makeWonExpandLock();
    context.locksByTile.set(lock.originKey, lock);
    context.locksByTile.set(lock.targetKey, lock);
    context.locksByCommandId.set(lock.commandId, lock);

    resolveLock(context, lock);

    const batches = tileDeltaBatches(events);
    const targetDelta = batches.flatMap((b) => b.tileDeltas).find((d) => d.x === 6 && d.y === 5);
    expect(targetDelta?.waystationJson).toBe(JSON.stringify({ activated: true, activatedByPlayerId: ATTACKER_ID, grantedEffect: "RESOURCE_SLOT" }));
  });

  // Waystones are world-generated without regard to current ownership, so a
  // dormant one can sit on land a barbarian or enemy player already owns --
  // capturing it is then a won ATTACK, not an EXPAND. Regression for the bug
  // where activation only fired on the EXPAND branch, silently no-opping on
  // ATTACK-won captures (no popup, no activity-feed entry, no granted effect)
  // until the player abandoned and re-claimed the tile via EXPAND.
  it("also activates a dormant waystation on a won ATTACK capture", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" }],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "FRONTIER", waystation: { activated: false } }]
    ]);
    const { context, events } = createContext(tiles, () => false, (targetKey, x, y, playerId) => {
      const tile = tiles.get(targetKey);
      if (!tile?.waystation) return;
      tiles.set(targetKey, {
        ...tile,
        waystation: { activated: true, activatedByPlayerId: playerId, grantedEffect: "RESOURCE_SLOT" },
        x,
        y
      });
    });
    const lock = makeWonAttackLock();
    context.locksByTile.set(lock.originKey, lock);
    context.locksByTile.set(lock.targetKey, lock);
    context.locksByCommandId.set(lock.commandId, lock);

    resolveLock(context, lock);

    const batches = tileDeltaBatches(events);
    const targetDelta = batches.flatMap((b) => b.tileDeltas).find((d) => d.x === 6 && d.y === 5);
    expect(targetDelta?.waystationJson).toBe(JSON.stringify({ activated: true, activatedByPlayerId: ATTACKER_ID, grantedEffect: "RESOURCE_SLOT" }));
  });
});
