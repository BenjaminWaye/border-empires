import { describe, expect, it } from "vitest";
import { MeshStandardMaterial, Scene } from "three";
import { createLeafGeometry } from "../client-map-3d-trees/client-map-3d-tree-models.js";
import { createDistrictGeometryFromModel } from "../client-town-district/district-geometry.js";
import { catalystOutcrop } from "./network-geology-model.js";
import { createNetworkGeometry, createNetworkOverlay } from "./network-models.js";

describe("resin uses the existing map broadleaf asset", () => {
  it("retains its exact canopy, trunk, colours and normals, with sap added after the tree", () => {
    const original = createLeafGeometry().scale(0.34 / 0.53, 0.34 / 0.53, 0.34 / 0.53);
    const site = createNetworkGeometry("NEURAL_RESIN", false);
    const tree = site.layers.body!;
    for (const name of ["position", "normal", "color"]) {
      const a = original.getAttribute(name), b = tree.getAttribute(name);
      for (let i = 0; i < a.count; i += 1) for (let component = 0; component < a.itemSize; component += 1)
        expect(b.getComponent(i, component)).toBeCloseTo(a.getComponent(i, component), 6);
    }
    expect(tree.getAttribute("position").count).toBeGreaterThan(original.getAttribute("position").count);
    original.dispose(); Object.values(site.layers).forEach(geometry => geometry.dispose());
  });
  it("keeps the authored soft normals and supports terrain-derived resin counts without the old site quota", () => {
    const scene = new Scene(), overlay = createNetworkOverlay(scene, 4000, false);
    for (let x = 0; x < 3500; x += 1) overlay.add({ x, y: 0, z: 0, kind: "NEURAL_RESIN", operational: true, foundation: false });
    overlay.commit();
    expect(overlay.diagnostics.instances).toBe(3500);
    expect(overlay.diagnostics.overflow).toBe(0);
    for (const child of scene.children) {
      if (child.name.endsWith("-body") && "material" in child && child.material instanceof MeshStandardMaterial)
        expect(child.material.flatShading).toBe(false);
    }
    overlay.dispose(); expect(scene.children).toHaveLength(0);
  });
});

it("catalyst host rock faces outwards so it reads as solid geology", () => {
  const geometry = createDistrictGeometryFromModel(t => catalystOutcrop(t, 0, 0, 0.2));
  const body = geometry.layers.body!, position = body.getAttribute("position"), normal = body.getAttribute("normal");
  const radialDot = position.getX(0) * normal.getX(0) + position.getZ(0) * normal.getZ(0);
  expect(radialDot).toBeGreaterThan(0);
  const last = normal.count - 1;
  expect(normal.getY(last)).toBeGreaterThan(0);
  Object.values(geometry.layers).forEach(layer => layer.dispose());
});
