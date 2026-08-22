import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Scene
} from "three";
import type { Tile } from "./client-types.js";
import { exposedBorderSides, type BorderSideDeps } from "./client-tile-borders/client-tile-borders.js";

const VERTS_PER_EDGE = 4;
const INDICES_PER_EDGE = 6;

// Sits a hair above the fill overlay's own rise-above-heightfield offset so
// the border ribbon never z-fights the flat color wash beneath it, in the
// same way the fill overlay clears the terrain itself.
export const BORDER_RISE_ABOVE_FILL = 0.004;

// World-unit thickness of the border ribbon, measured inward from the tile
// edge. Kept well under half a tile so opposite edges of a 1-wide salient
// never overlap.
export const DEFAULT_BORDER_WIDTH = 0.12;

const BORDER_OPACITY = 1;

export type OwnershipBorderOverlay = {
  readonly mesh: Mesh;
  readonly clear: () => void;
  // (ax,az)-(bx,bz) is the edge segment being outlined, at world height ay/by
  // (already includes whatever elevation offset the caller wants). (nx,nz)
  // is the *inward* unit normal (into the owning tile) the ribbon extrudes
  // along; width is the ribbon's thickness along that normal.
  readonly addEdge: (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    nx: number, nz: number,
    width: number,
    color: Color
  ) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createOwnershipBorderOverlay = (scene: Scene, maxEdges: number): OwnershipBorderOverlay => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(maxEdges * VERTS_PER_EDGE * 3);
  const colors = new Float32Array(maxEdges * VERTS_PER_EDGE * 3);
  const indices = new Uint32Array(maxEdges * INDICES_PER_EDGE);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);

  const material = new MeshBasicMaterial({
    toneMapped: false,
    color: "#ffffff",
    vertexColors: true,
    transparent: true,
    opacity: BORDER_OPACITY,
    depthWrite: false,
    side: DoubleSide
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  // One above the fill layers (renderOrder 6/7 in
  // client-map-3d-ownership-overlay.ts) so the crisp edge line always draws
  // on top of the soft fill wash beneath it.
  mesh.renderOrder = 8;
  scene.add(mesh);

  let count = 0;

  const clear = (): void => {
    count = 0;
  };

  const addEdge = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    nx: number, nz: number,
    width: number,
    color: Color
  ): void => {
    if (count >= maxEdges) return;

    const baseVertex = count * VERTS_PER_EDGE;
    const baseFloat = baseVertex * 3;

    const cx = ax + nx * width;
    const cz = az + nz * width;
    const dx = bx + nx * width;
    const dz = bz + nz * width;

    // CCW quad: A, B, D (inset from B), C (inset from A).
    positions[baseFloat + 0] = ax; positions[baseFloat + 1] = ay; positions[baseFloat + 2] = az;
    positions[baseFloat + 3] = bx; positions[baseFloat + 4] = by; positions[baseFloat + 5] = bz;
    positions[baseFloat + 6] = cx; positions[baseFloat + 7] = ay; positions[baseFloat + 8] = cz;
    positions[baseFloat + 9] = dx; positions[baseFloat + 10] = by; positions[baseFloat + 11] = dz;

    for (let v = 0; v < VERTS_PER_EDGE; v += 1) {
      colors[baseFloat + v * 3 + 0] = color.r;
      colors[baseFloat + v * 3 + 1] = color.g;
      colors[baseFloat + v * 3 + 2] = color.b;
    }

    const baseIndex = count * INDICES_PER_EDGE;
    indices[baseIndex + 0] = baseVertex + 0;
    indices[baseIndex + 1] = baseVertex + 2;
    indices[baseIndex + 2] = baseVertex + 1;
    indices[baseIndex + 3] = baseVertex + 1;
    indices[baseIndex + 4] = baseVertex + 2;
    indices[baseIndex + 5] = baseVertex + 3;

    count += 1;
  };

  const commit = (): void => {
    geometry.setDrawRange(0, count * INDICES_PER_EDGE);
    const pos = geometry.getAttribute("position") as BufferAttribute;
    const col = geometry.getAttribute("color") as BufferAttribute;
    const index = geometry.index!;
    pos.clearUpdateRanges();
    pos.addUpdateRange(0, count * VERTS_PER_EDGE * 3);
    pos.needsUpdate = true;
    col.clearUpdateRanges();
    col.addUpdateRange(0, count * VERTS_PER_EDGE * 3);
    col.needsUpdate = true;
    index.clearUpdateRanges();
    index.addUpdateRange(0, count * INDICES_PER_EDGE);
    index.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return { mesh, clear, addEdge, commit, dispose };
};

// Emits the crisp border ribbon for one owned tile's exposed edges only --
// reuses exposedBorderSides directly so this stays in lockstep with the 2D
// canvas ownership border (client-tile-borders.ts) and the breach-torn-edge
// overlay that shares the same "exposed" definition. Ribbon sits a hair
// above the fill overlay's own corner heights (BORDER_RISE_ABOVE_FILL),
// which is close enough to the true hill-draped surface at a tile's edges
// specifically -- domeFalloff is near zero at a tile's corners/edges and
// only bulges toward the tile center (see client-map-3d-hills.ts).
export const addOwnershipBorderEdgesForTile = (
  overlay: OwnershipBorderOverlay,
  tile: Tile,
  deps: BorderSideDeps,
  x0: number, x1: number, z0: number, z1: number,
  corner00Y: number, corner10Y: number, corner01Y: number, corner11Y: number,
  color: Color
): void => {
  const sides = exposedBorderSides(tile, deps);
  const by = BORDER_RISE_ABOVE_FILL;
  if (sides.top) overlay.addEdge(x0, corner00Y + by, z0, x1, corner10Y + by, z0, 0, 1, DEFAULT_BORDER_WIDTH, color);
  if (sides.right) overlay.addEdge(x1, corner10Y + by, z0, x1, corner11Y + by, z1, -1, 0, DEFAULT_BORDER_WIDTH, color);
  if (sides.bottom) overlay.addEdge(x1, corner11Y + by, z1, x0, corner01Y + by, z1, 0, -1, DEFAULT_BORDER_WIDTH, color);
  if (sides.left) overlay.addEdge(x0, corner01Y + by, z1, x0, corner00Y + by, z0, 1, 0, DEFAULT_BORDER_WIDTH, color);
};
