import { describe, expect, it, vi } from "vitest";
import { setWorldSeed } from "@border-empires/shared";

import { tileOverviewModifiersForTile } from "./client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

// A real hills tile (isHillsTileAt true) under seed 1 — same known-good
// coordinate used by apps/simulation/src/vision-footprint-table.test.ts,
// which mirrors this same hills-vision mechanic server-side.
const KNOWN_HILLS_TILE = { x: 99, y: 57 };

describe("tileOverviewModifiersForTile", () => {
  it("shows nearby war as a negative town growth modifier", () => {
    expect(
      tileOverviewModifiersForTile({
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
          populationGrowthPerMinute: 12,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMintworks: false,
          mintworksActive: false,
          hasGranary: false,
          granaryActive: false,
          growthModifiers: [{ label: "Nearby war", deltaPerMinute: -12 }]
        }
      } satisfies Tile)
    ).toContainEqual({ reason: "Nearby war", effect: "-100% population growth", tone: "negative" });
  });

  // Regression test: this used to recompute a Mintworks "Gold production"
  // line here from tile.town.mintworksCount, which duplicated the identical
  // stat already shown from tile.town.townModifierTotals (the single source
  // of truth for town-wide aggregates — see menuOverviewForTile in
  // client-tile-menu-view.ts) whenever a town's own tile was clicked. Any
  // active Mintworks must produce exactly one "Gold production" line, and it
  // must come from townModifierTotals, not from here.
  it("does not derive a Mintworks Gold production line from mintworksCount (would duplicate townModifierTotals)", () => {
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
        populationGrowthPerMinute: 12,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMintworks: true,
        mintworksActive: true,
        mintworksCount: 5,
        hasGranary: false,
        granaryActive: false
      }
    } satisfies Tile);
    expect(modifiers.some((m) => m.reason === "Gold production" || m.reason.includes("Gold production"))).toBe(false);
  });

  it("hides fort defense while a captured fort is in recovery", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));

    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER",
      fort: {
        ownerId: "me",
        status: "active",
        disabledUntil: Date.now() + 60_000
      }
    } satisfies Tile);

    expect(modifiers.some((modifier) => modifier.reason === "Defense")).toBe(false);
    vi.useRealTimers();
  });

  it("shows the active fort defense modifier from the real fort multiplier", () => {
    expect(
      tileOverviewModifiersForTile({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "FRONTIER",
        fort: {
          ownerId: "me",
          status: "active",
          variant: "FORT"
        }
      } satisfies Tile)
    ).toContainEqual({ reason: "Defense", effect: "2.5x", tone: "positive" });
  });

  it("labels upgraded fort defense modifiers by variant", () => {
    expect(
      tileOverviewModifiersForTile({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "FRONTIER",
        fort: {
          ownerId: "me",
          status: "active",
          variant: "TITANIUM_BASTION"
        }
      } satisfies Tile)
    ).toContainEqual({ reason: "Defense", effect: "4x", tone: "positive" });

    expect(
      tileOverviewModifiersForTile({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "FRONTIER",
        fort: {
          ownerId: "me",
          status: "active",
          variant: "THUNDER_BASTION"
        }
      } satisfies Tile)
    ).toContainEqual({ reason: "Defense", effect: "8x", tone: "positive" });
  });

  it("shows recently captured frontier towns as paused until settled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));

    expect(
      tileOverviewModifiersForTile({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "ai-1",
        ownershipState: "FRONTIER",
        town: {
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 0,
          supportMax: 0,
          goldPerMinute: 0,
          cap: 0,
          isFed: false,
          population: 12_000,
          maxPopulation: 100_000,
          populationGrowthPerMinute: 0,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMintworks: false,
          mintworksActive: false,
          hasGranary: false,
          granaryActive: false,
          captureShockUntil: Date.now() + 60_000
        }
      } satisfies Tile)
    ).toContainEqual({
      reason: "Recently captured",
      effect: "town manpower and production paused until settled",
      tone: "negative"
    });

    vi.useRealTimers();
  });

  it("shows recently captured settled towns even when growth is already zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));

    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 5,
        supportMax: 5,
        goldPerMinute: 12,
        cap: 300,
        isFed: true,
        population: 100_000,
        maxPopulation: 100_000,
        populationGrowthPerMinute: 0,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
        captureShockUntil: Date.now() + 60_000,
        growthModifiers: [
          { label: "Recently captured", deltaPerMinute: 0 },
          { label: "Long time peace", deltaPerMinute: 12 }
        ]
      }
    } satisfies Tile);

    expect(modifiers).toContainEqual({
      reason: "Recently captured",
      effect: "population growth paused",
      tone: "negative"
    });
    expect(modifiers.filter((modifier) => modifier.reason === "Recently captured")).toHaveLength(1);

    vi.useRealTimers();
  });

  it("does not show long-term peace while capture shock is active", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));

    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 5,
        supportMax: 5,
        goldPerMinute: 12,
        cap: 300,
        isFed: true,
        population: 25_000,
        maxPopulation: 100_000,
        populationGrowthPerMinute: 0,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
        captureShockUntil: Date.now() + 60_000,
        growthModifiers: [{ label: "Long time peace", deltaPerMinute: 12 }]
      }
    } satisfies Tile);

    expect(modifiers).toContainEqual({
      reason: "Recently captured",
      effect: "population growth paused",
      tone: "negative"
    });
    expect(modifiers.some((modifier) => modifier.reason === "Long-term peace")).toBe(false);

    vi.useRealTimers();
  });

  it("does not show nearby war while capture shock is active", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));

    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 5,
        supportMax: 5,
        goldPerMinute: 12,
        cap: 300,
        isFed: true,
        population: 25_000,
        maxPopulation: 100_000,
        populationGrowthPerMinute: 0,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
        captureShockUntil: Date.now() + 60_000,
        growthModifiers: [{ label: "Nearby war", deltaPerMinute: -12 }]
      }
    } satisfies Tile);

    expect(modifiers).toContainEqual({
      reason: "Recently captured",
      effect: "population growth paused",
      tone: "negative"
    });
    expect(modifiers.some((modifier) => modifier.reason === "Nearby war")).toBe(false);

    vi.useRealTimers();
  });

  // Regression test: economicStructureModifiersForTile used to gate behind a
  // small hardcoded allowlist (FARMSTEAD/WATERWORKS/UMBRITE_RIG/WOODEN_FORT/
  // RELAY_BEACON/CARAVANARY/CUSTOMS_HOUSE/RAIL_DEPOT) left over from before
  // the shared catalog existed, so most buildings — including every one of
  // the Weapons Workshop family — showed no Modifier section at all when
  // their own tile was clicked directly in-game, even though the catalog
  // had entries for them (reachable only from the tech-tree/build-menu
  // panel, not the tile popup). Covers a representative building outside
  // the old allowlist.
  it("shows modifiers for a Titanium Weapons Factory tile (previously outside the tile-overview allowlist)", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "TITANIUM_WEAPONS_FACTORY", status: "active" }
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Titanium Weapons Factory — Empire attack", effect: "+2% per copy", tone: "positive" });
    expect(modifiers).toContainEqual({ reason: "Titanium Weapons Factory — Empire defense", effect: "+3% per copy", tone: "positive" });
  });

  it("shows both the offense and vision modifier for a Relay Beacon (vision was previously missing from the catalog)", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Relay Beacon — Offense", effect: "+25%", tone: "positive" });
    expect(modifiers).toContainEqual({ reason: "Relay Beacon — Local vision", effect: "+5", tone: "positive" });
  });

  // Regression: economicStructureModifiersForTile called structureModifiersFor
  // with no ctx at all, so an Aether Condenser (CRYSTAL_SYNTHESIZER) in
  // EXCHANGE (Sell Off) mode still showed "Refine mode supplies: +1 CRYSTAL
  // slot" -- contradicting the structure's own status line, which correctly
  // said it was selling off its slot for gold instead.
  it("omits the Refine-mode slot modifier for an Aether Condenser in EXCHANGE (Sell Off) mode", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" }
    } satisfies Tile);
    expect(modifiers.find((m) => m.reason === "Refine mode supplies")).toBeUndefined();
  });

  it("shows the Refine-mode slot modifier for an Aether Condenser in SYNTHESIZE (Refine) mode", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "SYNTHESIZE" }
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Refine mode supplies", effect: "+1 CRYSTAL slot", tone: "positive" });
  });

  // Regression test: Observatory tiles were never checked at all by
  // tileOverviewModifiersForTile (no tile.observatory handling existed),
  // so an Observatory's vision/crystal-range modifiers never showed
  // anywhere in-game despite having catalog entries.
  it("shows vision and crystal range modifiers for an active Observatory tile", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "active" }
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Observatory — Local vision", effect: "+5", tone: "positive" });
    expect(modifiers.some((m) => m.reason === "Observatory — Crystal range")).toBe(true);
  });

  // Regression test: a Farmstead's own tile overview used to always show a
  // static "Farm food: +50%" line that never reflected the tile's real
  // boosted output (e.g. when a Waterworks doubles it) — noise, not a real
  // modifier. Only the FOOD-slot line, which is genuinely additive, remains.
  it("does not show the static Farm food percent line for a Farmstead tile, but keeps the FOOD slot line", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      resource: "FARM",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "FARMSTEAD", status: "active" }
    } satisfies Tile);
    expect(modifiers.some((m) => m.reason.includes("Farm food"))).toBe(false);
    expect(modifiers.some((m) => m.reason.includes("FOOD slot"))).toBe(true);
  });

  it("does not show the static Farmstead-food-radius percent line for a Waterworks tile, but keeps the FOOD slot line", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      resource: "FARM",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "WATERWORKS", status: "active" }
    } satisfies Tile);
    expect(modifiers.some((m) => m.reason.includes("Farmstead food"))).toBe(false);
    expect(modifiers.some((m) => m.reason.includes("FOOD slots per boosted Farmstead"))).toBe(true);
  });

  it("spells out both ends of the Clearing House's Mintworks gold-bonus boost instead of an ambiguous +25%", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "CLEARING_HOUSE", status: "active" }
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Mintworks gold bonus per copy", effect: "+10% → +35%", tone: "positive" });
  });

  it("shows a plain 'Vision' modifier for a real hills tile with no other modifier to disambiguate from", () => {
    setWorldSeed(1);
    const modifiers = tileOverviewModifiersForTile({
      x: KNOWN_HILLS_TILE.x,
      y: KNOWN_HILLS_TILE.y,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER"
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Vision", effect: "+1", tone: "positive" });
    expect(modifiers.some((m) => m.reason === "Hills")).toBe(false);
  });

  // Regression: a bare hills tile shows an unlabeled "Vision: +1" line
  // (nothing else to disambiguate from), but once the tile already has
  // another modifier — e.g. a Relay Beacon's own vision line — the hills
  // contribution is named "Hills:" so the two vision lines aren't confused
  // for each other.
  it("names 'Hills' as the source when the tile already has another modifier", () => {
    setWorldSeed(1);
    const modifiers = tileOverviewModifiersForTile({
      x: KNOWN_HILLS_TILE.x,
      y: KNOWN_HILLS_TILE.y,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Relay Beacon — Local vision", effect: "+5", tone: "positive" });
    expect(modifiers).toContainEqual({ reason: "Hills", effect: "vision +1", tone: "positive" });
    expect(modifiers.some((m) => m.reason === "Vision")).toBe(false);
  });

  it("does not show a Hills modifier for a non-hills land tile", () => {
    setWorldSeed(1);
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER"
    } satisfies Tile);
    expect(modifiers.some((m) => m.reason === "Hills")).toBe(false);
    expect(modifiers.some((m) => m.reason === "Vision")).toBe(false);
  });
});
