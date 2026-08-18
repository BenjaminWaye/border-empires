import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Scene,
  SphereGeometry,
  TorusGeometry
} from "three";
import { normalizeColorForThree } from "../client-three-color/client-three-color.js";

// 3D counterpart of the Canvas2D reach overlay in
// ../client-reach-overlay/client-reach-overlay.ts. That module owns all the
// pure reach-set/boundary/dormant logic (computeLocalReachSet,
// isDormantFrontierTile, isReachBoundaryTile) -- this module only turns
// "this tile is a reach boundary tile" / "this tile is dormant frontier" /
// "this tile is out-of-reach" into 3D geometry.
//
// Only wired up when isTrue3DRendererActive() is true (see
// client-map-3d.ts); the existing Canvas2D path in client-runtime-loop.ts is
// untouched and keeps rendering for ?renderer=2d.
//
// AETHER SENTRY LATTICE: the reach boundary reads as an active automated
// perimeter surveillance grid, not a wall or fence -- a small riveted
// brass/iron sentry pylon (spinning gyroscopic ring cradling a hovering
// aether-core orb) at every boundary-edge tile, taller/more ornate ones with
// a rotating beacon lens at corners, linked by sagging catenary energy
// tethers along straight runs with a travelling spark, and a "dead" dormant
// sentry (stopped ring, unlit core, no tether) wherever the player's own
// reach anchor there has lost power. Palette matches the game's established
// in-world aether visual language (see client-map-3d-aether-bridge-pylon-
// overlay.ts): riveted brass/iron housings, glowing cyan aether core/aura.
// Out-of-reach dimming and the dormant-frontier tile fill are unchanged
// concepts from the prior flat-stud implementation, just carried forward.

const BRASS = "#c2954a";
const IRON = "#2e2a26";
const AETHER_CORE = "#bdf3ff";
const AETHER_TETHER = "#9fe6ff";
const DEAD_METAL = "#4a4238";
const DEAD_CORE = "#5c6a6d";

const OUT_OF_REACH_TINT_COLOR = "#0a0c12";
const OUT_OF_REACH_OPACITY = 0.28;
const DORMANT_FRONTIER_TINT_COLOR = "#4a3f30";
const DORMANT_FRONTIER_OPACITY = 0.3;

const PYLON_LIFT = 0.0;
const RING_SPIN_PERIOD_MS = 2600;
const CORE_BOB_PERIOD_MS = 2200;
const CORE_BOB_AMPLITUDE = 0.02;
const BEACON_SPIN_PERIOD_MS = 3400;

// Performance guardrail: this overlay runs across every boundary tile of a
// player's whole frontier (dozens to 100+ tiles), unlike the aether-bridge-
// pylon overlay which only ever renders a handful of endpoints. Hard-cap the
// pooled instance counts so a huge frontier truncates gracefully instead of
// growing an unbounded number of meshes/draw calls, mirroring the general
// "bound expensive per-tile work" stance in docs/agents/ai-guardrails.md
// (written for AI planner CPU, same instinct applies to render cost here).
const MAX_SENTRY_PYLONS_HARD_CAP = 160;
const MAX_TETHERS_HARD_CAP = 220;
const TETHER_SEGMENTS = 6;
const TETHER_SAG = 0.05;
const TETHER_WIDTH = 0.035;
const TETHER_SPARK_PERIOD_MS = 1800;

export type ReachEdges = {
  readonly top: boolean;
  readonly right: boolean;
  readonly bottom: boolean;
  readonly left: boolean;
};

/** No edges set == not a boundary tile == nothing to draw. */
export const hasAnyEdge = (edges: ReachEdges): boolean => edges.top || edges.right || edges.bottom || edges.left;

/**
 * A boundary tile is a "corner" (taller, more ornate pylon with a rotating
 * beacon) when it has boundary edges on both axes at once -- e.g. top &&
 * right marks a turn, whereas top-only (or top && bottom, an unusual thin
 * spit of land) is a straight run. Derived purely from which of the 4 edge
 * booleans are true.
 */
export const isCornerPylon = (edges: ReachEdges): boolean => (edges.top || edges.bottom) && (edges.left || edges.right);

