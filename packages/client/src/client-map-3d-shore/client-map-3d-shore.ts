// Coastline polish for the ocean surface (docs/rivers-remake-plan.md,
// "1a-coast"). The sea is a grid of square tiles whose corners bob up to
// ~0.22 with the waves, so every coastline showed hard, flickering tile
// edges. Two fixes, both computed per water commit:
//
// - shore calm: waves fade to flat at sea corners touching land (and ease
//   back in over two more rings), so the coast stops flickering;
// - shore foam: a soft light band on the sea along the coast, its alpha
//   from the distance to the nearest land tile, so it rounds off around
//   convex sea corners and blurs the square seam.

import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, type Scene } from "three";

/** Wave calm by distance (in corner rings) from the nearest corner touching land. */
const SHORE_CALM_BY_RING = [1, 0.6, 0.25] as const;

/**
 * Per-vertex shore calm for a (vCols x vRows) corner grid. `isLandTile(c, r)`
 * is the tile whose top-left corner is grid vertex (c, r); a corner touches
 * land when any of its four tiles is land.
 */
export const computeShoreCalm = (vCols: number, vRows: number, isLandTile: (c: number, r: number) => boolean): Float32Array<ArrayBuffer> => {
  const ring = new Uint8Array(vCols * vRows).fill(255);
  for (let r = 0; r < vRows; r++) {
    for (let c = 0; c < vCols; c++) {
      if (isLandTile(c - 1, r - 1) || isLandTile(c, r - 1) || isLandTile(c - 1, r) || isLandTile(c, r)) ring[r * vCols + c] = 0;
    }
  }
  for (let pass = 1; pass < SHORE_CALM_BY_RING.length; pass++) {
    for (let r = 0; r < vRows; r++) {
      for (let c = 0; c < vCols; c++) {
        const i = r * vCols + c;
        if (ring[i]! <= pass) continue;
        const near =
          (c > 0 && ring[i - 1] === pass - 1) || (c + 1 < vCols && ring[i + 1] === pass - 1) ||
          (r > 0 && ring[i - vCols] === pass - 1) || (r + 1 < vRows && ring[i + vCols] === pass - 1);
        if (near) ring[i] = pass;
      }
    }
  }
  const calm = new Float32Array(vCols * vRows);
  for (let i = 0; i < calm.length; i++) calm[i] = SHORE_CALM_BY_RING[ring[i]!] ?? 0;
  return calm;
};

// Foam: peak alpha at the waterline, gone by FOAM_WIDTH (tiles) out to sea.
const FOAM_COLOR: readonly [number, number, number] = [0.6, 0.86, 0.85];
const FOAM_MAX_ALPHA = 0.55;
const FOAM_WIDTH = 0.38;
const FOAM_SUBDIV = 3;
// Above the sea surface; the shore is calm, so the surface sits flat there.
export const FOAM_LIFT_Y = 0.004;

export type FoamBuffers = { positions: number[]; colors: number[]; indices: number[] };

// Foam fades out within this distance (tiles) of a river mouth: the river
// cuts the shoreline there, and a foam line across it read as a hard edge.
const FOAM_MOUTH_CLEARANCE = 0.8;

/** Foam strength (0..1) at (x, z) given river mouth points (same coords). */
export const foamMouthFade = (x: number, z: number, mouths: ReadonlyArray<{ readonly x: number; readonly z: number }>): number => {
  let fade = 1;
  for (const m of mouths) {
    const t = Math.min(1, Math.hypot(x - m.x, z - m.z) / FOAM_MOUTH_CLEARANCE);
    fade = Math.min(fade, t * t * (3 - 2 * t));
  }
  return fade;
};

const distanceToSquare = (px: number, pz: number, x: number, z: number): number =>
  Math.hypot(Math.max(x - px, 0, px - (x + 1)), Math.max(z - pz, 0, pz - (z + 1)));

/**
 * Appends foam over water tile (gc, gr) (scene grid coords) at height `y`,
 * if any of its 8 neighbours is land. Only sub-cells the band reaches get
 * geometry, so open sea costs nothing.
 */
export const appendShoreFoam = (
  buffers: FoamBuffers,
  gc: number,
  gr: number,
  y: number,
  isLandTile: (gc: number, gr: number) => boolean,
  mouths: ReadonlyArray<{ readonly x: number; readonly z: number }> = []
): void => {
  // Most water tiles are open sea: reject them without allocating.
  let landMask = 0;
  for (let k = 0; k < 9; k++) if (k !== 4 && isLandTile(gc + (k % 3) - 1, gr + Math.floor(k / 3) - 1)) landMask |= 1 << k;
  if (landMask === 0) return;
  const land: (readonly [number, number])[] = [];
  for (let k = 0; k < 9; k++) if (landMask & (1 << k)) land.push([gc + (k % 3) - 1, gr + Math.floor(k / 3) - 1]);
  const n = FOAM_SUBDIV;
  const alphaAt = (x: number, z: number): number => {
    let d = Infinity;
    for (const [lx, lz] of land) d = Math.min(d, distanceToSquare(x, z, lx, lz));
    const t = Math.min(1, d / FOAM_WIDTH);
    return FOAM_MAX_ALPHA * (1 - t * t * (3 - 2 * t)) * (mouths.length > 0 ? foamMouthFade(x, z, mouths) : 1);
  };
  const alphas: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) alphas.push(alphaAt(gc + i / n, gr + j / n));
  const base = buffers.positions.length / 3;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      buffers.positions.push(gc + i / n, y, gr + j / n);
      buffers.colors.push(FOAM_COLOR[0], FOAM_COLOR[1], FOAM_COLOR[2], alphas[j * (n + 1) + i]!);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + n + 1;
      const d = c + 1;
      if (alphas[a]! + alphas[b]! + alphas[c]! + alphas[d]! === 0) continue;
      buffers.indices.push(base + a, base + c, base + b, base + b, base + c, base + d);
    }
  }
};

export type ShoreFoamLayer = {
  /** Rebuilds the foam for this water commit's tiles (scene grid coords); `enabled` false clears it. */
  readonly rebuild: (
    tiles: ReadonlyArray<{ readonly gc: number; readonly gr: number }>,
    isLandTile: (gc: number, gr: number) => boolean,
    y: number,
    enabled: boolean,
    mouths?: ReadonlyArray<{ readonly x: number; readonly z: number }>
  ) => void;
  readonly dispose: () => void;
};

export const createShoreFoamLayer = (scene: Scene, renderOrder: number): ShoreFoamLayer => {
  const material = new MeshBasicMaterial({
    toneMapped: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide
  });
  let mesh: Mesh | null = null;
  const clear = (): void => {
    if (!mesh) return;
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh = null;
  };
  const rebuild: ShoreFoamLayer["rebuild"] = (tiles, isLandTile, y, enabled, mouths = []) => {
    clear();
    if (!enabled) return;
    const buffers: FoamBuffers = { positions: [], colors: [], indices: [] };
    // Only mouths near this tile matter; most tiles have none.
    for (const { gc, gr } of tiles) {
      const near = mouths.filter((m) => Math.abs(m.x - gc - 0.5) < 2 && Math.abs(m.z - gr - 0.5) < 2);
      appendShoreFoam(buffers, gc, gr, y, isLandTile, near);
    }
    if (buffers.indices.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(buffers.positions), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(buffers.colors), 4));
    geometry.setIndex(buffers.indices);
    mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    scene.add(mesh);
  };
  const dispose = (): void => {
    clear();
    material.dispose();
  };
  return { rebuild, dispose };
};
