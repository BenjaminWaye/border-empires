import { describe, expect, it, vi } from "vitest";
import { OUT_OF_REACH_DECAY_MS, type ReachAnchor } from "@border-empires/shared";
import {
  countBorderOwnershipMismatches,
  seedReachBorderFromAnchors,
  stampOwnedFrontierReachGapsForDecay,
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

const tileAt = (
  key: string,
  fields: Omit<BorderSeedTileView, "x" | "y">
): [string, BorderSeedTileView] => {
  const [x, y] = key.split(",").map(Number);
  return [key, { x: x as number, y: y as number, ...fields }];
};

describe("countBorderOwnershipMismatches", () => {
  it("counts a tile SETTLED by one player on another player's border slot", () => {
    const tiles = tileMap(Object.fromEntries([tileAt("87,318", { ownerId: "enemy", ownershipState: "SETTLED" })]));
    const border = new Map([["87,318", "me"]]);

    expect(countBorderOwnershipMismatches(tiles, border)).toBe(1);
  });

  it("does not count a tile whose settled owner also holds the border slot", () => {
    const tiles = tileMap(Object.fromEntries([tileAt("87,318", { ownerId: "me", ownershipState: "SETTLED" })]));
    const border = new Map([["87,318", "me"]]);

    expect(countBorderOwnershipMismatches(tiles, border)).toBe(0);
  });

  it("does not count FRONTIER ground -- only SETTLED tiles carry the invariant", () => {
    const tiles = tileMap(Object.fromEntries([tileAt("87,318", { ownerId: "enemy", ownershipState: "FRONTIER" })]));
    const border = new Map([["87,318", "me"]]);

    expect(countBorderOwnershipMismatches(tiles, border)).toBe(0);
  });

  it("does not count a tile with no border slot at all", () => {
    const tiles = tileMap(Object.fromEntries([tileAt("87,318", { ownerId: "enemy", ownershipState: "SETTLED" })]));

    expect(countBorderOwnershipMismatches(tiles, new Map())).toBe(0);
  });

  it("exempts barbarian-held ground -- environment, never overtaken by a border push", () => {
    const tiles = tileMap(Object.fromEntries([tileAt("87,318", { ownerId: "barbarian-1", ownershipState: "SETTLED" })]));
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
      now: () => 0,
      stampDecay: vi.fn(),
      runtimeLogInfo
    });

    expect(applyReachAnchorActivation).toHaveBeenCalledWith(anchor, "world-init", { skipNeutralAutoClaim: true });
    expect(runtimeLogInfo).not.toHaveBeenCalled();
  });

  it("logs a violation count when seeding leaves the invariant broken", () => {
    const runtimeLogInfo = vi.fn();

    // "87,318" already has a border slot ("me"), and it's SETTLED, so the
    // gap-decay pass (FRONTIER-only) has nothing to do here.
    const result = seedReachBorderFromAnchors({
      gatherReachAnchors: () => [],
      applyReachAnchorActivation: vi.fn(),
      tiles: tileMap(Object.fromEntries([tileAt("87,318", { ownerId: "enemy", ownershipState: "SETTLED" })])),
      reachBorder: () => new Map([["87,318", "me"]]),
      now: () => 0,
      stampDecay: vi.fn(),
      runtimeLogInfo
    });

    expect(result.mismatches).toBe(1);
    expect(runtimeLogInfo).toHaveBeenCalledTimes(1);
    expect(runtimeLogInfo.mock.calls[0]?.[0]).toEqual({ mismatches: 1 });
  });

  it("reports how many tiles the seeding contest unsettled, so a restart's blast radius is visible", () => {
    const runtimeLogInfo = vi.fn();
    const tiles = tileMap(
      Object.fromEntries([
        tileAt("0,0", { ownerId: "me", ownershipState: "SETTLED" }),
        tileAt("1,0", { ownerId: "me", ownershipState: "SETTLED" })
      ])
    );

    const result = seedReachBorderFromAnchors({
      gatherReachAnchors: () => [anchor],
      // Stand-in for the contest unsettling one undefended tile during the replay.
      applyReachAnchorActivation: () => { tiles.set("0,0", { x: 0, y: 0, ownerId: "me", ownershipState: "FRONTIER" }); },
      tiles,
      reachBorder: () => new Map(),
      now: () => 0,
      stampDecay: vi.fn(),
      runtimeLogInfo
    });

    expect(result.unsettled).toBe(1);
    // "0,0" is now FRONTIER, still owned by "me", with no border slot -- the
    // gap-decay pass picks it up too and logs a second time.
    expect(result.gapsStamped).toBe(1);
    expect(runtimeLogInfo).toHaveBeenCalledTimes(2);
    expect(runtimeLogInfo.mock.calls[0]?.[0]).toMatchObject({ unsettled: 1 });
    expect(runtimeLogInfo.mock.calls[1]?.[0]).toEqual({ gapsStamped: 1 });
  });

  it("logs and reports how many owned FRONTIER gap tiles got a fresh decay timer", () => {
    const runtimeLogInfo = vi.fn();
    const stampDecay = vi.fn();

    const result = seedReachBorderFromAnchors({
      gatherReachAnchors: () => [],
      applyReachAnchorActivation: vi.fn(),
      tiles: tileMap(Object.fromEntries([tileAt("42,7", { ownerId: "me", ownershipState: "FRONTIER" })])),
      reachBorder: () => new Map(),
      now: () => 1_000,
      stampDecay,
      runtimeLogInfo
    });

    expect(result.gapsStamped).toBe(1);
    expect(stampDecay).toHaveBeenCalledWith("42,7", 1_000 + OUT_OF_REACH_DECAY_MS);
    expect(runtimeLogInfo.mock.calls.at(-1)?.[0]).toEqual({ gapsStamped: 1 });
  });
});

