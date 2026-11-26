import { describe, expect, it } from "vitest";
import { TOWN_FOCUS_MULTIPLIERS, manpowerPerBatch, nextManpowerRefillAtMs } from "@border-empires/shared";
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
    expect(card.nextRefillInMs).toBe(nextManpowerRefillAtMs("me", NOW) - NOW);
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

  it("shows a picked focus as active before the server applies it, and paused growth plainly", () => {
    const card = townFocusCard(townTile({ pendingFocus: "LEVY", pendingFocusAt: NOW, populationGrowthPerMinute: 0, nearbyWarPausedUntil: NOW + 60_000 }), "me", 0.5, NOW)!;
    expect(card.active).toBe("LEVY");
    expect(card.options.find((o) => o.focus === "LEVY")!.state).toBe("active");
    expect(card.options.find((o) => o.focus === "BALANCED")!.state).toBe("idle");
    expect(card.growthPaused).toBe(true);
    expect(card.options.every((o) => o.growth.value === "Paused" && o.growth.delta === "")).toBe(true);
  });

  it("formats durations so options stay distinguishable", () => {
    expect(townFocusDuration(30)).toBe("30m");
    expect(townFocusDuration(41 * 60)).toBe("41h");
    expect(townFocusDuration(108 * 60)).toBe("4.5d");
  });

  it("stores the choice as due now, the way the server stores it", () => {
    const town = townTile().town!;
    expect(optimisticTownFocus(town, "LEVY", NOW)).toMatchObject({ pendingFocus: "LEVY", pendingFocusAt: NOW });
    expect(optimisticTownFocus(town, "BALANCED", NOW)).toBe(town);
  });

  // The server's Coin figure trails a pick until its next growth tick: the base must come out at the applied focus.
  it("keeps Balanced's Coin right while a pick waits for the server", () => {
    const tile = townTile({ focus: "COMMERCE", pendingFocus: "LEVY", pendingFocusAt: NOW, goldPerMinute: 0.064 * 1.2 });
    tile.yieldRate = { goldPerMinute: 0.064 * 1.2 };
    const card = townFocusCard(tile, "me", 0.5, NOW)!;
    expect(card.options.find((o) => o.focus === "BALANCED")!.coin.value).toBe(String(Math.round(0.064 * 1440)));
  });
});

describe("town focus rule text", () => {
  it("is derived from the multipliers, so a retune changes the text too", () => {
    const card = townFocusCard(townTile(), "me", 0.5, NOW)!;
    const levy = card.options.find((o) => o.focus === "LEVY")!;
    const pct = (m: number) => `${m >= 1 ? "+" : "−"}${Math.round(Math.abs(m - 1) * 100)}%`;
    expect(levy.tradeLine).toBe(`MP ${pct(TOWN_FOCUS_MULTIPLIERS.LEVY.manpowerRegen)}`);
    expect(levy.costShort).toBe(`Others ${pct(TOWN_FOCUS_MULTIPLIERS.LEVY.coin)}`);
  });

  it("says Coin is unknown rather than 0 before the town's figure arrives", () => {
    const tile = townTile();
    delete (tile.town as { goldPerMinute?: number }).goldPerMinute;
    const card = townFocusCard(tile, "me", 0.5, NOW)!;
    expect(card.options.every((o) => o.coin.value === "…")).toBe(true);
  });
});
