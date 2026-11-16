// Regression: a fortification may share a tile with any building (every
// economic structure and an Aether Tower), in either build order; only a
// siege engine excludes it. Before this, a Fort onto a support tile holding a
// Manufactory (or any economic structure other than a Relay Beacon / Harbor
// Exchange) was rejected with "tile already has structure".
import { describe, expect, test } from "vitest";

import { noConflictingStructure, type PlacementContext } from "./structure-registry.js";

const ctx = (tileField: PlacementContext["tileField"], extra: Partial<PlacementContext["tile"]>): PlacementContext => ({
  tile: { x: 1, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", ...extra },
  actor: { techIds: new Set(), playerId: "p1" },
  isUpgrade: false,
  tileField
});

describe("noConflictingStructure: fortifications share a tile with any building", () => {
  test("a fort may go on a tile with any economic structure", () => {
    expect(noConflictingStructure(ctx("fort", { economicStructure: { type: "MANUFACTORY" } }))).toBeNull();
    expect(noConflictingStructure(ctx("fort", { economicStructure: { type: "TITANIUM_REFINERY" } }))).toBeNull();
  });

  test("a fort may go on a tile with an Aether Tower", () => {
    expect(noConflictingStructure(ctx("fort", { observatory: { status: "active" } }))).toBeNull();
  });

  test("a building may go on a fortified tile", () => {
    expect(noConflictingStructure(ctx("economicStructure", { fort: { variant: "FORT" } }))).toBeNull();
    expect(noConflictingStructure(ctx("observatory", { fort: { variant: "FORT" } }))).toBeNull();
  });

  test("a siege engine and a fort still exclude each other", () => {
    expect(noConflictingStructure(ctx("fort", { siegeBattery: { variant: "SIEGE_BATTERY" } }))).toMatch(/siege battery/);
    expect(noConflictingStructure(ctx("siegeBattery", { fort: { variant: "FORT" } }))).toMatch(/fort/);
  });

  test("non-fort buildings still can't stack on each other", () => {
    expect(noConflictingStructure(ctx("observatory", { economicStructure: { type: "MANUFACTORY" } }))).toMatch(/structure/);
    expect(noConflictingStructure(ctx("economicStructure", { observatory: { status: "active" } }))).toMatch(/aether tower/);
  });
});
