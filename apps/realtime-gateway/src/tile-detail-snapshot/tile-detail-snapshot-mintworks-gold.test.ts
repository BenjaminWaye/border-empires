import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

// fallbackTownGoldPerMinute's flat-Mintworks-bonus regression test, kept in
// a dedicated file rather than added to tile-detail-snapshot.test.ts, which
// is already at the repo's 500-line soft cap.
describe("buildSnapshotTileDetail — Mintworks flat gold bonus", () => {
  // Regression: fallbackTownGoldPerMinute (tile-detail-snapshot.ts's own
  // recompute, used whenever the snapshot's townJson lacks goldPerMinute)
  // duplicated apps/simulation/src/player-update-economy.ts's authoritative
  // townGoldPerMinuteForPlayer but dropped its trailing
  // "+ MINTWORKS_FLAT_GOLD_BONUS_PER_MIN * mintworksCount" term — each
  // active Mintworks' flat +1 gold/day-per-copy bonus (separate from its %
  // production multiplier) silently never reached this gateway-served
  // tile-detail path, same bug as live-town-summary.ts's own formula.
  it("includes each active Mintworks' flat gold/min bonus in the backfilled goldPerMinute", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 241,
          y: 150,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Velorreach",
            type: "MARKET",
            populationTier: "TOWN",
            baseGoldPerMinute: 2,
            supportCurrent: 5,
            supportMax: 5,
            // goldPerMinute / cap intentionally absent — this is the bug shape.
            isFed: true,
            population: 20671,
            maxPopulation: 10_000_000,
            connectedTownCount: 0,
            connectedTownBonus: 0
          }),
          townType: "MARKET",
          townPopulationTier: "TOWN"
        },
        // Five neighbor settled tiles so supportSummary reads 5/5; one hosts
        // an active Mintworks (still counts toward the support ring).
        { x: 240, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ type: "MINTWORKS", status: "active" }) },
        { x: 241, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 242, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 240, y: 150, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 242, y: 150, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 241, 150);
    const town = detail?.townJson ? (JSON.parse(detail.townJson as string) as Record<string, unknown>) : undefined;
    expect(town).toBeDefined();
    // TOWN_BASE_GOLD_PER_MIN(2/288) * supportRatio(1) * tierMult(1) *
    // (1+connectedBonus=1) * mintworksGoldProductionMultiplier(1, false)=1.10
    // + MINTWORKS_FLAT_GOLD_BONUS_PER_MIN(1/1440) * 1 = 0.008333.
    expect(town?.goldPerMinute).toBeCloseTo(0.008333, 5);
  });
});
