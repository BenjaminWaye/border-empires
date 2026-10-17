import { describe, expect, it, vi } from "vitest";
import type { ReachAnchor } from "@border-empires/shared";
import {
  countBorderOwnershipMismatches,
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
      runtimeLogInfo
    });

    expect(result.unsettled).toBe(1);
    expect(runtimeLogInfo).toHaveBeenCalledTimes(1);
    expect(runtimeLogInfo.mock.calls[0]?.[0]).toMatchObject({ unsettled: 1 });
  });

  it("leaves an owned FRONTIER tile outside every anchor's disk alone -- out-of-reach frontier no longer decays", () => {
    const runtimeLogInfo = vi.fn();
    const tiles = tileMap(Object.fromEntries([tileAt("42,7", { ownerId: "me", ownershipState: "FRONTIER" })]));

    const result = seedReachBorderFromAnchors({
      gatherReachAnchors: () => [],
      applyReachAnchorActivation: vi.fn(),
      tiles,
      reachBorder: () => new Map(),
      runtimeLogInfo
    });

    expect(result).toEqual({ unsettled: 0, mismatches: 0 });
    expect(tiles.get("42,7")).toEqual({ x: 42, y: 7, ownerId: "me", ownershipState: "FRONTIER" });
    expect(runtimeLogInfo).not.toHaveBeenCalled();
  });
});
