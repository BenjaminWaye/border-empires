import { describe, expect, it, vi } from "vitest";
import { createFleetOverlayFeed, dukeRaidsAsFleetOrders } from "./client-space-view-raid-feed.js";

const raid = { fromSeasonId: "s1", seasonId: "s2", launchedAt: 10, arrivesAt: 20 };

describe("the 3D raid feed (§29.4)", () => {
  it("shows each raid as one Fighter flying from its system to its target", () => {
    expect(dukeRaidsAsFleetOrders([raid])).toEqual([
      expect.objectContaining({ originSeasonId: "s1", targetSeasonId: "s2", composition: { RAIDER: 1 }, departsAt: 10, arrivesAt: 20 })
    ]);
  });

  it("keeps the player's own fleet orders alongside the raids", () => {
    const apply = vi.fn();
    const feed = createFleetOverlayFeed(apply);
    const own = { id: "o1", ownerAuthUid: "me", targetSeasonId: "s9", composition: {}, sentAt: 0, arrivesAt: 5 };
    feed.setLegacy([own]);
    feed.setRaids([raid]);
    expect(apply).toHaveBeenLastCalledWith([own, expect.objectContaining({ originSeasonId: "s1" })]);
    feed.setRaids([]);
    expect(apply).toHaveBeenLastCalledWith([own]);
  });
});
