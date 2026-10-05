import { describe, expect, it, vi } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";
import { strandedFrontierCounter } from "../stranded-frontier/stranded-frontier-metrics.js";

// Stranded frontier cleanup (docs/stranded-frontier-cleanup-plan.md): a FRONTIER
// tile that can no longer reach its owner's settled land decays instantly under
// the encirclement rule. These cover the two on-demand triggers -- the origin
// check on EXPAND/ATTACK and the gateway-forwarded CHECK_STRANDED_REGION -- and
// that out-of-reach decay (a separate, timer-based mechanic) is left alone.

type TileSeed = { x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED"; town?: { type: "MARKET"; populationTier: "SETTLEMENT" } };

const town = (x: number, y: number, ownerId: string): TileSeed => ({
  x, y, terrain: "LAND", ownerId, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" }
});
const frontier = (x: number, y: number, ownerId: string): TileSeed => ({ x, y, terrain: "LAND", ownerId, ownershipState: "FRONTIER" });
const neutral = (x: number, y: number): TileSeed => ({ x, y, terrain: "LAND" });

const buildRuntime = (tiles: TileSeed[]): SimulationRuntime =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })],
      ["player-2", buildPlayer("player-2", { points: 10_000, manpower: 10_000 })]
    ]),
    seedTiles: new Map(),
    initialState: { tiles, activeLocks: [] }
  });

const ownerOf = (runtime: SimulationRuntime, key: string): string | undefined => runtime.wireDeltaForTileKey(key, "player-1")?.ownerId;

const expand = async (runtime: SimulationRuntime, from: [number, number], to: [number, number], commandId: string): Promise<SimulationEvent[]> => {
  const seen = collectEvents(runtime);
  runtime.submitCommand({
    commandId,
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq: 1,
    issuedAt: 1_000,
    type: "EXPAND",
    payloadJson: JSON.stringify({ fromX: from[0], fromY: from[1], toX: to[0], toY: to[1] })
  });
  await Promise.resolve();
  return seen;
};

const firstOutcome = (seen: SimulationEvent[], commandId: string): SimulationEvent | undefined =>
  seen.find((event) => (event.eventType === "COMMAND_ACCEPTED" || event.eventType === "COMMAND_REJECTED") && event.commandId === commandId);

describe("stranded frontier: origin check", () => {
  it("rejects an EXPAND from a cut-off frontier tile and releases its whole component", async () => {
    const runtime = buildRuntime([town(10, 10, "player-1"), frontier(30, 30, "player-1"), frontier(31, 30, "player-1"), neutral(32, 30)]);
    const releasedBefore = strandedFrontierCounter("originReleased");

    const seen = await expand(runtime, [31, 30], [32, 30], "expand-stranded");

    expect(firstOutcome(seen, "expand-stranded")).toMatchObject({ eventType: "COMMAND_REJECTED", code: "ORIGIN_CUT_OFF" });
    expect(ownerOf(runtime, "31,30")).toBeUndefined();
    expect(ownerOf(runtime, "30,30")).toBeUndefined();
    expect(ownerOf(runtime, "10,10")).toBe("player-1");
    expect(strandedFrontierCounter("originReleased")).toBe(releasedBefore + 1);
  });

  it("accepts an EXPAND from a frontier tile next to settled land without the slow path", async () => {
    const runtime = buildRuntime([town(10, 10, "player-1"), frontier(11, 10, "player-1"), neutral(12, 10)]);
    const slowBefore = strandedFrontierCounter("originSlowPath");

    const seen = await expand(runtime, [11, 10], [12, 10], "expand-connected");

    expect(firstOutcome(seen, "expand-connected")).toMatchObject({ eventType: "COMMAND_ACCEPTED" });
    expect(strandedFrontierCounter("originSlowPath")).toBe(slowBefore);
  });

  it("still allows expanding from an out-of-reach (decaying) tile that is connected to settled land", async () => {
    // A frontier chain running far past the town's reach: the far end carries an
    // out-of-reach decay timer but is still supply-connected, so it stays a
    // valid origin (out-of-reach decay is a separate, timer-based mechanic).
    const chain = Array.from({ length: 30 }, (_, i) => frontier(11 + i, 10, "player-1"));
    const runtime = buildRuntime([town(10, 10, "player-1"), ...chain, neutral(41, 10)]);
    expect(runtime.wireDeltaForTileKey("40,10", "player-1")?.frontierDecayKind).toBe("OUT_OF_REACH");

    const seen = await expand(runtime, [40, 10], [41, 10], "expand-out-of-reach");

    expect(firstOutcome(seen, "expand-out-of-reach")).toMatchObject({ eventType: "COMMAND_ACCEPTED" });
    expect(ownerOf(runtime, "40,10")).toBe("player-1");
  });
});

describe("stranded frontier: CHECK_STRANDED_REGION", () => {
  const regionCommand = (commandId: string, payload: unknown) => ({
    commandId,
    sessionId: "system-runtime:stranded-region",
    playerId: "player-1",
    clientSeq: 0,
    issuedAt: 1_000,
    type: "CHECK_STRANDED_REGION" as const,
    payloadJson: JSON.stringify(payload)
  });

  it("releases every owner's stranded frontier in the chunk, keeps connected and barbarian tiles, and is never retained", async () => {
    const runtime = buildRuntime([
      town(10, 10, "player-1"),
      frontier(11, 10, "player-1"), // connected
      frontier(40, 40, "player-1"), frontier(41, 40, "player-1"), // stranded
      town(50, 50, "player-2"),
      frontier(51, 50, "player-2"), // connected
      frontier(20, 50, "player-2"), // stranded (another owner's)
      frontier(5, 40, "barbarian-1") // barbarians are never swept
    ]);
    const invalidBefore = strandedFrontierCounter("regionInvalid");

    // An invalid payload first: counted, nothing released. Both commands use
    // clientSeq 0, so this also proves the second is not replay-deduped away.
    runtime.submitCommand(regionCommand("system-runtime:stranded-region:bad", { cx: 999, cy: 0 }));
    runtime.submitCommand(regionCommand("system-runtime:stranded-region:good", { cx: 0, cy: 0 }));

    await vi.waitFor(() => expect(ownerOf(runtime, "40,40")).toBeUndefined());
    expect(ownerOf(runtime, "41,40")).toBeUndefined();
    expect(ownerOf(runtime, "20,50")).toBeUndefined();
    expect(ownerOf(runtime, "11,10")).toBe("player-1");
    expect(ownerOf(runtime, "51,50")).toBe("player-2");
    expect(ownerOf(runtime, "5,40")).toBe("barbarian-1");
    expect(strandedFrontierCounter("regionInvalid")).toBe(invalidBefore + 1);
    expect(runtime.snapshot().commands.some((command) => command.type === "CHECK_STRANDED_REGION")).toBe(false);
  });
});
