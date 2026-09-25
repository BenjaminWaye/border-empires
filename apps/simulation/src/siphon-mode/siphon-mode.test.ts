/**
 * Siphon siphon-mode regression tests (docs/game-mechanics.md "Siphon").
 *
 * Before this redesign Siphon stamped a 60-minute `sabotage` on enemy tiles
 * that only zeroed the victim's yield: nothing reached the caster and no
 * resource slots moved. These cover the redesign end to end through the real
 * runtime: the slot transfer on start and its restore on end (both players),
 * the dormancy it flips, the tower lock, CANCEL_SIPHON, every automatic end
 * (victim tower, caster tower lost, drained tile changing hands), and that
 * all of it survives a restart via event recovery.
 */
import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";
import {
  applySimulationEventsToRecoveredState,
  type RecoveredSimulationState
} from "../event-recovery/event-recovery.js";
import type { RuntimePlayer } from "../runtime-types.js";

const CASTER = "player-1";
const VICTIM = "player-2";
const TOWER = "0,1";
const TARGET = "10,1"; // victim's TITANIUM tile
const VICTIM_FORT = "11,0";
const CASTER_FORT = "1,0";

const initialTiles = (extra: Array<Record<string, unknown>> = []): RecoveredSimulationState["tiles"] =>
  [
    // Caster: town anchor, the casting tower, CRYSTAL for the tower's slot, and
    // a Fort (1 TITANIUM slot) with no TITANIUM of its own — dormant until it
    // siphons some.
    { x: 0, y: 0, terrain: "LAND", ownerId: CASTER, ownershipState: "SETTLED", town: { name: "Casterton", type: "MARKET", populationTier: "SETTLEMENT" } },
    { x: 0, y: 1, terrain: "LAND", ownerId: CASTER, ownershipState: "SETTLED", observatory: { ownerId: CASTER, status: "active", activatedAt: 1_000 } },
    { x: 0, y: 2, terrain: "LAND", ownerId: CASTER, ownershipState: "SETTLED", resource: "GEMS" },
    { x: 1, y: 0, terrain: "LAND", ownerId: CASTER, ownershipState: "SETTLED", fort: { ownerId: CASTER, status: "active", activatedAt: 1_000 } },
    // Victim: town anchor, one TITANIUM tile powering one Fort.
    { x: 10, y: 0, terrain: "LAND", ownerId: VICTIM, ownershipState: "SETTLED", town: { name: "Victimburg", type: "MARKET", populationTier: "SETTLEMENT" } },
    { x: 10, y: 1, terrain: "LAND", ownerId: VICTIM, ownershipState: "SETTLED", resource: "TITANIUM" },
    { x: 11, y: 0, terrain: "LAND", ownerId: VICTIM, ownershipState: "SETTLED", fort: { ownerId: VICTIM, status: "active", activatedAt: 1_000 } },
    ...extra
  ] as RecoveredSimulationState["tiles"];

const players = (): Map<string, RuntimePlayer> =>
  new Map([
    [CASTER, buildPlayer(CASTER, { points: 20_000, manpower: 10_000, techIds: new Set<string>(["logistics"]) })],
    [VICTIM, buildPlayer(VICTIM, { points: 20_000, manpower: 10_000 })]
  ]);

type RuntimeInternals = {
  state: { tiles: Map<string, DomainTileState> };
  resourceSlotSupplyForPlayer: (playerId: string, forceFresh: boolean) => { TITANIUM: number };
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
};
const internals = (runtime: SimulationRuntime): RuntimeInternals => runtime as unknown as RuntimeInternals;
const tileAt = (runtime: SimulationRuntime, key: string): DomainTileState | undefined => internals(runtime).state.tiles.get(key);
const titaniumSupply = (runtime: SimulationRuntime, playerId: string): number =>
  internals(runtime).resourceSlotSupplyForPlayer(playerId, true).TITANIUM;
const fortDormant = (runtime: SimulationRuntime, playerId: string, key: string): boolean => runtime.isStructureDormant(playerId, key, "fort");

const buildRuntime = (extra: Array<Record<string, unknown>> = [], initialState?: RecoveredSimulationState): SimulationRuntime =>
  new SimulationRuntime({
    now: () => 10_000,
    initialPlayers: players(),
    initialState: initialState ?? { tiles: initialTiles(extra), activeLocks: [] }
  });

let seq = 0;
const submit = async (runtime: SimulationRuntime, type: string, payload: Record<string, unknown>, playerId = CASTER, commandId = `${type}-${++seq}`): Promise<string> => {
  runtime.submitCommand({ commandId, sessionId: `session-${playerId}`, playerId, clientSeq: ++seq, issuedAt: 10_000, type, payloadJson: JSON.stringify(payload) } as Parameters<SimulationRuntime["submitCommand"]>[0]);
  await Promise.resolve();
  return commandId;
};
const rejection = (events: SimulationEvent[], commandId: string): SimulationEvent | undefined =>
  events.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === commandId);

