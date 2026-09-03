import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial } from "three";

// Flat instanced-quad tile-fill mesh (e.g. the Aether Survey Line's
// dormant-frontier tint) -- cheap, drawn under everything else. Extracted
// out of client-map-3d-aether-survey-line.ts (over the repo's 500-line file
// cap) since this piece is self-contained: a preallocated quad buffer plus
// pure geometry helpers, with no dependency on that module's pylon/line
// pooling.

export const VERTS_PER_TILE = 4;
export const INDICES_PER_TILE = 6;

export type QuadMesh = {
  geometry: BufferGeometry;
  positions: Float32Array;
  mesh: Mesh;
  material: MeshBasicMaterial;
};

export const createQuadMesh = (maxQuads: number, color: string, opacity: number, renderOrder: number): QuadMesh => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(maxQuads * VERTS_PER_TILE * 3);
  const indices = new Uint32Array(maxQuads * INDICES_PER_TILE);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const material = new MeshBasicMaterial({
    toneMapped: false,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return { geometry, positions, mesh, material };
};

export const writeQuad = (
  quad: QuadMesh,
  vertCount: number,
  indexCount: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number
): [number, number] => {
  const base = vertCount;
  quad.positions[base * 3] = x0; quad.positions[base * 3 + 1] = y; quad.positions[base * 3 + 2] = z0;
  quad.positions[(base + 1) * 3] = x1; quad.positions[(base + 1) * 3 + 1] = y; quad.positions[(base + 1) * 3 + 2] = z0;
  quad.positions[(base + 2) * 3] = x0; quad.positions[(base + 2) * 3 + 1] = y; quad.positions[(base + 2) * 3 + 2] = z1;
  quad.positions[(base + 3) * 3] = x1; quad.positions[(base + 3) * 3 + 1] = y; quad.positions[(base + 3) * 3 + 2] = z1;
  const index = quad.geometry.getIndex() as BufferAttribute;
  index.array[indexCount] = base;
  index.array[indexCount + 1] = base + 1;
  index.array[indexCount + 2] = base + 2;
  index.array[indexCount + 3] = base + 1;
  index.array[indexCount + 4] = base + 3;
  index.array[indexCount + 5] = base + 2;
  return [vertCount + VERTS_PER_TILE, indexCount + INDICES_PER_TILE];
};

/** Pure geometry helper: the 4 corners of a unit tile quad centered at (x, z). */
export const tileQuadCorners = (
  x: number,
  z: number,
  size: number
): { x0: number; x1: number; z0: number; z1: number } => {
  const half = size / 2;
  return { x0: x - half, x1: x + half, z0: z - half, z1: z + half };
};

/** Linear interpolation of a point at parameter t in [0, 1] between p0 and p1 -- a straight chord, per the brief. */
export type Vec3Like = { readonly x: number; readonly y: number; readonly z: number };
export const lerpPoint = (p0: Vec3Like, p1: Vec3Like, t: number): Vec3Like => ({
  x: p0.x + (p1.x - p0.x) * t,
  y: p0.y + (p1.y - p0.y) * t,
  z: p0.z + (p1.z - p0.z) * t
});
