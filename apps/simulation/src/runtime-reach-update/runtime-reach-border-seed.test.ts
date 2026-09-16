import { describe, expect, it, vi } from "vitest";
import type { ReachAnchor } from "@border-empires/shared";
import {
  countBorderOwnershipMismatches,
  fillOwnedReachGaps,
  seedReachBorderFromAnchors,
  type BorderSeedTileView
} from "./runtime-reach-border-seed.js";

/**
 * The reachOwnerId/ownerId invariant: a tile SETTLED by player Y must never
 * sit on a reach-border slot held by player X. Boot seeding used to
 * manufacture exactly that state and re-create it on every restart, so this
 * audit is the standing detector for the bug coming back.
 */

const tileMap = (entries: Record<string, BorderSeedTileView>): Map<string, BorderSeedTileView> =>
  new Map(Object.entries(entries));

describe("countBorderOwnershipMismatches", () => {
  it("counts a tile SETTLED by one player on another player's border slot", () => {
    const tiles = tileMap({ "87,318": { ownerId: "enemy", ownershipState: "SETTLED" } });
    const border = new Map([["87,318", "me"]]);

    expect(countBorderOwnershipMismatches(tiles, border)).toBe(1);
  });

  it("does not count a tile whose settled owner also holds the border slot", () => {
    const tiles = tileMap({ "87,318": { ownerId: "me", ownershipState: "SETTLED" } });
    const border = new Map([["87,318", "me"]]);

    expect(countBorderOwnershipMismatches(tiles, border)).toBe(0);
  });

  it("does not count FRONTIER ground -- only SETTLED tiles carry the invariant", () => {
    const tiles = tileMap({ "87,318": { ownerId: "enemy", ownershipState: "FRONTIER" } });
    const border = new Map([["87,318", "me"]]);

    expect(countBorderOwnershipMismatches(tiles, border)).toBe(0);
  });

  it("does not count a tile with no border slot at all", () => {
    const tiles = tileMap({ "87,318": { ownerId: "enemy", ownershipState: "SETTLED" } });

    expect(countBorderOwnershipMismatches(tiles, new Map())).toBe(0);
  });

  it("exempts barbarian-held ground -- environment, never overtaken by a border push", () => {
    const tiles = tileMap({ "87,318": { ownerId: "barbarian-1", ownershipState: "SETTLED" } });
    const border = new Map([["87,318", "me"]]);

    expect(countBorderOwnershipMismatches(tiles, border)).toBe(0);
  });
});

describe("seedReachBorderFromAnchors", () => {
  const anchor: ReachAnchor = { x: 10, y: 10, ownerId: "me", activatedAt: 1, kind: "TOWN" };

  it("replays every anchor with neutral auto-claim skipped but the settled contest left on", () => {
    const applyReachAnchorActivation = vi.fn();
    const runtimeLogInfo = vi.fn();

    seedReachBorderFromAnchors({
      gatherReachAnchors: () => [anchor],
      applyReachAnchorActivation,
      tiles: new Map(),
      reachBorder: () => new Map(),
      grantReachBorderSlot: vi.fn(),
      runtimeLogInfo
    });

    expect(applyReachAnchorActivation).toHaveBeenCalledWith(anchor, "world-init", { skipNeutralAutoClaim: true });
    expect(runtimeLogInfo).not.toHaveBeenCalled();
  });

  it("logs a violation count when seeding leaves the invariant broken", () => {
    const runtimeLogInfo = vi.fn();

    // "87,318" already has a border slot ("me"), so the gap-fill pass has
    // nothing to do here and can't add a second log call.
    const result = seedReachBorderFromAnchors({
      gatherReachAnchors: () => [],
      applyReachAnchorActivation: vi.fn(),
      tiles: tileMap({ "87,318": { ownerId: "enemy", ownershipState: "SETTLED" } }),
      reachBorder: () => new Map([["87,318", "me"]]),
      grantReachBorderSlot: vi.fn(),
      runtimeLogInfo
    });

    expect(result.mismatches).toBe(1);
    expect(runtimeLogInfo).toHaveBeenCalledTimes(1);
    expect(runtimeLogInfo.mock.calls[0]?.[0]).toEqual({ mismatches: 1 });
  });

  it("reports how many tiles the seeding contest unsettled, so a restart's blast radius is visible", () => {
    const runtimeLogInfo = vi.fn();
    const tiles = tileMap({
      "0,0": { ownerId: "me", ownershipState: "SETTLED" },
      "1,0": { ownerId: "me", ownershipState: "SETTLED" }
    });

    const result = seedReachBorderFromAnchors({
      gatherReachAnchors: () => [anchor],
      // Stand-in for the contest unsettling one undefended tile during the replay.
      applyReachAnchorActivation: () => { tiles.set("0,0", { ownerId: "me", ownershipState: "FRONTIER" }); },
      tiles,
      reachBorder: () => new Map(),
      grantReachBorderSlot: vi.fn(),
      runtimeLogInfo
    });

    expect(result.unsettled).toBe(1);
    // Both "0,0" (now FRONTIER) and "1,0" (still SETTLED) still owned by
    // "me" with no border slot, so the gap-fill pass covers both and logs
    // a second time.
    expect(result.gapsFilled).toBe(2);
    expect(runtimeLogInfo).toHaveBeenCalledTimes(2);
    expect(runtimeLogInfo.mock.calls[0]?.[0]).toMatchObject({ unsettled: 1 });
    expect(runtimeLogInfo.mock.calls[1]?.[0]).toEqual({ gapsFilled: 2 });
  });
});

describe("fillOwnedReachGaps", () => {
  it("grants a border slot for an owned tile the anchor replay never touched", () => {
    const grantReachBorderSlot = vi.fn();

    const filled = fillOwnedReachGaps({
      tiles: tileMap({ "42,7": { ownerId: "me", ownershipState: "FRONTIER" } }),
      reachBorder: () => new Map(),
      grantReachBorderSlot
    });

    expect(filled).toBe(1);
    expect(grantReachBorderSlot).toHaveBeenCalledWith("42,7", "me");
  });

  it("never overwrites a slot the anchor contest already resolved", () => {
    const grantReachBorderSlot = vi.fn();

    const filled = fillOwnedReachGaps({
      tiles: tileMap({ "42,7": { ownerId: "me", ownershipState: "FRONTIER" } }),
      reachBorder: () => new Map([["42,7", "rival"]]),
      grantReachBorderSlot
    });

    expect(filled).toBe(0);
    expect(grantReachBorderSlot).not.toHaveBeenCalled();
  });

  it("skips barbarian-held ground -- environment, not a bordered empire", () => {
    const grantReachBorderSlot = vi.fn();

    const filled = fillOwnedReachGaps({
      tiles: tileMap({ "42,7": { ownerId: "barbarian-1", ownershipState: "SETTLED" } }),
      reachBorder: () => new Map(),
      grantReachBorderSlot
    });

    expect(filled).toBe(0);
    expect(grantReachBorderSlot).not.toHaveBeenCalled();
  });

  it("skips unowned tiles", () => {
    const grantReachBorderSlot = vi.fn();

    const filled = fillOwnedReachGaps({
      tiles: tileMap({ "42,7": { ownershipState: "FRONTIER" } }),
      reachBorder: () => new Map(),
      grantReachBorderSlot
    });

    expect(filled).toBe(0);
    expect(grantReachBorderSlot).not.toHaveBeenCalled();
  });
});
