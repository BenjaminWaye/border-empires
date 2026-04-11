import { afterEach, describe, expect, it, vi } from "vitest";
import type { Player, Tile } from "@border-empires/shared";

import { createChunkSnapshotController } from "./snapshots.js";

const makePlayer = (id: string): Player =>
  ({
    id,
    name: id,
    x: 0,
    y: 0,
    color: "#fff",
    points: 0,
    level: 1,
    T: 1,
    stamina: 0,
    territoryTiles: new Set<string>(),
    discoveredContinents: [],
    isAi: false,
    isEliminated: false,
    respawnPending: false,
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techIds: new Set<string>(),
    unlockedTechIds: [],
    currentResearch: undefined,
    researchQueue: [],
    domainIds: new Set<string>(),
    claimedDomains: [],
    missions: [],
    missionStats: {
      neutralCaptures: 0,
      enemyCaptures: 0,
      combatWins: 0,
      maxTilesHeld: 0,
      maxSettledTilesHeld: 0,
      maxFarmsHeld: 0,
      maxContinentsHeld: 0,
      maxTechPicks: 0
    },
    pendingTargetBoosts: 0,
    powerups: [],
    E: 0,
    Ts: 0,
    Es: 0,
    currentTargetBoost: undefined,
    techPoints: 0,
    currentTownFocus: undefined,
    currentDomainFocus: undefined,
    inventory: [],
    alliances: new Set<string>(),
    allies: new Set<string>()
  } as unknown) as Player;

const makeTile = (x: number, y: number): Tile =>
  ({
    x,
    y,
    terrain: "LAND",
    fogged: false,
    lastChangedAt: 0
  } as Tile);

