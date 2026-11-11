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
  const palisadeTile: Tile = { ...emptyTile, fort: { ownerId: "me", status: "active", variant: "PALISADE" } };

  it("shows 'Fortify this tile' for a tile with no fort (no regression to upgrade text)", () => {
    const detail = buildDetailTextForAction("build_fortification", emptyTile);
    expect(detail).toContain("Fortify this tile");
    expect(detail).not.toContain("Upgrade");
  });

  it("names the standing tier, never a fixed upgrade target (the picker chooses)", () => {
    expect(buildDetailTextForAction("build_fortification", palisadeTile)).toContain("Upgrade this Palisade to a stronger tier");
    expect(buildDetailTextForAction("build_fortification", fortTile)).toContain("Upgrade this Fort to a stronger tier");
    expect(buildDetailTextForAction("build_fortification", ironTile)).toContain("Upgrade this Titanium Bastion to a stronger tier");
    expect(buildDetailTextForAction("build_fortification", thunderTile)).toContain("Upgrade this Thunder Bastion");
  });
});

// Regression test: buildDetailTextForAction had no branch at all for
// build_hydroworks / build_census_hall / build_clearing_house, so it fell
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
      hasManufactory: false,
      manufactoryActive: false,
      hasIncubationEngine: false,
      incubationEngineActive: false
    }
  };

  it("returns real detail text for build_hydroworks", () => {
    const detail = buildDetailTextForAction("build_hydroworks", supportTile, supportedTown);
    expect(detail).not.toContain("undefined");
    expect(detail).toContain("Hydrogarden");
  });

  it("returns real detail text for build_census_hall", () => {
    const detail = buildDetailTextForAction("build_census_hall", supportTile, supportedTown);
    expect(detail).not.toContain("undefined");
    expect(detail).toContain("Testford");
  });

  it("returns real detail text for build_clearing_house", () => {
    const detail = buildDetailTextForAction("build_clearing_house", supportTile, supportedTown);
    expect(detail).not.toContain("undefined");
    expect(detail).toContain("Manufactory");
  });
});
