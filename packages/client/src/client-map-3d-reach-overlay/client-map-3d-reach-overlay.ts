import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene
} from "three";

// 3D counterpart of the Canvas2D reach overlay in
// ../client-reach-overlay/client-reach-overlay.ts. That module owns all the
// pure reach-set/boundary logic (computeLocalReachSet, isDormantFrontierTile,
// isReachBoundaryTile) -- this module only turns "this tile is a reach
// boundary tile" / "this tile is dormant frontier" / "this tile is
// out-of-reach" into 3D geometry, following the same
// clear()/addInstance()/commit() shape as client-map-3d-road-overlay.ts.
//
// Only wired up when isTrue3DRendererActive() is true (see
// client-map-3d.ts); the existing Canvas2D path in client-runtime-loop.ts is
// untouched and keeps rendering for ?renderer=2d.
//
// Visual language matches the game's established steampunk-relay palette
// (see client-map-3d-relay-beacon-overlay.ts / client-map-3d-watchtower-overlay.ts,
// both of which use warm amber "#ff9d3d" for a lit energy core over a brass
// "#a5864d" housing): the reach boundary is not one continuous line/ribbon
// but a chain of small discrete glowing "energy-fence" studs running along
// each boundary edge with visible gaps between them, like posts in a
// relay-beacon perimeter fence rather than a drawn border.

const VERTS_PER_TILE = 4;
const INDICES_PER_TILE = 6;

// Warm amber energy-core glow, matching RELAY_BEACON's/watchtower lantern's
// emissive color exactly (client-map-3d-relay-beacon-overlay.ts line 130,
// client-map-3d-watchtower-overlay.ts line 67).
const BOUNDARY_STUD_GLOW_COLOR = "#ff9d3d";
// Brass housing color the studs sit on, echoing the beacon/watchtower's
// brass parts (client-map-3d-relay-beacon-overlay.ts "#a5864d").
const BOUNDARY_STUD_BASE_COLOR = "#a5864d";
const OUT_OF_REACH_TINT_COLOR = "#0a0c12";
const OUT_OF_REACH_OPACITY = 0.28;
// Dormant frontier reads as a "powered down" version of the same energy
// language rather than an unrelated flat brown tint: a duller, desaturated
// echo of the boundary stud's brass/amber housing instead of a live glow.
const DORMANT_FRONTIER_TINT_COLOR = "#4a3f30";
const DORMANT_FRONTIER_OPACITY = 0.3;

const STUD_LIFT = 0.045;
const STUD_THICKNESS = 0.05;
// Each boundary edge (length 1 tile) is divided into a fixed chain of stud
// spans (start/end fraction along the edge), leaving visible gaps between
// them and at both ends -- this is what reads as "discrete fence posts"
// instead of a continuous line. Two studs per edge, roughly a third of the
// edge each, symmetric gaps.
const STUD_SPANS: ReadonlyArray<readonly [number, number]> = [
  [0.08, 0.42],
  [0.58, 0.92]
];

export type ReachEdges = {
  readonly top: boolean;
  readonly right: boolean;
  readonly bottom: boolean;
  readonly left: boolean;
};

/** No edges set == not a boundary tile == nothing to draw. */
export const hasAnyEdge = (edges: ReachEdges): boolean => edges.top || edges.right || edges.bottom || edges.left;

export type StudQuad = { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number };

/**
 * Pure geometry helper: given a tile's local-space center (x, z) and its
 * size (always 1 for a unit tile), returns the discrete stud quads (in the
 * XZ plane) for every edge that borders an out-of-reach neighbour --
 * STUD_SPANS.length short studs per edge with gaps between them, rather
 * than one continuous segment. Mirrors which edges the 2D
 * drawReachBoundaryLine draws (top/right/bottom/left vs out-of-reach
 * neighbours) exactly, just emitting a chain of posts instead of a single
 * dashed stroke.
 */