describe("createChunkSnapshotController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("yields overloaded snapshots between chunk batches", async () => {
    vi.useFakeTimers();
    const sentPayloads: string[] = [];
    const actor = makePlayer("player-1");
    const controller = createChunkSnapshotController<Player>({
      chunkSize: 1,
      chunkCountX: 8,
      chunkCountY: 8,
      initialBootstrapRadius: 0,
      chunkStreamBatchSize: 4,
      chunkSnapshotBatchSize: 4,
      chunkSnapshotBudgetMs: 24,
      chunkSnapshotWarnMs: 60,
      chunkSnapshotYieldMs: 4,
      chunkSnapshotOverloadYieldMs: 16,
      now: () => Date.now(),
      wrapChunkX: (value) => value,
      wrapChunkY: (value) => value,
      runtimeMemoryStats: () => ({ rssMb: 0, heapUsedMb: 0, heapTotalMb: 0, externalMb: 0, arrayBuffersMb: 0 }),
      pushChunkSnapshotPerf: () => undefined,
      onFirstChunkSent: () => undefined,
      onSlowChunkSnapshot: () => undefined,
      visibilitySnapshotForPlayer: () => ({ allVisible: true, visibleMask: new Uint8Array(0) }),
      cachedChunkSnapshotByPlayer: new Map(),
      fogChunkTilesByChunkKey: new Map(),
      chunkSnapshotGenerationByPlayer: new Map(),
      chunkSnapshotInFlightByPlayer: new Map(),
      chunkSnapshotSentAtByPlayer: new Map(),
      chunkSubscriptionByPlayer: new Map([[actor.id, { cx: 0, cy: 0, radius: 0 }]]),
      authSyncTimingByPlayer: new Map(),
      fogChunkTiles: (worldCx, worldCy) => [makeTile(worldCx, worldCy)],
      summaryChunkTiles: (worldCx, worldCy) => [makeTile(worldCx, worldCy)],
      summaryChunkVersion: () => 0,
      loadSummaryChunkTilesBatch: async (requests) => requests.map(({ cx, cy }) => [makeTile(cx, cy)]),
      visibleInSnapshot: () => true,
      wrapX: (value) => value,
      wrapY: (value) => value,
      worldWidth: 32,
      worldHeight: 32,
      serializeChunkBatchViaWorker: async (inputs) => inputs.map((input) => `worker:${input.cx},${input.cy}`),
      serializeChunkBatchDirect: (inputs) => inputs.map((input) => `direct:${input.cx},${input.cy}`),
      serializeChunkBatchBodies: (_generation, chunkBodies) => chunkBodies.join("|"),
      sendChunkBatchPayload: (socket, payload) => socket.send(payload),
      runtimeLoadShedLevel: () => "hard"
    });

    controller.sendChunkSnapshot(
      { readyState: 1, OPEN: 1, send: (payload) => sentPayloads.push(payload) },
      actor,
      { cx: 0, cy: 0, radius: 0 },
      undefined,
      [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 },
        { cx: 2, cy: 0 }
      ]
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(sentPayloads).toEqual(["direct:0,0"]);

    await vi.advanceTimersByTimeAsync(15);
    expect(sentPayloads).toEqual(["direct:0,0"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(sentPayloads).toEqual(["direct:0,0", "direct:1,0"]);

    await vi.advanceTimersByTimeAsync(16);
    expect(sentPayloads).toEqual(["direct:0,0", "direct:1,0", "direct:2,0"]);
  });

  it("yields normal snapshots once the batch budget is exceeded", async () => {
    vi.useFakeTimers();
    let nowMs = 0;
    const sentPayloads: string[] = [];
    const actor = makePlayer("player-1");
    const controller = createChunkSnapshotController<Player>({
      chunkSize: 1,
      chunkCountX: 8,
      chunkCountY: 8,
      initialBootstrapRadius: 0,
      chunkStreamBatchSize: 2,
      chunkSnapshotBatchSize: 1,
      chunkSnapshotBudgetMs: 5,
      chunkSnapshotWarnMs: 60,
      chunkSnapshotYieldMs: 4,
      chunkSnapshotOverloadYieldMs: 16,
      now: () => nowMs,
      wrapChunkX: (value) => value,
      wrapChunkY: (value) => value,
      runtimeMemoryStats: () => ({ rssMb: 0, heapUsedMb: 0, heapTotalMb: 0, externalMb: 0, arrayBuffersMb: 0 }),
      pushChunkSnapshotPerf: () => undefined,
      onFirstChunkSent: () => undefined,
      onSlowChunkSnapshot: () => undefined,
      visibilitySnapshotForPlayer: () => ({ allVisible: true, visibleMask: new Uint8Array(0) }),
      cachedChunkSnapshotByPlayer: new Map(),
      fogChunkTilesByChunkKey: new Map(),
      chunkSnapshotGenerationByPlayer: new Map(),
      chunkSnapshotInFlightByPlayer: new Map(),
      chunkSnapshotSentAtByPlayer: new Map(),
      chunkSubscriptionByPlayer: new Map([[actor.id, { cx: 0, cy: 0, radius: 0 }]]),
      authSyncTimingByPlayer: new Map(),
      fogChunkTiles: (worldCx, worldCy) => [makeTile(worldCx, worldCy)],
      summaryChunkTiles: (worldCx, worldCy) => [makeTile(worldCx, worldCy)],
      summaryChunkVersion: () => 0,
      loadSummaryChunkTilesBatch: async (requests) => {
        nowMs += 6;
        return requests.map(({ cx, cy }) => [makeTile(cx, cy)]);
      },
      visibleInSnapshot: () => true,
      wrapX: (value) => value,
      wrapY: (value) => value,
      worldWidth: 32,
      worldHeight: 32,
      serializeChunkBatchViaWorker: async (inputs) => inputs.map((input) => `worker:${input.cx},${input.cy}`),
      serializeChunkBatchDirect: (inputs) => inputs.map((input) => `direct:${input.cx},${input.cy}`),
      serializeChunkBatchBodies: (_generation, chunkBodies) => chunkBodies.join("|"),
      sendChunkBatchPayload: (socket, payload) => socket.send(payload),
      runtimeLoadShedLevel: () => "normal"
    });

    controller.sendChunkSnapshot(
      { readyState: 1, OPEN: 1, send: (payload) => sentPayloads.push(payload) },
      actor,
      { cx: 0, cy: 0, radius: 0 },
      undefined,
      [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 }
      ]
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(sentPayloads).toEqual(["direct:0,0"]);

    await vi.advanceTimersByTimeAsync(3);
    expect(sentPayloads).toEqual(["direct:0,0"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(sentPayloads).toEqual(["direct:0,0", "direct:1,0"]);
  });

  it("yields normal multi-chunk snapshots even when cached payload sends stay under budget", async () => {
    vi.useFakeTimers();
    const sentPayloads: string[] = [];
    const actor = makePlayer("player-1");
    const controller = createChunkSnapshotController<Player>({
      chunkSize: 1,
      chunkCountX: 8,
      chunkCountY: 8,
      initialBootstrapRadius: 0,
      chunkStreamBatchSize: 4,
      chunkSnapshotBatchSize: 4,
      chunkSnapshotBudgetMs: 50,
      chunkSnapshotWarnMs: 60,
      chunkSnapshotYieldMs: 4,
      chunkSnapshotOverloadYieldMs: 16,
      now: () => Date.now(),
      wrapChunkX: (value) => value,
      wrapChunkY: (value) => value,
      runtimeMemoryStats: () => ({ rssMb: 0, heapUsedMb: 0, heapTotalMb: 0, externalMb: 0, arrayBuffersMb: 0 }),
      pushChunkSnapshotPerf: () => undefined,
      onFirstChunkSent: () => undefined,
      onSlowChunkSnapshot: () => undefined,
      visibilitySnapshotForPlayer: () => ({ allVisible: true, visibleMask: new Uint8Array(0) }),
      cachedChunkSnapshotByPlayer: new Map(),
      fogChunkTilesByChunkKey: new Map(),
      chunkSnapshotGenerationByPlayer: new Map(),
      chunkSnapshotInFlightByPlayer: new Map(),
      chunkSnapshotSentAtByPlayer: new Map(),
      chunkSubscriptionByPlayer: new Map([[actor.id, { cx: 0, cy: 0, radius: 0 }]]),
      authSyncTimingByPlayer: new Map(),
      fogChunkTiles: (worldCx, worldCy) => [makeTile(worldCx, worldCy)],
      summaryChunkTiles: (worldCx, worldCy) => [makeTile(worldCx, worldCy)],
      summaryChunkVersion: () => 0,
      loadSummaryChunkTilesBatch: async (requests) => requests.map(({ cx, cy }) => [makeTile(cx, cy)]),
      visibleInSnapshot: () => true,
      wrapX: (value) => value,
      wrapY: (value) => value,
      worldWidth: 32,
      worldHeight: 32,
      serializeChunkBatchViaWorker: async (inputs) => inputs.map((input) => `worker:${input.cx},${input.cy}`),
      serializeChunkBatchDirect: (inputs) => inputs.map((input) => `direct:${input.cx},${input.cy}`),
      serializeChunkBatchBodies: (_generation, chunkBodies) => chunkBodies.join("|"),
      sendChunkBatchPayload: (socket, payload) => socket.send(payload),
      runtimeLoadShedLevel: () => "normal"
    });

    controller.sendChunkSnapshot(
      { readyState: 1, OPEN: 1, send: (payload) => sentPayloads.push(payload) },
      actor,
      { cx: 0, cy: 0, radius: 0 },
      undefined,
      [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 },
        { cx: 2, cy: 0 }
      ]
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(sentPayloads).toEqual(["direct:0,0"]);

    await vi.advanceTimersByTimeAsync(3);
    expect(sentPayloads).toEqual(["direct:0,0"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(sentPayloads).toEqual(["direct:0,0", "direct:1,0"]);

    await vi.advanceTimersByTimeAsync(4);
    expect(sentPayloads).toEqual(["direct:0,0", "direct:1,0", "direct:2,0"]);
  });

  it("reads thin chunk summaries through the batch loader instead of the main-thread summary reader", async () => {
    vi.useFakeTimers();
    const sentPayloads: string[] = [];
    const actor = makePlayer("player-1");
    const summaryChunkTiles = vi.fn((worldCx: number, worldCy: number) => [makeTile(worldCx, worldCy)]);
    const loadSummaryChunkTilesBatch = vi.fn(async (requests: Array<{ cx: number; cy: number; mode: "thin" | "shell" }>) =>
      requests.map(({ cx, cy }) => [makeTile(cx, cy)])
    );
    const controller = createChunkSnapshotController<Player>({
      chunkSize: 1,
      chunkCountX: 8,
      chunkCountY: 8,
      initialBootstrapRadius: 0,
      chunkStreamBatchSize: 4,
      chunkSnapshotBatchSize: 4,
      chunkSnapshotBudgetMs: 24,
      chunkSnapshotWarnMs: 60,
      chunkSnapshotYieldMs: 4,
      chunkSnapshotOverloadYieldMs: 16,
      now: () => Date.now(),
      wrapChunkX: (value) => value,
      wrapChunkY: (value) => value,
      runtimeMemoryStats: () => ({ rssMb: 0, heapUsedMb: 0, heapTotalMb: 0, externalMb: 0, arrayBuffersMb: 0 }),
      pushChunkSnapshotPerf: () => undefined,
      onFirstChunkSent: () => undefined,
      onSlowChunkSnapshot: () => undefined,
      visibilitySnapshotForPlayer: () => ({ allVisible: true, visibleMask: new Uint8Array(0) }),
      cachedChunkSnapshotByPlayer: new Map(),
      fogChunkTilesByChunkKey: new Map(),
      chunkSnapshotGenerationByPlayer: new Map(),
      chunkSnapshotInFlightByPlayer: new Map(),
      chunkSnapshotSentAtByPlayer: new Map(),
      chunkSubscriptionByPlayer: new Map([[actor.id, { cx: 0, cy: 0, radius: 0 }]]),
      authSyncTimingByPlayer: new Map(),
      fogChunkTiles: (worldCx, worldCy) => [makeTile(worldCx, worldCy)],
      summaryChunkTiles,
      summaryChunkVersion: () => 0,
      loadSummaryChunkTilesBatch,
      visibleInSnapshot: () => true,
      wrapX: (value) => value,
      wrapY: (value) => value,
      worldWidth: 32,
      worldHeight: 32,
      serializeChunkBatchViaWorker: async (inputs) => inputs.map((input) => `worker:${input.cx},${input.cy}`),
      serializeChunkBatchDirect: (inputs) => inputs.map((input) => `direct:${input.cx},${input.cy}`),
      serializeChunkBatchBodies: (_generation, chunkBodies) => chunkBodies.join("|"),
      sendChunkBatchPayload: (socket, payload) => socket.send(payload),
      runtimeLoadShedLevel: () => "normal"
    });

    controller.sendChunkSnapshot(
      { readyState: 1, OPEN: 1, send: (payload) => sentPayloads.push(payload) },
      actor,
      { cx: 0, cy: 0, radius: 0 },
      undefined,
      [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 }
      ],
      "thin",
      2
    );

    await vi.advanceTimersByTimeAsync(0);

    expect(loadSummaryChunkTilesBatch).toHaveBeenCalledWith([
      { cx: 0, cy: 0, mode: "thin" },
      { cx: 1, cy: 0, mode: "thin" }
    ]);
    expect(summaryChunkTiles).not.toHaveBeenCalled();
    expect(sentPayloads).toEqual(["direct:0,0|direct:1,0"]);
  });
});
