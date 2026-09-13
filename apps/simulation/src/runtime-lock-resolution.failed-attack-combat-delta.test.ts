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

// Regression test for a real bug report: a defended tile flashed neutral in
// the client for a split second, but only when the attack against it was
// REPELLED, never when it succeeded. Root cause was resolveLock's
// attacker-lost branch hand-building the combat-overlay delta as a bare
// {x, y, combatJson} object instead of routing it through
// context.tileDeltaFromState like every other emit site -- omitting
// ownerId/ownershipState, which every downstream consumer treats as an
// explicit ownership CLEAR (see tile-delta-stringify-cache.ts's "always
// emitted" guarantee and client-optimistic-state.ts's mergeIncomingTileDetail).
describe("resolveLock failed-attack combat-only delta", () => {
  it("carries the target's real (unchanged) ownerId/ownershipState, not just combatJson", () => {
    const tiles = new Map<string, DomainTileState>([
      [ORIGIN_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: ATTACKER_ID, ownershipState: "SETTLED" }],
      [TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED" }]
    ]);
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
      tryDrainWaypointQueue: () => {}
    };

    // Attacker loses and their origin survives (a well-defended fort holding
    // the line, not overrun) -- so the ONLY delta this resolution emits for
    // the target is the attacker-lost branch's combat-overlay stub.
    const lock: LockRecord = {
      commandId: "attack-repelled",
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
        targetRecentlyPillaged: false
      }
    };
    context.locksByTile.set(lock.originKey, lock);
    context.locksByTile.set(lock.targetKey, lock);
    context.locksByCommandId.set(lock.commandId, lock);

    resolveLock(context, lock);

    // Ownership on the server side was never in doubt -- confirm the test
    // setup actually reflects a repelled attack before asserting on the wire.
    expect(tiles.get(TARGET_KEY)?.ownerId).toBe(DEFENDER_ID);

    const combatBatch = events.find(
      (event): event is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> =>
        event.eventType === "TILE_DELTA_BATCH" && event.commandId === "attack-repelled:combat"
    );
    expect(combatBatch).toBeDefined();
    const targetDelta = combatBatch?.tileDeltas.find((d) => d.x === 6 && d.y === 5);
    expect(targetDelta?.ownerId).toBe(DEFENDER_ID);
    expect(targetDelta?.ownershipState).toBe("SETTLED");
    expect((targetDelta as { combatJson?: string } | undefined)?.combatJson).toBeDefined();
  });
});
