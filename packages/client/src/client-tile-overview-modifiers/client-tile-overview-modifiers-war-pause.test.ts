import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tileOverviewModifiersForTile } from "./client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

// Kept out of client-tile-overview-modifiers.test.ts, which is at the
// repo's 500-line cap.
const NOW = 1_800_000_000_000;

const warPausedTownTile = (growthModifiers?: NonNullable<Tile["town"]>["growthModifiers"]): Tile => ({
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
    populationGrowthPerMinute: 0,
    populationTier: "TOWN",
    connectedTownCount: 0,
    connectedTownBonus: 0,
    hasMintworks: false,
    mintworksActive: false,
    hasIncubationEngine: false,
    incubationEngineActive: false,
    nearbyWarPausedUntil: NOW + 45 * 60_000,
    ...(growthModifiers ? { growthModifiers } : {})
  }
});

describe("tileOverviewModifiersForTile — nearby-war pause timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Regression: the growth tick's per-minute delta carries the war-pause
  // timer but no growthModifiers, so the "Nearby war" row vanished and the
  // player saw growth paused with no reason.
  it("shows the Nearby war row from the pause timer alone, with time remaining", () => {
    const rows = tileOverviewModifiersForTile(warPausedTownTile()).filter((row) => row.reason === "Nearby war");
    expect(rows).toEqual([{ reason: "Nearby war", effect: "population growth paused, resumes in ~45m", tone: "negative" }]);
  });

  it("does not duplicate the row when the full summary's Nearby war modifier is also present", () => {
    const rows = tileOverviewModifiersForTile(warPausedTownTile([{ label: "Nearby war", deltaPerMinute: -12 }])).filter(
      (row) => row.reason === "Nearby war"
    );
    expect(rows).toHaveLength(1);
  });
});
