import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { structureRequiresTownOrSupportTile, type StructurePlacementType } from "@border-empires/shared";
import metadata from "../../../shared/src/structure-placement-metadata.json" with { type: "json" };
import { DISTRICT_BUILDING_KINDS, DISTRICT_PROJECT_KINDS, isDistrictBuilding } from "./district-catalog.js";
import { createDistrictGeometry } from "./district-geometry.js";
import { districtIconSvg } from "./district-icon-svg.js";

describe("complete district model coverage", () => {
  it("covers every town-restricted type, including stacking and saved retired buildings", () => {
    for (const kind of Object.keys(metadata)) {
      if (structureRequiresTownOrSupportTile(kind as StructurePlacementType)) expect(isDistrictBuilding(kind), kind).toBe(true);
    }
    expect(DISTRICT_BUILDING_KINDS).toHaveLength(45);
    // General utilities do not require a town, but still need a deliberate
    // visual classification. New support-compatible metadata cannot silently
    // bypass either the remodeled kit or an explicitly preserved model.
    const preserved: ReadonlySet<string> = new Set([...DISTRICT_PROJECT_KINDS,
      "FORT", "TITANIUM_BASTION", "THUNDER_BASTION", "PALISADE", "SIEGE_BATTERY", "SIEGE_TOWER", "DREAD_TOWER"]);
    for (const [kind, placement] of Object.entries(metadata)) {
      if (placement.showOn.some(surface => surface === "support")) expect(isDistrictBuilding(kind) || preserved.has(kind), kind).toBe(true);
    }
  });
  it.each(DISTRICT_BUILDING_KINDS)("keeps %s inside its tile and exports matching 2D art", kind => {
    const geometry = createDistrictGeometry(kind);
    expect(geometry.height).toBeGreaterThan(0.1);
    expect(geometry.height).toBeLessThanOrEqual(0.6);
    expect(Object.keys(geometry.layers).length).toBeLessThanOrEqual(6);
    let triangles = 0;
    for (const [layer, mesh] of Object.entries(geometry.layers)) {
      triangles += (mesh.index?.count ?? mesh.getAttribute("position").count) / 3;
      if (layer !== "halo" && layer !== "steam") {
        const bounds = mesh.boundingBox;
        expect(Math.max(Math.abs(bounds?.min.x ?? 0), Math.abs(bounds?.max.x ?? 0)), `${kind}:${layer}:x`).toBeLessThanOrEqual(0.4);
        expect(Math.max(Math.abs(bounds?.min.z ?? 0), Math.abs(bounds?.max.z ?? 0)), `${kind}:${layer}:z`).toBeLessThanOrEqual(0.4);
      }
      mesh.dispose();
    }
    expect(triangles, `${kind}:triangle budget`).toBeLessThanOrEqual(3000);
    const svg = districtIconSvg(kind);
    const filename = `${kind.toLowerCase().replaceAll("_", "-")}.svg`;
    expect(readFileSync(new URL(`../../public/overlays/town-district/${filename}`, import.meta.url), "utf8")).toBe(svg);
    expect(svg.length).toBeLessThan(250_000);
  });
});
