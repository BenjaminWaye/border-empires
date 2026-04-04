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

  postMessage(message: { type: string; chunks?: FakeChunk[]; requests?: Array<{ cx: number; cy: number; mode: string }>; id?: number }): void {
    if (message.type === "hydrate") {
      for (const chunk of message.chunks ?? []) {
        this.chunkTilesByKey.set(`${chunk.mode}:${chunk.cx},${chunk.cy}`, chunk.tiles);
      }
      queueMicrotask(() => this.emit("message", { type: "ready" }));
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
      onError: vi.fn(),
      loadChunkTilesLocal
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
      onError: vi.fn(),
      loadChunkTilesLocal
    });

    const chunks = await manager.loadBatch([{ cx: 0, cy: 0, mode: "shell" }]);

    expect(chunks).toEqual([[{ x: 0, y: 0, terrain: "LAND", lastChangedAt: 0, detailLevel: "summary" }]]);
    expect(loadChunkTilesLocal).toHaveBeenCalledOnce();
    expect(manager.state.lastUsedWorker).toBe(false);
  });
});
