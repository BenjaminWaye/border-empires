import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tile } from "@border-empires/shared";
import type { ChunkSummaryMode } from "../chunk/snapshots.js";

type FakeChunk = { cx: number; cy: number; mode: string; tiles: readonly unknown[] };

class FakeWorker {
  private handlers = new Map<string, Array<(value: any) => void>>();
  private chunkTilesByKey = new Map<string, readonly unknown[]>();

  on(event: string, handler: (value: any) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  postMessage(message: { type: string; chunks?: FakeChunk[]; requests?: Array<{ cx: number; cy: number; mode: string }>; id?: number; patches?: Array<{ cx: number; cy: number; tileIndex: number; tilesByMode: Record<string, unknown> }> }): void {
    if (message.type === "hydrate") {
      for (const chunk of message.chunks ?? []) {
        this.chunkTilesByKey.set(`${chunk.mode}:${chunk.cx},${chunk.cy}`, chunk.tiles);
      }
      queueMicrotask(() => this.emit("message", { type: "ready" }));
      return;
    }
    if (message.type === "patch") {
      for (const patch of message.patches ?? []) {
        for (const [mode, tile] of Object.entries(patch.tilesByMode)) {
          const key = `${mode}:${patch.cx},${patch.cy}`;
          const current = [...(this.chunkTilesByKey.get(key) ?? [])];
          current[patch.tileIndex] = tile;
          this.chunkTilesByKey.set(key, current);
        }
      }
      return;
    }
    const chunks = (message.requests ?? []).map((request) => [...(this.chunkTilesByKey.get(`${request.mode}:${request.cx},${request.cy}`) ?? [])]);
    queueMicrotask(() => this.emit("message", { type: "chunks", id: message.id, chunks }));
  }

  private emit(event: string, value: any): void {
    for (const handler of this.handlers.get(event) ?? []) handler(value);
  }
}

vi.mock("node:worker_threads", () => ({
  Worker: FakeWorker
}));

afterEach(() => {
  vi.resetModules();
});

describe("createChunkReadManager", () => {
  it("hydrates worker-owned chunk summaries and serves reads from the worker cache", async () => {
    const { createChunkReadManager } = await import("./chunk-read-manager.js");
    const loadChunkTilesLocal = vi.fn((cx: number, cy: number, _mode: ChunkSummaryMode): Tile[] => [
      { x: cx, y: cy, terrain: "LAND", lastChangedAt: 0, detailLevel: "summary" }
    ]);
    const manager = createChunkReadManager({
      enabled: true,
      now: (() => {
        let t = 0;
        return () => ++t;
      })(),
      chunkCountX: 1,
      chunkCountY: 1,
      chunkSize: 1,
      onError: vi.fn(),
      loadChunkTilesLocal,
      loadChunkTileLocal: (x, y) => ({ x, y, terrain: "LAND", lastChangedAt: 0, detailLevel: "summary" })
    });

    await manager.hydrateAll();

    expect(manager.state.hydrated).toBe(true);
    expect(manager.state.available).toBe(true);

    loadChunkTilesLocal.mockClear();
    const chunks = await manager.loadBatch([{ cx: 0, cy: 0, mode: "thin" }]);

    expect(chunks).toEqual([[{ x: 0, y: 0, terrain: "LAND", lastChangedAt: 0, detailLevel: "summary" }]]);
    expect(loadChunkTilesLocal).not.toHaveBeenCalled();
    expect(manager.state.lastUsedWorker).toBe(true);
  });

  it("falls back to local reads when the worker path is disabled", async () => {
    const { createChunkReadManager } = await import("./chunk-read-manager.js");
    const loadChunkTilesLocal = vi.fn((cx: number, cy: number, _mode: ChunkSummaryMode): Tile[] => [
      { x: cx, y: cy, terrain: "LAND", lastChangedAt: 0, detailLevel: "summary" }
    ]);
    const manager = createChunkReadManager({
      enabled: false,
      now: () => 1,
      chunkCountX: 1,
      chunkCountY: 1,
      chunkSize: 1,
      onError: vi.fn(),
      loadChunkTilesLocal,
      loadChunkTileLocal: (x, y) => ({ x, y, terrain: "LAND", lastChangedAt: 0, detailLevel: "summary" })
    });

    const chunks = await manager.loadBatch([{ cx: 0, cy: 0, mode: "shell" }]);

    expect(chunks).toEqual([[{ x: 0, y: 0, terrain: "LAND", lastChangedAt: 0, detailLevel: "summary" }]]);
    expect(loadChunkTilesLocal).toHaveBeenCalledOnce();
    expect(manager.state.lastUsedWorker).toBe(false);
  });

  it("patches a worker-owned tile without rehydrating the whole chunk", async () => {
    const { createChunkReadManager } = await import("./chunk-read-manager.js");
    const loadChunkTilesLocal = vi.fn((cx: number, cy: number, _mode: ChunkSummaryMode): Tile[] => [
      { x: cx, y: cy, terrain: "LAND", lastChangedAt: 0, detailLevel: "summary" }
    ]);
    const loadChunkTileLocal = vi
      .fn<(x: number, y: number, mode: ChunkSummaryMode) => Tile>()
      .mockImplementation((_x, _y, mode) => ({
        x: 0,
        y: 0,
        terrain: "LAND",
        lastChangedAt: 0,
        detailLevel: "summary",
        ...(mode === "thin" ? { ownerId: "p1" } : {})
      }));
    const manager = createChunkReadManager({
      enabled: true,
      now: () => 1,
      chunkCountX: 1,
      chunkCountY: 1,
      chunkSize: 1,
      onError: vi.fn(),
      loadChunkTilesLocal,
      loadChunkTileLocal
    });

    await manager.hydrateAll();
    loadChunkTilesLocal.mockClear();

    await manager.patchTile(0, 0);
    const chunks = await manager.loadBatch([{ cx: 0, cy: 0, mode: "thin" }]);

    expect(chunks).toEqual([[{ x: 0, y: 0, terrain: "LAND", lastChangedAt: 0, detailLevel: "summary", ownerId: "p1" }]]);
    expect(loadChunkTilesLocal).not.toHaveBeenCalled();
    expect(loadChunkTileLocal).toHaveBeenCalled();
  });
});
