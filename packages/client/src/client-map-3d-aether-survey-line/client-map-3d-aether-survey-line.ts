// 3D Aether Survey Line overlay -- the empire's territorial border marker.
// It does not block movement or separate territory; it simply communicates
// "this side is ours". Visual identity: elegant brass survey pylons, an
// impossibly thin glowing aether line, frontier telegraph network.
//
// Unlike the last two rounds (a pylon/effect on every single boundary
// tile), this design places pylons only every ~10-15 tiles along the
// player's reach boundary (see client-reach-overlay.ts's
// traceReachBoundaryLoops/samplePerimeterPylons for the perimeter-walk and
// sampling logic that decides WHERE pylons go -- this module only turns
// "put a pylon here" / "connect these two pylon points" / "this tile is
// dormant-frontier" / "this tile is out-of-reach" into 3D geometry). The
// caller (client-map-3d.ts) walks the sampled points/segments once per
// reach-set change and calls addPylon/addLineSegment for each.
//
// Pylon design is deliberately a small, simplified descendant of the real
// Relay Beacon (client-map-3d-relay-beacon-overlay.ts): that beacon is four
// dark-iron lattice legs converging on a deck with a slowly-rotating brass
// heliograph mirror array (6 mirrors + 2 gears) and amber signal lamps. This
// survey pylon keeps the same materials/proportions/"small rotating array"
// idea at a fraction of the scale: a single slender post (no lattice --
// "minimal footprint"), a small geometric emitter shape at the top, ONE tiny
// rotating ring (echoing the mirror array's rotation via the same
// baseAngle + speed-constant technique as RelayBeaconOverlay.update()), and
// a subtle cyan-white glow point instead of amber lamps (aether-toned, per
// the brief -- amber is the real beacon's own separate signature).
//
// The connecting line is a genuinely thin cylinder (not a curtain plane or
// ribbon), lifted slightly off the ground, with an occasional small bright
// pulse travelling along it -- a much thinner descendant of the very first
// design round's "travelling spark".

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry
} from "three";
import { normalizeColorForThree } from "../client-three-color/client-three-color.js";

const BRASS = "#b08d55";
const IRON = "#26282e";
const AETHER_CORE = "#bdf3ff";
const AETHER_LINE = "#9fe6ff";
const DEAD_METAL = "#3a3d45";

const OUT_OF_REACH_TINT_COLOR = "#0a0c12";
const OUT_OF_REACH_OPACITY = 0.28;
const DORMANT_FRONTIER_TINT_COLOR = "#4a3f30";
const DORMANT_FRONTIER_OPACITY = 0.3;

const PYLON_LIFT = 0.0;
// Same technique family as RelayBeaconOverlay's ARRAY_SPEED: a base angle
// captured once per instance plus a per-frame nowMs * speed term, so the
// single small ring spins continuously without any stored delta-time state.
const RING_SPIN_SPEED = 0.0009;
const CORE_PULSE_PERIOD_MS = 2000;
const CORE_PULSE_AMPLITUDE = 0.15;

// Pylons are sparse by construction (one per ~10-15 boundary tiles instead
// of one per boundary tile), so a much smaller cap than the old per-tile
// curtain overlay comfortably covers even a large frontier while still
// truncating gracefully rather than growing unbounded draw calls.
const MAX_PYLONS_HARD_CAP = 96;
const MAX_SEGMENTS_HARD_CAP = 96;

// Pylon scale: the whole post/ring/emitter/core assembly at 1/4 its
// original size, so the ring sits low enough for the connecting line
// (LINE_LIFT, derived below) to pass right through its loop rather than
// floating well below a much taller post.
const PYLON_SCALE = 0.25;
const POST_HEIGHT = 0.5 * PYLON_SCALE;
const POST_BASE_LIFT = 0.045 * PYLON_SCALE;
// Where the emitter/ring/core sit -- and, matched exactly, where the
// connecting line sits too, so it visibly threads through the ring loop.
const RING_HEIGHT = POST_HEIGHT + POST_BASE_LIFT;
const LINE_LIFT = RING_HEIGHT;
// Deliberately much thinner than the pylon post (postGeometry above) so it
// still reads as "hair-thin" per the brief, but large enough for its
// per-owner glow color to actually be visible at normal camera distance
// instead of anti-aliasing away to a pale gray thread.
const LINE_RADIUS = 0.026;
const PULSE_PERIOD_MS = 2600;
const PULSE_RADIUS = 0.045;

