import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Scene
} from "three";

const VERTS_PER_TILE = 4;
const INDICES_PER_TILE = 6;

// Settled keeps the strong claim color (0.85) so owned territory reads
// unambiguously. Frontier was previously dropped to 0.32 to let biome detail
// show through, but on grass terrain that reads as visually indistinguishable
// from unowned land (confirmed live: a tile with correct owner data and
// ownershipState FRONTIER rendered with no visible tint at 0.32). Raised to
// 0.5 to keep frontier reliably distinct from unowned tiles across biomes.
const SETTLED_OPACITY = 0.85;
// Exported so the waypoint claim-sweep in client-map-3d.ts matches the
// real ownership tint exactly — any drift would show as a visible pop
// the moment the sweep hands off to the ownership overlay.
export const FRONTIER_OPACITY = 0.5;

export type OwnershipOverlay = {
  readonly settledMesh: Mesh;
  readonly frontierMesh: Mesh;
  readonly clear: () => void;
  readonly addTile: (
    corner00X: number, corner00Y: number, corner00Z: number,
    corner10X: number, corner10Y: number, corner10Z: number,
    corner01X: number, corner01Y: number, corner01Z: number,
    corner11X: number, corner11Y: number, corner11Z: number,
    color: Color,
    isFrontier: boolean
  ) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const createMesh = (maxTiles: number, opacity: number): {
  geometry: BufferGeometry;
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  mesh: Mesh;
  material: MeshBasicMaterial;
} => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(maxTiles * VERTS_PER_TILE * 3);
  const colors = new Float32Array(maxTiles * VERTS_PER_TILE * 3);
  const indices = new Uint32Array(maxTiles * INDICES_PER_TILE);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const material = new MeshBasicMaterial({
    color: "#ffffff",
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { geometry, positions, colors, indices, mesh, material };
};

export const createOwnershipOverlay = (scene: Scene, maxTiles: number): OwnershipOverlay => {
  const settled = createMesh(maxTiles, SETTLED_OPACITY);
  settled.mesh.renderOrder = 6;
  const frontier = createMesh(maxTiles, FRONTIER_OPACITY);
  frontier.mesh.renderOrder = 7;
  scene.add(settled.mesh, frontier.mesh);

  let settledCount = 0;
  let frontierCount = 0;

  const clear = (): void => {
    settledCount = 0;
    frontierCount = 0;
  };

  const addTile = (
    corner00X: number, corner00Y: number, corner00Z: number,
    corner10X: number, corner10Y: number, corner10Z: number,
    corner01X: number, corner01Y: number, corner01Z: number,
    corner11X: number, corner11Y: number, corner11Z: number,
    color: Color,
    isFrontier: boolean
  ): void => {
    const target = isFrontier ? frontier : settled;
    const count = isFrontier ? frontierCount : settledCount;
    if (count >= maxTiles) return;

    const baseVertex = count * VERTS_PER_TILE;
    const baseFloat = baseVertex * 3;

    // 4 corners in CCW order: TL (00), TR (10), BL (01), BR (11).
    target.positions[baseFloat + 0] = corner00X;
    target.positions[baseFloat + 1] = corner00Y;
    target.positions[baseFloat + 2] = corner00Z;
    target.positions[baseFloat + 3] = corner10X;
    target.positions[baseFloat + 4] = corner10Y;
    target.positions[baseFloat + 5] = corner10Z;
    target.positions[baseFloat + 6] = corner01X;
    target.positions[baseFloat + 7] = corner01Y;
    target.positions[baseFloat + 8] = corner01Z;
    target.positions[baseFloat + 9] = corner11X;
    target.positions[baseFloat + 10] = corner11Y;
    target.positions[baseFloat + 11] = corner11Z;

    for (let v = 0; v < VERTS_PER_TILE; v += 1) {
      target.colors[baseFloat + v * 3 + 0] = color.r;
      target.colors[baseFloat + v * 3 + 1] = color.g;
      target.colors[baseFloat + v * 3 + 2] = color.b;
    }

    const baseIndex = count * INDICES_PER_TILE;
    target.indices[baseIndex + 0] = baseVertex + 0;
    target.indices[baseIndex + 1] = baseVertex + 2;
    target.indices[baseIndex + 2] = baseVertex + 1;
    target.indices[baseIndex + 3] = baseVertex + 1;
    target.indices[baseIndex + 4] = baseVertex + 2;
    target.indices[baseIndex + 5] = baseVertex + 3;

    if (isFrontier) frontierCount += 1;
    else settledCount += 1;
  };

  const commit = (): void => {
    settled.geometry.setDrawRange(0, settledCount * INDICES_PER_TILE);
    frontier.geometry.setDrawRange(0, frontierCount * INDICES_PER_TILE);
    const settledPos = settled.geometry.getAttribute("position");
    const settledColor = settled.geometry.getAttribute("color");
    if (settledPos) (settledPos as BufferAttribute).needsUpdate = true;
    if (settledColor) (settledColor as BufferAttribute).needsUpdate = true;
    if (settled.geometry.index) settled.geometry.index.needsUpdate = true;
    const frontierPos = frontier.geometry.getAttribute("position");
    const frontierColor = frontier.geometry.getAttribute("color");
    if (frontierPos) (frontierPos as BufferAttribute).needsUpdate = true;
    if (frontierColor) (frontierColor as BufferAttribute).needsUpdate = true;
    if (frontier.geometry.index) frontier.geometry.index.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(settled.mesh, frontier.mesh);
    settled.geometry.dispose();
    settled.material.dispose();
    frontier.geometry.dispose();
    frontier.material.dispose();
  };

  return { settledMesh: settled.mesh, frontierMesh: frontier.mesh, clear, addTile, commit, dispose };
};
