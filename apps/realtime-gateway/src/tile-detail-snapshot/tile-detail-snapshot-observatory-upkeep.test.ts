import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

// Kept in a dedicated file rather than added to tile-detail-snapshot.test.ts,
// which is already over the repo's 500-line cap (AGENTS.md: files already
// over the cap may not grow further).
//
// Regression: an Observatory's domain object has no `type`/`variant` field,
// so it was silently dropped by the generic per-minute upkeep loop's
// `if (!type) continue;` guard -- Observatory never got an upkeepEntries
// row at all, even though each additional one a player owns costs
// progressively more CRYSTAL slot upkeep (applyObservatoryProgressiveCost in
// apps/simulation/src/resource-slot-view/resource-slot-view.ts: 1st = 1
// slot, 2nd = 2, and so on by build order).
describe("buildSnapshotTileDetail — Observatory progressive CRYSTAL slot upkeep", () => {
  it("reports 1 CRYSTAL slot for a player's first active Observatory", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          observatoryJson: JSON.stringify({ ownerId: "player-1", status: "active", activatedAt: 100 })
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);

    expect(detail?.upkeepEntries).toEqual([
      { label: "Observatory", perMinute: {}, slot: { resource: "CRYSTAL", count: 1 } }
    ]);
  });

  it("ranks a player's Observatories by build order, so the 2nd reports 2 CRYSTAL slots", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          observatoryJson: JSON.stringify({ ownerId: "player-1", status: "active", activatedAt: 100 })
        },
        {
          x: 11,
          y: 11,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          observatoryJson: JSON.stringify({ ownerId: "player-1", status: "active", activatedAt: 200 })
        }
      ]
    };

    const firstDetail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);
    const secondDetail = buildSnapshotTileDetail(snapshot, "player-1", 11, 11);

    expect(firstDetail?.upkeepEntries).toEqual([
      { label: "Observatory", perMinute: {}, slot: { resource: "CRYSTAL", count: 1 } }
    ]);
    expect(secondDetail?.upkeepEntries).toEqual([
      { label: "Observatory", perMinute: {}, slot: { resource: "CRYSTAL", count: 2 } }
    ]);
  });

  it("omits Observatory upkeep from Watchtower Engine's own exempt observatory", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 12,
          y: 12,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          observatoryJson: JSON.stringify({ ownerId: "player-1", status: "active", activatedAt: 100 }),
          naturalWonderJson: JSON.stringify({ type: "WATCHTOWER_ENGINE" })
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 12, 12);

    expect(detail && "upkeepEntries" in detail).toBe(false);
  });

  it("does not report Observatory upkeep while under construction", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 13,
          y: 13,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          observatoryJson: JSON.stringify({ ownerId: "player-1", status: "under_construction" })
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 13, 13);

    expect(detail && "upkeepEntries" in detail).toBe(false);
  });
});
