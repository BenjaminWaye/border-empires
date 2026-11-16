// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mineResourceHintFor } from "../client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { builtResourceOverlayForTile } from "../client-map-render/client-map-render-resource-overlays.js";
import { depletedReclamationWorksOverlayImage, structureOverlayImages } from "../client-map-render/client-map-overlay-images.js";
import { salvageTributeActions } from "../client-salvage-tribute/client-salvage-tribute.js";
import type { Tile } from "../client-types.js";
import { networkIconExports } from "./network-icon-svg.js";
import { createNetworkGeometry } from "./network-models.js";

const works = (resource: Tile["resource"]): Tile => ({
  x: 4, y: 7, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...(resource ? { resource } : {}),
  economicStructure: { ownerId: "me", type: "RECLAMATION_WORKS", status: "active", salvageLoadsShipped: resource ? 1 : 3 }
} as Tile);

describe("depleted Reclamation Works", () => {
  it("uses the depleted art in 2D and the depleted model in 3D once the field is gone", () => {
    expect(builtResourceOverlayForTile(works(undefined))).toBe(depletedReclamationWorksOverlayImage);
    expect(builtResourceOverlayForTile(works("PRECURSOR_SALVAGE"))).toBe(structureOverlayImages.RECLAMATION_WORKS);
    expect(mineResourceHintFor("RECLAMATION_WORKS", undefined)).toBe("DEPLETED");
    expect(mineResourceHintFor("RECLAMATION_WORKS", "PRECURSOR_SALVAGE")).toBeUndefined();
    expect(mineResourceHintFor("CULTIVATION_ESTATE", undefined)).toBeUndefined();
  });

  it("exports a distinct depleted icon from the production model", () => {
    const icons = networkIconExports();
    const live = icons.find(row => row.filename === "reclamation-works-overlay.svg")!.svg;
    const depleted = icons.find(row => row.filename === "reclamation-works-depleted-overlay.svg")!.svg;
    expect(depleted).toContain("<title>Depleted Reclamation Works</title>");
    expect(depleted).not.toBe(live);
  });

  it("is visibly darker than a working Works, with its lights out", () => {
    const brightness = (depleted: boolean): number => {
      const colors = createNetworkGeometry("PRECURSOR_SALVAGE", true, 0, depleted).layers.body!.getAttribute("color")!;
      let sum = 0;
      for (let i = 0; i < colors.count; i += 1) sum += colors.getX(i) + colors.getY(i) + colors.getZ(i);
      return sum / colors.count;
    };
    expect(brightness(true)).toBeLessThan(brightness(false) * 0.75);
    expect(createNetworkGeometry("PRECURSOR_SALVAGE", true, 0, true).layers.glow?.getAttribute("position")?.count ?? 0).toBe(0);
  });

  it("offers no shipment from a depleted Works", () => {
    expect(salvageTributeActions({ me: "me", manpower: 0, manpowerCap: 2000 }, works(undefined))).toEqual([]);
  });
});
