import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { DISTRICT_PROJECT_KINDS } from "../client-town-district/district-catalog.js";
import { createDistrictOverlay } from "../client-town-district/district-overlay.js";
import { createDistrictGeometry } from "../client-town-district/district-geometry.js";
import { districtFixture } from "../client-town-district/district-fixtures.js";
import { constructionSiteForTile } from "../client-construction-phase/client-construction-phase.js";

describe("monument lifecycle and reduced-quality rendering", () => {
  it.each(DISTRICT_PROJECT_KINDS)("keeps %s states isolated and clears removed instances", kind => {
    for (const quality of [0, 1]) {
      const scene = new Scene(), overlay = createDistrictOverlay(scene, 3, undefined, quality);
      const { building } = districtFixture(kind);
      const record = building.economicStructure!;
      record.status = "under_construction"; record.startedAt = 1000; record.completesAt = 11000;
      const site = constructionSiteForTile(building, 6000, "economicStructure");
      if (!site) throw new Error(`Missing construction site for ${kind}`);
      const placement = { kind, x: 0, y: 0, z: 0, foundation: true, operational: true };
      overlay.add(placement); overlay.add({ ...placement, x: 1, operational: false });
      overlay.add({ ...placement, x: 2, operational: false, site }); overlay.commit();
      const meshes = scene.children.filter((mesh): mesh is InstancedMesh => mesh instanceof InstancedMesh && Boolean(mesh.geometry.getAttribute("districtState")));
      expect(meshes.length).toBeGreaterThan(0);
      const model = createDistrictGeometry(kind);
      for (const mesh of meshes) {
        const state = mesh.geometry.getAttribute("districtState");
        expect(state.getX(0)).toBe(1); expect(state.getX(1)).toBe(0); expect(state.getX(2)).toBe(0);
        expect(state.getY(2)).toBeLessThan(model.height);
      }
      overlay.clear(); record.status = "removing";
      const removalSite = constructionSiteForTile(building, 6000, "economicStructure");
      if (!removalSite) throw new Error(`Missing removal site for ${kind}`);
      overlay.add({ ...placement, operational: false, site: removalSite });
      overlay.commit(); overlay.update(6000);
      expect(meshes.every(mesh => mesh.count === 1)).toBe(true);
      overlay.clear(); overlay.commit(); expect(meshes.every(mesh => mesh.count === 0)).toBe(true);
      for (const geometry of Object.values(model.layers)) geometry.dispose();
      overlay.dispose(); expect(scene.children).toHaveLength(0);
    }
  });
});
