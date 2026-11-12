import { Group, Mesh, Scene } from "three";
import { structureDisplayName } from "@border-empires/shared";
import type { StructureInfoKey } from "../client-map-display.js";
import { createStructureReviewModel } from "./structure-review-model.js";
import { projectMeshesToSvg } from "./mesh-projection-svg.js";

/** Deterministic 2D projection of the production mesh, for exports and audits. */
export const structureReviewSvg = (kind: StructureInfoKey, mineResource: "TITANIUM" | "GEMS" = "TITANIUM"): string => {
  const scene = new Scene(), model = createStructureReviewModel(scene, kind, undefined, false, mineResource);
  // Only the scene's direct meshes, as the exports always projected.
  const root = new Group();
  for (const child of scene.children) if (child instanceof Mesh) root.add(child.clone(false));
  try {
    return projectMeshesToSvg(root, structureDisplayName(kind));
  } finally {
    model.dispose();
  }
};

export { DISTRICT_PROJECT_KINDS as structureReviewMonumentKinds } from "../client-town-district/district-catalog.js";

export { INFRASTRUCTURE_EXPORTS as structureReviewInfrastructureExports } from "../client-infrastructure/infrastructure-art.js";
