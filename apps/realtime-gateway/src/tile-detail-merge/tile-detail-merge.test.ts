import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { mergeTileDetailIntoSnapshot } from "./tile-detail-merge.js";

describe("mergeTileDetailIntoSnapshot", () => {
  it("overlays fresh tile fields on the cached tile", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [{ x: 74, y: 414, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }]
    };
    const fresh: PlayerSubscriptionSnapshot["tiles"] = [
      { x: 74, y: 414, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
    ];

    const merged = mergeTileDetailIntoSnapshot(snapshot, fresh, undefined, "player-1");

    expect(merged.tiles).toEqual(fresh);
  });

  it("still appends a fresh tile not present in the cached snapshot", () => {
    const snapshot: PlayerSubscriptionSnapshot = { playerId: "player-1", tiles: [] };
    const fresh: PlayerSubscriptionSnapshot["tiles"] = [{ x: 5, y: 5, terrain: "LAND", ownerId: "player-1" }];

    const merged = mergeTileDetailIntoSnapshot(snapshot, fresh, undefined, "player-1");

    expect(merged.tiles).toEqual(fresh);
  });

  it("clears a cached resource the fresh tile no longer has (regression: emptied salvage field reappeared)", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [{ x: 5, y: 287, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "PRECURSOR_SALVAGE" }]
    };
    // Exact shape the sim's FetchTileDetail returns after the last salvage load: no resource key.
    const fresh: PlayerSubscriptionSnapshot["tiles"] = [{ x: 5, y: 287, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }];

    const merged = mergeTileDetailIntoSnapshot(snapshot, fresh, undefined, "player-1");

    expect(merged.tiles[0]).not.toHaveProperty("resource");
    expect(mergeTileDetailIntoSnapshot(snapshot, [{ ...fresh[0]!, resource: "PRECURSOR_SALVAGE" }], undefined, "player-1").tiles[0]?.resource).toBe("PRECURSOR_SALVAGE");
  });

  it("keeps a cached resource on a tile the player doesn't own (masked projections omit it)", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [{ x: 9, y: 9, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED", resource: "IRON" }]
    };
    // Lock-target-only enemy tiles come back terrain-only from FetchTileDetail.
    const merged = mergeTileDetailIntoSnapshot(snapshot, [{ x: 9, y: 9, terrain: "LAND", ownerId: "enemy" }], undefined, "player-1");
    expect(merged.tiles[0]?.resource).toBe("IRON");
  });
});
