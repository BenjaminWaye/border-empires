import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

describe("buildSnapshotTileDetail shardSite clear-signaling", () => {
  it("emits an explicit empty shardSiteJson for the viewer's own tile with no shard", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [{ x: 74, y: 414, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 74, 414);

    expect(detail && "shardSiteJson" in detail).toBe(true);
    expect(detail?.shardSiteJson).toBe("");
    // Must survive the wire: JSON.stringify drops undefined, keeps "".
    expect("shardSiteJson" in (JSON.parse(JSON.stringify(detail)) as Record<string, unknown>)).toBe(true);
  });

  it("passes a real shardSiteJson on the viewer's own tile through untouched", () => {
    const shardSiteJson = JSON.stringify({ kind: "FALL", amount: 1 });
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [{ x: 74, y: 414, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", shardSiteJson }]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 74, 414);

    expect(detail?.shardSiteJson).toBe(shardSiteJson);
  });

  it("does not force-clear shardSiteJson on a tile the viewer does not own", () => {
    // Reveal gating elsewhere in the sim's projection can legitimately omit
    // shardSiteJson for a tile not owned by the viewer (e.g. "not revealed to
    // you yet"), so this must stay scoped to the viewer's own tile.
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [{ x: 10, y: 20, terrain: "LAND" }]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 20);

    expect(detail && "shardSiteJson" in detail).toBe(false);
  });
});
