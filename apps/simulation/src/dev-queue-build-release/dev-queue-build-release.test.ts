import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_SETTLE_PREFS, FORT_TIER_LADDER } from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile } from "../afc-test-fixture/afc-test-fixture.js";
import { releaseQueuedBuildReservation } from "./dev-queue-build-release.js";

/**
 * Playtest 2026-11-12 (pt-optimiser): a Manufactory whose card said 150
 * manpower charged 300, twice, for a player above the cap. An online client
 * mirrors a queued build to the server (DEV_QUEUE_ENQUEUE holds its manpower),
 * dispatches BUILD_STRUCTURE itself, then sends DEV_QUEUE_CANCEL. The build
 * charged in full on top of the hold, and the cancel's refund is clamped to
 * the cap, so the hold was lost.
 */
const OVER_CAP = 2_000;

const makeRuntime = () => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    // Online: the client owns dispatch of its queued entries.
    isPlayerSubscribed: () => true,
    initialPlayers: new Map([["player-1", {
      id: "player-1", isAi: false, points: 50_000, manpower: 0,
      techIds: new Set<string>(["masonry"]), domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local", allies: new Set<string>(), autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS },
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
      landingReserveGranted: true
    }]]),
    initialState: {
      tiles: [
        afcModuleFixtureTile("player-1"),
        { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
        ...[0, 1, 2, 3].map((i) => ({ x: 4 + i, y: 12, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "TITANIUM" as const })),
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
      ],
      activeLocks: []
    }
  });
  const rejections: string[] = [];
  runtime.onEvent((e) => { if (e.eventType === "COMMAND_REJECTED") rejections.push(e.message); });
  let seq = 0;
  const send = async (type: string, payload: Record<string, unknown>): Promise<void> => {
    seq += 1;
    runtime.submitCommand({ commandId: `c${seq}`, sessionId: "s", playerId: "player-1", clientSeq: seq, issuedAt: 1_000, type, payloadJson: JSON.stringify(payload) } as unknown as CommandEnvelope);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  const player = () => runtime.exportState().players.find((entry) => entry.id === "player-1")!;
  return { runtime, send, rejections, player };
};

describe("a client-dispatched queued build", () => {
  it("is charged its cost once when the player is above the manpower cap", async () => {
    const { runtime, send, rejections, player } = makeRuntime();
    // Put the player above the cap the way the landing reserve / a Waystation grant does.
    const live = (runtime as unknown as { state: { players: Map<string, { manpower: number; waystationManpowerOverflow?: number }> } }).state.players.get("player-1")!;
    const cap = player().manpowerCap;
    live.manpower = cap + OVER_CAP;
    live.waystationManpowerOverflow = OVER_CAP;
    const cost = FORT_TIER_LADDER.FORT.manpower;

    await send("DEV_QUEUE_ENQUEUE", { x: 10, y: 10, tileKey: "10,10", kind: "BUILD", structureType: "FORT", tier: "FORT" });
    expect(player().manpower).toBe(cap + OVER_CAP - cost);

    await send("BUILD_STRUCTURE", { x: 10, y: 10, structureType: "FORT", tier: "FORT" });
    await send("DEV_QUEUE_CANCEL", { tileKey: "10,10" });

    expect(rejections).toEqual([]);
    expect(player().manpower).toBe(cap + OVER_CAP - cost);
    expect(player().devQueue ?? []).toEqual([]);
  });
});

describe("releaseQueuedBuildReservation", () => {
  it("returns the hold unclamped and drops the entry", () => {
    const summary = { devQueue: [{ tileKey: "1,1", x: 1, y: 1, kind: "BUILD" as const, structureType: "MANUFACTORY", reservedManpower: 150, enqueuedAt: 0 }] };
    const player = { manpower: 5 };
    releaseQueuedBuildReservation(summary, player, "1,1", "MANUFACTORY");
    expect(player.manpower).toBe(155);
    expect(summary.devQueue).toEqual([]);
  });

  it("leaves garrisons, removals, other structures and other tiles alone", () => {
    const entries = [
      { tileKey: "1,1", x: 1, y: 1, kind: "SETTLE" as const, reservedManpower: 20, enqueuedAt: 0 },
      { tileKey: "2,2", x: 2, y: 2, kind: "BUILD" as const, structureType: "REMOVE_STRUCTURE", enqueuedAt: 0 },
      { tileKey: "4,4", x: 4, y: 4, kind: "BUILD" as const, structureType: "FORT", reservedManpower: 300, enqueuedAt: 0 }
    ];
    const summary = { devQueue: entries };
    const player = { manpower: 5 };
    for (const key of ["1,1", "2,2", "3,3", "4,4"]) releaseQueuedBuildReservation(summary, player, key, "MANUFACTORY");
    expect(player.manpower).toBe(5);
    expect(summary.devQueue).toBe(entries);
  });
});
