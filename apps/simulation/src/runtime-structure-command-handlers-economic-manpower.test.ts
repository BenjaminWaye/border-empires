/**
 * Regression tests for Step 4 of docs/manpower-economy-rewrite-plan.md
 * (§4.1/§4.4, §12): every economic structure now costs manpower as a
 * primary cost, not just gold — previously only FORT/SIEGE_OUTPOST/
 * WOODEN_FORT/RELAY_BEACON were manpower-gated; economic structures like
 * MINTWORKS, CARAVANARY, FARMSTEAD, etc. cost zero manpower.
 */
import { describe, expect, it, vi } from "vitest";
import { structureBuildDurationMs, structureBuildManpowerCost } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime/runtime.js";
import { buildPlayer, collectEvents } from "./runtime/runtime.test-helpers.js";

type RawPlayerRef = { manpower: number };

/**
 * Constructs a runtime and normalizes the actor's manpower to exactly
 * `startingManpower`, sidestepping the unrelated "cap grew" migration grant
 * (see docs/manpower-economy-rewrite-plan.md §4.3 and
 * tick-territory-automation-ai-manpower-reserve.test.ts's fuller writeup of
 * the same quirk): reading a snapshot once lets that one-time grant settle
 * before the raw value under test is set directly.
 */
const buildRuntimeWithManpower = (startingManpower: number, extraTiles: Array<Record<string, unknown>> = []) => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["trade", "agriculture"]), strategicResources: { FOOD: 100 } })]
    ]),
    initialState: {
      tiles: [
        {
          x: 16,
          y: 16,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          town: { name: "Trade Hub", type: "MARKET", populationTier: "TOWN" }
        },
        { x: 16, y: 17, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        // FOOD slot supply for the town's own 2-slot demand (§5.3) plus
        // whatever the structure under test draws — without this, every
        // build here would reject with INSUFFICIENT_SLOT before manpower is
        // ever checked.
        { x: 16, y: 18, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 16, y: 19, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 16, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 16, y: 21, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        ...extraTiles
      ],
      activeLocks: []
    }
  });
  runtime.exportPlayerDebugSnapshot(); // settle the one-time cap-grant quirk
  const raw = (runtime as unknown as { state: { players: Map<string, RawPlayerRef> } }).state.players.get("player-1")!;
  raw.manpower = startingManpower;
  return runtime;
};

describe("economic structure manpower cost (Step 4)", () => {
  it("deducts MINTWORKS's manpower cost on build, matching structureBuildManpowerCost", async () => {
    vi.useFakeTimers();
    try {
      expect(structureBuildManpowerCost("MINTWORKS")).toBe(150);
      // Below the fixture's real manpower cap (well under the ~1,026 town+capital
      // total here) so the build's own deduction is the only thing that moves
      // this number — a starting value above cap would just clamp down to cap
      // on every read, per §4.3's regen/cap-clamp behavior.
      const runtime = buildRuntimeWithManpower(500);

      runtime.submitCommand({
        commandId: "mintworks-manpower-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "MINTWORKS" })
      });

      await Promise.resolve();
      const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
      expect(player?.manpower).toBe(500 - 150);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a MINTWORKS build with INSUFFICIENT_MANPOWER when manpower is below cost, even with plenty of gold", async () => {
    const runtime = buildRuntimeWithManpower(structureBuildManpowerCost("MINTWORKS") - 1);
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "mintworks-manpower-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "MINTWORKS" })
    });

    await Promise.resolve();
    const rejected = seen.find((event) => event.eventType === "COMMAND_REJECTED");
    expect(rejected).toMatchObject({ code: "INSUFFICIENT_MANPOWER" });
    expect(runtime.exportState().tiles.some((tile) => tile.x === 16 && tile.y === 17 && tile.economicStructureJson)).toBe(false);
  });

  it("deducts FARMSTEAD's manpower cost (Tier 1, 80) on build", async () => {
    vi.useFakeTimers();
    try {
      expect(structureBuildManpowerCost("FARMSTEAD")).toBe(80);
      const runtime = buildRuntimeWithManpower(500, [{ x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }]);

      runtime.submitCommand({
        commandId: "farmstead-manpower-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 20, y: 20, structureType: "FARMSTEAD" })
      });

      await Promise.resolve();
      const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
      expect(player?.manpower).toBe(500 - 80);

      vi.advanceTimersByTime(structureBuildDurationMs("FARMSTEAD"));
    } finally {
      vi.useRealTimers();
    }
  });
});