export const boundaryEdgeStuds = (x: number, z: number, size: number, edges: ReachEdges): StudQuad[] => {
  const half = size / 2;
  const x0 = x - half;
  const x1 = x + half;
  const z0 = z - half;
  const z1 = z + half;
  const halfThickness = STUD_THICKNESS / 2;
  const studs: StudQuad[] = [];

  const addAlongX = (fixedZ: number): void => {
    for (const [t0, t1] of STUD_SPANS) {
      studs.push({ x0: x0 + t0 * size, x1: x0 + t1 * size, z0: fixedZ - halfThickness, z1: fixedZ + halfThickness });
    }
  };
  const addAlongZ = (fixedX: number): void => {
    for (const [t0, t1] of STUD_SPANS) {
      studs.push({ x0: fixedX - halfThickness, x1: fixedX + halfThickness, z0: z0 + t0 * size, z1: z0 + t1 * size });
    }
  };

  if (edges.top) addAlongX(z0);
  if (edges.bottom) addAlongX(z1);
  if (edges.left) addAlongZ(x0);
  if (edges.right) addAlongZ(x1);

  return studs;
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

export type ReachOverlay3D = {
  readonly group: Group;
  readonly clear: () => void;
  /** Adds the boundary energy-fence studs for one reach-boundary tile. */
  readonly addBoundaryTile: (x: number, z: number, surfaceY: number, size: number, edges: ReachEdges) => void;
  /** Tints one dormant-frontier tile (owned FRONTIER tile still holding a leftover structure). */
  readonly addDormantFrontierTile: (x: number, z: number, surfaceY: number, size: number) => void;
  /** Dims one visible-but-unreachable neutral/enemy tile. */
  readonly addOutOfReachTile: (x: number, z: number, surfaceY: number, size: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type QuadMesh = {
  geometry: BufferGeometry;
  positions: Float32Array;
  mesh: Mesh;
  material: MeshBasicMaterial;
};

const createQuadMesh = (maxQuads: number, color: string, opacity: number, renderOrder: number): QuadMesh => {
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

const writeQuad = (
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

export const createReachOverlay3D = (scene: Scene, maxTiles: number): ReachOverlay3D => {
  const group = new Group();
  group.name = "reach-overlay-3d";

  // Up to 4 edges * STUD_SPANS.length studs per tile.
  const maxStuds = maxTiles * 4 * STUD_SPANS.length;
  const studBase = createQuadMesh(maxStuds, BOUNDARY_STUD_BASE_COLOR, 0.55, 9);
  const studGlow = createQuadMesh(maxStuds, BOUNDARY_STUD_GLOW_COLOR, 0.9, 10);
  const dormant = createQuadMesh(maxTiles, DORMANT_FRONTIER_TINT_COLOR, DORMANT_FRONTIER_OPACITY, 7);
  const outOfReach = createQuadMesh(maxTiles, OUT_OF_REACH_TINT_COLOR, OUT_OF_REACH_OPACITY, 8);

  group.add(studBase.mesh, studGlow.mesh, dormant.mesh, outOfReach.mesh);
  scene.add(group);

  let studVertCount = 0;
  let studIndexCount = 0;
  let dormantVertCount = 0;
  let dormantIndexCount = 0;
  let outOfReachVertCount = 0;
  let outOfReachIndexCount = 0;

  const clear = (): void => {
    studVertCount = 0;
    studIndexCount = 0;
    dormantVertCount = 0;
    dormantIndexCount = 0;
    outOfReachVertCount = 0;
    outOfReachIndexCount = 0;
  };

  const addBoundaryTile = (x: number, z: number, surfaceY: number, size: number, edges: ReachEdges): void => {
    if (!hasAnyEdge(edges)) return;
    const studs = boundaryEdgeStuds(x, z, size, edges);
    const baseY = surfaceY + STUD_LIFT;
    const glowY = baseY + 0.006;
    for (const stud of studs) {
      if (studVertCount + VERTS_PER_TILE > maxStuds * VERTS_PER_TILE) return;
      [studVertCount, studIndexCount] = writeQuad(studBase, studVertCount, studIndexCount, stud.x0, stud.x1, stud.z0, stud.z1, baseY);
      writeQuad(studGlow, studVertCount - VERTS_PER_TILE, studIndexCount - INDICES_PER_TILE, stud.x0, stud.x1, stud.z0, stud.z1, glowY);
    }
  };

  const addDormantFrontierTile = (x: number, z: number, surfaceY: number, size: number): void => {
    if (dormantVertCount + VERTS_PER_TILE > maxTiles * VERTS_PER_TILE) return;
    const { x0, x1, z0, z1 } = tileQuadCorners(x, z, size);
    [dormantVertCount, dormantIndexCount] = writeQuad(dormant, dormantVertCount, dormantIndexCount, x0, x1, z0, z1, surfaceY);
  };

  const addOutOfReachTile = (x: number, z: number, surfaceY: number, size: number): void => {
    if (outOfReachVertCount + VERTS_PER_TILE > maxTiles * VERTS_PER_TILE) return;
    const { x0, x1, z0, z1 } = tileQuadCorners(x, z, size);
    [outOfReachVertCount, outOfReachIndexCount] = writeQuad(outOfReach, outOfReachVertCount, outOfReachIndexCount, x0, x1, z0, z1, surfaceY);
  };

  const commit = (): void => {
    (studBase.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (studBase.geometry.getIndex() as BufferAttribute).needsUpdate = true;
    studBase.geometry.setDrawRange(0, studIndexCount);

    (studGlow.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (studGlow.geometry.getIndex() as BufferAttribute).needsUpdate = true;
    studGlow.geometry.setDrawRange(0, studIndexCount);

    (dormant.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (dormant.geometry.getIndex() as BufferAttribute).needsUpdate = true;
    dormant.geometry.setDrawRange(0, dormantIndexCount);

    (outOfReach.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (outOfReach.geometry.getIndex() as BufferAttribute).needsUpdate = true;
    outOfReach.geometry.setDrawRange(0, outOfReachIndexCount);
  };

  const dispose = (): void => {
    scene.remove(group);
    studBase.geometry.dispose();
    studBase.material.dispose();
    studGlow.geometry.dispose();
    studGlow.material.dispose();
    dormant.geometry.dispose();
    dormant.material.dispose();
    outOfReach.geometry.dispose();
    outOfReach.material.dispose();
  };

  return { group, clear, addBoundaryTile, addDormantFrontierTile, addOutOfReachTile, commit, dispose };
};
