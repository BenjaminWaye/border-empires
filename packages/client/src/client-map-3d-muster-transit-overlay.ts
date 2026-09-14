import { AnimationMixer, MeshStandardMaterial, Object3D, Quaternion, Scene, SkinnedMesh, Vector3, type AnimationAction } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  firstSkinnedMesh,
  loadPopupMarineTemplate,
  type PopupMarineTemplate
} from "./client-map-3d-popup-marine/popup-marine-asset.js";
import { MARINE_MODEL_SCALE } from "./client-map-3d-popup-marine/popup-marine-timeline.js";

// Muster transit overlay: a company marching hop-by-hop along the actual
// owned-territory path from a mustering flag to the enemy tile it's
// attacking, for the travel-time window between an ADVANCE/MARCH/manual
// muster attack firing and the (existing, unrelated) combat lock starting.
// Sits alongside the supply-line overlay (client-map-3d-supply-line-overlay
// .ts, the static/pulsing route line) rather than replacing it — the line
// marks the route, this renders the troops actually moving along it.
//
// The company walks the real hop path (the same tile-by-tile chain the
// server's ADVANCE/MARCH BFS or the client's dock-fair pathfinder produced —
// see runtime-muster-tick.ts/ADVANCE_MAX_RANGE_TILES for why hops, not raw
// distance, are the unit of "how far"), never a straight line cut across
// tiles as if they weren't there. Every hop gets an equal share of the
// total transit time, matching PR 1's hop-based pacing: a dock crossing is
// one hop regardless of the real distance it spans, so the company simply
// covers that hop's (possibly large) real distance in the same time as any
// other single hop — reading as a fast dash across the water rather than
// silently teleporting or, worse, stretching the whole march's timing to
// account for a distance no other hop is judged by.
//
// Renders the same skinned marine model the battle overlay uses
// (client-map-3d-popup-marine/popup-marine-overlay-fx.ts), playing its
// "PistolWalk" clip continuously rather than the combat module's Pistol*
// firing stances or its own PistolRun — a company marching to the front
// isn't sprinting or aiming yet, just walking there with its weapon
// carried. Clip time is derived from nowMs, not accumulated frame deltas,
// for the same scrub/rejoin-safe reason as the battle overlay. Formerly
// round dot instances (SphereGeometry, matching the old dot-swarm battle
// overlay's own look) — replaced by the same real 3D squads the battle
// overlay now uses.
//
// This trades InstancedMesh dot-spheres (near-free) for one skinned-mesh
// clone + AnimationMixer per soldier, so the concurrent-company cap is kept
// far below the dot version's MAX_TRANSITS: MAX_RENDERED_TRANSITS *
// SOLDIERS_PER_COMPANY marine slots exist up front (comparable to the battle
// overlay's own MAX_CONCURRENT_BATTLES * MARINES_PER_SIDE ceiling), and any
// transit beyond that cap simply isn't rendered.
const MAX_TRANSITS = 10;
const SOLDIERS_PER_COMPANY = 7;
const WALK_CLIP_NAME = "PistolWalk";

const MODEL_Y_OFFSET = 0;
const UP_AXIS = new Vector3(0, 1, 0);
// Spread the loop phase across the company so soldiers don't stride in
// lockstep — same trick as the battle overlay's per-marine phase.
const PHASE_STEP = 0.31;

// Column formation: offsets along the direction of travel (behind the lead,
// negative = further back) and across it (left/right), in world (tile) units.
const FORMATION: ReadonlyArray<{ along: number; across: number }> = [
  { along: 0, across: 0 },
  { along: -0.14, across: -0.09 },
  { along: -0.14, across: 0.09 },
  { along: -0.28, across: -0.16 },
  { along: -0.28, across: 0 },
  { along: -0.28, across: 0.16 },
  { along: -0.42, across: 0 }
];

export type MusterTransitHop = { x: number; z: number };

