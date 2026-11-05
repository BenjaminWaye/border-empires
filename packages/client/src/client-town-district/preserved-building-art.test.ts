import { describe, expect, it } from "vitest";
import { districtArtUrl } from "./district-art.js";
import { isDistrictBuilding } from "./district-catalog.js";
import { districtRecord } from "./district-network.js";
import { districtFixture } from "./district-fixtures.js";
import { structureOverlayRoute } from "../client-structure-info-catalog/structure-overlay-route.js";

describe("user-preserved building artwork", () => {
  it.each(["FORT", "RELAY_BEACON", "OBSERVATORY", "UMBRITE_RIG", "DREAD_TOWER", "SIEGE_BATTERY"] as const)("keeps %s out of the district model and SVG replacements", kind => {
    expect(isDistrictBuilding(kind)).toBe(false);
    expect(districtArtUrl(kind)).toBeUndefined();
    expect(structureOverlayRoute(kind).family).not.toBe("district");
  });
  it("does not attach district connections to the preserved Aether Tower", () => {
    const { building } = districtFixture("MANUFACTORY");
    delete building.economicStructure;
    building.observatory = { ownerId: "p1", status: "active", supportAnchor: { x: 100, y: 100 } };
    expect(districtRecord(building)).toBeUndefined();
  });
});