// Just shy of a full half-tile (0.5) so the pylon sits right on the tile
// boundary line itself without its base geometry clipping through the
// neighbouring tile's ground plane.
const PYLON_EDGE_OFFSET_AMOUNT = 0.42;

/**
 * A sentry pylon marks a boundary EDGE, not a tile center -- it should
 * stand on the line between the owned tile and its out-of-reach neighbour,
 * the way a real border post stands on the border, not in the middle of a
 * field. Pure function: sums an outward unit push toward every active edge
 * and returns the (unnormalized) offset to add to the tile-center position,
 * landing the pylon almost exactly on that edge (or, for a corner tile with
 * two active edges, on the tile's corner vertex where both edges meet).
 *
 * Reach borders never overlap between players (each tile is clipped to at
 * most one owner), so an enemy's boundary pylons can sit on the tile
 * directly across the line from yours -- each side's posts standing right
 * at their own edge is exactly what should make a contested border read as
 * two real fortifications facing off, not two rows merged into one.
 */
export const pylonEdgeOffset = (edges: ReachEdges): { readonly dx: number; readonly dz: number } => {
  let dx = 0;
  let dz = 0;
  if (edges.top) dz -= 1; // north neighbour is out of reach -> push north (-z), onto that edge
  if (edges.bottom) dz += 1;
  if (edges.left) dx -= 1; // west neighbour is out of reach -> push west (-x), onto that edge
  if (edges.right) dx += 1;
  const len = Math.hypot(dx, dz);
  if (len === 0) return { dx: 0, dz: 0 };
  return { dx: (dx / len) * PYLON_EDGE_OFFSET_AMOUNT, dz: (dz / len) * PYLON_EDGE_OFFSET_AMOUNT };
};

export type Vec3Like = { readonly x: number; readonly y: number; readonly z: number };

/**
 * Samples a point at parameter t in [0, 1] along a sagging catenary-style
 * arc between p0 and p1 -- a genuine curve (sine-weighted dip toward the
 * ground at the midpoint), not a straight rigid bar. `sag` is the maximum
 * downward dip in world units, applied at t = 0.5.
 */
export const catenaryPoint = (p0: Vec3Like, p1: Vec3Like, sag: number, t: number): Vec3Like => ({
  x: p0.x + (p1.x - p0.x) * t,
  y: p0.y + (p1.y - p0.y) * t - sag * Math.sin(Math.PI * t),
  z: p0.z + (p1.z - p0.z) * t
});

/** Loops nowMs into a [0, 1) progress fraction along a tether's travelling spark, given its period. */
export const tetherSparkT = (nowMs: number, periodMs: number): number => {
  const wrapped = nowMs % periodMs;
  return (wrapped < 0 ? wrapped + periodMs : wrapped) / periodMs;
};

/** Pure geometry helper: the 4 corners of a unit tile quad centered at (x, z). Used for the tile-fill overlays. */
export const tileQuadCorners = (
  x: number,
  z: number,
  size: number
): { x0: number; x1: number; z0: number; z1: number } => {
  const half = size / 2;
  return { x0: x - half, x1: x + half, z0: z - half, z1: z + half };
};

// --- Tile-fill overlays (out-of-reach dimming, dormant-frontier fill) -----
// Unchanged in concept from the prior implementation: flat instanced quads,
// cheap, drawn under everything else.

const VERTS_PER_TILE = 4;
const INDICES_PER_TILE = 6;

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

// --- Sentry pylons (pooled Object3D groups, mirrors the pooled-mesh pattern
// used by client-map-3d-aether-bridge-pylon-overlay.ts) -------------------

type Sentry = {
  readonly group: Group;
  readonly ringOuter: Mesh;
  readonly ringInner: Mesh;
  readonly core: Mesh;
  readonly coreMaterial: MeshBasicMaterial | null; // null for dead sentries (fixed dim tint, no owner color)
  readonly beacon: Mesh | null;
};

