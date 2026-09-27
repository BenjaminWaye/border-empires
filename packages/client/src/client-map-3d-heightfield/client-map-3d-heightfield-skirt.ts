// Heightfield skirt mesh buffers, extracted from client-map-3d-heightfield.ts
// (over the 500-line cap). client-map-3d-heightfield.ts fills them per rebuild.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshStandardMaterial } from "three";

export type HeightfieldSkirt = {
  readonly MAX_SKIRT_EDGES: number;
  readonly skirtPositions: Float32Array;
  readonly skirtColors: Float32Array;
  readonly skirtNormals: Float32Array;
  readonly skirtIndices: Uint32Array;
  readonly skirtGeometry: BufferGeometry;
  readonly skirtMaterial: MeshStandardMaterial;
  readonly skirtMesh: Mesh;
};

export const createHeightfieldSkirt = (QUAD_COUNT: number): HeightfieldSkirt => {
  // Skirt: a vertical wall dropped from every coastal land edge (where a
  // drawn land tile borders a skipped sea/unexplored tile) down to
  // SKIRT_BOTTOM_Y. Plain vertex-colored material — no biome textures — it
  // is only ever glimpsed edge-on as a thin sliver beneath the coast bevel.
  // Sized for the worst case (every tile edge is a coastline) so the typed
  // arrays never need to grow at runtime.
  const MAX_SKIRT_EDGES = QUAD_COUNT * 4;
  const skirtPositions = new Float32Array(MAX_SKIRT_EDGES * 4 * 3);
  const skirtColors = new Float32Array(MAX_SKIRT_EDGES * 4 * 3);
  // Written directly per edge (flat quad normal) rather than via
  // geometry.computeVertexNormals() — that method loops over the buffer's
  // full preallocated index/position count, not the draw range, so on a
  // MAX_SKIRT_EDGES-sized buffer it would rescan up to ~1M entries every
  // rebuild() regardless of how few skirt edges are actually active.
  const skirtNormals = new Float32Array(MAX_SKIRT_EDGES * 4 * 3);
  const skirtIndices = new Uint32Array(MAX_SKIRT_EDGES * 6);
  const skirtGeometry = new BufferGeometry();
  skirtGeometry.setAttribute("position", new BufferAttribute(skirtPositions, 3));
  skirtGeometry.setAttribute("color", new BufferAttribute(skirtColors, 3));
  skirtGeometry.setAttribute("normal", new BufferAttribute(skirtNormals, 3));
  skirtGeometry.setIndex(new BufferAttribute(skirtIndices, 1));
  skirtGeometry.setDrawRange(0, 0);
  const skirtMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: DoubleSide
  });
  const skirtMesh = new Mesh(skirtGeometry, skirtMaterial);
  skirtMesh.frustumCulled = false;
  skirtMesh.receiveShadow = false;
  skirtMesh.castShadow = false;
  return { MAX_SKIRT_EDGES, skirtPositions, skirtColors, skirtNormals, skirtIndices, skirtGeometry, skirtMaterial, skirtMesh };
};
