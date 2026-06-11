import { describe, expect, it, vi } from "vitest";

import { createFullVisibilityReplacementPayloadCache } from "./full-visibility-replacement-payload-cache.js";

describe("full visibility replacement payload cache", () => {
  it("reuses the encoded payload when snapshots share the same tiles array", () => {
    const jsonSafeTileDeltaBatch = vi.fn((tiles) => tiles.map((tile) => ({ ...tile })));
    const cache = createFullVisibilityReplacementPayloadCache({
      jsonSafeTileDeltaBatch,
      jsonByteSize: (value) => JSON.stringify(value).length
    });
    const sharedTiles = [
      { x: 1, y: 1, terrain: "LAND" as const },
      { x: 2, y: 1, terrain: "SEA" as const }
    ];

    const first = cache.get({ playerId: "player-1", tiles: sharedTiles });
    const second = cache.get({ playerId: "player-2", tiles: sharedTiles });

    expect(second.payload).toBe(first.payload);
    expect(second.payloadJsonBytes).toBe(first.payloadJsonBytes);
    expect(jsonSafeTileDeltaBatch).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the payload when the shared tiles array changes", () => {
    const jsonSafeTileDeltaBatch = vi.fn((tiles) => tiles.map((tile) => ({ ...tile })));
    const cache = createFullVisibilityReplacementPayloadCache({
      jsonSafeTileDeltaBatch,
      jsonByteSize: (value) => JSON.stringify(value).length
    });

    cache.get({ playerId: "player-1", tiles: [{ x: 1, y: 1, terrain: "LAND" as const }] });
    cache.get({ playerId: "player-2", tiles: [{ x: 1, y: 1, terrain: "LAND" as const }] });

    expect(jsonSafeTileDeltaBatch).toHaveBeenCalledTimes(2);
  });
});