const expectSiphonActive = (runtime: SimulationRuntime): void => {
  // The victim's town at 10,0 is in the 3x3 too (output zeroed, no slots to move).
  expect(tileAt(runtime, TOWER)?.observatory?.siphon?.tileKeys).toEqual(["10,0", TARGET]);
  expect(tileAt(runtime, "10,0")?.sabotage).toMatchObject({ ownerId: CASTER, observatoryTileKey: TOWER });
  expect(tileAt(runtime, TARGET)?.sabotage).toMatchObject({ ownerId: CASTER, observatoryTileKey: TOWER, outputMultiplier: 0 });
  expect(titaniumSupply(runtime, CASTER)).toBe(1);
  expect(titaniumSupply(runtime, VICTIM)).toBe(0);
  expect(fortDormant(runtime, CASTER, CASTER_FORT)).toBe(false);
  expect(fortDormant(runtime, VICTIM, VICTIM_FORT)).toBe(true);
};

const expectSiphonEnded = (runtime: SimulationRuntime): void => {
  expect(tileAt(runtime, TOWER)?.observatory?.siphon).toBeUndefined();
  expect(tileAt(runtime, TARGET)?.sabotage).toBeUndefined();
  expect(tileAt(runtime, "10,0")?.sabotage).toBeUndefined();
  expect(titaniumSupply(runtime, VICTIM)).toBe(1);
  expect(fortDormant(runtime, VICTIM, VICTIM_FORT)).toBe(false);
};

