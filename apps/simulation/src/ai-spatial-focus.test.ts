import { describe, expect, it } from "vitest";

import {
  AI_SPATIAL_FOCUS_EXPIRY_MS,
  AI_SPATIAL_FOCUS_MAX_OWNED_TILES,
  expandFocusFront,
  pickFocusOrigin,
  selectSpatialFocus,
  type AiSpatialFocus
} from "./ai-spatial-focus.js";

const key = (x: number, y: number): string => `${x},${y}`;

const ownedRect = (x0: number, y0: number, w: number, h: number): Set<string> => {
  const set = new Set<string>();
  for (let dx = 0; dx < w; dx += 1) {
    for (let dy = 0; dy < h; dy += 1) {
      set.add(key(x0 + dx, y0 + dy));
    }
  }
  return set;
};

describe("expandFocusFront", () => {
  it("returns empty when origin is not owned", () => {
    const owned = ownedRect(0, 0, 3, 3);
    expect(expandFocusFront(key(99, 99), owned, 16).size).toBe(0);
  });

  it("includes the origin and reachable owned neighbors", () => {
    const owned = ownedRect(0, 0, 3, 3);
    const front = expandFocusFront(key(1, 1), owned, 16);
    expect(front.size).toBe(9);
    for (const k of owned) expect(front.has(k)).toBe(true);
  });

  it("caps at maxOwnedTiles and never exceeds it", () => {
    const owned = ownedRect(0, 0, 40, 40); // 1600 tiles
    const front = expandFocusFront(key(20, 20), owned, AI_SPATIAL_FOCUS_MAX_OWNED_TILES);
    expect(front.size).toBe(AI_SPATIAL_FOCUS_MAX_OWNED_TILES);
  });

  it("does not cross into unowned tiles", () => {
    const owned = new Set<string>([
      key(0, 0), key(1, 0), key(2, 0),
      // gap at (3, 0)
      key(4, 0), key(5, 0)
    ]);
    const front = expandFocusFront(key(0, 0), owned, 16);
    expect(front.has(key(0, 0))).toBe(true);
    expect(front.has(key(1, 0))).toBe(true);
    expect(front.has(key(2, 0))).toBe(true);
    expect(front.has(key(4, 0))).toBe(false);
    expect(front.has(key(5, 0))).toBe(false);
  });

  it("returns empty when maxOwnedTiles is zero or negative", () => {
    const owned = ownedRect(0, 0, 3, 3);
    expect(expandFocusFront(key(0, 0), owned, 0).size).toBe(0);
    expect(expandFocusFront(key(0, 0), owned, -1).size).toBe(0);
  });
});

describe("pickFocusOrigin", () => {
  it("prefers hot-frontier tiles that are still owned", () => {
    const owned = ownedRect(0, 0, 3, 3);
    const hot = new Set<string>([key(99, 99), key(2, 2), key(0, 0)]);
    expect(pickFocusOrigin(hot, owned)).toBe(key(2, 2));
  });

  it("falls back to first owned tile when no hot tile is owned", () => {
    const owned = new Set<string>([key(7, 7), key(8, 8)]);
    const hot = new Set<string>([key(99, 99)]);
    expect(pickFocusOrigin(hot, owned)).toBe(key(7, 7));
  });

  it("returns undefined when nothing is owned", () => {
    expect(pickFocusOrigin(new Set(), new Set())).toBeUndefined();
  });
});

describe("selectSpatialFocus", () => {
  it("returns undefined when the player owns no tiles", () => {
    const focus = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: new Set(),
      ownedTileKeys: new Set(),
      now: 1_000
    });
    expect(focus).toBeUndefined();
  });

  it("creates a fresh focus when no prior exists", () => {
    const owned = ownedRect(0, 0, 3, 3);
    const hot = new Set([key(1, 1)]);
    const focus = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: hot,
      ownedTileKeys: owned,
      now: 1_000
    });
    expect(focus).toBeDefined();
    expect(focus!.originTileKey).toBe(key(1, 1));
    expect(focus!.primaryFront.size).toBe(9);
    expect(focus!.expiresAt).toBe(1_000 + AI_SPATIAL_FOCUS_EXPIRY_MS);
  });

  it("reuses prior focus when origin still owned and not expired", () => {
    const owned = ownedRect(0, 0, 3, 3);
    const hot = new Set([key(1, 1)]);
    const first = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: hot,
      ownedTileKeys: owned,
      now: 1_000
    })!;
    const second = selectSpatialFocus({
      prior: first,
      hotFrontierTileKeys: hot,
      ownedTileKeys: owned,
      now: 30_000
    });
    expect(second).toBe(first); // same object identity
  });

  it("rebuilds focus when prior origin is no longer owned", () => {
    const prior: AiSpatialFocus = {
      originTileKey: key(99, 99),
      primaryFront: new Set([key(99, 99)]),
      computedAt: 0,
      expiresAt: AI_SPATIAL_FOCUS_EXPIRY_MS
    };
    const owned = ownedRect(0, 0, 3, 3);
    const hot = new Set([key(2, 2)]);
    const next = selectSpatialFocus({
      prior,
      hotFrontierTileKeys: hot,
      ownedTileKeys: owned,
      now: 10_000
    });
    expect(next).toBeDefined();
    expect(next!.originTileKey).toBe(key(2, 2));
  });

  it("rebuilds focus when prior has expired", () => {
    const owned = ownedRect(0, 0, 3, 3);
    const hot = new Set([key(1, 1)]);
    const first = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: hot,
      ownedTileKeys: owned,
      now: 1_000
    })!;
    const second = selectSpatialFocus({
      prior: first,
      hotFrontierTileKeys: hot,
      ownedTileKeys: owned,
      now: 1_000 + AI_SPATIAL_FOCUS_EXPIRY_MS + 1
    });
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(second!.computedAt).toBe(1_000 + AI_SPATIAL_FOCUS_EXPIRY_MS + 1);
  });

  it("caps front size at maxOwnedTiles", () => {
    const owned = ownedRect(0, 0, 40, 40); // 1600 tiles
    const hot = new Set([key(20, 20)]);
    const focus = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: hot,
      ownedTileKeys: owned,
      now: 0
    });
    expect(focus!.primaryFront.size).toBe(AI_SPATIAL_FOCUS_MAX_OWNED_TILES);
  });

  it("applies jitter to expiry", () => {
    const owned = ownedRect(0, 0, 3, 3);
    const hot = new Set([key(1, 1)]);
    const focus = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: hot,
      ownedTileKeys: owned,
      now: 1_000,
      jitterMs: 7_500
    });
    expect(focus!.expiresAt).toBe(1_000 + AI_SPATIAL_FOCUS_EXPIRY_MS + 7_500);
  });
});
