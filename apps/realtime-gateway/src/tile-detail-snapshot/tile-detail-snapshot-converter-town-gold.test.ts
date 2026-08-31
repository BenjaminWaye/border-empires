import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

// Regression: fallbackTownGoldPerMinute (tile-detail-snapshot.ts's own
// recompute, used whenever the snapshot's townJson lacks goldPerMinute --
// which it always does, since toSharedVisibilityTownSummary strips
// goldPerMinute before persisting) never accounted for an EXCHANGE-mode
// converter (Aether Condenser/Titanium Works/Umbrite Works) in the town's
// support ring, even after that attribution shipped in
// player-update-economy.ts/live-town-summary.ts. The tile popup's
// "MODIFIERS" section (townModifierTotals, computed independently in this
// same file) showed the correct "Sell Off gold" line, but the "GOLD
// PRODUCTION" stat card above it -- fed by this goldPerMinute -- silently
// omitted the converter's contribution, so the two numbers on the same
// screen disagreed.
describe("buildSnapshotTileDetail — converter town-support gold attribution", () => {
  const baseTiles = (): PlayerSubscriptionSnapshot["tiles"] => [
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
        isFed: true,
        population: 20671,
        maxPopulation: 10_000_000,
        connectedTownCount: 0,
        connectedTownBonus: 0
      }),
      townType: "MARKET",
      townPopulationTier: "TOWN"
    },
    { x: 241, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
    { x: 242, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
    { x: 240, y: 150, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
    { x: 242, y: 150, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
  ];

  it("adds an EXCHANGE-mode Aether Condenser's gold to the backfilled goldPerMinute", () => {
    const withoutConverter: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        { x: 240, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        ...baseTiles()
      ]
    };
    const withConverter: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 240, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          economicStructureJson: JSON.stringify({ type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" })
        },
        ...baseTiles()
      ]
    };

    const goldPerMinuteWithout = (
      JSON.parse(buildSnapshotTileDetail(withoutConverter, "player-1", 241, 150)?.townJson as string) as Record<string, unknown>
    ).goldPerMinute as number;
    const goldPerMinuteWith = (
      JSON.parse(buildSnapshotTileDetail(withConverter, "player-1", 241, 150)?.townJson as string) as Record<string, unknown>
    ).goldPerMinute as number;

    expect(goldPerMinuteWith).toBeCloseTo(goldPerMinuteWithout + 10 / 1440, 5);
  });

  it("does not attribute a REFINE-mode (default) converter's gold to the town", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 240, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          economicStructureJson: JSON.stringify({ type: "CRYSTAL_SYNTHESIZER", status: "active" })
        },
        ...baseTiles()
      ]
    };
    const detail = buildSnapshotTileDetail(snapshot, "player-1", 241, 150);
    const town = JSON.parse(detail?.townJson as string) as Record<string, unknown>;
    expect(town.townModifierTotals ?? []).toEqual([]);
  });

  it("surfaces a 'Sell Off gold' modifier under a '1 Aether Condenser' heading, matching the goldPerMinute bump", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 240, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          economicStructureJson: JSON.stringify({ type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" })
        },
        ...baseTiles()
      ]
    };
    const detail = buildSnapshotTileDetail(snapshot, "player-1", 241, 150);
    const town = JSON.parse(detail?.townJson as string) as Record<string, unknown>;
    expect(town.townModifierTotals).toContainEqual({
      heading: "1 Aether Condenser",
      modifiers: [{ statLabel: "Sell Off gold", valueText: "+10", tone: "positive" }]
    });
  });
});
