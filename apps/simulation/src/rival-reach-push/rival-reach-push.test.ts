import { describe, expect, it, vi } from "vitest";
import { createRivalReachPushMetrics } from "./rival-reach-push-metrics.js";
import { createRivalReachPushState, pushRivalReachOnConnectSafely, pushRivalReachOnOwnerChanged, type RivalReachPushDeps } from "./rival-reach-push.js";

type World = {
  reachByOwner: Record<string, string[]>;
  visibleByViewer: Record<string, Set<string>>;
  changedByOwner: Record<string, string[]>;
  subscribed: string[];
};

const depsFor = (world: World): { deps: RivalReachPushDeps; emit: ReturnType<typeof vi.fn>; log: { error: ReturnType<typeof vi.fn> } } => {
  const emit = vi.fn();
  const log = { error: vi.fn() };
  const deps: RivalReachPushDeps = {
    reachBorderTileKeysGroupedByOwner: () => new Map(Object.entries(world.reachByOwner)),
    reachTileKeysForPlayer: (ownerId) => [...(world.reachByOwner[ownerId] ?? [])],
    isTileVisibleToPlayer: (viewerId, tileKey) => world.visibleByViewer[viewerId]?.has(tileKey) ?? false,
    takeReachChangedTileKeys: (ownerId) => {
      const keys = world.changedByOwner[ownerId] ?? [];
      delete world.changedByOwner[ownerId];
      return keys;
    },
    emitRivalReachUpdate: emit,
    subscribedPlayerIds: () => world.subscribed,
    metrics: createRivalReachPushMetrics(),
    now: () => 0
  };
  return { deps, emit, log };
};

describe("pushRivalReachOnOwnerChanged (mutation trigger)", () => {
  it("never emits a tile the viewer has no visibility on (fog clipping)", () => {
    const world: World = {
      reachByOwner: { rival: ["0,0", "0,1", "5,5"] },
      visibleByViewer: { viewer: new Set(["0,0", "0,1"]) }, // 5,5 not visible
      changedByOwner: { rival: ["0,0"] },
      subscribed: ["viewer", "rival"]
    };
    const state = createRivalReachPushState();
    const { deps, emit } = depsFor(world);

    pushRivalReachOnOwnerChanged(state, deps, "rival", "cmd-1", { error: vi.fn() });

    expect(emit).toHaveBeenCalledTimes(1);
    const [viewerId, ownerId, tileKeys] = emit.mock.calls[0]!;
    expect(viewerId).toBe("viewer");
    expect(ownerId).toBe("rival");
    expect(tileKeys).toEqual(["0,0", "0,1"]);
    expect(tileKeys).not.toContain("5,5");
  });

  it("skips a viewer who cannot see any of the changed tiles (no visible overlap)", () => {
    const world: World = {
      reachByOwner: { rival: ["9,9"] },
      visibleByViewer: { viewer: new Set(["0,0"]) },
      changedByOwner: { rival: ["9,9"] },
      subscribed: ["viewer", "rival"]
    };
    const state = createRivalReachPushState();
    const { deps, emit } = depsFor(world);

    pushRivalReachOnOwnerChanged(state, deps, "rival", "cmd-1", { error: vi.fn() });

    expect(emit).not.toHaveBeenCalled();
    expect(deps.metrics.snapshot().mutationPushNoVisibleOverlapTotal).toBe(1);
  });

  it("never pushes to the owner itself", () => {
    const world: World = {
      reachByOwner: { rival: ["0,0"] },
      visibleByViewer: { rival: new Set(["0,0"]) },
      changedByOwner: { rival: ["0,0"] },
      subscribed: ["rival"]
    };
    const state = createRivalReachPushState();
    const { deps, emit } = depsFor(world);

    pushRivalReachOnOwnerChanged(state, deps, "rival", "cmd-1", { error: vi.fn() });

    expect(emit).not.toHaveBeenCalled();
  });

  it("dedups an unchanged clipped set on a later mutation for the same (viewer, owner)", () => {
    const world: World = {
      reachByOwner: { rival: ["0,0"] },
      visibleByViewer: { viewer: new Set(["0,0"]) },
      changedByOwner: { rival: ["0,0"] },
      subscribed: ["viewer", "rival"]
    };
    const state = createRivalReachPushState();
    const { deps, emit } = depsFor(world);

    pushRivalReachOnOwnerChanged(state, deps, "rival", "cmd-1", { error: vi.fn() });
    world.changedByOwner.rival = ["0,0"]; // same tile changes again, clipped set is identical
    pushRivalReachOnOwnerChanged(state, deps, "rival", "cmd-2", { error: vi.fn() });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(deps.metrics.snapshot().pushDedupSkippedTotal).toBe(1);
  });

  it("does nothing when the changed-tile buffer is empty (defensive no-op, not a full-border fallback scan)", () => {
    const world: World = {
      reachByOwner: { rival: ["0,0"] },
      visibleByViewer: { viewer: new Set(["0,0"]) },
      changedByOwner: {},
      subscribed: ["viewer", "rival"]
    };
    const state = createRivalReachPushState();
    const { deps, emit } = depsFor(world);

    pushRivalReachOnOwnerChanged(state, deps, "rival", "cmd-1", { error: vi.fn() });

    expect(emit).not.toHaveBeenCalled();
  });

  it("isolates a failure instead of throwing, and counts it", () => {
    const world: World = {
      reachByOwner: { rival: ["0,0"] },
      visibleByViewer: { viewer: new Set(["0,0"]) },
      changedByOwner: { rival: ["0,0"] },
      subscribed: ["viewer", "rival"]
    };
    const state = createRivalReachPushState();
    const { deps } = depsFor(world);
    deps.emitRivalReachUpdate = () => {
      throw new Error("boom");
    };
    const log = { error: vi.fn() };

    expect(() => pushRivalReachOnOwnerChanged(state, deps, "rival", "cmd-1", log)).not.toThrow();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(deps.metrics.snapshot().mutationPushFailedTotal).toBe(1);
  });
});

