import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { resolveLock, type RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";
import type { LockRecord, SimulationTileWireDelta } from "./runtime-types.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { CombatLockIndex } from "./combat-lock-index/combat-lock-index.js";
import type { TerritoryFlip } from "./territory-flip-log/territory-flip-log.js";

const ATTACKER_ID = "maren";
const DEFENDER_ID = "me";
const ORIGIN_KEY = simulationTileKey(5, 5);
const TARGET_KEY = simulationTileKey(6, 5);

const makePlayer = (id: string): DomainPlayer => ({ id, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() });

// Same bare-Maps fixture as the sibling resolveLock tests, plus a
// recordTileFlip sink: resolveLock runs with a pre-baked combat result.
const createContext = (tiles: Map<string, DomainTileState>, flips: TerritoryFlip[]): RuntimeLockResolutionContext => ({
  players: new Map([[ATTACKER_ID, makePlayer(ATTACKER_ID)], [DEFENDER_ID, makePlayer(DEFENDER_ID)]]),
  tiles,
  locksByTile: new CombatLockIndex(),
  locksByCommandId: new Map(),
  musterReservedByKey: new Map(),
  barbarianTileProgress: new Map(),
  now: () => 1_000,
  emitEvent: () => {},
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
  isTileBeyondReach: () => false,
  canAutoSettleCapturedAnchor: () => false,
  autoSettleCapturedAnchor: () => {},
  tryDrainWaypointQueue: () => {},
  recordTileFlip: (flip) => { flips.push(flip); }
});

const attackLock = (attackerWon: boolean): LockRecord => ({
  commandId: "attack-1",
  playerId: ATTACKER_ID,
  actionType: "ATTACK",
  manpowerCost: 60,
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
      attackerWon,
      winnerId: attackerWon ? ATTACKER_ID : DEFENDER_ID,
      defenderOwnerId: DEFENDER_ID,
      origin: { x: 5, y: 5 },
      target: { x: 6, y: 5 },
      // A failed attack hands the launch tile to the defender.
      changes: attackerWon ? [] : [{ x: 5, y: 5, ownerId: DEFENDER_ID, ownershipState: "FRONTIER" }],
      pointsDelta: 0,
      manpowerDelta: -60,
      pillagedGold: 0,
      pillagedShare: 0,
      pillagedStrategic: {},
      atkEff: 1,
      defEff: 1,
      winChance: 0.5,
      levelDelta: 0
    },
    defenderGoldLoss: 0,
    targetRecentlyPillaged: false
  }
});

const resolve = (origin: DomainTileState, target: DomainTileState, attackerWon: boolean): TerritoryFlip[] => {
  const tiles = new Map([[ORIGIN_KEY, origin], [TARGET_KEY, target]]);
  const flips: TerritoryFlip[] = [];
  const context = createContext(tiles, flips);
  const lock = attackLock(attackerWon);
  context.locksByTile.addLock(lock);
  context.locksByCommandId.set(lock.commandId, lock);
  resolveLock(context, lock);
  return flips;
};

// Regression: a player lost a Palisade, a Dock and a wonder and the Activity
// report never said so, because the ownership log only kept who and where.
describe("resolveLock records what stood on a tile that changed hands", () => {
  it("records the captured target's fortification and wonder as they were before capture (a dock has its own note)", () => {
    const flips = resolve(
      { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" },
      {
        x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "FRONTIER",
        fort: { ownerId: DEFENDER_ID, status: "active", variant: "PALISADE" },
        dockId: "dock-3",
        naturalWonder: { type: "FOUNDRY_HEART" }
      },
      true
    );
    expect(flips).toEqual([expect.objectContaining({
      x: 6, y: 5, fromOwner: DEFENDER_ID, toOwner: ATTACKER_ID,
      features: [{ kind: "STRUCTURE", structureType: "PALISADE" }, { kind: "NATURAL_WONDER", wonderType: "FOUNDRY_HEART" }]
    })]);
  });

  it("records a seized launch tile's structures, including ones the capture razes", () => {
    const flips = resolve(
      {
        x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED",
        siegeBattery: { ownerId: ATTACKER_ID, status: "active", variant: "SIEGE_TOWER" },
        dockId: "dock-4"
      },
      { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED" },
      false
    );
    expect(flips).toEqual([expect.objectContaining({
      x: 5, y: 5, fromOwner: ATTACKER_ID, toOwner: DEFENDER_ID,
      features: [{ kind: "STRUCTURE", structureType: "SIEGE_TOWER" }]
    })]);
  });

  it("records dock notes when a failed attack loses a launch tile holding a dock", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED", dockId: "dock-4" }],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED" }]
    ]);
    const context = createContext(tiles, []);
    const impacts: unknown[] = [];
    context.recordPersonalImpact = (impact) => { impacts.push(impact); };
    const lock = attackLock(false);
    context.locksByTile.addLock(lock);
    context.locksByCommandId.set(lock.commandId, lock);
    resolveLock(context, lock);
    expect(impacts).toEqual([
      expect.objectContaining({ kind: "DOCK_CAPTURED", playerId: DEFENDER_ID, counterpartyPlayerId: ATTACKER_ID, x: 5, y: 5 }),
      expect.objectContaining({ kind: "DOCK_LOST", playerId: ATTACKER_ID, counterpartyPlayerId: DEFENDER_ID, x: 5, y: 5 })
    ]);
  });

  it("leaves a bare tile's flip without a features field", () => {
    const flips = resolve(
      { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" },
      { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "FRONTIER" },
      true
    );
    expect(flips).toHaveLength(1);
    expect(flips[0]).not.toHaveProperty("features");
  });
});
