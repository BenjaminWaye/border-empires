import { readFileSync } from "node:fs";
import { structureReviewSvg } from "./structure-review-svg.js";
import { describe, expect, it } from "vitest";
import { STRUCTURE_REGISTRY, type StructureDisplayKey } from "@border-empires/shared";
import { InstancedMesh, MeshStandardMaterial, Scene, Vector3 } from "three";
import { createStructureReviewModel } from "./structure-review-model.js";
import { structureModelBriefFor } from "./structure-model-briefs.js";

describe("production structure review coverage", () => {
  for (const kind of Object.keys(STRUCTURE_REGISTRY) as StructureDisplayKey[]) {
    it(`renders and releases the actual ${kind} model`, () => {
      const scene = new Scene();
      const model = createStructureReviewModel(scene, kind, undefined, false);
      const size = model.bounds.getSize(new Vector3());
      expect(model.bounds.isEmpty()).toBe(false);
      expect(size.x).toBeGreaterThan(0.05);
      expect(size.y).toBeGreaterThan(0.05);
      expect(size.z).toBeGreaterThan(0.05);
      expect(structureModelBriefFor(kind).landmark.length).toBeGreaterThan(20);
      model.update(1234); model.dispose();
      expect(scene.children).toHaveLength(0);
    });
  }
  it("assembles the completed Siege Engine with a horizontal long barrel", () => {
    const scene = new Scene(), model = createStructureReviewModel(scene, "SOVEREIGN_SIEGE_ENGINE", undefined, false);
    const barrels = scene.children.filter((mesh): mesh is InstancedMesh => {
      if (!(mesh instanceof InstancedMesh) || mesh.count === 0) return false;
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox?.getSize(new Vector3());
      return Boolean(size && size.z > 0.4 && size.x < 0.12 && size.y < 0.12);
    });
    expect(barrels).toHaveLength(1);
    model.dispose();
  });
  it("keeps the completed cannon’s 2D artwork identical to its production 3D projection", () => {
    expect(readFileSync(new URL("../../public/overlays/sovereign-siege-engine-overlay.svg", import.meta.url), "utf8"))
      .toBe(structureReviewSvg("SOVEREIGN_SIEGE_ENGINE"));
  });
  it("shows the mineral requested by the live tile", () => {
    const signature = (resource: "TITANIUM" | "GEMS"): string => {
      const scene = new Scene(), model = createStructureReviewModel(scene, "MINE", undefined, false, resource);
      const materials = scene.children.filter((mesh): mesh is InstancedMesh => mesh instanceof InstancedMesh && mesh.count > 0)
        .map(mesh => mesh.material).flat().filter((material): material is MeshStandardMaterial => material instanceof MeshStandardMaterial).map(material => material.color.getHexString());
      model.dispose(); return materials.join(",");
    };
    expect(signature("TITANIUM")).toBe(signature("TITANIUM"));
    expect(signature("GEMS")).not.toBe(signature("TITANIUM"));
  });
});
