import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

describe("buildSnapshotTileDetail muster clear-signaling", () => {
  it("emits an explicit empty musterJson for an owned tile with no muster flag", () => {
    // Regression: the sim's tile-detail serializer (toFullSnapshotProtoTile)
    // truthy-guards muster_json, so a tile whose flag is gone carries no
    // muster field at all -- and the spread omitted the key, which the
    // client's sparse merge reads as "unchanged". A player whose flag was
    // removed server-side (e.g. the MUSTER_STALE_MS auto-clear) kept seeing
    // it, and "Clear Muster" was rejected with MUSTER_INVALID forever,
    // because the tile-detail refresh that should have healed the belief was
    // structurally unable to clear the field.
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [{ x: 90, y: 317, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 90, 317);

    expect(detail && "musterJson" in detail).toBe(true);
    expect(detail?.musterJson).toBe("");
    // Must survive the wire: JSON.stringify drops undefined, keeps "".
    expect("musterJson" in (JSON.parse(JSON.stringify(detail)) as Record<string, unknown>)).toBe(true);
  });

  it("passes a real muster flag through untouched", () => {
    const musterJson = JSON.stringify({ ownerId: "player-1", mode: "HOLD", amount: 12, updatedAt: 1 });
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [{ x: 90, y: 317, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", musterJson }]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 90, 317);

    expect(detail?.musterJson).toBe(musterJson);
  });
});
