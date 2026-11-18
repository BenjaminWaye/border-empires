import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

type SummaryView = {
  claimContinuations: Map<string, { structureType?: string }>;
  devQueue: Array<{ tileKey: string; x: number; y: number; kind: string; queuedAt: number }>;
};
const summaryOf = (runtime: SimulationRuntime): SummaryView =>
  (runtime as unknown as { summaryForPlayer: (playerId: string) => SummaryView }).summaryForPlayer("player-1");

// Regression (2026-11 staging playtest, tile 573,300): Build on an owned
// FRONTIER tile outside reach sends CLAIM_CONTINUATION_SET + SETTLE. The SETTLE
// is refused OUT_OF_REACH, but the "garrison + build" continuation and its
// queued SETTLE entry stayed registered, so the tile read as queued forever.
const outOfReachRuntime = (scheduleAfter: (delayMs: number, task: () => void) => void = () => {}): SimulationRuntime =>
  new SimulationRuntime({
    now: () => 1_000,
    scheduleAfter,
    isPlayerSubscribed: () => true,
    initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "TOWN" } },
        { x: 50, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "FARM" },
        // A supply-connected FRONTIER chain running past the town's reach border (x 7-13), then neutral ground.
        ...[11, 12, 13, 14, 15].map((x) => ({ x, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "FRONTIER" as const })),
        { x: 16, y: 10, terrain: "LAND", resource: "FARM" }
      ],
      docks: [],
      activeLocks: []
    }
  });

const runBuildOnOutOfReachFrontier = async (order: "continuation-first" | "settle-first") => {
  const runtime = outOfReachRuntime();
  const seen = collectEvents(runtime);
  const submit = (commandId: string, clientSeq: number, type: string, payload: object): void => runtime.submitCommand({
    commandId, sessionId: "session-1", playerId: "player-1", clientSeq, issuedAt: 1_000, type: type as never, payloadJson: JSON.stringify(payload)
  });

  // Exactly what the client's handleBuildAction sends for a FRONTIER tile. The
  // sim may handle them in either order: SETTLE rides a faster lane.
  const continuation = (): void => submit("continuation", 1, "CLAIM_CONTINUATION_SET", { x: 50, y: 50, structureType: "HYDROGARDEN" });
  const settle = (): void => submit("settle", 2, "SETTLE", { x: 50, y: 50 });
  if (order === "continuation-first") { continuation(); settle(); } else { settle(); continuation(); }
  for (let i = 0; i < 4; i += 1) await Promise.resolve();

  expect(seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "settle")?.code).toBe("OUT_OF_REACH");
  const summary = summaryOf(runtime);
  expect(summary.claimContinuations.has("50,50")).toBe(false);
  expect(summary.devQueue.filter((entry) => entry.tileKey === "50,50")).toEqual([]);
};

describe("SETTLE refused as OUT_OF_REACH with a build queued behind it", () => {
  it("drops the claim continuation and its queued garrison", async () => {
    await runBuildOnOutOfReachFrontier("continuation-first");
  });

  it("never registers a continuation that arrives after the refusal", async () => {
    await runBuildOnOutOfReachFrontier("settle-first");
  });
});

describe("garrison + build continuation outside reach", () => {
  it("drops a continuation registered earlier when its SETTLE is refused OUT_OF_REACH", async () => {
    // Registered while the tile was in reach; reach has since shrunk.
    const runtime = outOfReachRuntime();
    const seen = collectEvents(runtime);
    const summary = summaryOf(runtime);
    summary.claimContinuations.set("50,50", { structureType: "HYDROGARDEN" });
    summary.devQueue = [{ tileKey: "50,50", x: 50, y: 50, kind: "SETTLE", queuedAt: 1_000 }];

    runtime.submitCommand({
      commandId: "settle", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000, type: "SETTLE", payloadJson: JSON.stringify({ x: 50, y: 50 })
    });
    for (let i = 0; i < 4; i += 1) await Promise.resolve();

    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "settle")?.code).toBe("OUT_OF_REACH");
    expect(summaryOf(runtime).claimContinuations.has("50,50")).toBe(false);
    expect(summaryOf(runtime).devQueue.filter((entry) => entry.tileKey === "50,50")).toEqual([]);
  });

  it("drops the continuation when an EXPAND lands on a neutral tile outside reach", async () => {
    const scheduled: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = outOfReachRuntime((delayMs, task) => { scheduled.push({ delayMs, task }); });
    const submit = (commandId: string, clientSeq: number, type: string, payload: object): void => runtime.submitCommand({
      commandId, sessionId: "session-1", playerId: "player-1", clientSeq, issuedAt: 1_000, type: type as never, payloadJson: JSON.stringify(payload)
    });
    submit("expand", 1, "EXPAND", { fromX: 15, fromY: 10, toX: 16, toY: 10 });
    submit("continuation", 2, "CLAIM_CONTINUATION_SET", { x: 16, y: 10, structureType: "HYDROGARDEN" });
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    expect(summaryOf(runtime).claimContinuations.has("16,10")).toBe(true);

    const expandResolution = scheduled.find((entry) => entry.delayMs > 0);
    expect(expandResolution).toBeDefined();
    expandResolution!.task();
    for (let i = 0; i < 4; i += 1) await Promise.resolve();

    expect(runtime.exportState().tiles).toContainEqual(expect.objectContaining({ x: 16, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" }));
    expect(summaryOf(runtime).claimContinuations.has("16,10")).toBe(false);
    expect(summaryOf(runtime).devQueue.filter((entry) => entry.tileKey === "16,10")).toEqual([]);
  });
});
