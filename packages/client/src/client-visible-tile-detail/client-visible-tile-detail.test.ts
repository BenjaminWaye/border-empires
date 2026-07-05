import { describe, expect, it, vi } from "vitest";

import { createVisibleTileDetailRequester } from "./client-visible-tile-detail.js";
import type { Tile } from "../client-types.js";

const makeTile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y,
  terrain: "LAND",
  detailLevel: "summary",
  fogged: false,
  ...overrides
});

describe("createVisibleTileDetailRequester", () => {
  it("prioritizes nearby town tiles in the visible viewport", () => {
    const requestTileDetailIfNeeded = vi.fn();
    const requestVisibleTileDetails = createVisibleTileDetailRequester({
      state: { me: "me" },
      keyFor: (x, y) => `${x},${y}`,
      requestTileDetailIfNeeded,
      isMobile: () => false,
      now: () => 1_000
    });

    requestVisibleTileDetails(
      [
        { wx: 110, wy: 100, vis: "visible", t: makeTile(110, 100, { ownerId: "enemy", ownershipState: "SETTLED", townType: "MARKET" }) },
        { wx: 100, wy: 100, vis: "visible", t: makeTile(100, 100, { ownerId: "me", ownershipState: "SETTLED", townType: "MARKET" }) },
        { wx: 101, wy: 100, vis: "visible", t: makeTile(101, 100, { ownerId: "me", ownershipState: "SETTLED", townType: "FARMING" }) }
      ],
      100,
      100
    );

    expect(requestTileDetailIfNeeded).toHaveBeenCalledTimes(3);
    expect(requestTileDetailIfNeeded.mock.calls[0]?.[0]).toMatchObject({ x: 100, y: 100, ownerId: "me" });
    expect(requestTileDetailIfNeeded.mock.calls[1]?.[0]).toMatchObject({ x: 101, y: 100, ownerId: "me" });
  });

  it("skips full, fogged, and empty visible town tiles", () => {
    const requestTileDetailIfNeeded = vi.fn();
    const requestVisibleTileDetails = createVisibleTileDetailRequester({
      state: { me: "me" },
      keyFor: (x, y) => `${x},${y}`,
      requestTileDetailIfNeeded,
      isMobile: () => false,
      now: () => 1_000
    });

    requestVisibleTileDetails(
      [
        { wx: 10, wy: 10, vis: "visible", t: makeTile(10, 10, { detailLevel: "full", ownerId: "me", townType: "MARKET" }) },
        { wx: 11, wy: 10, vis: "visible", t: makeTile(11, 10, { fogged: true, ownerId: "me", townType: "MARKET" }) },
        { wx: 12, wy: 10, vis: "visible", t: makeTile(12, 10) },
        { wx: 13, wy: 10, vis: "fogged", t: makeTile(13, 10, { ownerId: "me", townType: "MARKET" }) },
        { wx: 14, wy: 10, vis: "visible", t: makeTile(14, 10, { ownerId: "me", ownershipState: "SETTLED", townType: "MARKET" }) }
      ],
      14,
      10
    );

    expect(requestTileDetailIfNeeded).toHaveBeenCalledTimes(1);
    expect(requestTileDetailIfNeeded).toHaveBeenCalledWith(expect.objectContaining({ x: 14, y: 10, ownerId: "me" }));
  });

  it("throttles repeated viewport scans", () => {
    const requestTileDetailIfNeeded = vi.fn();
    let nowMs = 1_000;
    const requestVisibleTileDetails = createVisibleTileDetailRequester({
      state: { me: "me" },
      keyFor: (x, y) => `${x},${y}`,
      requestTileDetailIfNeeded,
      isMobile: () => false,
      now: () => nowMs,
      minIntervalMs: 160
    });

    const visibleTiles = [{ wx: 14, wy: 10, vis: "visible" as const, t: makeTile(14, 10, { ownerId: "me", ownershipState: "SETTLED", townType: "MARKET" }) }];
    requestVisibleTileDetails(visibleTiles, 14, 10);
    requestVisibleTileDetails(visibleTiles, 14, 10);
    nowMs += 200;
    requestVisibleTileDetails(visibleTiles, 14, 10);

    expect(requestTileDetailIfNeeded).toHaveBeenCalledTimes(2);
  });

  it("skips bare owned land, resources, docks, forts, and other structures with no town (narrowed scope)", () => {
    // The sweep used to treat plain ownerId (or a resource/dock/fort/etc.
    // with no town) as reason enough to fetch detail. For a large empire
    // that's mostly bare settled land, that meant the sweep never idled --
    // thousands of tiles expiring from the 60s freshness cache and
    // re-queuing forever, for enrichment data that doesn't actually exist
    // on those tiles. Now only tiles with a real town identity qualify.
    const requestTileDetailIfNeeded = vi.fn();
    const requestVisibleTileDetails = createVisibleTileDetailRequester({
      state: { me: "me" },
      keyFor: (x, y) => `${x},${y}`,
      requestTileDetailIfNeeded,
      isMobile: () => false,
      now: () => 1_000
    });

    requestVisibleTileDetails(
      [
        { wx: 1, wy: 1, vis: "visible", t: makeTile(1, 1, { ownerId: "me", ownershipState: "SETTLED" }) },
        { wx: 2, wy: 1, vis: "visible", t: makeTile(2, 1, { ownerId: "me", ownershipState: "SETTLED", resource: "FARM" }) },
        { wx: 3, wy: 1, vis: "visible", t: makeTile(3, 1, { ownerId: "me", ownershipState: "SETTLED", dockId: "dock-1" }) },
        { wx: 4, wy: 1, vis: "visible", t: makeTile(4, 1, { ownerId: "me", ownershipState: "SETTLED", fort: { ownerId: "me", status: "active" } }) },
        { wx: 5, wy: 1, vis: "visible", t: makeTile(5, 1, { ownerId: "me", ownershipState: "SETTLED", shardSite: { kind: "FALL", amount: 1, expiresAt: 9_999 } }) }
      ],
      1,
      1
    );

    expect(requestTileDetailIfNeeded).not.toHaveBeenCalled();
  });
});
