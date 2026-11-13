import { readFileSync } from "node:fs";
import { structureReviewSvg } from "./structure-review-svg.js";
import { describe, expect, it } from "vitest";
import { STRUCTURE_REGISTRY, type StructureDisplayKey } from "@border-empires/shared";
import { Scene, Vector3 } from "three";
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
  it("keeps the completed cannon’s 2D artwork identical to its production 3D projection", () => {
    expect(readFileSync(new URL("../../public/overlays/sovereign-siege-engine-overlay.svg", import.meta.url), "utf8"))
      .toBe(structureReviewSvg("SOVEREIGN_SIEGE_ENGINE"));
  });
});
