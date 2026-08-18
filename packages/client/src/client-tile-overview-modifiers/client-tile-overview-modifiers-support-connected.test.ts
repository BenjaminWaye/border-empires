import { describe, expect, it } from "vitest";

import { tileOverviewModifiersForTile } from "./client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

// Support/Connected-town gold-production modifier tests, kept in a
// dedicated file rather than added to client-tile-overview-modifiers.test.ts,
// which is already close to the repo's 500-line soft cap.
describe("tileOverviewModifiersForTile — Support/Connected-town gold modifiers", () => {
  // Regression test: connectedTownCount > 0 with connectedTownBonus === 0
  // means a real connected-town network exists but no member town has a
  // built Caravanary yet (networkHasCaravanary gate in
  // apps/simulation/src/economy-network/economy-network.ts) — the panel
  // used to say nothing at all in this case, silently withholding the
  // reason the bonus reads +0%.
  it("shows a neutral 0% line explaining a connected network with no Trade Nexus yet", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 8,
        supportMax: 8,
        goldPerMinute: 12,
        cap: 300,
        isFed: true,
        population: 18_400,
        maxPopulation: 100_000,
        populationTier: "TOWN",
        connectedTownCount: 2,
        connectedTownBonus: 0,
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false
      }
    } satisfies Tile);
    expect(modifiers).toContainEqual({
      reason: "2 connected towns",
      effect: "+0% gold production — build a Trade Nexus to enable",
      tone: "neutral"
    });
  });

  // Regression test: supportRatio (supportCurrent / supportMax) directly
  // multiplies town gold production (apps/simulation/src/
  // live-town-summary.ts) but partial support used to be shown as a bare
  // "Support 7/8" fact with no indication it was costing anything.
  it("shows partial Support's real gold-production cost as a modifier", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 7,
        supportMax: 8,
        goldPerMinute: 12,
        cap: 300,
        isFed: true,
        population: 18_400,
        maxPopulation: 100_000,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false
      }
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Support 7/8", effect: "-12% gold production", tone: "negative" });
  });

  it("does not show a Support modifier when support is full", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 8,
        supportMax: 8,
        goldPerMinute: 12,
        cap: 300,
        isFed: true,
        population: 18_400,
        maxPopulation: 100_000,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false
      }
    } satisfies Tile);
    expect(modifiers.some((m) => m.reason.startsWith("Support "))).toBe(false);
  });
});