describe("Siphon siphon mode", () => {
  it("transfers the drained resource tile's slots from victim to caster, flipping dormancy both ways", async () => {
    const runtime = buildRuntime();
    const seen = collectEvents(runtime);
    expect(titaniumSupply(runtime, CASTER)).toBe(0);
    expect(titaniumSupply(runtime, VICTIM)).toBe(1);
    expect(fortDormant(runtime, CASTER, CASTER_FORT)).toBe(true);
    expect(fortDormant(runtime, VICTIM, VICTIM_FORT)).toBe(false);

    const cast = await submit(runtime, "SIPHON_TILE", { x: 10, y: 1 });
    expect(rejection(seen, cast)).toBeUndefined();
    expectSiphonActive(runtime);
    // Both players get a fresh player-state update so their dormancy flips show at once.
    const updated = seen.filter((event) => event.eventType === "PLAYER_MESSAGE" && event.commandId === cast).map((event) => event.playerId);
    expect(new Set(updated)).toEqual(new Set([CASTER, VICTIM]));
  });

  it("locks the tower: it can't cast another ability until the siphon ends", async () => {
    const runtime = buildRuntime([{ x: 12, y: 2, terrain: "LAND", ownerId: VICTIM, ownershipState: "SETTLED", resource: "FARM" }]);
    const seen = collectEvents(runtime);
    await submit(runtime, "SIPHON_TILE", { x: 10, y: 1 });
    const second = await submit(runtime, "SIPHON_TILE", { x: 12, y: 2 });
    expect(rejection(seen, second)).toMatchObject({ code: "SIPHON_INVALID" });
  });

  it("CANCEL_SIPHON ends it, gives the slots back to both players, and starts the tower's cooldown", async () => {
    const runtime = buildRuntime();
    const seen = collectEvents(runtime);
    await submit(runtime, "SIPHON_TILE", { x: 10, y: 1 });
    const stranger = await submit(runtime, "CANCEL_SIPHON", { x: 0, y: 1 }, VICTIM);
    expect(rejection(seen, stranger)).toMatchObject({ code: "CANCEL_SIPHON_INVALID" });
    expectSiphonActive(runtime);

    const cancel = await submit(runtime, "CANCEL_SIPHON", { x: 0, y: 1 });
    expect(rejection(seen, cancel)).toBeUndefined();
    expectSiphonEnded(runtime);
    expect(titaniumSupply(runtime, CASTER)).toBe(0);
    expect(fortDormant(runtime, CASTER, CASTER_FORT)).toBe(true);
    expect(tileAt(runtime, TOWER)?.observatory?.cooldownUntil).toBeGreaterThan(10_000);

    const again = await submit(runtime, "CANCEL_SIPHON", { x: 0, y: 1 });
    expect(rejection(seen, again)).toMatchObject({ code: "CANCEL_SIPHON_INVALID" });
  });

  it("ends when the victim switches on an Aether Tower whose protection covers the drained tile", async () => {
    const victimTower = { x: 12, y: 1, terrain: "LAND", ownerId: VICTIM, ownershipState: "SETTLED", observatory: { ownerId: VICTIM, status: "inactive", activatedAt: 1_000 } };
    const runtime = buildRuntime([victimTower, { x: 12, y: 2, terrain: "LAND", ownerId: VICTIM, ownershipState: "SETTLED", resource: "GEMS" }]);
    await submit(runtime, "SIPHON_TILE", { x: 10, y: 1 });
    expectSiphonActive(runtime);

    await submit(runtime, "SET_OBSERVATORY_ENABLED", { x: 12, y: 1, enabled: true }, VICTIM);
    expectSiphonEnded(runtime);
  });

  it("refuses to drain tiles the owner already covers with an active Aether Tower", async () => {
    const victimTower = { x: 12, y: 1, terrain: "LAND", ownerId: VICTIM, ownershipState: "SETTLED", observatory: { ownerId: VICTIM, status: "active", activatedAt: 1_000 } };
    const runtime = buildRuntime([victimTower, { x: 12, y: 2, terrain: "LAND", ownerId: VICTIM, ownershipState: "SETTLED", resource: "GEMS" }]);
    const seen = collectEvents(runtime);
    const cast = await submit(runtime, "SIPHON_TILE", { x: 10, y: 1 });
    expect(rejection(seen, cast)).toMatchObject({ code: "SIPHON_INVALID" });
    expect(tileAt(runtime, TOWER)?.observatory?.siphon).toBeUndefined();
  });

  it("ends when the caster switches the siphoning tower off", async () => {
    const runtime = buildRuntime();
    await submit(runtime, "SIPHON_TILE", { x: 10, y: 1 });
    await submit(runtime, "SET_OBSERVATORY_ENABLED", { x: 0, y: 1, enabled: false });
    expectSiphonEnded(runtime);
    expect(tileAt(runtime, TOWER)?.observatory?.status).toBe("inactive");
  });

  it("ends when the caster's tower is destroyed or captured", async () => {
    for (const lose of ["destroyed", "captured"] as const) {
      const runtime = buildRuntime();
      await submit(runtime, "SIPHON_TILE", { x: 10, y: 1 });
      const tower = tileAt(runtime, TOWER)!;
      const next: DomainTileState =
        lose === "destroyed"
          ? { ...tower, observatory: undefined }
          : { ...tower, ownerId: VICTIM, observatory: { ...tower.observatory!, ownerId: VICTIM } };
      internals(runtime).replaceTileState(TOWER, next, `lose-${lose}`);
      expectSiphonEnded(runtime);
    }
  });

  it("ends when a drained tile changes owner", async () => {
    const runtime = buildRuntime();
    await submit(runtime, "SIPHON_TILE", { x: 10, y: 1 });
    internals(runtime).replaceTileState(TARGET, { ...tileAt(runtime, TARGET)!, ownerId: CASTER }, "capture-target");
    expect(tileAt(runtime, TOWER)?.observatory?.siphon).toBeUndefined();
    expect(tileAt(runtime, TARGET)?.sabotage).toBeUndefined();
  });

  it("releases the tower when some other write strips a drained tile's stamp without an owner change", async () => {
    const runtime = buildRuntime();
    await submit(runtime, "SIPHON_TILE", { x: 10, y: 1 });
    internals(runtime).replaceTileState(TARGET, { ...tileAt(runtime, TARGET)!, sabotage: undefined }, "strip-stamp");
    expectSiphonEnded(runtime);
  });

  it("survives a restart (event recovery) and can still be cancelled afterwards", async () => {
    const runtime = buildRuntime();
    const seen = collectEvents(runtime);
    await submit(runtime, "SIPHON_TILE", { x: 10, y: 1 });
    const base: RecoveredSimulationState = {
      tiles: initialTiles(),
      activeLocks: [],
      players: [],
      pendingSettlements: [],
      tileYieldCollectedAtByTile: [],
      playerYieldCollectionEpochByPlayer: []
    } as unknown as RecoveredSimulationState;
    const recovered = applySimulationEventsToRecoveredState(base, seen);
    const restarted = buildRuntime([], { ...recovered, players: [] } as RecoveredSimulationState);
    expectSiphonActive(restarted);

    // And an END survives too: the clear must not resurrect on replay.
    const restartedEvents = collectEvents(restarted);
    await submit(restarted, "CANCEL_SIPHON", { x: 0, y: 1 });
    const recoveredAfterEnd = applySimulationEventsToRecoveredState(recovered, restartedEvents);
    const restartedAgain = buildRuntime([], { ...recoveredAfterEnd, players: [] } as RecoveredSimulationState);
    expectSiphonEnded(restartedAgain);
  });
});
