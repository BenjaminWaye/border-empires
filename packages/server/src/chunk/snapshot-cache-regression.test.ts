import { describe, expect, it } from "vitest";

import type { Player, Tile } from "@border-empires/shared";

import { createChunkSnapshotController, type VisibilitySnapshot } from "./snapshots.js";

const flushSnapshotWork = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const makeVisibilitySnapshot = (mask: number[]): VisibilitySnapshot => ({
  allVisible: false,
  visibleMask: Uint8Array.from(mask)
});

const makeTile = (x: number, y: number, ownerId?: string): Tile => ({
  x,
  y,
  terrain: "LAND",
  fogged: false,
  lastChangedAt: 0,
  ...(ownerId ? { ownerId } : {})
});

const makePlayer = (): Player => ({
  id: "p1",
  name: "Player 1",
  points: 0,
  level: 0,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  powerups: {},
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
  territoryTiles: new Set<`${number},${number}`>(),
  T: 0,
  E: 0,
  Ts: 0,
  Es: 0,
  stamina: 0,
  staminaUpdatedAt: 0,
  manpower: 0,
  manpowerUpdatedAt: 0,
  allies: new Set<string>(),
  spawnShieldUntil: 0,
  isEliminated: false,
  respawnPending: false,
  lastActiveAt: 0,
  activityInbox: [],
  profileComplete: true
});