describe("pushRivalReachOnConnectSafely (connect trigger)", () => {
  it("clips each rival's border to the joining viewer's visibility", () => {
    const world: World = {
      reachByOwner: { rivalA: ["0,0", "1,1"], rivalB: ["9,9"] },
      visibleByViewer: { viewer: new Set(["0,0"]) }, // sees only rivalA's 0,0; nothing of rivalB
      changedByOwner: {},
      subscribed: ["viewer"]
    };
    const state = createRivalReachPushState();
    const { deps, emit } = depsFor(world);

    pushRivalReachOnConnectSafely(state, deps, "viewer", { error: vi.fn() });

    expect(emit).toHaveBeenCalledTimes(1);
    const [viewerId, ownerId, tileKeys] = emit.mock.calls[0]!;
    expect(viewerId).toBe("viewer");
    expect(ownerId).toBe("rivalA");
    expect(tileKeys).toEqual(["0,0"]);
  });

  it("never pushes an owner with zero visible overlap to the joining viewer", () => {
    const world: World = {
      reachByOwner: { rival: ["9,9"] },
      visibleByViewer: { viewer: new Set(["0,0"]) },
      changedByOwner: {},
      subscribed: ["viewer"]
    };
    const state = createRivalReachPushState();
    const { deps, emit } = depsFor(world);

    pushRivalReachOnConnectSafely(state, deps, "viewer", { error: vi.fn() });

    expect(emit).not.toHaveBeenCalled();
  });

  it("never pushes the viewer their own border as a rival", () => {
    const world: World = {
      reachByOwner: { viewer: ["0,0"] },
      visibleByViewer: { viewer: new Set(["0,0"]) },
      changedByOwner: {},
      subscribed: ["viewer"]
    };
    const state = createRivalReachPushState();
    const { deps, emit } = depsFor(world);

    pushRivalReachOnConnectSafely(state, deps, "viewer", { error: vi.fn() });

    expect(emit).not.toHaveBeenCalled();
  });

  it("caps total tiles scanned across owners and counts the cap", () => {
    const bigOwnerTiles = Array.from({ length: 9000 }, (_, i) => `${i},0`);
    const world: World = {
      reachByOwner: { huge: bigOwnerTiles, small: ["0,0"] },
      visibleByViewer: { viewer: new Set(["0,0"]) },
      changedByOwner: {},
      subscribed: ["viewer"]
    };
    const state = createRivalReachPushState();
    const { deps, emit } = depsFor(world);

    pushRivalReachOnConnectSafely(state, deps, "viewer", { error: vi.fn() });

    // "huge" exceeds MAX_CONNECT_TILE_SCAN alone and is skipped this pass;
    // "small" still gets through since it stays under budget.
    expect(deps.metrics.snapshot().connectPushTileScanCappedTotal).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![1]).toBe("small");
  });

  it("does not let invisible owners scanned earlier starve a later visible neighbor's budget", () => {
    // Two owners the viewer cannot see at all, together at the scan cap,
    // followed by a genuinely adjacent/visible neighbor. Before the fix, the
    // invisible owners' tiles were charged to the budget before their
    // visibility was checked, so the neighbor could get capped out purely by
    // iteration order — permanently, since an offline/inactive owner never
    // triggers the mutation push that would otherwise "catch up" later.
    const invisibleA = Array.from({ length: 4000 }, (_, i) => `a${i},0`);
    const invisibleB = Array.from({ length: 4000 }, (_, i) => `b${i},0`);
    const world: World = {
      reachByOwner: { invisibleA, invisibleB, neighbor: ["5,5"] },
      visibleByViewer: { viewer: new Set(["5,5"]) },
      changedByOwner: {},
      subscribed: ["viewer"]
    };
    const state = createRivalReachPushState();
    const { deps, emit } = depsFor(world);

    pushRivalReachOnConnectSafely(state, deps, "viewer", { error: vi.fn() });

    expect(deps.metrics.snapshot().connectPushTileScanCappedTotal).toBe(0);
    expect(deps.metrics.snapshot().connectPushNoVisibleOverlapTotal).toBe(2);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![1]).toBe("neighbor");
    expect(emit.mock.calls[0]![2]).toEqual(["5,5"]);
  });

  it("bounds total visibility-gate probing even when invisible owners' borders are collectively huge", () => {
    // Two owners, neither with any tile visible to the viewer, whose combined
    // border sizes vastly exceed any per-push budget. hasAnyVisibleTile can't
    // short-circuit when nothing is visible, so proving that costs O(tile
    // count) per owner -- without its own bound, this reintroduces the exact
    // unbounded connect-time scan the cap exists to prevent, just moved from
    // "charging the push budget" to "probing visibility".
    const hugeInvisibleA = Array.from({ length: 90_000 }, (_, i) => `a${i},0`);
    const hugeInvisibleB = Array.from({ length: 90_000 }, (_, i) => `b${i},0`);
    const world: World = {
      reachByOwner: { hugeInvisibleA, hugeInvisibleB },
      visibleByViewer: { viewer: new Set(["nowhere,near"]) },
      changedByOwner: {},
      subscribed: ["viewer"]
    };
    const state = createRivalReachPushState();
    const { deps, emit } = depsFor(world);
    let visibilityCheckCalls = 0;
    const baseIsVisible = deps.isTileVisibleToPlayer;
    deps.isTileVisibleToPlayer = (viewerId, tileKey) => {
      visibilityCheckCalls += 1;
      return baseIsVisible(viewerId, tileKey);
    };

    pushRivalReachOnConnectSafely(state, deps, "viewer", { error: vi.fn() });

    // Total probing work stays bounded regardless of how large the
    // (invisible) owners' borders are -- nowhere near the 180,000 tiles on
    // offer.
    expect(visibilityCheckCalls).toBeLessThan(90_000);
    expect(emit).not.toHaveBeenCalled();
  });

  it("isolates a failure instead of rejecting the surrounding connect flow", () => {
    const world: World = {
      reachByOwner: { rival: ["0,0"] },
      visibleByViewer: { viewer: new Set(["0,0"]) },
      changedByOwner: {},
      subscribed: ["viewer"]
    };
    const state = createRivalReachPushState();
    const { deps } = depsFor(world);
    deps.reachBorderTileKeysGroupedByOwner = () => {
      throw new Error("boom");
    };
    const log = { error: vi.fn() };

    expect(() => pushRivalReachOnConnectSafely(state, deps, "viewer", log)).not.toThrow();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(deps.metrics.snapshot().connectPushFailedTotal).toBe(1);
  });
});
