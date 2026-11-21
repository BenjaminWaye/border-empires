import { describe, expect, it, vi } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";
import { applyCombatEncirclement } from "../runtime-lock-resolution-encirclement.js";
import type { LockRecord } from "../runtime-types.js";

// A player who loses their last land to encirclement or frontier decay (a
// stranded-frontier release) gets the same "empire fell" notice and email as
// one wiped out by attack: an immediate `eliminated` respawn, not a quiet
// auth_recovery respawn at their next login.

type TileSeed = { x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" };

const frontier = (x: number, y: number): TileSeed => ({ x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" });
// Open ground far from player-1's frontier: somewhere to land the respawn.
const openGround: TileSeed[] = Array.from({ length: 81 }, (_, i) => ({ x: 5 + (i % 9), y: 5 + Math.floor(i / 9), terrain: "LAND" }));

const buildRuntime = (tiles: TileSeed[]): SimulationRuntime =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
    seedTiles: new Map(),
    initialState: { tiles: [...openGround, ...tiles], activeLocks: [] }
  });

const respawnedMessages = (seen: SimulationEvent[], playerId = "player-1"): Array<Record<string, unknown>> =>
  seen.flatMap((event) =>
    event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_RESPAWNED" && event.playerId === playerId
      ? [JSON.parse(event.payloadJson) as Record<string, unknown>]
      : []
  );

const expectEmpireFellOnce = (runtime: SimulationRuntime, seen: SimulationEvent[]): void => {
  const messages = respawnedMessages(seen);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({ reason: "eliminated" });
  expect(runtime.peekRespawnNoticeForPlayer("player-1")).toMatchObject({ reasonCode: "eliminated" });
  // Already landed, so the next login has nothing to recover (no second, auth_recovery notice).
  expect(runtime.ensurePlayerHasSpawnTerritory("player-1")).toBe(false);
  expect(respawnedMessages(seen)).toHaveLength(1);
};

describe("empire fell after encirclement or frontier decay", () => {
  it("frontier decay: releasing a player's last stranded frontier respawns them with the eliminated notice", async () => {
    const runtime = buildRuntime([frontier(40, 40), frontier(41, 40)]);
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "system-runtime:stranded-region:0,0",
      sessionId: "system-runtime:stranded-region",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "CHECK_STRANDED_REGION",
      payloadJson: JSON.stringify({ cx: 0, cy: 0 })
    });

    await vi.waitFor(() => expect(respawnedMessages(seen)).toHaveLength(1));
    expect(runtime.wireDeltaForTileKey("40,40", "player-1")?.ownerId).toBeUndefined();
    expectEmpireFellOnce(runtime, seen);
  });

  it("encirclement: cutting off a player's last frontier outside combat respawns them with the eliminated notice", () => {
    // The non-combat callers (Aether Lance, bombardment, Create Mountain, AFC
    // hijack, abandon) remove a tile and then re-check encirclement from it.
    const runtime = buildRuntime([frontier(30, 30), frontier(31, 30)]);
    const seen = collectEvents(runtime);
    const applyEncirclement = (runtime as unknown as {
      applyEncirclement: (keys: string[], playerId: string, commandId: string, options?: { bfsCap?: number }) => void;
    }).applyEncirclement.bind(runtime);

    applyEncirclement(["29,30"], "player-1", "aether-lance-1", { bfsCap: 2000 });

    expect(runtime.wireDeltaForTileKey("30,30", "player-1")?.ownerId).toBeUndefined();
    expectEmpireFellOnce(runtime, seen);
  });

  it("combat encirclement defers to the lock resolution's own wipe-out check", () => {
    const runtime = buildRuntime([frontier(30, 30)]);
    const seen = collectEvents(runtime);
    const applyEncirclement = (runtime as unknown as {
      applyEncirclement: (keys: string[], playerId: string, commandId: string, options?: { deferEliminationCheck?: boolean }) => void;
    }).applyEncirclement.bind(runtime);

    applyEncirclement(["29,30"], "player-1", "attack-1", { deferEliminationCheck: true });

    expect(runtime.wireDeltaForTileKey("30,30", "player-1")?.ownerId).toBeUndefined();
    expect(respawnedMessages(seen)).toHaveLength(0);
  });

  it("Aether Lance: purging the tile a player's last frontier hung off respawns them with the eliminated notice", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["crystal-lattices"]), strategicResources: { CRYSTAL: 500 } })],
        ["player-2", buildPlayer("player-2", { points: 5_000, manpower: 100 })]
      ]),
      initialState: {
        tiles: [
          ...openGround,
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          // player-2's whole empire: one settled tile and the frontier hanging off it.
          { x: 5, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 6, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ] as never,
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "lance-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "AETHER_LANCE", payloadJson: JSON.stringify({ x: 5, y: 0 })
    });

    await vi.waitFor(() => expect(respawnedMessages(seen, "player-2")).toHaveLength(1));
    expect(runtime.wireDeltaForTileKey("6,0", "player-2")?.ownerId).toBeUndefined();
    expect(respawnedMessages(seen, "player-2")[0]).toMatchObject({ reason: "eliminated" });
    expect(runtime.peekRespawnNoticeForPlayer("player-2")).toMatchObject({ reasonCode: "eliminated" });
  });

  it("combat encirclement always asks applyEncirclement to defer the wipe-out check to resolveLock", () => {
    const calls: Array<{ playerId: string; deferEliminationCheck: boolean | undefined }> = [];
    const context = {
      applyEncirclement: (_keys: string[], playerId: string, _commandId: string, options?: { deferEliminationCheck?: boolean }) =>
        void calls.push({ playerId, deferEliminationCheck: options?.deferEliminationCheck }),
      applyEncirclementForExpand: () => {}
    };
    const lock = { actionType: "ATTACK", targetKey: "11,10", originKey: "10,10", playerId: "attacker", commandId: "attack-1" } as LockRecord;

    applyCombatEncirclement(context, lock, true, false, "defender");
    applyCombatEncirclement(context, lock, false, true, "defender");

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.deferEliminationCheck === true)).toBe(true);
  });
});
