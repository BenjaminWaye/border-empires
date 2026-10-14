// 3D Aether Survey Line overlay -- the empire's territorial border marker.
// It does not block movement or separate territory; it simply communicates
// "this side is ours". Visual identity: elegant brass survey pylons, an
// impossibly thin glowing aether line, frontier telegraph network.
//
// Unlike the last two rounds (a pylon/effect on every single boundary
// tile), this design SAMPLES the boundary rather than marking every tile
// (see client-reach-overlay.ts's traceReachBoundaryEdgeLoops/
// samplePerimeterPylons for the sampling logic that decides WHERE pylons
// go -- and MAX_PYLONS_HARD_CAP below for why "sparse" isn't the whole
// story -- this module only turns those into 3D geometry). The caller
// (client-map-3d.ts) walks the sampled points/segments per reach-set
// change and calls addPylon/addLineSegment for each.
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
// a subtle cyan-white glow point instead of amber lamps (aether-toned,
// per the brief -- amber is the real beacon's own separate signature).
// The connecting line is a genuinely thin cylinder (not a curtain plane or
// ribbon), lifted slightly off the ground, with an occasional small bright
// pulse travelling along it -- a much thinner descendant of the very first
// design round's "travelling spark".

import {
  AdditiveBlending,
  BufferAttribute,
  CylinderGeometry,
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
import { createPoolDropCounter } from "../client-map-3d-pool-drop-counter/client-map-3d-pool-drop-counter.js";
import { createQuadMesh, tileQuadCorners, VERTS_PER_TILE, writeQuad, type Vec3Like } from "../client-map-3d-quad-fill/client-map-3d-quad-fill.js";
import { createSurveyLineSegmentPool } from "./client-map-3d-aether-survey-line-segments.js";
import { createIncursionOverlay3D, type IncursionOverlay3D } from "../client-map-3d-incursion-overlay/client-map-3d-incursion-overlay.js";
import { reachEmphasisStyle, type ReachBorderEmphasis } from "../client-reach-border-emphasis/client-reach-border-emphasis.js";

const BRASS = "#b08d55";
const IRON = "#26282e";
const AETHER_CORE = "#bdf3ff";
const DEAD_METAL = "#3a3d45";

const DORMANT_FRONTIER_TINT_COLOR = "#4a3f30";
const DORMANT_FRONTIER_OPACITY = 0.3;

const PYLON_LIFT = 0.0;
// Same technique family as RelayBeaconOverlay's ARRAY_SPEED: a base angle
// captured once per instance plus a per-frame nowMs * speed term, so the
// single small ring spins continuously without any stored delta-time state.
const RING_SPIN_SPEED = 0.0009;
const CORE_PULSE_PERIOD_MS = 2000;
const CORE_PULSE_AMPLITUDE = 0.15;

// Pylons are NOT sparse the way the module header above claims -- every
// boundary corner is mandatory (samplePerimeterPylons), so a modest empire
// exceeded the old 96 cap on its own, silently dropping excess in list
// order. The caller now culls to the on-screen window and, over budget,
// keeps geometry nearest the camera first (client-reach-overlay-window-
// cull.ts) -- distance-based, not owner/list-order. Segments get a much
// higher cap: the line IS the border (a dropped one is a visible gap) and
// costs one mesh against a pylon's ~6-mesh Group, so this covers a
// crowded viewport without the pylon pool's draw-call cost.
export const MAX_PYLONS_HARD_CAP = 240;
export const MAX_SEGMENTS_HARD_CAP = 900;

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
// How far a retiring pylon sinks below (and an arriving one rises from)
// ground level -- its full standing height, so it visibly disappears into
// / emerges from the terrain rather than just fading in place. Exported so
// line-segment endpoints can apply the exact same offset their pylon does,
// keeping the beam's retracting/extending endpoint glued to the physical
// post instead of drifting apart from it.
export const PYLON_SINK_DEPTH = RING_HEIGHT;

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
  deadMetal: new MeshStandardMaterial({ color: DEAD_METAL, metalness: 0.3, roughness: 0.85, flatShading: true })
});

