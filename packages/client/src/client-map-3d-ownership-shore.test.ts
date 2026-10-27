import { describe, expect, it } from "vitest";
import { BufferAttribute, Color, Mesh, Scene } from "three";
import { createOwnershipOverlay } from "./client-map-3d-ownership-overlay.js";
import { OWNERSHIP_SHORE_EDGE_OPACITY } from "./client-map-3d-ownership-shore.js";
import type { ShoreFringe } from "./client-map-3d-shore/client-map-3d-shore-sand.js";

// Two pieces of fringe in sea tile (0, 0): one beside land tile (0, -1),
// one beside (1, -1). Each is a triangle running from the land edge
// (seaward 0) out to the waterline (seaward 1).
const fringe: ShoreFringe = {
  positions: [0.2, -0.04, 0, 0.8, -0.04, 0, 0.5, -0.05, 0.3, 1.2, -0.04, 0, 1.8, -0.04, 0, 1.5, -0.05, 0.3],
  seaward: [0, 0, 1, 0, 0, 1],
  polygonVertices: [0, 1, 2, 3, 4, 5],
  polygons: [
    { first: 0, count: 3, landGc: 0, landGr: -1 },
    { first: 3, count: 3, landGc: 1, landGr: -1 }
  ]
};

const addTile = (overlay: ReturnType<typeof createOwnershipOverlay>, gc: number, gr: number, color: Color, frontier: boolean): void => {
  overlay.addTile(gc, 0, gr, gc + 1, 0, gr, gc, 0, gr + 1, gc + 1, 0, gr + 1, color, frontier);
};
const shoreMeshes = (scene: Scene): Mesh[] =>
  scene.children.filter((o): o is Mesh => o instanceof Mesh && (o.geometry.getAttribute("color") as BufferAttribute | undefined)?.itemSize === 4);
const rgba = (mesh: Mesh, vertex: number): number[] => {
  const color = mesh.geometry.getAttribute("color") as BufferAttribute;
  return [color.getX(vertex), color.getY(vertex), color.getZ(vertex), color.getW(vertex)];
};

describe("ownership carried onto the beach fringe", () => {
  it("tints each piece of fringe with its own land tile's owner, settled and frontier apart", () => {
    const scene = new Scene();
    const overlay = createOwnershipOverlay(scene, 4);
    addTile(overlay, 0, -1, new Color(1, 0, 0), false);
    addTile(overlay, 1, -1, new Color(0, 0, 1), true);
    overlay.commit();
    overlay.extendOntoShore(fringe);
    const meshes = shoreMeshes(scene);
    expect(meshes).toHaveLength(2);
    const settled = meshes.find((m) => m.material === overlay.settledMesh.material)!;
    const frontier = meshes.find((m) => m.material === overlay.frontierMesh.material)!;
    expect(rgba(settled, 0).slice(0, 3)).toEqual([1, 0, 0]);
    expect(rgba(frontier, 0).slice(0, 3)).toEqual([0, 0, 1]);
    expect(settled.renderOrder).toBe(overlay.settledMesh.renderOrder);
    // Raised clear of the sand like the tile's own quad.
    expect((settled.geometry.getAttribute("position") as BufferAttribute).getY(0)).toBeGreaterThan(-0.04);
  });

  it("leaves fringe beside unowned land bare, and clears with the overlay", () => {
    const scene = new Scene();
    const overlay = createOwnershipOverlay(scene, 4);
    addTile(overlay, 0, -1, new Color(1, 0, 0), false);
    overlay.extendOntoShore(fringe);
    const [only] = shoreMeshes(scene);
    expect(only!.geometry.getAttribute("position").count).toBe(3);
    overlay.clear();
    overlay.extendOntoShore(fringe);
    expect(shoreMeshes(scene)).toHaveLength(0);
  });

  it("fades out toward the waterline when asked, and stays even otherwise", () => {
    const scene = new Scene();
    const overlay = createOwnershipOverlay(scene, 4);
    addTile(overlay, 0, -1, new Color(1, 0, 0), false);
    overlay.extendOntoShore(fringe, OWNERSHIP_SHORE_EDGE_OPACITY);
    const [faded] = shoreMeshes(scene);
    expect(rgba(faded!, 0)[3]).toBe(1);
    expect(rgba(faded!, 2)[3]).toBeCloseTo(OWNERSHIP_SHORE_EDGE_OPACITY, 6);
    overlay.extendOntoShore(fringe);
    const [even] = shoreMeshes(scene);
    expect(rgba(even!, 2)[3]).toBe(1);
  });

  it("fades a multiply overlay toward white instead, since multiply ignores alpha", () => {
    const scene = new Scene();
    const overlay = createOwnershipOverlay(scene, 4, { settled: 0.4, frontier: 0.12 }, undefined, { settled: "multiply", frontier: "multiply" });
    addTile(overlay, 0, -1, new Color(1, 0, 0), false);
    overlay.extendOntoShore(fringe, 0);
    const [mesh] = shoreMeshes(scene);
    expect(rgba(mesh!, 0)[1]).toBeLessThan(1);
    expect(rgba(mesh!, 2)).toEqual([1, 1, 1, 1]);
  });
});