// --- Tile-fill overlays (out-of-reach dimming, dormant-frontier fill) -----
// Unchanged in concept from prior rounds: flat instanced quads, cheap,
// drawn under everything else.

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

/** Pure geometry helper: the 4 corners of a unit tile quad centered at (x, z). */
export const tileQuadCorners = (
  x: number,
  z: number,
  size: number
): { x0: number; x1: number; z0: number; z1: number } => {
  const half = size / 2;
  return { x0: x - half, x1: x + half, z0: z - half, z1: z + half };
};

/** Loops nowMs into a [0, 1) progress fraction for a travelling pulse, given its period. */
export const pulseT = (nowMs: number, periodMs: number = PULSE_PERIOD_MS): number => {
  const wrapped = nowMs % periodMs;
  return (wrapped < 0 ? wrapped + periodMs : wrapped) / periodMs;
};

/** Linear interpolation of a point at parameter t in [0, 1] between p0 and p1 -- a straight chord, per the brief. */
export type Vec3Like = { readonly x: number; readonly y: number; readonly z: number };
export const lerpPoint = (p0: Vec3Like, p1: Vec3Like, t: number): Vec3Like => ({
  x: p0.x + (p1.x - p0.x) * t,
  y: p0.y + (p1.y - p0.y) * t,
  z: p0.z + (p1.z - p0.z) * t
});

// --- Pylons (pooled Object3D groups) -------------------------------------

type Pylon = {
  readonly group: Group;
  readonly ring: Mesh | null;
  readonly core: Mesh | null;
  readonly coreMaterial: MeshBasicMaterial | null;
};

