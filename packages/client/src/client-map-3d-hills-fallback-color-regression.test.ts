import { BufferAttribute, MeshStandardMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createHillTerrain, HILL_DOME_RADIUS } from "./client-map-3d-hills.js";
import type { HeightfieldTerrainKind } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";

// A defensive-correctness guard, not the fix for the "tiles lost their
// bottoms" bug (see client-map-3d-hills-skirt-regression.test.ts for that).
// flatCorner's own last-resort fallback used to be a hardcoded
// { e: 0, r: 0, g: 0, b: 0 } — literal black at zero elevation. That was
// originally suspected as the bug's cause, since the dome's outer ring
// (r >= HILL_DOME_RADIUS) sits exactly at this corner-blended value by
// design. It turned out not to be reachable in practice — a hill tile's own
// footprint is always one of the 4 cells its corners check, and the tile
// itself must already be explored to be rendered at all, so the fallback
// never actually fires for a hill's own corners today (see the comment on
// flatCorner in client-map-3d-hills.ts for the full trace). This test pins
// the fallback's behavior anyway: correct fallback color beats a hardcoded
// black one if a future refactor ever changes who calls flatCorner or how.
describe("hills dome flatCorner fallback (defensive, see comment above)", () => {
  it("does not paint the dome's edge black when every neighbour is unexplored", () => {
    const scene = new Scene();
    const sharedMaterial = new MeshStandardMaterial();
    const hills = createHillTerrain(scene, 4, sharedMaterial);

    const kindAt: HeightfieldTerrainKind = "GRASS";
    // Only the origin tile is explored; every neighbour (and everything
    // else) is unexplored fog.
    const isExploredAt = (wx: number, wy: number): boolean => wx === 0 && wy === 0;
    const isHillsAt = (wx: number, wy: number): boolean => wx === 0 && wy === 0;

    hills.rebuild({
      camX: 0,
      camY: 0,
      halfW: 2,
      halfH: 2,
      worldWidth: 450,
      worldHeight: 450,
      tileKindAt: () => kindAt,
      isExploredAt,
      isHillsAt
    });

    const colorAttr = hills.mesh.geometry.getAttribute("color") as BufferAttribute;
    const positionAttr = hills.mesh.geometry.getAttribute("position") as BufferAttribute;
    const drawnVertexCount = hills.mesh.geometry.index
      ? Math.max(...Array.from({ length: hills.mesh.geometry.index.count }, (_, i) => hills.mesh.geometry.index!.getX(i))) + 1
      : positionAttr.count;

    expect(drawnVertexCount).toBeGreaterThan(0);

    let checkedEdgeVertex = false;
    for (let i = 0; i < drawnVertexCount; i += 1) {
      const px = positionAttr.getX(i);
      const pz = positionAttr.getZ(i);
      const r = Math.hypot(px - 0.5, pz - 0.5);
      if (r < HILL_DOME_RADIUS) continue; // inside the bump, not an edge vertex
      checkedEdgeVertex = true;
      const cr = colorAttr.getX(i);
      const cg = colorAttr.getY(i);
      const cb = colorAttr.getZ(i);
      expect(cr === 0 && cg === 0 && cb === 0).toBe(false);
    }
    expect(checkedEdgeVertex).toBe(true);

    hills.dispose();
  });
});
