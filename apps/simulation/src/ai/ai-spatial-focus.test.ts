import { describe, expect, it } from "vitest";

import {
  AI_SPATIAL_FOCUS_HARD_EXPIRY_MS,
  AI_SPATIAL_FOCUS_EXPIRY_MS,
  AI_SPATIAL_FOCUS_MAX_OWNED_TILES,
  expandFocusFront,
  pickFocusOriginForCategory,
  selectSpatialFocus,
  type AiSpatialFocus,
  type AiSpatialFocusCategory
} from "./ai-spatial-focus.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

const emptySources = (): Record<AiSpatialFocusCategory, ReadonlySet<string>> => ({
  hot_frontier: new Set<string>(),
  build_candidate: new Set<string>(),
  settle_pending: new Set<string>()
});

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

  it("uses frontier-style diagonal connectivity", () => {
    const owned = new Set<string>([key(0, 0), key(1, 1), key(2, 2)]);
    const front = expandFocusFront(key(0, 0), owned, 16);
    expect(front.has(key(0, 0))).toBe(true);
    expect(front.has(key(1, 1))).toBe(true);
    expect(front.has(key(2, 2))).toBe(true);
  });

  it("wraps across world edges", () => {
    const owned = new Set<string>([
      key(0, 0),
      key(WORLD_WIDTH - 1, 0),
      key(0, WORLD_HEIGHT - 1),
      key(WORLD_WIDTH - 1, WORLD_HEIGHT - 1)
    ]);
    const front = expandFocusFront(key(0, 0), owned, 16);
    expect(front.size).toBe(4);
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

describe("pickFocusOriginForCategory", () => {
  it("returns first owned tile in the start category when non-empty", () => {
    const owned = ownedRect(0, 0, 3, 3);
    const sources = emptySources();
    sources.hot_frontier = new Set<string>([key(99, 99), key(2, 2), key(0, 0)]);
    const picked = pickFocusOriginForCategory("hot_frontier", sources, owned);
    expect(picked).toEqual({ originTileKey: key(2, 2), originCategory: "hot_frontier" });
  });

  it("rotates to the next non-empty category when start category has no owned candidate", () => {
    const owned = ownedRect(0, 0, 3, 3);
    const sources = emptySources();
    sources.hot_frontier = new Set<string>([key(99, 99)]); // unowned -> skip
    sources.build_candidate = new Set<string>([key(1, 1)]);
    const picked = pickFocusOriginForCategory("hot_frontier", sources, owned);
    expect(picked).toEqual({ originTileKey: key(1, 1), originCategory: "build_candidate" });
  });

  it("starts from the requested category rather than always hot_frontier", () => {
    const owned = ownedRect(0, 0, 3, 3);
    const sources = emptySources();
    sources.hot_frontier = new Set<string>([key(0, 0)]);
    sources.build_candidate = new Set<string>([key(1, 1)]);
    sources.settle_pending = new Set<string>([key(2, 2)]);
    const picked = pickFocusOriginForCategory("settle_pending", sources, owned);
    expect(picked).toEqual({ originTileKey: key(2, 2), originCategory: "settle_pending" });
  });

  it("falls back to the first owned tile when every category is empty or unowned", () => {
    const owned = new Set<string>([key(7, 7), key(8, 8)]);
    const picked = pickFocusOriginForCategory("hot_frontier", emptySources(), owned);
    expect(picked).toEqual({ originTileKey: key(7, 7), originCategory: "hot_frontier" });
  });

  it("returns undefined when nothing is owned", () => {
    const picked = pickFocusOriginForCategory("hot_frontier", emptySources(), new Set());
    expect(picked).toBeUndefined();
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

  it("does not rebuild an unexpired focus when the front changed", () => {
    const first = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: new Set([key(1, 1)]),
      ownedTileKeys: new Set([key(1, 1)]),
      now: 1_000
    })!;
    const second = selectSpatialFocus({
      prior: first,
      hotFrontierTileKeys: new Set([key(1, 1)]),
      ownedTileKeys: new Set([key(1, 1), key(1, 2)]),
      now: first.expiresAt - 1
    });
    expect(second).toBe(first);
  });

  it("rebuilds focus when prior origin is no longer owned", () => {
    const prior: AiSpatialFocus = {
      originTileKey: key(99, 99),
      originCategory: "hot_frontier",
      primaryFront: new Set([key(99, 99)]),
      computedAt: 0,
      expiresAt: AI_SPATIAL_FOCUS_EXPIRY_MS,
      hardExpiresAt: AI_SPATIAL_FOCUS_HARD_EXPIRY_MS,
      lastOriginByCategory: { hot_frontier: key(99, 99) },
      unproductiveStreak: 0
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

  it("keeps an expired active focus when its front changed", () => {
    const first = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: new Set([key(0, 0), key(5, 5)]),
      ownedTileKeys: new Set([key(0, 0)]),
      now: 1_000,
      jitterMs: 0
    })!;
    const next = selectSpatialFocus({
      prior: first,
      hotFrontierTileKeys: new Set([key(0, 0), key(5, 5)]),
      ownedTileKeys: new Set([key(0, 0), key(1, 0)]),
      now: first.expiresAt + 1,
      jitterMs: 0
    })!;
    expect(next.originTileKey).toBe(key(0, 0));
    expect(next.originCategory).toBe("hot_frontier");
    expect(next.primaryFront.has(key(1, 0))).toBe(true);
    expect(next.expiresAt).toBe(first.expiresAt + 1 + AI_SPATIAL_FOCUS_EXPIRY_MS);
    expect(next.hardExpiresAt).toBe(first.hardExpiresAt);
  });

  it("moves on from an active focus after the hard expiry", () => {
    const first = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: new Set([key(0, 0), key(5, 5)]),
      ownedTileKeys: new Set([key(0, 0), key(5, 5)]),
      now: 1_000,
      jitterMs: 0
    })!;
    const next = selectSpatialFocus({
      prior: first,
      hotFrontierTileKeys: new Set([key(0, 0), key(5, 5)]),
      ownedTileKeys: new Set([key(0, 0), key(1, 0), key(5, 5)]),
      now: first.hardExpiresAt + 1,
      jitterMs: 0
    })!;
    expect(next.originTileKey).toBe(key(5, 5));
    expect(next.originCategory).toBe("hot_frontier");
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

  it("rotates to build_candidate on the next refresh after an expired hot_frontier focus", () => {
    const owned = ownedRect(0, 0, 5, 5);
    const hot = new Set<string>([key(0, 0)]);
    const buildCandidates = new Set<string>([key(2, 2)]);
    const first = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: hot,
      buildCandidateTileKeys: buildCandidates,
      ownedTileKeys: owned,
      now: 1_000
    })!;
    expect(first.originCategory).toBe("hot_frontier");
    expect(first.originTileKey).toBe(key(0, 0));

    const second = selectSpatialFocus({
      prior: first,
      hotFrontierTileKeys: hot,
      buildCandidateTileKeys: buildCandidates,
      ownedTileKeys: owned,
      now: 1_000 + AI_SPATIAL_FOCUS_EXPIRY_MS + 1
    })!;
    expect(second.originCategory).toBe("build_candidate");
    expect(second.originTileKey).toBe(key(2, 2));
  });

  it("advances within a category after returning to it", () => {
    const owned = ownedRect(0, 0, 10, 10);
    const hot = new Set<string>([key(0, 0), key(2, 2), key(4, 4)]);
    const first = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: hot,
      ownedTileKeys: owned,
      now: 1_000
    })!;
    expect(first.originTileKey).toBe(key(0, 0));

    const second = selectSpatialFocus({
      prior: first,
      hotFrontierTileKeys: hot,
      ownedTileKeys: owned,
      now: first.expiresAt + 1
    })!;
    expect(second.originCategory).toBe("hot_frontier");
    expect(second.originTileKey).toBe(key(2, 2));

    const third = selectSpatialFocus({
      prior: second,
      hotFrontierTileKeys: hot,
      ownedTileKeys: owned,
      now: second.expiresAt + 1
    })!;
    expect(third.originCategory).toBe("hot_frontier");
    expect(third.originTileKey).toBe(key(4, 4));
  });

  it("rotates build_candidate -> settle_pending -> hot_frontier across three refreshes", () => {
    const owned = ownedRect(0, 0, 5, 5);
    const hot = new Set<string>([key(0, 0)]);
    const buildCandidates = new Set<string>([key(1, 1)]);
    const settlePending = new Set<string>([key(2, 2)]);
    let now = 1_000;
    const params = (prior: AiSpatialFocus | undefined) => ({
      prior,
      hotFrontierTileKeys: hot,
      buildCandidateTileKeys: buildCandidates,
      settlePendingTileKeys: settlePending,
      ownedTileKeys: owned,
      now
    });

    const a = selectSpatialFocus(params(undefined))!;
    expect(a.originCategory).toBe("hot_frontier");

    now = a.expiresAt + 1;
    const b = selectSpatialFocus(params(a))!;
    expect(b.originCategory).toBe("build_candidate");

    now = b.expiresAt + 1;
    const c = selectSpatialFocus(params(b))!;
    expect(c.originCategory).toBe("settle_pending");

    now = c.expiresAt + 1;
    const d = selectSpatialFocus(params(c))!;
    expect(d.originCategory).toBe("hot_frontier");
  });

  it("skips an empty rotation target and lands on the next non-empty category", () => {
    const owned = ownedRect(0, 0, 5, 5);
    const hot = new Set<string>([key(0, 0)]);
    // build_candidate is empty; settle_pending has a tile
    const settlePending = new Set<string>([key(3, 3)]);
    const first = selectSpatialFocus({
      prior: undefined,
      hotFrontierTileKeys: hot,
      buildCandidateTileKeys: new Set(),
      settlePendingTileKeys: settlePending,
      ownedTileKeys: owned,
      now: 1_000
    })!;
    expect(first.originCategory).toBe("hot_frontier");

    const second = selectSpatialFocus({
      prior: first,
      hotFrontierTileKeys: hot,
      buildCandidateTileKeys: new Set(),
      settlePendingTileKeys: settlePending,
      ownedTileKeys: owned,
      now: 1_000 + AI_SPATIAL_FOCUS_EXPIRY_MS + 1
    })!;
    expect(second.originCategory).toBe("settle_pending");
    expect(second.originTileKey).toBe(key(3, 3));
  });

  // A growing rectangle spanning two fixed corners: (0,0) (hot_frontier
  // origin) and (9,9) (build_candidate origin). Both corners stay owned and
  // fully connected as the rectangle grows, so expandFocusFront's BFS from
  // either corner keeps picking up the new tiles -> priorFrontChanged is
  // true on every refresh, independent of which origin is active. This
  // isolates the unproductive-streak behavior from ordinary front-churn
  // rotation (which already fires when the front is stable).
  const growingOwnedRect = (extraCols: number): Set<string> => ownedRect(0, 0, 10 + extraCols, 10);

  describe("unproductive-streak forced rotation", () => {
    it("forces rotation after maxUnproductiveStreak consecutive unproductive refreshes even while the front keeps changing", () => {
      const hot = new Set([key(0, 0)]);
      const build = new Set([key(9, 9)]);
      const first = selectSpatialFocus({
        prior: undefined,
        hotFrontierTileKeys: hot,
        buildCandidateTileKeys: build,
        ownedTileKeys: growingOwnedRect(0),
        now: 1_000,
        maxUnproductiveStreak: 2
      })!;
      expect(first.originCategory).toBe("hot_frontier");
      expect(first.originTileKey).toBe(key(0, 0));
      expect(first.unproductiveStreak).toBe(0);

      const second = selectSpatialFocus({
        prior: first,
        hotFrontierTileKeys: hot,
        buildCandidateTileKeys: build,
        ownedTileKeys: growingOwnedRect(1),
        now: first.expiresAt + 1,
        lastScanWasProductive: false,
        maxUnproductiveStreak: 2
      })!;
      // Streak is 1, below the threshold of 2 -> front-changed branch still
      // wins, same origin/category as before.
      expect(second.originCategory).toBe("hot_frontier");
      expect(second.originTileKey).toBe(key(0, 0));
      expect(second.unproductiveStreak).toBe(1);

      const third = selectSpatialFocus({
        prior: second,
        hotFrontierTileKeys: hot,
        buildCandidateTileKeys: build,
        ownedTileKeys: growingOwnedRect(2),
        now: second.expiresAt + 1,
        lastScanWasProductive: false,
        maxUnproductiveStreak: 2
      })!;
      // Streak reaches 2 -> forced rotation to the next category, even
      // though the front changed (grew) yet again this refresh.
      expect(third.originCategory).toBe("build_candidate");
      expect(third.originTileKey).toBe(key(9, 9));
      expect(third.unproductiveStreak).toBe(0);
    });

    it("never forces rotation when scans are productive, or when no signal is given", () => {
      const hot = new Set([key(0, 0)]);
      const build = new Set([key(9, 9)]);
      const first = selectSpatialFocus({
        prior: undefined,
        hotFrontierTileKeys: hot,
        buildCandidateTileKeys: build,
        ownedTileKeys: growingOwnedRect(0),
        now: 1_000,
        maxUnproductiveStreak: 2
      })!;

      const second = selectSpatialFocus({
        prior: first,
        hotFrontierTileKeys: hot,
        buildCandidateTileKeys: build,
        ownedTileKeys: growingOwnedRect(1),
        now: first.expiresAt + 1,
        lastScanWasProductive: true,
        maxUnproductiveStreak: 2
      })!;
      expect(second.originTileKey).toBe(key(0, 0));
      expect(second.unproductiveStreak).toBe(0);

      const third = selectSpatialFocus({
        prior: second,
        hotFrontierTileKeys: hot,
        buildCandidateTileKeys: build,
        ownedTileKeys: growingOwnedRect(2),
        now: second.expiresAt + 1,
        // lastScanWasProductive omitted -> defaults to productive.
        maxUnproductiveStreak: 2
      })!;
      expect(third.originTileKey).toBe(key(0, 0));

      const fourth = selectSpatialFocus({
        prior: third,
        hotFrontierTileKeys: hot,
        buildCandidateTileKeys: build,
        ownedTileKeys: growingOwnedRect(3),
        now: third.expiresAt + 1,
        lastScanWasProductive: true,
        maxUnproductiveStreak: 2
      })!;
      // Three refreshes past the threshold, but always productive/unsignaled
      // -> never rotates.
      expect(fourth.originCategory).toBe("hot_frontier");
      expect(fourth.originTileKey).toBe(key(0, 0));
      expect(fourth.unproductiveStreak).toBe(0);
    });

    it("resets the streak to 0 after a forced rotation and does not immediately re-rotate", () => {
      const hot = new Set([key(0, 0)]);
      const build = new Set([key(9, 9)]);
      const first = selectSpatialFocus({
        prior: undefined,
        hotFrontierTileKeys: hot,
        buildCandidateTileKeys: build,
        ownedTileKeys: growingOwnedRect(0),
        now: 1_000,
        maxUnproductiveStreak: 2
      })!;
      const second = selectSpatialFocus({
        prior: first,
        hotFrontierTileKeys: hot,
        buildCandidateTileKeys: build,
        ownedTileKeys: growingOwnedRect(1),
        now: first.expiresAt + 1,
        lastScanWasProductive: false,
        maxUnproductiveStreak: 2
      })!;
      const third = selectSpatialFocus({
        prior: second,
        hotFrontierTileKeys: hot,
        buildCandidateTileKeys: build,
        ownedTileKeys: growingOwnedRect(2),
        now: second.expiresAt + 1,
        lastScanWasProductive: false,
        maxUnproductiveStreak: 2
      })!;
      expect(third.originCategory).toBe("build_candidate");
      expect(third.unproductiveStreak).toBe(0);

      const fourth = selectSpatialFocus({
        prior: third,
        hotFrontierTileKeys: hot,
        buildCandidateTileKeys: build,
        ownedTileKeys: growingOwnedRect(3),
        now: third.expiresAt + 1,
        lastScanWasProductive: false,
        maxUnproductiveStreak: 2
      })!;
      // Streak is scoped to the new origin: this is only the first
      // unproductive refresh since rotating, so it stays put at streak 1
      // rather than immediately rotating again.
      expect(fourth.originCategory).toBe("build_candidate");
      expect(fourth.originTileKey).toBe(key(9, 9));
      expect(fourth.unproductiveStreak).toBe(1);
    });
  });
});
