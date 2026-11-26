import { describe, expect, it } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, manpowerPerBatch, nextManpowerRefillAtMs } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { optimisticTownFocus, townFocusCard, townFocusDuration } from "./client-town-focus.js";

const NOW = 1_800_000_000_000;
const townTile = (town: Partial<NonNullable<Tile["town"]>> = {}): Tile => ({
  x: 4, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", yieldRate: { goldPerMinute: 0.064 },
  town: {
    type: "MARKET", name: "Vellmar", population: 60_000, maxPopulation: 1_000_000, populationTier: "TOWN", isFed: true,
    baseGoldPerMinute: 0, goldPerMinute: 0.064, supportCurrent: 8, supportMax: 8, cap: 300, populationGrowthPerMinute: 10,
    connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false, hasIncubationEngine: false, incubationEngineActive: false,
    nextPopulationTierUpgrade: { targetTier: "CITY", requiredPopulation: 100_000, goldCost: 40, available: false },
    ...town
  } as NonNullable<Tile["town"]>
});

describe("townFocusCard", () => {
  it("projects each focus from the town's own numbers", () => {
    const card = townFocusCard(townTile(), "me", 0.5, NOW)!;
    const byFocus = Object.fromEntries(card.options.map((o) => [o.focus, o]));
    const mp = manpowerPerBatch(0.5);
    expect(byFocus.BALANCED!.manpower.value).toBe(Math.round(mp).toLocaleString("en-US"));
    expect(byFocus.LEVY!.manpower).toMatchObject({ value: Math.round(mp * 1.2).toLocaleString("en-US"), tone: "up" });
    expect(byFocus.COMMERCE!.coin.tone).toBe("up");
    expect(byFocus.GROWTH!.growth.tone).toBe("up");
    expect(byFocus.BALANCED!.state).toBe("active");
    expect(card.startsInMs).toBe(nextManpowerRefillAtMs("me", NOW) - NOW);
  });

  it("divides the active focus out of the server's figures and compares every row with Balanced", () => {
    const tile = townTile({ focus: "COMMERCE", goldPerMinute: 0.064 * 1.2 });
    tile.yieldRate = { goldPerMinute: 0.064 * 1.2 };
    const card = townFocusCard(tile, "me", 0.5, NOW)!;
    const balanced = card.options.find((o) => o.focus === "BALANCED")!;
    const commerce = card.options.find((o) => o.focus === "COMMERCE")!;
    expect(balanced.coin).toMatchObject({ value: String(Math.round(0.064 * 1440)), delta: "", tone: "same" });
    expect(commerce).toMatchObject({ state: "active", coin: { tone: "up" } });
    // Buttons state the rule as rates, so a lower refill never reads as a one-off cost.
    expect(commerce.tradeLine).toBe("Coin +20%");
    expect(commerce.costLine).toBe("MP −10% · Growth −10%");
    expect(card.options.find((o) => o.focus === "LEVY")).toMatchObject({ tradeLine: "MP +20%", costLine: "Coin −10% · Growth −10%" });
  });

  it("marks a queued focus and shows paused growth plainly", () => {
    const card = townFocusCard(townTile({ pendingFocus: "LEVY", pendingFocusAt: NOW + 60_000, populationGrowthPerMinute: 0, nearbyWarPausedUntil: NOW + 60_000 }), "me", 0.5, NOW)!;
    expect(card.queued).toBe("LEVY");
    expect(card.queuedInMs).toBe(60_000);
    expect(card.options.find((o) => o.focus === "LEVY")!.state).toBe("queued");
    expect(card.growthPaused).toBe(true);
    expect(card.options.every((o) => o.growth.value === "Paused" && o.growth.delta === "")).toBe(true);
  });

  it("formats durations so options stay distinguishable", () => {
    expect(townFocusDuration(30)).toBe("30m");
    expect(townFocusDuration(41 * 60)).toBe("41h");
    expect(townFocusDuration(108 * 60)).toBe("4.5d");
  });

  it("queues the choice for the next refill the way the server stores it", () => {
    const town = townTile().town!;
    expect(optimisticTownFocus(town, "LEVY", "me", NOW)).toMatchObject({ pendingFocus: "LEVY", pendingFocusAt: nextManpowerRefillAtMs("me", NOW) });
    expect(optimisticTownFocus(town, "BALANCED", "me", NOW)).toBe(town);
    expect(MANPOWER_REFILL_WINDOW_MS).toBeGreaterThan(0);
  });
});
