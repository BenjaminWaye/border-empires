import { describe, expect, it } from "vitest";

import { tileOverviewModifiersForTile } from "./client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

// Per-structure modifier lines, split out of client-tile-overview-modifiers.test.ts to keep it under 500 lines.
describe("tileOverviewModifiersForTile structures", () => {
  // Regression test: economicStructureModifiersForTile used to gate behind a
  // small hardcoded allowlist (HYDROGARDEN/HYDROWORKS/UMBRITE_RIG/PALISADE/
  // RELAY_BEACON/TRADE_NEXUS/HARBOR_EXCHANGE/NEURAL_WORKS) left over from before
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

  it("shows the reach and vision modifiers for a Relay Beacon (it no longer grants an offense bonus)", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
    } satisfies Tile);
    // Two modifiers, so each carries the structure-name prefix. Reach is listed: playtesters
    // read only "Local vision +5" and couldn't tell a beacon extends reach (2026-11-14).
    expect(modifiers).toContainEqual({ reason: "Relay Beacon — Reach", effect: "5 tiles", tone: "positive" });
    expect(modifiers).toContainEqual({ reason: "Relay Beacon — Local vision", effect: "+5", tone: "positive" });
    expect(modifiers.some((m) => m.reason === "Relay Beacon — Offense")).toBe(false);
  });

  // Regression: economicStructureModifiersForTile called structureModifiersFor
  // with no ctx at all, so an Aether Condenser (AETHER_CONDENSER) in
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
      economicStructure: { ownerId: "me", type: "AETHER_CONDENSER", status: "active", converterMode: "EXCHANGE" }
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
      economicStructure: { ownerId: "me", type: "AETHER_CONDENSER", status: "active", converterMode: "SYNTHESIZE" }
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
    expect(modifiers).toContainEqual({ reason: "Aether Tower — Local vision", effect: "+10", tone: "positive" });
    expect(modifiers.some((m) => m.reason === "Aether Tower — Crystal range")).toBe(true);
  });

  // Regression test: a Hydrogarden's own tile overview used to always show a
  // static "Farm food: +50%" line that never reflected the tile's real
  // boosted output (e.g. when a Hydroworks doubles it) — noise, not a real
  // modifier. Only the FOOD-slot line, which is genuinely additive, remains.
  it("does not show the static Farm food percent line for a Hydrogarden tile, but keeps the FOOD slot line", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      resource: "FARM",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "HYDROGARDEN", status: "active" }
    } satisfies Tile);
    expect(modifiers.some((m) => m.reason.includes("Farm food"))).toBe(false);
    expect(modifiers.some((m) => m.reason.includes("FOOD slot"))).toBe(true);
  });

  it("does not show the static Hydrogarden-food-radius percent line for a Hydroworks tile, but keeps the FOOD slot line", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      resource: "FARM",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "HYDROWORKS", status: "active" }
    } satisfies Tile);
    expect(modifiers.some((m) => m.reason.includes("Hydrogarden food"))).toBe(false);
    expect(modifiers.some((m) => m.reason.includes("FOOD slots per boosted Hydrogarden"))).toBe(true);
  });

  it("spells out both ends of the Clearing House's Manufactory gold-bonus boost instead of an ambiguous +25%", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "CLEARING_HOUSE", status: "active" }
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Manufactory coin bonus per copy", effect: "+10% → +35%", tone: "positive" });
  });
});
