import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { mergeTileDetailIntoSnapshot } from "./tile-detail-merge.js";

describe("mergeTileDetailIntoSnapshot", () => {
  it("clears a stale shardSiteJson on the viewer's own tile when the fresh fetch omits it", () => {
    // Regression: toFullSnapshotProtoTile (the sim's FetchTileDetail
    // serializer) truthy-guards shardSiteJson, so a tile whose shard is gone
    // carries no shardSiteJson at all in `fresh`. A blind `{...old, ...fresh}`
    // spread then reads that omission as "unchanged" and keeps re-serving a
    // shard that expired (or was collected) while the tile was outside this
    // player's live vision -- Collect Shard then rejects with COLLECT_EMPTY
    // forever, no matter how many times the tile is reselected.
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        { x: 74, y: 414, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", shardSiteJson: JSON.stringify({ kind: "FALL", amount: 1 }) }
      ]
    };
    const fresh: PlayerSubscriptionSnapshot["tiles"] = [
      { x: 74, y: 414, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
    ];

    const merged = mergeTileDetailIntoSnapshot(snapshot, fresh, undefined, "player-1");

    expect(merged.tiles[0]?.shardSiteJson).toBeUndefined();
  });

  it("passes a real, still-present shardSiteJson through untouched", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        { x: 74, y: 414, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", shardSiteJson: JSON.stringify({ kind: "FALL", amount: 1 }) }
      ]
    };
    const shardSiteJson = JSON.stringify({ kind: "FALL", amount: 2 });
    const fresh: PlayerSubscriptionSnapshot["tiles"] = [
      { x: 74, y: 414, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", shardSiteJson }
    ];

    const merged = mergeTileDetailIntoSnapshot(snapshot, fresh, undefined, "player-1");

    expect(merged.tiles[0]?.shardSiteJson).toBe(shardSiteJson);
  });

  it("does NOT force-clear shardSiteJson on a tile the viewer does not own", () => {
    // A neutral or enemy-owned tile's shardSiteJson omission from a
    // visibility-filtered fresh fetch can legitimately mean "not revealed to
    // you yet" rather than "removed" -- only the viewer's own tile is safe
    // to force-clear (see the doc comment in tile-detail-merge.ts).
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        { x: 10, y: 20, terrain: "LAND", shardSiteJson: JSON.stringify({ kind: "CACHE", amount: 1 }) }
      ]
    };
    const fresh: PlayerSubscriptionSnapshot["tiles"] = [{ x: 10, y: 20, terrain: "LAND" }];

    const merged = mergeTileDetailIntoSnapshot(snapshot, fresh, undefined, "player-1");

    expect(merged.tiles[0]?.shardSiteJson).toBe(JSON.stringify({ kind: "CACHE", amount: 1 }));
  });

  it("still appends a fresh tile not present in the cached snapshot", () => {
    const snapshot: PlayerSubscriptionSnapshot = { playerId: "player-1", tiles: [] };
    const fresh: PlayerSubscriptionSnapshot["tiles"] = [{ x: 5, y: 5, terrain: "LAND", ownerId: "player-1" }];

    const merged = mergeTileDetailIntoSnapshot(snapshot, fresh, undefined, "player-1");

    expect(merged.tiles).toEqual(fresh);
  });
});
