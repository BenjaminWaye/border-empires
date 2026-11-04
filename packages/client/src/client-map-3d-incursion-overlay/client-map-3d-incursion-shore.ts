import { BufferAttribute, BufferGeometry, Mesh, type Group, type Material } from "three";
import type { ShoreFringe } from "../client-map-3d-shore/client-map-3d-shore-sand.js";
import { OWNERSHIP_RISE_ABOVE_HEIGHTFIELD } from "../client-map-3d-ownership-shore.js";

type HatchRgb = readonly [number, number, number];
export type ShoreHatchColors = { readonly theirs: HatchRgb; readonly mine: HatchRgb };
type IncursionShore = {
  readonly clear: () => void;
  readonly rebuild: (fringe: ShoreFringe, colorsAt: (gc: number, gr: number) => ShoreHatchColors | undefined) => void;
};

/** Uses the beach's clipped polygons, so stripes end exactly at the curved waterline. */
export const createIncursionShore = (parent: Group, material: Material): IncursionShore => {
  let mesh: Mesh | undefined;
  const clear = (): void => {
    if (!mesh) return;
    parent.remove(mesh);
    mesh.geometry.dispose();
    mesh = undefined;
  };
  const rebuild = (fringe: ShoreFringe, colorsAt: (gc: number, gr: number) => ShoreHatchColors | undefined): void => {
    clear();
    const positions: number[] = [];
    const theirs: number[] = [];
    const mine: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    // All output is bounded by this rebuild's finite beach geometry.
    for (const polygon of fringe.polygons) {
      const colors = colorsAt(polygon.landGc, polygon.landGr);
      if (!colors) continue;
      const base = positions.length / 3;
      for (let v = 0; v < polygon.count; v += 1) {
        const p = fringe.polygonVertices[polygon.first + v]! * 3;
        const x = fringe.positions[p]!;
        const z = fringe.positions[p + 2]!;
        positions.push(x, fringe.positions[p + 1]! + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD + 0.002, z);
        theirs.push(...colors.theirs);
        mine.push(...colors.mine);
        // Continue the tile's UVs beyond 0..1 instead of stretching a new
        // stripe pattern over each piece of sand (including wrapped views).
        uvs.push(x - polygon.landGc, 1 - (z - polygon.landGr));
      }
      for (let k = 1; k + 1 < polygon.count; k += 1) indices.push(base, base + k, base + k + 1);
    }
    if (!indices.length) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("hatchTheirs", new BufferAttribute(new Float32Array(theirs), 3));
    geometry.setAttribute("hatchMine", new BufferAttribute(new Float32Array(mine), 3));
    geometry.setAttribute("hatchUv", new BufferAttribute(new Float32Array(uvs), 2));
    geometry.setIndex(indices);
    mesh = new Mesh(geometry, material);
    mesh.renderOrder = 8;
    mesh.frustumCulled = false;
    parent.add(mesh);
  };
  return { clear, rebuild };
};
