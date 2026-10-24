import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";
import { resolveLock, type RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";
import type { LockRecord, LockedCombatResolution, SimulationTileWireDelta } from "./runtime-types.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { CombatLockIndex } from "./combat-lock-index/combat-lock-index.js";

const ATTACKER_ID = "player-1";
const DEFENDER_ID = "player-2";
const ORIGIN_KEY = simulationTileKey(5, 5);
const TARGET_KEY = simulationTileKey(6, 5);

function makePlayer(id: string): DomainPlayer {
  return { id, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() };
}

// War gear (popup-marine-gear.ts on the client): each side's weapons-factory
// flags, rolled into LockedCombatResolution by buildLockedCombatResolution,
// must reach the client on the combat broadcast -- otherwise those empires'
// squads render in standard kit (no heavy armour, no Umbrite rounds).
const resolveWithGear = (gear: Pick<LockedCombatResolution, "attackerGear" | "defenderGear">): Record<string, unknown> => {
  const tiles = new Map<string, DomainTileState>([
    [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" }],
    [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED" }]
  ]);
  const events: SimulationEvent[] = [];
  const context: RuntimeLockResolutionContext = {
    players: new Map([[ATTACKER_ID, makePlayer(ATTACKER_ID)], [DEFENDER_ID, makePlayer(DEFENDER_ID)]]),
    tiles,
    locksByTile: new CombatLockIndex(),
    locksByCommandId: new Map(),
    musterReservedByKey: new Map(),
    barbarianTileProgress: new Map(),
    now: () => 0,
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
    isTileBeyondReach: () => false,
    canAutoSettleCapturedAnchor: () => false,
    autoSettleCapturedAnchor: () => {},
    tryDrainWaypointQueue: () => {}
  };

  const lock: LockRecord = {
    commandId: "attack-geared",
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
        changes: [],
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
      targetRecentlyPillaged: false,
      ...gear
    }
  };
  context.locksByTile.addLock(lock);
  context.locksByCommandId.set(lock.commandId, lock);
  resolveLock(context, lock);
  const combatBatch = events.find(
    (event): event is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> =>
      event.eventType === "TILE_DELTA_BATCH" && event.commandId === "attack-geared:combat"
  );
  const combatJson = (combatBatch?.tileDeltas.find((d) => d.x === 6 && d.y === 5) as { combatJson?: string } | undefined)?.combatJson;
  expect(combatJson).toBeDefined();
  return JSON.parse(combatJson!) as Record<string, unknown>;
};

describe("resolveLock combat broadcast war gear", () => {
  it("carries each side's war gear onto the combat broadcast", () => {
    const payload = resolveWithGear({ attackerGear: { umbriteArms: true }, defenderGear: { titaniumArmor: true } });
    expect(payload.attackerGear).toEqual({ umbriteArms: true });
    expect(payload.defenderGear).toEqual({ titaniumArmor: true });
  });

  it("omits both gear fields when neither side has any", () => {
    const payload = resolveWithGear({});
    expect(payload).not.toHaveProperty("attackerGear");
    expect(payload).not.toHaveProperty("defenderGear");
  });
});
