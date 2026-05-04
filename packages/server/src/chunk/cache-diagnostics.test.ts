import { describe, expect, it } from "vitest";

import { summarizeChunkSnapshotCaches, summarizeChunkSnapshotPlayerCache, type ChunkSnapshotCacheEntry } from "./cache-diagnostics.js";
import type { VisibilitySnapshot } from "./snapshots.js";

describe("chunk cache diagnostics", () => {
  it("summarizes payload, mask, and visibility snapshot bytes", () => {
    const visibilityByPlayer = new Map<string, VisibilitySnapshot>([
      ["player-a", { allVisible: false, visibleMask: new Uint8Array([1, 0, 1, 0]) }],
      ["player-b", { allVisible: true, visibleMask: new Uint8Array(0) }]
    ]);
    const cachedChunkSnapshotByPlayer = new Map<string, ChunkSnapshotCacheEntry>([
      [
        "player-a",
        {
          visibility: visibilityByPlayer.get("player-a")!,
          visibilityVersion: 1,
          discoveryVersion: 0,
          payloadByChunkKey: new Map([
            ["thin:0,0", '{"chunk":"a"}'],
            ["thin:1,0", '{"chunk":"bb"}']
          ]),
          summaryVersionByPayloadKey: new Map(),
          visibilityMaskByChunkKey: new Map([["0,0", new Uint8Array([1, 0, 1, 0])]]),
          visibilityVersionByChunkKey: new Map()
        }
      ],
      [
        "player-b",
        {
          visibility: visibilityByPlayer.get("player-b")!,
          visibilityVersion: 1,
          discoveryVersion: 0,
          payloadByChunkKey: new Map([["thin:0,0", '{"chunk":"ccc"}']]),
          summaryVersionByPayloadKey: new Map(),
          visibilityMaskByChunkKey: new Map(),
          visibilityVersionByChunkKey: new Map()
        }
      ]
    ]);

    expect(
      summarizeChunkSnapshotPlayerCache({
        playerId: "player-a",
        cachedChunkSnapshotByPlayer,
        cachedVisibilitySnapshotByPlayer: visibilityByPlayer
      })
    ).toMatchObject({
      playerId: "player-a",
      allVisible: false,
      payloads: 2,
      visibilityMasks: 1,
      visibilitySnapshotBytes: 4
    });

    expect(
      summarizeChunkSnapshotCaches({
        cachedChunkSnapshotByPlayer,
        cachedVisibilitySnapshotByPlayer: visibilityByPlayer,
        maxPlayers: 2
      })
    ).toMatchObject({
      players: 2,
      payloads: 3,
      visibilityMasks: 1,
      visibilitySnapshots: 2,
      visibilitySnapshotBytes: 4,
      topPlayers: [
        expect.objectContaining({ playerId: "player-a" }),
        expect.objectContaining({ playerId: "player-b" })
      ]
    });
  });
});