describe("stampOwnedFrontierReachGapsForDecay", () => {
  it("stamps an owned FRONTIER tile the anchor replay never covered", () => {
    const stampDecay = vi.fn();

    const stamped = stampOwnedFrontierReachGapsForDecay({
      tiles: tileMap(Object.fromEntries([tileAt("42,7", { ownerId: "me", ownershipState: "FRONTIER" })])),
      reachBorder: () => new Map(),
      gatherReachAnchors: () => [],
      now: () => 1_000,
      stampDecay
    });

    expect(stamped).toBe(1);
    expect(stampDecay).toHaveBeenCalledWith("42,7", 1_000 + OUT_OF_REACH_DECAY_MS);
  });

  it("does not touch a tile the anchor replay already covers", () => {
    const stampDecay = vi.fn();

    const stamped = stampOwnedFrontierReachGapsForDecay({
      tiles: tileMap(Object.fromEntries([tileAt("42,7", { ownerId: "me", ownershipState: "FRONTIER" })])),
      reachBorder: () => new Map([["42,7", "me"]]),
      gatherReachAnchors: () => [],
      now: () => 1_000,
      stampDecay
    });

    expect(stamped).toBe(0);
    expect(stampDecay).not.toHaveBeenCalled();
  });

  it("does not re-stamp a tile that is already decaying (either reason)", () => {
    const stampDecay = vi.fn();

    const stamped = stampOwnedFrontierReachGapsForDecay({
      tiles: tileMap(
        Object.fromEntries([tileAt("42,7", { ownerId: "me", ownershipState: "FRONTIER", frontierDecayKind: "OUT_OF_REACH" })])
      ),
      reachBorder: () => new Map(),
      gatherReachAnchors: () => [],
      now: () => 1_000,
      stampDecay
    });

    expect(stamped).toBe(0);
    expect(stampDecay).not.toHaveBeenCalled();
  });

  it("does not touch SETTLED tiles -- decay only ever applies to FRONTIER ground", () => {
    const stampDecay = vi.fn();

    const stamped = stampOwnedFrontierReachGapsForDecay({
      tiles: tileMap(Object.fromEntries([tileAt("42,7", { ownerId: "me", ownershipState: "SETTLED" })])),
      reachBorder: () => new Map(),
      gatherReachAnchors: () => [],
      now: () => 1_000,
      stampDecay
    });

    expect(stamped).toBe(0);
    expect(stampDecay).not.toHaveBeenCalled();
  });

  it("skips barbarian-held ground -- environment, not a bordered empire", () => {
    const stampDecay = vi.fn();

    const stamped = stampOwnedFrontierReachGapsForDecay({
      tiles: tileMap(Object.fromEntries([tileAt("42,7", { ownerId: "barbarian-1", ownershipState: "FRONTIER" })])),
      reachBorder: () => new Map(),
      gatherReachAnchors: () => [],
      now: () => 1_000,
      stampDecay
    });

    expect(stamped).toBe(0);
    expect(stampDecay).not.toHaveBeenCalled();
  });

  it("skips unowned tiles", () => {
    const stampDecay = vi.fn();

    const stamped = stampOwnedFrontierReachGapsForDecay({
      tiles: tileMap(Object.fromEntries([tileAt("42,7", { ownershipState: "FRONTIER" })])),
      reachBorder: () => new Map(),
      gatherReachAnchors: () => [],
      now: () => 1_000,
      stampDecay
    });

    expect(stamped).toBe(0);
    expect(stampDecay).not.toHaveBeenCalled();
  });

  it("does not stamp a tile actively contested by 2+ live anchors -- fought over, not undefended", () => {
    const stampDecay = vi.fn();
    const rival: ReachAnchor = { x: 42, y: 7, ownerId: "rival", activatedAt: 1, kind: "TOWN" };
    const another: ReachAnchor = { x: 43, y: 7, ownerId: "another", activatedAt: 1, kind: "TOWN" };

    const stamped = stampOwnedFrontierReachGapsForDecay({
      tiles: tileMap(Object.fromEntries([tileAt("42,7", { ownerId: "me", ownershipState: "FRONTIER" })])),
      reachBorder: () => new Map(),
      gatherReachAnchors: () => [rival, another],
      now: () => 1_000,
      stampDecay
    });

    expect(stamped).toBe(0);
    expect(stampDecay).not.toHaveBeenCalled();
  });
});