export type MusterTransit = {
  // The full tile-by-tile route, flag tile first and target tile last. Every
  // consecutive pair is one hop the company marches across in equal time,
  // whatever the real distance between them (see module comment).
  path: ReadonlyArray<MusterTransitHop>;
  groundY: number;
  startAt: number;
  arriveAt: number;
  ownerColor: string;
};

// Builds a real tile-by-tile route between two points by king-move stepping
// (at most 1 unit per axis per step — the same 8-directional adjacency
// runtime-muster-tick.ts's BFS hops use), so the overlay never has to fall
// back to a diagonal beeline cut across tiles the company never actually
// crossed. Capped at maxSteps as a safety net (a client-side march can't run
// the full server BFS) — past that, callers should treat the crossing as a
// single collapsed hop instead (see the dock-crossing handling in
// client-map-3d-capture-overlays.ts) rather than call this with an
// arbitrarily long span.
export const tileWalkPath = (
  fromX: number, fromZ: number, toX: number, toZ: number, maxSteps = 32
): MusterTransitHop[] => {
  const points: MusterTransitHop[] = [{ x: fromX, z: fromZ }];
  let cx = fromX, cz = fromZ, steps = 0;
  while ((cx !== toX || cz !== toZ) && steps < maxSteps) {
    cx += Math.sign(toX - cx);
    cz += Math.sign(toZ - cz);
    points.push({ x: cx, z: cz });
    steps++;
  }
  return cx === toX && cz === toZ ? points : [{ x: fromX, z: fromZ }, { x: toX, z: toZ }];
};

export type MusterTransitOverlay = {
  readonly clear: () => void;
  readonly addTransit: (transit: MusterTransit) => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

// Smoothstep-style ease so the company visibly winds up and settles instead
// of moving at constant velocity.
const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

type Soldier = {
  root: Object3D;
  material: MeshStandardMaterial;
  mixer: AnimationMixer;
  action: AnimationAction;
  phase: number;
};

// Same paint-times-tint material the battle overlay uses (see
// popup-marine-overlay-fx.ts's buildMaterial) — a separate instance per pool
// rather than a shared import so this overlay can dispose its own materials
// independently of the battle overlay's lifecycle.
const buildMaterial = (): MeshStandardMaterial =>
  new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.4, metalness: 0.4 });

