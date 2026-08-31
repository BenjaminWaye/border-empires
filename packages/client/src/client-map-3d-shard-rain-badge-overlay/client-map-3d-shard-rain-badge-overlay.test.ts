import { describe, expect, it, vi } from "vitest";
import { populateShardRainBadgeInstances } from "./client-map-3d-shard-rain-badge-overlay.js";
import type { ResourceBadgeOverlay } from "../client-map-3d-unfed-badge-overlay/client-map-3d-unfed-badge-overlay.js";
import type { Tile } from "../client-types.js";

const baseDeps = (tiles: ReadonlyMap<string, Tile>) => ({
  camX: 10,
  camY: 10,
  halfW: 100,
  halfH: 100,
  elevationAt: () => 0,
  tiles
});

describe("populateShardRainBadgeInstances", () => {
  it("adds a badge instance for every active site whose tile has not confirmed collection", () => {
    const overlay = { addInstance: vi.fn() } as unknown as ResourceBadgeOverlay;
    const shardRainStatus = {
      key: "rain-1",
      phase: "started" as const,
      startsAt: 0,
      expiresAt: Date.now() + 1_800_000,
      siteCount: 1,
      sites: [{ x: 12, y: 12 }]
    };

    populateShardRainBadgeInstances(overlay, shardRainStatus, baseDeps(new Map()));

    expect(overlay.addInstance).toHaveBeenCalledTimes(1);
  });

  it("skips a site once its tile confirms the shard is collected (unfogged, no shardSite)", () => {
    const overlay = { addInstance: vi.fn() } as unknown as ResourceBadgeOverlay;
    const tiles = new Map<string, Tile>();
    tiles.set("12,12", { x: 12, y: 12, fogged: false, shardSite: null } as Tile);
    const shardRainStatus = {
      key: "rain-1",
      phase: "started" as const,
      startsAt: 0,
      expiresAt: Date.now() + 1_800_000,
      siteCount: 1,
      sites: [{ x: 12, y: 12 }]
    };

    populateShardRainBadgeInstances(overlay, shardRainStatus, baseDeps(tiles));

    expect(overlay.addInstance).not.toHaveBeenCalled();
  });

  it("keeps showing a site whose tile is fogged or unknown, since collection isn't confirmed", () => {
    const overlay = { addInstance: vi.fn() } as unknown as ResourceBadgeOverlay;
    const tiles = new Map<string, Tile>();
    tiles.set("12,12", { x: 12, y: 12, fogged: true, shardSite: null } as Tile);
    const shardRainStatus = {
      key: "rain-1",
      phase: "started" as const,
      startsAt: 0,
      expiresAt: Date.now() + 1_800_000,
      siteCount: 1,
      sites: [{ x: 12, y: 12 }]
    };

    populateShardRainBadgeInstances(overlay, shardRainStatus, baseDeps(tiles));

    expect(overlay.addInstance).toHaveBeenCalledTimes(1);
  });
});
