// Split out of client-tile-menu-view.test.ts (already over the repo's
// 500-line file-growth cap) so this file can grow independently.
import { describe, expect, it } from "vitest";

import { buildDetailTextForAction } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

describe("buildDetailTextForAction fort tier text", () => {
  const emptyTile: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };
  const fortTile: Tile = { ...emptyTile, fort: { ownerId: "me", status: "active" } };
  const ironTile: Tile = { ...emptyTile, fort: { ownerId: "me", status: "active", variant: "TITANIUM_BASTION" } };
  const thunderTile: Tile = { ...emptyTile, fort: { ownerId: "me", status: "active", variant: "THUNDER_BASTION" } };
  const woodenFortTile: Tile = { ...emptyTile, economicStructure: { ownerId: "me", type: "WOODEN_FORT", status: "active" } };

  it("shows 'Fortify this tile' for a tile with no fort (no regression to upgrade text)", () => {
    const detail = buildDetailTextForAction("build_fortification", emptyTile);
    expect(detail).toContain("Fortify this tile");
    expect(detail).not.toContain("Upgrade");
  });

  it("shows 'Upgrade this Palisade' for a wooden-fort tile", () => {
    const detail = buildDetailTextForAction("build_fortification", woodenFortTile);
    expect(detail).toContain("Upgrade this Palisade");
  });

  it("shows Titanium Bastion upgrade text for an active fort with undefined variant", () => {
    const detail = buildDetailTextForAction("build_fortification", fortTile);
    expect(detail).toContain("Upgrade this Fort into an Titanium Bastion");
    expect(detail).toContain("4x");
  });

  it("shows Thunder Bastion upgrade text for an Titanium Bastion", () => {
    const detail = buildDetailTextForAction("build_fortification", ironTile);
    expect(detail).toContain("Upgrade this Titanium Bastion into a Thunder Bastion");
    expect(detail).toContain("8x");
  });

  it("falls through (no upgrade text) for a Thunder Bastion", () => {
    const detail = buildDetailTextForAction("build_fortification", thunderTile);
    // Should not show upgrade text for a max-tier fort
    expect(detail).toBeDefined();
    expect(detail).not.toContain("Upgrade");
    expect(detail).not.toContain("Bastion");
  });
});

// Regression test: buildDetailTextForAction had no branch at all for
// build_waterworks / build_census_hall / build_clearing_house, so it fell
// through to `return undefined`. The build-menu action list then does
// `deps.buildDetailTextForAction(...) + frontierBuildDetailSuffix(tile)`
// (client-tile-action-logic.ts), and `undefined + string` coerces to the
// literal string "undefined" — shipping that text straight into the build
// menu.
describe("buildDetailTextForAction never returns undefined for a real build action", () => {
  const supportTile: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };
  const supportedTown: Tile = {
    x: 11,
    y: 10,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    town: {
      name: "Testford",
      type: "MARKET",
      baseGoldPerMinute: 2,
      supportCurrent: 5,
      supportMax: 5,
      goldPerMinute: 7,
      cap: 100,
      isFed: true,
      population: 10_000,
      maxPopulation: 25_000,
      populationTier: "TOWN",
      connectedTownCount: 0,
      connectedTownBonus: 0,
      hasMintworks: false,
      mintworksActive: false,
      hasGranary: false,
      granaryActive: false
    }
  };

  it("returns real detail text for build_waterworks", () => {
    const detail = buildDetailTextForAction("build_waterworks", supportTile, supportedTown);
    expect(detail).not.toContain("undefined");
    expect(detail).toContain("Farmstead");
  });

  it("returns real detail text for build_census_hall", () => {
    const detail = buildDetailTextForAction("build_census_hall", supportTile, supportedTown);
    expect(detail).not.toContain("undefined");
    expect(detail).toContain("Testford");
  });

  it("returns real detail text for build_clearing_house", () => {
    const detail = buildDetailTextForAction("build_clearing_house", supportTile, supportedTown);
    expect(detail).not.toContain("undefined");
    expect(detail).toContain("Mintworks");
  });
});