export const createMusterTransitOverlay = (scene: Scene): MusterTransitOverlay => {
  let disposed = false;
  let pool: Soldier[] = [];

  const makeSoldier = (template: PopupMarineTemplate, index: number): Soldier => {
    const root = cloneSkinned(template.root) as Object3D;
    const material = buildMaterial();
    const mesh = firstSkinnedMesh(root);
    mesh.material = material;
    mesh.frustumCulled = false;
    mesh.renderOrder = 37;
    root.visible = false;
    const mixer = new AnimationMixer(root);
    const clip = template.clips.get(WALK_CLIP_NAME);
    // A marine template missing its walk clip is a broken asset, not
    // something to crash the map over — skip animating this slot; the
    // soldier just won't render (root stays hidden) rather than throwing.
    const action = clip ? mixer.clipAction(clip) : undefined;
    if (action) {
      action.play();
      action.enabled = true;
    }
    scene.add(root);
    return { root, material, mixer, action: action!, phase: (index % SOLDIERS_PER_COMPANY) * PHASE_STEP };
  };

  const disposeSoldier = (soldier: Soldier): void => {
    soldier.mixer.stopAllAction();
    soldier.mixer.uncacheRoot(soldier.root);
    scene.remove(soldier.root);
    soldier.root.traverse((child) => {
      if (child instanceof SkinnedMesh) child.geometry.dispose();
    });
    soldier.material.dispose();
  };

  loadPopupMarineTemplate()
    .then((template) => {
      if (disposed) return;
      pool = Array.from({ length: MAX_TRANSITS * SOLDIERS_PER_COMPANY }, (_, i) => makeSoldier(template, i));
    })
    .catch((err: unknown) => {
      // Nothing renders rather than crashing the whole 3D map: the pool
      // simply stays empty, so a march shows its supply line with no troops
      // instead of taking down the renderer.
      console.error("popup-marine model failed to load; muster transit troops will not render", err);
    });

  let entries: MusterTransit[] = [];
  const tmpQuat = new Quaternion();

  const clear = (): void => { entries = []; };
  const addTransit = (transit: MusterTransit): void => {
    if (entries.length >= MAX_TRANSITS || transit.path.length < 2) return;
    entries.push(transit);
  };
  const commit = (): void => {
    // Actual placement happens in tick(); commit() only exists to match the
    // clear/add/commit/tick shape every other overlay in client-map-3d.ts
    // follows (add during the rebuild pass, tick every frame).
  };

  // Resolves a fractional "hop position" (e.g. 2.35 = 35% through the third
  // hop) into a world XZ, clamping to the path's ends. Shared by the lead and
  // every trailing formation member so they all read the same route.
  const pointAtHop = (path: ReadonlyArray<MusterTransitHop>, hopPos: number): { x: number; z: number; dirX: number; dirZ: number; segIndex: number } => {
    const maxHop = path.length - 1;
    const clamped = Math.min(maxHop, Math.max(0, hopPos));
    const segIndex = Math.min(maxHop - 1, Math.floor(clamped));
    const localT = clamped - segIndex;
    const from = path[segIndex]!, to = path[segIndex + 1]!;
    const dx = to.x - from.x, dz = to.z - from.z;
    const dist = Math.hypot(dx, dz) || 1;
    return { x: from.x + dx * localT, z: from.z + dz * localT, dirX: dx / dist, dirZ: dz / dist, segIndex };
  };

  const tick = (nowMs: number): void => {
    for (const soldier of pool) soldier.root.visible = false;
    if (entries.length === 0 || pool.length === 0) return;

    let writeIdx = 0;
    for (const e of entries) {
      const totalHops = e.path.length - 1;
      const span = Math.max(1, e.arriveAt - e.startAt);
      const rawT = Math.min(1, Math.max(0, (nowMs - e.startAt) / span));
      const t = easeInOutSine(rawT);
      const hopPos = t * totalHops;

      const lead = pointAtHop(e.path, hopPos);
      const perpX = -lead.dirZ, perpZ = lead.dirX;
      const yaw = Math.atan2(lead.dirX, lead.dirZ);

      for (const member of FORMATION) {
        const soldier = pool[writeIdx];
        writeIdx++;
        if (!soldier) continue;

        // member.along is in world (tile) units; within whichever hop the
        // lead currently occupies, that converts to a fraction of *that
        // hop's* real length so a trailing member never reads as having
        // already crossed a hop the lead hasn't reached yet (clamped to the
        // current hop rather than bleeding into the previous one) — the
        // company visibly bunches up at each tile before spreading out
        // along the next heading, instead of cutting corners.
        const segIndex = lead.segIndex;
        const from = e.path[segIndex]!, to = e.path[segIndex + 1]!;
        const segDist = Math.hypot(to.x - from.x, to.z - from.z) || 1;
        const memberHopPos = Math.max(segIndex, hopPos + member.along / segDist);
        const base = pointAtHop(e.path, memberHopPos);

        const mx = base.x + perpX * member.across;
        const mz = base.z + perpZ * member.across;
        soldier.root.position.set(mx, e.groundY + MODEL_Y_OFFSET, mz);
        tmpQuat.setFromAxisAngle(UP_AXIS, yaw);
        soldier.root.quaternion.copy(tmpQuat);
        soldier.root.scale.setScalar(MARINE_MODEL_SCALE);
        soldier.material.color.set(e.ownerColor);
        soldier.root.visible = true;

        if (soldier.action) {
          const duration = soldier.action.getClip().duration;
          soldier.action.time = duration > 0 ? (nowMs * 0.001 + soldier.phase) % duration : 0;
          soldier.mixer.update(0);
        }
        soldier.root.updateMatrixWorld(true);
      }
    }
  };

  const dispose = (): void => {
    disposed = true;
    for (const soldier of pool) disposeSoldier(soldier);
    pool = [];
  };

  return { clear, addTransit, commit, tick, dispose };
};
