import { describe, expect, it } from "vitest";

import type { Tile } from "@border-empires/shared";

import { buildChunkFromInput } from "./serializer-shared.js";

const makeTile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y,
  terrain: "LAND",
  fogged: false,
  lastChangedAt: 0,
  ...overrides
});

describe("chunk serializer shared", () => {
  it("omits unexplored tiles while preserving visible and discovered fogged tiles", () => {
    const chunk = buildChunkFromInput({
      cx: 0,
      cy: 0,
      fogTiles: [
        makeTile(0, 0, { fogged: true }),
        makeTile(1, 0, { fogged: true }),
        makeTile(0, 1, { fogged: true }),
        makeTile(1, 1, { fogged: true })
      ],
      visibleTiles: [
        makeTile(0, 0, { ownerId: "me" }),
        makeTile(1, 0),
        makeTile(0, 1),
        makeTile(1, 1)
      ],
      visibleMask: Uint8Array.from([1, 0, 0, 0]),
      discoveredMask: Uint8Array.from([0, 1, 0, 0])
    });

    expect(chunk.tilesMaskedByFog).toEqual([
      expect.objectContaining({ x: 0, y: 0, fogged: false, ownerId: "me" }),
      expect.objectContaining({ x: 1, y: 0, fogged: true })
    ]);
  });
});
