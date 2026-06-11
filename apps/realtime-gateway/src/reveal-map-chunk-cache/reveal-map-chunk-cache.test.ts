import { describe, expect, it, vi } from "vitest";

import { BroadcastPayload } from "../broadcast-payload/broadcast-payload.js";
import { createRevealMapChunkCache } from "./reveal-map-chunk-cache.js";

describe("reveal map chunk cache", () => {
  it("splits full-map tiles into reusable pre-serialized chunks shared across players", () => {
    const jsonSafeTileDeltaBatch = vi.fn((tiles) => tiles.map((tile) => ({ ...tile })));
    const cache = createRevealMapChunkCache({
      chunkSize: 2,
      jsonSafeTileDeltaBatch
    });
    const sharedTiles = [
      { x: 1, y: 1, terrain: "LAND" as const },
      { x: 2, y: 1, terrain: "SEA" as const },
      { x: 3, y: 1, terrain: "MOUNTAIN" as const }
    ];

    const first = cache.getOrCreate({ playerId: "player-1", tiles: sharedTiles });
    const second = cache.getOrCreate({ playerId: "player-2", tiles: sharedTiles });

    expect(second).toBe(first);
    expect(cache.current()).toBe(first);
    expect(first.begin).toBeInstanceOf(BroadcastPayload);
    expect(first.begin.source).toMatchObject({ type: "REVEAL_MAP_BEGIN", totalTiles: 3, chunkCount: 2 });
    expect(first.chunks).toHaveLength(2);
    for (const chunk of first.chunks) expect(chunk).toBeInstanceOf(BroadcastPayload);
    expect(first.chunks[0]?.source).toMatchObject({ type: "REVEAL_MAP_CHUNK", chunkIndex: 0, chunkCount: 2 });
    expect((first.chunks[0]?.source as { tiles: unknown[] }).tiles).toHaveLength(2);
    expect((first.chunks[1]?.source as { tiles: unknown[] }).tiles).toHaveLength(1);
    expect(first.end).toBeInstanceOf(BroadcastPayload);
    expect(first.end.source).toMatchObject({ type: "REVEAL_MAP_END", snapshotId: first.snapshotId });
    expect(first.chunks[0]?.serialized).toContain('"REVEAL_MAP_CHUNK"');
    expect(jsonSafeTileDeltaBatch).toHaveBeenCalledTimes(2);
  });

  it("rebuilds chunks after explicit invalidation", () => {
    const jsonSafeTileDeltaBatch = vi.fn((tiles) => tiles.map((tile) => ({ ...tile })));
    const cache = createRevealMapChunkCache({
      chunkSize: 2,
      jsonSafeTileDeltaBatch
    });
    const sharedTiles = [{ x: 1, y: 1, terrain: "LAND" as const }];

    const first = cache.getOrCreate({ playerId: "player-1", tiles: sharedTiles });
    cache.clear();
    const second = cache.getOrCreate({ playerId: "player-2", tiles: sharedTiles });

    expect(second).not.toBe(first);
    expect(cache.current()).toBe(second);
    expect(jsonSafeTileDeltaBatch).toHaveBeenCalledTimes(2);
  });
});