export type ReachOverlay3D = {
  readonly group: Group;
  /** Resets the live pylon/line pool -- call every frame, right before re-adding this frame's pylons/segments, so the border-transition animation stays smooth regardless of camera movement. */
  readonly clearPylons: () => void;
  /** Resets the dead-pylon/dormant-frontier tile overlays -- these don't animate, so only call this from the throttled camera-move/reach-change rebuild, not every frame. */
  readonly clearTileOverlays: () => void;
  /**
   * Adds a live survey pylon at a sampled perimeter point. `ownerColor`
   * tints the glow point so adjacent empires' lines stay distinguishable.
   * `riseFraction` (default 1 = fully risen) and `laserFraction` (default
   * 1 = full glow) drive the border-expansion transition: a retiring
   * pylon fades its laser out (laserFraction 1→0) then sinks into the
   * ground (riseFraction 1→0); an arriving one rises first (riseFraction
   * 0→1) then powers its laser on (laserFraction 0→1). See
   * client-reach-overlay-transitions.ts for the timing/easing that
   * produces these two fractions per frame. `emphasis` (default "rival")
   * makes the viewer's own pylons bigger/brighter than everyone else's --
   * see client-reach-border-emphasis.ts.
   */
  readonly addPylon: (
    x: number,
    z: number,
    surfaceY: number,
    size: number,
    nowMs: number,
    ownerColor: string,
    riseFraction?: number,
    laserFraction?: number,
    emphasis?: ReachBorderEmphasis
  ) => void;
  /**
   * Adds the thin glowing chord between two consecutive pylon points.
   * `riseFraction0`/`riseFraction1` sink each endpoint by the same amount
   * its own pylon does, so the beam stays glued to the physical post
   * during a transition instead of drifting apart from it. `laserFraction`
   * dims the whole chord (the weaker of its two endpoints' laser state,
   * computed by the caller) rather than per-endpoint, since a half-lit
   * beam doesn't read as a coherent lighting state. `emphasis` picks the
   * own (thick, white-hot core, pulsing) vs rival (thin, dim) line style.
   */
  readonly addLineSegment: (
    x0: number,
    z0: number,
    surfaceY0: number,
    x1: number,
    z1: number,
    surfaceY1: number,
    ownerColor: string,
    laserFraction?: number,
    riseFraction0?: number,
    riseFraction1?: number,
    emphasis?: ReachBorderEmphasis
  ) => void;
  /** Adds a "this used to be surveyed, now abandoned" dim/dark pylon stub -- no glow, no ring, no line. */
  readonly addDormantFrontierTile: (x: number, z: number, surfaceY: number, size: number) => void;
  /** Hatches a rival-held tile inside the viewer's reach and outlines its pocket edges -- see client-reach-incursion.ts. */
  readonly addIncursionTile: IncursionOverlay3D["addTile"];
  /** Uploads this frame's live pylon/line pool. Call every frame, paired with clearPylons. */
  readonly commitPylons: () => void;
  /** Uploads the dead-pylon/dormant-frontier tile overlays. Call only from the throttled rebuild, paired with clearTileOverlays. */
  readonly commitTileOverlays: () => void;
  /** Advances ring spin / core pulse animation. Call every frame (unconditionally, not just when the visible-tile pass rebuilds). */
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
  /** Pool-exhaustion drop counters since the last clearPylons -- see client-map-3d-pool-drop-counter.ts. */
  readonly droppedPylonCount: () => number;
  readonly droppedSegmentCount: () => number;
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
  // Parallel to livePool -- each live pylon's current laserFraction, so the
  // per-frame ring-spin/core-pulse update() (which recomputes core opacity
  // from scratch every call) can multiply the pulse by it instead of
  // clobbering whatever addPylon just set for a transitioning pylon.
  const liveLaserFractions: number[] = new Array(maxPylons).fill(1);
  const liveOpacityMults: number[] = new Array(maxPylons).fill(1); // per-pylon emphasis opacity, re-applied by update() like liveLaserFractions
  let liveCursor = 0;
  // See client-map-3d-pool-drop-counter.ts's doc comment for why this exists.
  const pylonDrops = createPoolDropCounter();
  let deadCursor = 0;

  // Connecting lines live in their own pool module (own vs rival styling) -- see client-map-3d-aether-survey-line-segments.ts.
  const segments = createSurveyLineSegmentPool(group, maxSegments);

  scene.add(group);

  // Fill overlay (dormant-frontier tint).
  const dormant = createQuadMesh(maxTiles, DORMANT_FRONTIER_TINT_COLOR, DORMANT_FRONTIER_OPACITY, 7);
  group.add(dormant.mesh);
  let dormantVertCount = 0;
  let dormantIndexCount = 0;
  const incursion = createIncursionOverlay3D(group, maxTiles);

  // Split in two so the live pylon/line pool -- which needs a full
  // clear+re-add+commit every frame to animate the rise/sink/laser
  // transition smoothly regardless of camera movement -- doesn't force the
  // dead-pylon/dormant tile overlays (cheap to compute but
  // pointless to redo every frame; they don't animate at all) to redo their
  // own work at the same cadence. client-map-3d.ts calls clearPylons/
  // commitPylons unconditionally every frame, and clearTileOverlays/
  // commitTileOverlays only from the throttled camera-move/reach-change
  // rebuild, same as before this split existed.
  const clearPylons = (): void => {
    liveCursor = 0;
    pylonDrops.reset();
    segments.clear();
  };

  const clearTileOverlays = (): void => {
    deadCursor = 0;
    dormantVertCount = 0;
    dormantIndexCount = 0;
    incursion.clear();
  };

  const addPylon = (
    x: number,
    z: number,
    surfaceY: number,
    size: number,
    nowMs: number,
    ownerColor: string,
    riseFraction = 1,
    laserFraction = 1,
    emphasis: ReachBorderEmphasis = "rival"
  ): void => {
    if (liveCursor >= livePool.length) { pylonDrops.recordDrop(); return; }
    const pylon = livePool[liveCursor]!;
    const style = reachEmphasisStyle(emphasis);
    const sunkOffset = (1 - riseFraction) * PYLON_SINK_DEPTH * style.pylonScale;
    pylon.group.position.set(x, surfaceY + PYLON_LIFT - sunkOffset, z);
    pylon.group.scale.setScalar(size * style.pylonScale);
    const phase = liveCursor * 0.9;
    if (pylon.ring) pylon.ring.rotation.y = nowMs * RING_SPIN_SPEED + phase;
    const pulse = Math.sin(nowMs / CORE_PULSE_PERIOD_MS + phase) * 0.5 + 0.5;
    if (pylon.coreMaterial) {
      pylon.coreMaterial.color.set(normalizeColorForThree(ownerColor));
      pylon.coreMaterial.opacity = (0.6 + pulse * CORE_PULSE_AMPLITUDE) * laserFraction * style.opacityMult;
    }
    if (pylon.core) pylon.core.scale.setScalar(1 + pulse * 0.1);
    pylon.group.visible = true;
    liveLaserFractions[liveCursor] = laserFraction;
    liveOpacityMults[liveCursor] = style.opacityMult;
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

  let lastNowMs = 0; // addLineSegment has no nowMs param; the own-line pulse phase is refreshed by update() every frame anyway
  const addLineSegment = (
    x0: number,
    z0: number,
    surfaceY0: number,
    x1: number,
    z1: number,
    surfaceY1: number,
    ownerColor: string,
    laserFraction = 1,
    riseFraction0 = 1,
    riseFraction1 = 1,
    emphasis: ReachBorderEmphasis = "rival"
  ): void => {
    const { pylonScale } = reachEmphasisStyle(emphasis);
    const lineLift = LINE_LIFT * pylonScale; // threads the (scaled) pylon ring
    const sinkDepth = PYLON_SINK_DEPTH * pylonScale;
    const p0: Vec3Like = { x: x0, y: surfaceY0 + lineLift - (1 - riseFraction0) * sinkDepth, z: z0 };
    const p1: Vec3Like = { x: x1, y: surfaceY1 + lineLift - (1 - riseFraction1) * sinkDepth, z: z1 };
    segments.add(p0, p1, ownerColor, laserFraction, emphasis, lastNowMs);
  };

  // Animates rotation/core-pulse state on already-placed pylons every
  // frame, independent of rebuildVisibleTerrain()'s camera-move/reach-
  // change throttle -- addPylon/addLineSegment only run when that rebuild
  // fires, so without this the ring/core only ever advanced when the
  // camera moved. Matches the same per-frame `update()` pattern every other
  // animated overlay in client-map-3d.ts already uses
  // (relayBeaconOverlay.update(nowMs), watchtowerOverlay.update(nowMs), ...).
  // Positions/visibility/ownerColor are untouched here -- those only change
  // when the underlying reach data changes, which addPylon/addLineSegment
  // already handle. The only animated line state is the viewer's own
  // border breathing pulse, which the segment pool re-applies itself.
  const update = (nowMs: number): void => {
    for (let i = 0; i < liveCursor; i += 1) {
      const pylon = livePool[i]!;
      const phase = i * 0.9;
      if (pylon.ring) pylon.ring.rotation.y = nowMs * RING_SPIN_SPEED + phase;
      const pulse = Math.sin(nowMs / CORE_PULSE_PERIOD_MS + phase) * 0.5 + 0.5;
      if (pylon.coreMaterial) pylon.coreMaterial.opacity = (0.6 + pulse * CORE_PULSE_AMPLITUDE) * liveLaserFractions[i]! * liveOpacityMults[i]!;
      if (pylon.core) pylon.core.scale.setScalar(1 + pulse * 0.1);
    }
    lastNowMs = nowMs;
    segments.update(nowMs);
  };

  const commitPylons = (): void => {
    for (let i = liveCursor; i < livePool.length; i += 1) livePool[i]!.group.visible = false;
    segments.commit();
  };

  const commitTileOverlays = (): void => {
    for (let i = deadCursor; i < deadPool.length; i += 1) deadPool[i]!.group.visible = false;

    // Ranged upload: these buffers are sized for maxTiles (worst case),
    // but only *VertCount/*IndexCount of each was written this rebuild.
    // An unranged needsUpdate reuploads the whole preallocated buffer via
    // bufferSubData every rebuild — same cost pattern fixed elsewhere
    // (client-map-3d-hills.ts, client-map-3d-ownership-overlay.ts).
    const dormantPos = dormant.geometry.getAttribute("position") as BufferAttribute;
    const dormantIndex = dormant.geometry.getIndex() as BufferAttribute;
    dormantPos.clearUpdateRanges();
    dormantPos.addUpdateRange(0, dormantVertCount * 3);
    dormantPos.needsUpdate = true;
    dormantIndex.clearUpdateRanges();
    dormantIndex.addUpdateRange(0, dormantIndexCount);
    dormantIndex.needsUpdate = true;
    dormant.geometry.setDrawRange(0, dormantIndexCount);
    incursion.commit();
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
    dormant.geometry.dispose();
    dormant.material.dispose();
    materials.brass.dispose();
    materials.iron.dispose();
    materials.core.dispose();
    materials.deadMetal.dispose();
    for (const pylon of livePool) pylon.coreMaterial?.dispose();
    segments.dispose();
    incursion.dispose();
  };

  return {
    group,
    clearPylons,
    droppedPylonCount: () => pylonDrops.count(),
    droppedSegmentCount: () => segments.droppedCount(),
    clearTileOverlays,
    addPylon,
    addLineSegment,
    addDormantFrontierTile,
    addIncursionTile: incursion.addTile,
    commitPylons,
    commitTileOverlays,
    update,
    dispose
  };
};