describe("chunk snapshot cache regression guard", () => {
  it("reuses cached chunk payloads when a new visibility snapshot leaves a chunk mask unchanged", async () => {
    let visibilitySnapshot = makeVisibilitySnapshot([
      1, 1, 0, 0,
      1, 1, 0, 0
    ]);

    const loadBatchRequests: Array<Array<{ cx: number; cy: number; mode: string }>> = [];
    const workerSerializeCounts: number[] = [];
    const sentPayloads: string[] = [];
    const perfSamples: Array<{
      cachedPayloadChunks: number;
      rebuiltChunks: number;
      batches: number;
    }> = [];
    const cachedChunkSnapshotByPlayer = new Map<
      string,
      {
        visibility: VisibilitySnapshot;
        visibilityVersion: number;
        payloadByChunkKey: Map<string, string>;
        visibilityMaskByChunkKey: Map<string, Uint8Array>;
        visibilityVersionByChunkKey: Map<string, number>;
      }
    >();

    const controller = createChunkSnapshotController<Player>({
      chunkSize: 2,
      chunkCountX: 2,
      chunkCountY: 1,
      initialBootstrapRadius: 0,
      chunkStreamBatchSize: 4,
      chunkSnapshotBatchSize: 4,
      chunkSnapshotBudgetMs: 24,
      chunkSnapshotWarnMs: 60,
      chunkSnapshotYieldMs: 4,
      chunkSnapshotOverloadYieldMs: 16,
      now: () => 0,
      wrapChunkX: (value) => ((value % 2) + 2) % 2,
      wrapChunkY: () => 0,
      runtimeMemoryStats: () => ({ rssMb: 0, heapUsedMb: 0, heapTotalMb: 0, externalMb: 0, arrayBuffersMb: 0 }),
      pushChunkSnapshotPerf: (sample) => {
        perfSamples.push({
          cachedPayloadChunks: sample.cachedPayloadChunks,
          rebuiltChunks: sample.rebuiltChunks,
          batches: sample.batches
        });
      },
      onFirstChunkSent: () => {},
      onSlowChunkSnapshot: () => {},
      visibilitySnapshotForPlayer: () => visibilitySnapshot,
      cachedChunkSnapshotByPlayer,
      fogChunkTilesByChunkKey: new Map(),
      chunkSnapshotGenerationByPlayer: new Map(),
      chunkSnapshotInFlightByPlayer: new Map(),
      chunkSnapshotSentAtByPlayer: new Map(),
      chunkSubscriptionByPlayer: new Map(),
      authSyncTimingByPlayer: new Map(),
      fogChunkTiles: (cx) => {
        const startX = cx * 2;
        return [
          makeTile(startX, 0),
          makeTile(startX + 1, 0),
          makeTile(startX, 1),
          makeTile(startX + 1, 1)
        ];
      },
      summaryChunkTiles: (cx) => {
        const startX = cx * 2;
        return [
          makeTile(startX, 0, `visible-${cx}`),
          makeTile(startX + 1, 0, `visible-${cx}`),
          makeTile(startX, 1, `visible-${cx}`),
          makeTile(startX + 1, 1, `visible-${cx}`)
        ];
      },
      loadSummaryChunkTilesBatch: async (requests) => {
        loadBatchRequests.push(requests.map((request) => ({ ...request })));
        return requests.map((request) => {
          const startX = request.cx * 2;
          return [
            makeTile(startX, 0, `visible-${request.cx}`),
            makeTile(startX + 1, 0, `visible-${request.cx}`),
            makeTile(startX, 1, `visible-${request.cx}`),
            makeTile(startX + 1, 1, `visible-${request.cx}`)
          ];
        });
      },
      visibleInSnapshot: (snapshot, x, y) => snapshot.visibleMask[y * 4 + x] === 1,
      wrapX: (value, mod) => ((value % mod) + mod) % mod,
      wrapY: (value, mod) => ((value % mod) + mod) % mod,
      worldWidth: 4,
      worldHeight: 2,
      serializeChunkBatchViaWorker: async (inputs) => {
        workerSerializeCounts.push(inputs.length);
        return inputs.map((input) => JSON.stringify({ cx: input.cx, cy: input.cy, visible: [...input.visibleMask] }));
      },
      serializeChunkBatchDirect: (inputs) =>
        inputs.map((input) => JSON.stringify({ cx: input.cx, cy: input.cy, visible: [...input.visibleMask], direct: true })),
      serializeChunkBatchBodies: (chunkBodies) => JSON.stringify({ type: "CHUNK_BATCH", chunks: chunkBodies.map((body) => JSON.parse(body)) }),
      runtimeLoadShedLevel: () => "normal"
    });

    const socket = {
      readyState: 1,
      OPEN: 1,
      send: (payload: string) => {
        sentPayloads.push(payload);
      }
    };

    controller.sendChunkSnapshot(
      socket,
      makePlayer(),
      { cx: 0, cy: 0, radius: 0 },
      undefined,
      [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 }
      ],
      "thin",
      4
    );
    await flushSnapshotWork();

    visibilitySnapshot = makeVisibilitySnapshot([
      1, 1, 1, 0,
      1, 1, 0, 0
    ]);
    controller.sendChunkSnapshot(
      socket,
      makePlayer(),
      { cx: 0, cy: 0, radius: 0 },
      undefined,
      [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 }
      ],
      "thin",
      4
    );
    await flushSnapshotWork();

    visibilitySnapshot = makeVisibilitySnapshot([
      1, 1, 1, 0,
      1, 1, 0, 0
    ]);
    controller.sendChunkSnapshot(
      socket,
      makePlayer(),
      { cx: 0, cy: 0, radius: 0 },
      undefined,
      [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 }
      ],
      "thin",
      4
    );
    await flushSnapshotWork();

    expect(loadBatchRequests).toEqual([
      [
        { cx: 0, cy: 0, mode: "thin" },
        { cx: 1, cy: 0, mode: "thin" }
      ],
      [{ cx: 1, cy: 0, mode: "thin" }]
    ]);
    expect(workerSerializeCounts).toEqual([2, 1]);
    expect(sentPayloads).toHaveLength(3);
    expect(perfSamples).toEqual([
      { cachedPayloadChunks: 0, rebuiltChunks: 2, batches: 1 },
      { cachedPayloadChunks: 1, rebuiltChunks: 1, batches: 1 },
      { cachedPayloadChunks: 2, rebuiltChunks: 0, batches: 1 }
    ]);
  });
});