const makeMaterials = () => ({
  brass: new MeshStandardMaterial({ color: BRASS, metalness: 0.5, roughness: 0.42, emissive: "#6b4a16", emissiveIntensity: 0.35, flatShading: true }),
  iron: new MeshStandardMaterial({ color: IRON, metalness: 0.5, roughness: 0.62, flatShading: true }),
  core: new MeshBasicMaterial({ toneMapped: false, color: AETHER_CORE, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
  deadMetal: new MeshStandardMaterial({ color: DEAD_METAL, metalness: 0.3, roughness: 0.8, flatShading: true }),
  deadCore: new MeshBasicMaterial({ toneMapped: false, color: DEAD_CORE, transparent: true, opacity: 0.35, depthWrite: false }),
  tether: new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", vertexColors: true, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
  spark: new MeshBasicMaterial({ toneMapped: false, color: "#eafcff", transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false })
});

export type ReachOverlay3D = {
  readonly group: Group;
  readonly clear: () => void;
  /**
   * Adds a live sentry pylon for one reach-boundary tile (corner flag drives
   * the taller ornate variant). `ownerColor` tints the gyroscope core's
   * glow (and, via addTether, the tethers/sparks) so adjacent players'
   * borders stay visually distinct along a contested front; the brass/iron
   * housing stays neutral.
   */
  readonly addBoundaryTile: (
    x: number,
    z: number,
    surfaceY: number,
    size: number,
    edges: ReachEdges,
    nowMs: number,
    ownerColor: string
  ) => void;
  /** Adds a sagging energy tether with a travelling spark between two same-owner boundary-pylon positions, tinted by ownerColor. */
  readonly addTether: (
    x0: number,
    z0: number,
    surfaceY0: number,
    x1: number,
    z1: number,
    surfaceY1: number,
    nowMs: number,
    ownerColor: string
  ) => void;
  /** Adds a "dead" powered-down sentry (stopped ring, unlit core, no tether) for a dormant-frontier tile. */
  readonly addDormantFrontierTile: (x: number, z: number, surfaceY: number, size: number) => void;
  /** Dims one visible-but-unreachable neutral/enemy tile. */
  readonly addOutOfReachTile: (x: number, z: number, surfaceY: number, size: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createReachOverlay3D = (scene: Scene, maxTiles: number): ReachOverlay3D => {
  const group = new Group();
  group.name = "aether-sentry-lattice";

  const maxSentries = Math.min(maxTiles, MAX_SENTRY_PYLONS_HARD_CAP);
  const maxTethers = Math.min(maxTiles * 2, MAX_TETHERS_HARD_CAP);

  const materials = makeMaterials();

  // Shared low-poly geometry -- cheap per-instance, reused across the pool.
  const plinthGeometry = new CylinderGeometry(0.12, 0.15, 0.08, 6);
  const cornerPlinthGeometry = new CylinderGeometry(0.11, 0.15, 0.16, 6);
  const ringOuterGeometry = new TorusGeometry(0.11, 0.014, 4, 10);
  const ringInnerGeometry = new TorusGeometry(0.09, 0.012, 4, 10);
  const coreGeometry = new SphereGeometry(0.045, 7, 6);
  const beaconLensGeometry = new ConeGeometry(0.045, 0.08, 6);
  const beaconStemGeometry = new CylinderGeometry(0.02, 0.03, 0.14, 6);

  const buildSentry = (corner: boolean, dead: boolean): Sentry => {
    const sentryGroup = new Group();
    const metalMat = dead ? materials.deadMetal : materials.brass;
    // Live sentries get their own cloned core material so its color can be
    // retinted per-owner on every addBoundaryTile call (the pool item is
    // reused across owners frame to frame); dead sentries stay a fixed dim
    // tint since dormant sentries always belong to the local player.
    const coreMat = dead ? materials.deadCore : (materials.core.clone() as MeshBasicMaterial);

    const plinth = new Mesh(corner ? cornerPlinthGeometry : plinthGeometry, dead ? materials.deadMetal : materials.iron);
    plinth.position.y = corner ? 0.08 : 0.04;
    sentryGroup.add(plinth);

    const gyroPivotY = corner ? 0.2 : 0.12;
    const ringOuter = new Mesh(ringOuterGeometry, metalMat);
    ringOuter.position.y = gyroPivotY;
    sentryGroup.add(ringOuter);

    const ringInner = new Mesh(ringInnerGeometry, metalMat);
    ringInner.position.y = gyroPivotY;
    ringInner.rotation.x = Math.PI / 2;
    sentryGroup.add(ringInner);

    const core = new Mesh(coreGeometry, coreMat);
    core.position.y = gyroPivotY;
    sentryGroup.add(core);

    let beacon: Mesh | null = null;
    if (corner) {
      const stem = new Mesh(beaconStemGeometry, dead ? materials.deadMetal : materials.iron);
      stem.position.y = 0.32;
      sentryGroup.add(stem);
      beacon = new Mesh(beaconLensGeometry, coreMat);
      beacon.position.y = 0.42;
      sentryGroup.add(beacon);
    }

    sentryGroup.visible = false;
    group.add(sentryGroup);
    return { group: sentryGroup, ringOuter, ringInner, core, coreMaterial: dead ? null : coreMat, beacon };
  };

  const straightPool: Sentry[] = Array.from({ length: maxSentries }, () => buildSentry(false, false));
  const cornerPool: Sentry[] = Array.from({ length: maxSentries }, () => buildSentry(true, false));
  const deadPool: Sentry[] = Array.from({ length: maxSentries }, () => buildSentry(false, true));
  let straightCursor = 0;
  let cornerCursor = 0;
  let deadCursor = 0;

  // Tethers: a pooled ribbon geometry (TETHER_SEGMENTS quads sampled along
  // the catenary per tether) plus a pooled travelling-spark sphere per slot.
  const tetherMesh = createQuadMesh(maxTethers * TETHER_SEGMENTS, AETHER_TETHER, 0.55, 11);
  tetherMesh.material.dispose();
  tetherMesh.mesh.material = materials.tether;
  // Per-vertex colors so each tether can be tinted per-owner even though
  // all tethers share one batched geometry/mesh.
  const tetherColors = new Float32Array(maxTethers * TETHER_SEGMENTS * VERTS_PER_TILE * 3).fill(1);
  tetherMesh.geometry.setAttribute("color", new BufferAttribute(tetherColors, 3));
  const sparkGeometry = new SphereGeometry(0.03, 6, 6);
  const sparkPool: { readonly mesh: Mesh; readonly material: MeshBasicMaterial }[] = Array.from(
    { length: maxTethers },
    () => {
      const material = materials.spark.clone() as MeshBasicMaterial;
      const mesh = new Mesh(sparkGeometry, material);
      mesh.visible = false;
      group.add(mesh);
      return { mesh, material };
    }
  );
  let tetherVertCount = 0;
  let tetherIndexCount = 0;
  let tetherCursor = 0;

  group.add(tetherMesh.mesh);
  scene.add(group);

  // Fill overlays (dormant-frontier tint, out-of-reach dim).
  const dormant = createQuadMesh(maxTiles, DORMANT_FRONTIER_TINT_COLOR, DORMANT_FRONTIER_OPACITY, 7);
  const outOfReach = createQuadMesh(maxTiles, OUT_OF_REACH_TINT_COLOR, OUT_OF_REACH_OPACITY, 8);
  group.add(dormant.mesh, outOfReach.mesh);
  let dormantVertCount = 0;
  let dormantIndexCount = 0;
  let outOfReachVertCount = 0;
  let outOfReachIndexCount = 0;

  const clear = (): void => {
    straightCursor = 0;
    cornerCursor = 0;
    deadCursor = 0;
    tetherCursor = 0;
    tetherVertCount = 0;
    tetherIndexCount = 0;
    dormantVertCount = 0;
    dormantIndexCount = 0;
    outOfReachVertCount = 0;
    outOfReachIndexCount = 0;
  };

  const animateLiveSentry = (sentry: Sentry, nowMs: number, phase: number, gyroPivotY: number): void => {
    sentry.ringOuter.rotation.z = nowMs / RING_SPIN_PERIOD_MS + phase;
    sentry.ringInner.rotation.y = nowMs / (RING_SPIN_PERIOD_MS * 0.7) + phase;
    const bob = Math.sin(nowMs / CORE_BOB_PERIOD_MS + phase) * CORE_BOB_AMPLITUDE;
    sentry.core.position.y = gyroPivotY + bob;
    sentry.core.rotation.y = nowMs / 1400 + phase;
    if (sentry.beacon) sentry.beacon.rotation.y = nowMs / BEACON_SPIN_PERIOD_MS + phase;
  };

  const addBoundaryTile = (
    x: number,
    z: number,
    surfaceY: number,
    size: number,
    edges: ReachEdges,
    nowMs: number,
    ownerColor: string
  ): void => {
    if (!hasAnyEdge(edges)) return;
    const corner = isCornerPylon(edges);
    const pool = corner ? cornerPool : straightPool;
    const cursor = corner ? cornerCursor : straightCursor;
    if (cursor >= pool.length) return;
    const sentry = pool[cursor]!;
    const { dx, dz } = pylonEdgeOffset(edges);
    sentry.group.position.set(x + dx * size, surfaceY + PYLON_LIFT, z + dz * size);
    sentry.group.scale.setScalar(size);
    if (sentry.coreMaterial) sentry.coreMaterial.color = new Color(normalizeColorForThree(ownerColor));
    animateLiveSentry(sentry, nowMs, cursor * 0.7, corner ? 0.2 : 0.12);
    sentry.group.visible = true;
    if (corner) cornerCursor += 1;
    else straightCursor += 1;
  };

  const addDormantFrontierTile = (x: number, z: number, surfaceY: number, size: number): void => {
    if (deadCursor < deadPool.length) {
      const sentry = deadPool[deadCursor]!;
      sentry.group.position.set(x, surfaceY + PYLON_LIFT, z);
      sentry.group.scale.setScalar(size);
      // Gyroscope ring is stopped and the core is unlit -- no per-frame
      // rotation/bob for a dead sentry, just a fixed resting pose.
      sentry.group.visible = true;
      deadCursor += 1;
    }
    if (dormantVertCount + VERTS_PER_TILE > maxTiles * VERTS_PER_TILE) return;
    const { x0, x1, z0, z1 } = tileQuadCorners(x, z, size);
    [dormantVertCount, dormantIndexCount] = writeQuad(dormant, dormantVertCount, dormantIndexCount, x0, x1, z0, z1, surfaceY);
  };

  const addOutOfReachTile = (x: number, z: number, surfaceY: number, size: number): void => {
    if (outOfReachVertCount + VERTS_PER_TILE > maxTiles * VERTS_PER_TILE) return;
    const { x0, x1, z0, z1 } = tileQuadCorners(x, z, size);
    [outOfReachVertCount, outOfReachIndexCount] = writeQuad(outOfReach, outOfReachVertCount, outOfReachIndexCount, x0, x1, z0, z1, surfaceY);
  };

  const tetherColorTmp = new Color();

  const addTether = (
    x0: number,
    z0: number,
    surfaceY0: number,
    x1: number,
    z1: number,
    surfaceY1: number,
    nowMs: number,
    ownerColor: string
  ): void => {
    if (tetherCursor >= maxTethers) return;
    tetherColorTmp.set(normalizeColorForThree(ownerColor));
    const p0: Vec3Like = { x: x0, y: surfaceY0 + 0.14, z: z0 };
    const p1: Vec3Like = { x: x1, y: surfaceY1 + 0.14, z: z1 };
    // Thin ribbon: TETHER_SEGMENTS quads sampled along the catenary, each a
    // short strip oriented perpendicular to the tether's XZ direction.
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (TETHER_WIDTH / 2);
    const nz = (dx / len) * (TETHER_WIDTH / 2);
    for (let i = 0; i < TETHER_SEGMENTS; i += 1) {
      if (tetherVertCount + VERTS_PER_TILE > maxTethers * TETHER_SEGMENTS * VERTS_PER_TILE) break;
      const ta = i / TETHER_SEGMENTS;
      const tb = (i + 1) / TETHER_SEGMENTS;
      const a = catenaryPoint(p0, p1, TETHER_SAG, ta);
      const b = catenaryPoint(p0, p1, TETHER_SAG, tb);
      // Reuse writeQuad by treating the segment as an XZ quad at a single Y
      // (the segment's average height) -- short enough per-segment that the
      // sag still reads as a smooth curve across TETHER_SEGMENTS steps.
      const y = (a.y + b.y) / 2;
      [tetherVertCount, tetherIndexCount] = writeQuad(
        tetherMesh,
        tetherVertCount,
        tetherIndexCount,
        a.x - nx,
        a.x + nx,
        a.z - nz,
        b.z + nz,
        y
      );
      // Correct the two "far" vertices to sample b.x/b.z instead of a
      // simple axis-aligned box, so the ribbon actually follows a/b rather
      // than an axis-aligned bounding quad.
      const base = tetherVertCount - VERTS_PER_TILE;
      tetherMesh.positions[(base + 1) * 3] = b.x + nx;
      tetherMesh.positions[(base + 1) * 3 + 2] = b.z - nz;
      tetherMesh.positions[(base + 3) * 3] = b.x + nx;
      tetherMesh.positions[(base + 3) * 3 + 2] = b.z + nz;
      tetherMesh.positions[base * 3] = a.x - nx;
      tetherMesh.positions[base * 3 + 2] = a.z - nz;
      tetherMesh.positions[(base + 2) * 3] = a.x - nx;
      tetherMesh.positions[(base + 2) * 3 + 2] = a.z + nz;

      for (let v = 0; v < VERTS_PER_TILE; v += 1) {
        tetherColors[(base + v) * 3] = tetherColorTmp.r;
        tetherColors[(base + v) * 3 + 1] = tetherColorTmp.g;
        tetherColors[(base + v) * 3 + 2] = tetherColorTmp.b;
      }
    }

    const spark = sparkPool[tetherCursor];
    if (spark) {
      const t = tetherSparkT(nowMs, TETHER_SPARK_PERIOD_MS);
      const sp = catenaryPoint(p0, p1, TETHER_SAG, t);
      spark.mesh.position.set(sp.x, sp.y, sp.z);
      spark.material.color = tetherColorTmp.clone();
      spark.mesh.visible = true;
    }
    tetherCursor += 1;
  };

  const commit = (): void => {
    for (let i = straightCursor; i < straightPool.length; i += 1) straightPool[i]!.group.visible = false;
    for (let i = cornerCursor; i < cornerPool.length; i += 1) cornerPool[i]!.group.visible = false;
    for (let i = deadCursor; i < deadPool.length; i += 1) deadPool[i]!.group.visible = false;
    for (let i = tetherCursor; i < sparkPool.length; i += 1) sparkPool[i]!.mesh.visible = false;

    (tetherMesh.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (tetherMesh.geometry.getAttribute("color") as BufferAttribute).needsUpdate = true;
    (tetherMesh.geometry.getIndex() as BufferAttribute).needsUpdate = true;
    tetherMesh.geometry.setDrawRange(0, tetherIndexCount);

    (dormant.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (dormant.geometry.getIndex() as BufferAttribute).needsUpdate = true;
    dormant.geometry.setDrawRange(0, dormantIndexCount);

    (outOfReach.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (outOfReach.geometry.getIndex() as BufferAttribute).needsUpdate = true;
    outOfReach.geometry.setDrawRange(0, outOfReachIndexCount);
  };

  const dispose = (): void => {
    scene.remove(group);
    plinthGeometry.dispose();
    cornerPlinthGeometry.dispose();
    ringOuterGeometry.dispose();
    ringInnerGeometry.dispose();
    coreGeometry.dispose();
    beaconLensGeometry.dispose();
    beaconStemGeometry.dispose();
    sparkGeometry.dispose();
    tetherMesh.geometry.dispose();
    dormant.geometry.dispose();
    dormant.material.dispose();
    outOfReach.geometry.dispose();
    outOfReach.material.dispose();
    materials.brass.dispose();
    materials.iron.dispose();
    materials.core.dispose();
    materials.deadMetal.dispose();
    materials.deadCore.dispose();
    materials.tether.dispose();
    materials.spark.dispose();
    for (const sentry of [...straightPool, ...cornerPool]) sentry.coreMaterial?.dispose();
    for (const spark of sparkPool) spark.material.dispose();
  };

  return { group, clear, addBoundaryTile, addTether, addDormantFrontierTile, addOutOfReachTile, commit, dispose };
};
