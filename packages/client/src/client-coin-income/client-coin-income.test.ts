import { describe, expect, it } from "vitest";
import { EMPIRE_INTEGRITY_INCOME_LABEL } from "@border-empires/shared";
import { emptyEconomyBreakdown } from "../client-economy-model.js";
import type { Tile } from "../client-types.js";
import { deriveTownListRows } from "../client-town-list/client-town-list.js";
import { tileFactsFor } from "../client-hud-v2/client-hud-v2-tile-facts.js";
import { empireCoinIncome, tileCoinPerMinute } from "./client-coin-income.js";

const town = (goldPerMinute: number | undefined, yieldGold?: number): Tile => ({
  x: 3,
  y: 4,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  town: { name: "Green", populationTier: "TOWN", population: 1000, maxPopulation: 5000, isFed: goldPerMinute !== 0, ...(goldPerMinute !== undefined ? { goldPerMinute } : {}) },
  ...(yieldGold !== undefined ? { yieldRate: { goldPerMinute: yieldGold } } : {})
}) as Tile;

const coinFact = (tile: Tile): string | undefined =>
  tileFactsFor(tile, { combatBreakdown: undefined, overviewLines: [] } as never, "me").find((f) => f.label === "Coin")?.value;

describe("tileCoinPerMinute: one per-tile coin figure for every surface", () => {
  it("prefers the town summary over a cached yieldRate", () => {
    expect(tileCoinPerMinute(town(21 / 1440, 0))).toBeCloseTo(21 / 1440, 6);
  });

  // Playtest: town "0.0" on one screen, "+21" on another, "–" on a third.
  it("reads a known 0 (unfed town) as 0, not a stale cached rate", () => {
    expect(tileCoinPerMinute(town(0, 12 / 1440))).toBe(0);
  });

  it("keeps the last known rate while the town summary has no coin field yet", () => {
    expect(tileCoinPerMinute(town(undefined, 12 / 1440))).toBeCloseTo(12 / 1440, 6);
  });

  it("gives the Towns list and the tile facts the same number", () => {
    const tile = town(21 / 1440, 0);
    const [row] = deriveTownListRows([tile], "me", new Map([["3,4", tile]]));
    expect(row?.goldPerMinute).toBe(tileCoinPerMinute(tile));
    expect(coinFact(tile)).toBe("21.0/day");
  });
});

describe("empireCoinIncome", () => {
  it("is the HUD bar's net and the Integrity panel's coin effect from the same rows", () => {
    const economyBreakdown = emptyEconomyBreakdown();
    economyBreakdown.GOLD.sources = [
      { label: "Towns", amountPerMinute: 0.02, count: 1 },
      { label: EMPIRE_INTEGRITY_INCOME_LABEL, amountPerMinute: 0.0024, count: 1 }
    ];
    economyBreakdown.GOLD.sinks = [{ label: "Clearing House", amountPerMinute: 0.004, count: 1 }];
    const view = empireCoinIncome({ incomePerMinute: 0.0224, upkeepPerMinute: { gold: 0.004 }, economyBreakdown });
    expect(view.netPerMinute).toBeCloseTo(0.0184, 9);
    expect(view.integrityPerMinute).toBeCloseTo(0.0024, 9);
  });
});
