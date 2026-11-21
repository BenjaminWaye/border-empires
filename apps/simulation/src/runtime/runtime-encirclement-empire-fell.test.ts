import { describe, expect, it, vi } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

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

const respawnedMessages = (seen: SimulationEvent[]): Array<Record<string, unknown>> =>
  seen.flatMap((event) =>
    event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_RESPAWNED" && event.playerId === "player-1"
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
});
