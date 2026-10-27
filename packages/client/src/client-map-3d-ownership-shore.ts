// Carries a per-tile overlay (ownership tint, the fogged slate wash, the
// remembered-owner tint -- all createOwnershipOverlay instances) out over the
// soft beach fringe (client-map-3d-shore/client-map-3d-shore-sand.ts).
//
// The overlays are one square per tile, so on a coast they stop at the
// land tile's square edge, while the beach fringe now curves out past it
// into the sea tile. Untinted, owned territory read as a staircase of colour
// inside a smooth, bare beach. Each piece of fringe instead takes the
// overlay of the land tile nearest it (ShoreFringePolygon.landGc/landGr), so
// territory runs right out to the curved waterline, and where two empires
// meet on a coast the fringe splits between them.
//
// Drawn with the overlay's own bucket materials (same opacity, blending,
// render order and any shader patch, e.g. the fogged edge clip), so where
// the fringe meets the tile the tint is indistinguishable from the tile's
// own. Ownership then fades out over a narrow band at the waterline
// (OWNERSHIP_SHORE_EDGE_OPACITY, ShoreFringe.seaward), so an empire's sea
// edge reads soft while keeping the waterline's curve; the fog overlays pass
// no fade and stay even all the way out.
import { BufferAttribute, BufferGeometry, Mesh, type Material, type Scene } from "three";
import type { ShoreFringe } from "./client-map-3d-shore/client-map-3d-shore-sand.js";

/**
 * How far client-map-3d.ts lifts the ownership quads over the heightfield.
 * The fringe tint uses the same lift, so it meets the tile's own at the
 * coast edge.
 */
export const OWNERSHIP_RISE_ABOVE_HEIGHTFIELD = 0.022;

/** Ownership tint strength at the waterline, relative to the tile's own (1 = no fade). */
export const OWNERSHIP_SHORE_EDGE_OPACITY = 0.15;

/** A tile's overlay colour, already in the form its bucket stores (see colorComponentFor). */
export type ShoreTileTint = { readonly r: number; readonly g: number; readonly b: number; readonly frontier: boolean };

/** Scene grid tile -> map key. Scene coords stay well inside +-32768. */
export const shoreTintKey = (gc: number, gr: number): number => (gc + 32768) * 65536 + (gr + 32768);

export type ShoreTintBucket = {
  readonly material: Material;
  readonly renderOrder: number;
  // How the bucket fades: through vertex alpha for a normal-blend bucket,
  // toward white for a multiply one (multiply blending ignores alpha).
  readonly fade: "alpha" | "toWhite";
};

export type OwnershipShoreTint = {
  /** `edgeOpacity`: tint strength at the waterline relative to the land edge (1 = even). */
  readonly rebuild: (fringe: ShoreFringe, tintAt: (gc: number, gr: number) => ShoreTileTint | undefined, edgeOpacity: number) => void;
  /** Settled and frontier meshes, for tests (null when this commit tinted nothing in that bucket). */
  readonly meshes: () => { readonly settled: Mesh | null; readonly frontier: Mesh | null };
  readonly dispose: () => void;
};

type TintBuffers = { positions: number[]; colors: number[]; indices: number[] };

export const createOwnershipShoreTint = (
  scene: Scene,
  buckets: { readonly settled: ShoreTintBucket; readonly frontier: ShoreTintBucket }
): OwnershipShoreTint => {
  let settled: Mesh | null = null;
  let frontier: Mesh | null = null;

  const clear = (): void => {
    for (const mesh of [settled, frontier]) {
      if (!mesh) continue;
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    settled = null;
    frontier = null;
  };

  const build = (buffers: TintBuffers, bucket: ShoreTintBucket): Mesh | null => {
    if (buffers.indices.length === 0) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(buffers.positions), 3));
    // RGBA: the alpha channel carries the waterline fade (three.js turns on
    // vertex alpha for a 4-component colour attribute).
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(buffers.colors), 4));
    geometry.setIndex(buffers.indices);
    const mesh = new Mesh(geometry, bucket.material);
    mesh.renderOrder = bucket.renderOrder;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };

  const rebuild: OwnershipShoreTint["rebuild"] = (fringe, tintAt, edgeOpacity) => {
    clear();
    const out = {
      settled: { positions: [], colors: [], indices: [] } as TintBuffers,
      frontier: { positions: [], colors: [], indices: [] } as TintBuffers
    };
    for (const polygon of fringe.polygons) {
      const tint = tintAt(polygon.landGc, polygon.landGr);
      if (!tint) continue;
      const target = tint.frontier ? out.frontier : out.settled;
      const toWhite = (tint.frontier ? buckets.frontier : buckets.settled).fade === "toWhite";
      const base = target.positions.length / 3;
      for (let v = 0; v < polygon.count; v++) {
        const i = fringe.polygonVertices[polygon.first + v]!;
        const p = i * 3;
        target.positions.push(fringe.positions[p]!, fringe.positions[p + 1]! + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD, fringe.positions[p + 2]!);
        const strength = 1 - (1 - edgeOpacity) * fringe.seaward[i]!;
        if (toWhite) target.colors.push(1 + (tint.r - 1) * strength, 1 + (tint.g - 1) * strength, 1 + (tint.b - 1) * strength, 1);
        else target.colors.push(tint.r, tint.g, tint.b, strength);
      }
      for (let k = 1; k + 1 < polygon.count; k++) target.indices.push(base, base + k, base + k + 1);
    }
    settled = build(out.settled, buckets.settled);
    frontier = build(out.frontier, buckets.frontier);
  };

  return { rebuild, meshes: () => ({ settled, frontier }), dispose: clear };
};