const makeMaterials = () => ({
  // Smooth shading (not flat) so a low-poly metal surface still reads as a
  // curved, polished object catching light gradients instead of a faceted
  // plastic placeholder -- the single biggest lever for a small object like
  // this to read as a real finished asset rather than a primitive stand-in.
  brass: new MeshStandardMaterial({ color: BRASS, metalness: 0.75, roughness: 0.28 }),
  iron: new MeshStandardMaterial({ color: IRON, metalness: 0.6, roughness: 0.45 }),
  core: new MeshBasicMaterial({ toneMapped: false, color: AETHER_CORE, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
  deadMetal: new MeshStandardMaterial({ color: DEAD_METAL, metalness: 0.3, roughness: 0.85, flatShading: true }),
  line: new MeshBasicMaterial({ toneMapped: false, color: AETHER_LINE, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }),
  pulse: new MeshBasicMaterial({ toneMapped: false, color: AETHER_CORE, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false })
});

export type ReachOverlay3D = {
  readonly group: Group;
  readonly clear: () => void;
  /** Adds a live survey pylon at a sampled perimeter point. `ownerColor` tints the glow point so adjacent empires' lines stay distinguishable. */
  readonly addPylon: (x: number, z: number, surfaceY: number, size: number, nowMs: number, ownerColor: string) => void;
  /** Adds the thin glowing chord + travelling pulse between two consecutive pylon points. */
  readonly addLineSegment: (
    x0: number,
    z0: number,
    surfaceY0: number,
    x1: number,
    z1: number,
    surfaceY1: number,
    nowMs: number,
    ownerColor: string
  ) => void;
  /** Adds a "this used to be surveyed, now abandoned" dim/dark pylon stub -- no glow, no ring, no line. */
  readonly addDormantFrontierTile: (x: number, z: number, surfaceY: number, size: number) => void;
  /** Dims one visible-but-unreachable neutral/enemy tile. */
  readonly addOutOfReachTile: (x: number, z: number, surfaceY: number, size: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createReachOverlay3D = (scene: Scene, maxTiles: number): ReachOverlay3D => {
  const group = new Group();
  group.name = "aether-survey-line";

  const maxPylons = Math.min(Math.max(1, Math.ceil(maxTiles / 8)), MAX_PYLONS_HARD_CAP);
  const maxSegments = Math.min(Math.max(1, Math.ceil(maxTiles / 8)), MAX_SEGMENTS_HARD_CAP);

  const materials = makeMaterials();

  // Shared low-poly geometry -- a single slender post, a small geometric
  // emitter (octahedron), one tiny ring, one glow point. Sized to read
  // clearly at normal play-camera distance (comparable order of magnitude
  // to this game's other small structures -- e.g. the fort's 0.08-thick
  // walls/0.16 towers -- just slimmer in proportion, not sub-pixel thin;
  // "minimal footprint" describes the pylon's silhouette relative to a
  // fort/wall, not its literal on-screen size). Only the connecting LINE
  // (see LINE_RADIUS below) is the deliberately hair-thin element.
  // Higher segment counts than the first pass (was 5-6) so smooth shading
  // (above) actually has enough geometry to interpolate across -- a smooth
  // material on a 6-sided cylinder still reads faceted from any distance
  // that resolves individual faces.
  const baseGeometry = new CylinderGeometry(0.1 * PYLON_SCALE, 0.115 * PYLON_SCALE, 0.03 * PYLON_SCALE, 14);
  const footGeometry = new CylinderGeometry(0.075 * PYLON_SCALE, 0.09 * PYLON_SCALE, 0.06 * PYLON_SCALE, 12);
  const postGeometry = new CylinderGeometry(0.032 * PYLON_SCALE, 0.05 * PYLON_SCALE, 0.55 * PYLON_SCALE, 12);
  // A brass collar band partway up the post -- a real design detail (echoes
  // the beacon's banded brass feed pipes) rather than a bare uniform shaft.
  const collarGeometry = new CylinderGeometry(0.058 * PYLON_SCALE, 0.058 * PYLON_SCALE, 0.03 * PYLON_SCALE, 12);
  const emitterGeometry = new OctahedronGeometry(0.075 * PYLON_SCALE, 0);
  const ringGeometry = new TorusGeometry(0.11 * PYLON_SCALE, 0.014 * PYLON_SCALE, 8, 24);
  const coreGeometry = new SphereGeometry(0.045 * PYLON_SCALE, 12, 10);
  const deadPostGeometry = new CylinderGeometry(0.032 * PYLON_SCALE, 0.05 * PYLON_SCALE, 0.32 * PYLON_SCALE, 12);

  const buildPylon = (dead: boolean): Pylon => {
    const pylonGroup = new Group();
    if (dead) {
      // Dormant treatment: a single dim/dark stub -- no emitter, no ring,
      // no core glow, per the brief's "powered down, abandoned survey post".
      const base = new Mesh(baseGeometry, materials.deadMetal);
      base.position.y = 0.015 * PYLON_SCALE;
      pylonGroup.add(base);
      const foot = new Mesh(footGeometry, materials.deadMetal);
      foot.position.y = 0.022 * PYLON_SCALE;
      pylonGroup.add(foot);
      const post = new Mesh(deadPostGeometry, materials.deadMetal);
      post.position.y = 0.16 * PYLON_SCALE;
      pylonGroup.add(post);
      pylonGroup.visible = false;
      group.add(pylonGroup);
      return { group: pylonGroup, ring: null, core: null, coreMaterial: null };
    }

    // Wide, flat iron base plate the whole post stands on -- gives the
    // pylon a grounded, "actually installed" silhouette instead of a stick
    // planted directly in the terrain.
    const base = new Mesh(baseGeometry, materials.iron);
    base.position.y = 0.015 * PYLON_SCALE;
    pylonGroup.add(base);

    const foot = new Mesh(footGeometry, materials.iron);
    foot.position.y = 0.022 * PYLON_SCALE;
    pylonGroup.add(foot);

    const post = new Mesh(postGeometry, materials.brass);
    post.position.y = POST_HEIGHT / 2 + POST_BASE_LIFT;
    pylonGroup.add(post);

    // A collar band partway up the shaft -- breaks up the plain cylinder
    // silhouette with a real design detail instead of a bare uniform post.
    const collar = new Mesh(collarGeometry, materials.iron);
    collar.position.y = POST_BASE_LIFT + POST_HEIGHT * 0.62;
    pylonGroup.add(collar);

    // RING_HEIGHT (module-level) is where the emitter/ring/core sit, and
    // exactly where LINE_LIFT places the connecting line too -- so the
    // line visibly threads through the ring loop instead of floating
    // below or above it.
    const emitter = new Mesh(emitterGeometry, materials.brass);
    emitter.position.y = RING_HEIGHT;
    pylonGroup.add(emitter);

    const ring = new Mesh(ringGeometry, materials.iron);
    ring.position.y = RING_HEIGHT;
    ring.rotation.x = Math.PI / 2;
    pylonGroup.add(ring);

    // Cloned so the glow color can be retinted per-owner on every
    // addPylon call (pool items are reused across owners frame to frame).
    const coreMat = materials.core.clone() as MeshBasicMaterial;
    const core = new Mesh(coreGeometry, coreMat);
    core.position.y = RING_HEIGHT;
    pylonGroup.add(core);

    pylonGroup.visible = false;
    group.add(pylonGroup);
    return { group: pylonGroup, ring, core, coreMaterial: coreMat };
  };

  const livePool: Pylon[] = Array.from({ length: maxPylons }, () => buildPylon(false));
  const deadPool: Pylon[] = Array.from({ length: maxPylons }, () => buildPylon(true));
  let liveCursor = 0;
  let deadCursor = 0;

  // Line segments: a thin cylinder per slot (oriented between two points)
  // plus a small travelling-pulse sphere, each with its own cloned
  // material so it can be tinted per-owner.
  const lineGeometry = new CylinderGeometry(LINE_RADIUS, LINE_RADIUS, 1, 5);
  const pulseGeometry = new SphereGeometry(PULSE_RADIUS, 6, 5);
  const linePool: { readonly mesh: Mesh; readonly material: MeshBasicMaterial; readonly pulse: Mesh; readonly pulseMaterial: MeshBasicMaterial }[] =
    Array.from({ length: maxSegments }, () => {
      const material = materials.line.clone() as MeshBasicMaterial;
      const mesh = new Mesh(lineGeometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 11;
      const pulseMaterial = materials.pulse.clone() as MeshBasicMaterial;
      const pulse = new Mesh(pulseGeometry, pulseMaterial);
      pulse.visible = false;
      pulse.frustumCulled = false;
      pulse.renderOrder = 12;
      group.add(mesh, pulse);
      return { mesh, material, pulse, pulseMaterial };
    });
  let segmentCursor = 0;

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
    liveCursor = 0;
    deadCursor = 0;
    segmentCursor = 0;
    dormantVertCount = 0;
    dormantIndexCount = 0;
    outOfReachVertCount = 0;
    outOfReachIndexCount = 0;
  };

  const addPylon = (x: number, z: number, surfaceY: number, size: number, nowMs: number, ownerColor: string): void => {
    if (liveCursor >= livePool.length) return;
    const pylon = livePool[liveCursor]!;
    pylon.group.position.set(x, surfaceY + PYLON_LIFT, z);
    pylon.group.scale.setScalar(size);
    const phase = liveCursor * 0.9;
    if (pylon.ring) pylon.ring.rotation.y = nowMs * RING_SPIN_SPEED + phase;
    const pulse = Math.sin(nowMs / CORE_PULSE_PERIOD_MS + phase) * 0.5 + 0.5;
    if (pylon.coreMaterial) {
      pylon.coreMaterial.color = new Color(normalizeColorForThree(ownerColor));
      pylon.coreMaterial.opacity = 0.6 + pulse * CORE_PULSE_AMPLITUDE;
    }
    if (pylon.core) pylon.core.scale.setScalar(1 + pulse * 0.1);
    pylon.group.visible = true;
    liveCursor += 1;
  };

  const addDormantFrontierTile = (x: number, z: number, surfaceY: number, size: number): void => {
    if (deadCursor < deadPool.length) {
      const pylon = deadPool[deadCursor]!;
      pylon.group.position.set(x, surfaceY + PYLON_LIFT, z);
      pylon.group.scale.setScalar(size);
      pylon.group.visible = true;
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

  const addLineSegment = (
    x0: number,
    z0: number,
    surfaceY0: number,
    x1: number,
    z1: number,
    surfaceY1: number,
    nowMs: number,
    ownerColor: string
  ): void => {
    if (segmentCursor >= linePool.length) return;
    const slot = linePool[segmentCursor]!;
    const p0: Vec3Like = { x: x0, y: surfaceY0 + LINE_LIFT, z: z0 };
    const p1: Vec3Like = { x: x1, y: surfaceY1 + LINE_LIFT, z: z1 };
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dz = p1.z - p0.z;
    const length = Math.hypot(dx, dy, dz) || 0.0001;
    const mid = lerpPoint(p0, p1, 0.5);
    slot.mesh.position.set(mid.x, mid.y, mid.z);
    // Orient the cylinder's local +Y axis along the chord direction.
    slot.mesh.up.set(0, 0, 1);
    slot.mesh.lookAt(p1.x, p1.y, p1.z);
    slot.mesh.rotateX(Math.PI / 2);
    slot.mesh.scale.set(1, length, 1);
    const normalizedColor = normalizeColorForThree(ownerColor);
    slot.material.color = new Color(normalizedColor);
    slot.mesh.visible = true;

    // Occasional tiny pulse travelling from p0 to p1 along the line.
    const t = pulseT(nowMs + segmentCursor * (PULSE_PERIOD_MS / 3));
    const pulsePoint = lerpPoint(p0, p1, t);
    slot.pulse.position.set(pulsePoint.x, pulsePoint.y, pulsePoint.z);
    slot.pulseMaterial.color = new Color(normalizedColor);
    slot.pulse.visible = true;

    segmentCursor += 1;
  };

  const commit = (): void => {
    for (let i = liveCursor; i < livePool.length; i += 1) livePool[i]!.group.visible = false;
    for (let i = deadCursor; i < deadPool.length; i += 1) deadPool[i]!.group.visible = false;
    for (let i = segmentCursor; i < linePool.length; i += 1) {
      linePool[i]!.mesh.visible = false;
      linePool[i]!.pulse.visible = false;
    }

    (dormant.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (dormant.geometry.getIndex() as BufferAttribute).needsUpdate = true;
    dormant.geometry.setDrawRange(0, dormantIndexCount);

    (outOfReach.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (outOfReach.geometry.getIndex() as BufferAttribute).needsUpdate = true;
    outOfReach.geometry.setDrawRange(0, outOfReachIndexCount);
  };

  const dispose = (): void => {
    scene.remove(group);
    baseGeometry.dispose();
    footGeometry.dispose();
    postGeometry.dispose();
    collarGeometry.dispose();
    emitterGeometry.dispose();
    ringGeometry.dispose();
    coreGeometry.dispose();
    deadPostGeometry.dispose();
    lineGeometry.dispose();
    pulseGeometry.dispose();
    dormant.geometry.dispose();
    dormant.material.dispose();
    outOfReach.geometry.dispose();
    outOfReach.material.dispose();
    materials.brass.dispose();
    materials.iron.dispose();
    materials.core.dispose();
    materials.deadMetal.dispose();
    materials.line.dispose();
    materials.pulse.dispose();
    for (const pylon of livePool) pylon.coreMaterial?.dispose();
    for (const slot of linePool) {
      slot.material.dispose();
      slot.pulseMaterial.dispose();
    }
  };

  return { group, clear, addPylon, addLineSegment, addDormantFrontierTile, addOutOfReachTile, commit, dispose };
};
