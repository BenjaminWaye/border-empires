import { Quaternion, Scene, Vector3, type Texture } from "three";
import { createMarinePools } from "./client-map-3d-popup-marine/popup-marine-pools.js";
import { playMarineStance } from "./client-map-3d-popup-marine/popup-marine-slot.js";
import type { SquadGear } from "./client-map-3d-popup-marine/popup-marine-gear.js";
import { squadUnitsFor, UNIT_PROFILES, type MarineUnitKind } from "./client-map-3d-popup-marine/popup-marine-units.js";
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
// Renders the same mixed company the battle overlay fields
// (client-map-3d-popup-marine/popup-marine-units.ts: infantry plus each owned
// weapons factory's specialists -- titanium war-walkers, Umbrite heavy
// troopers), drawn from the same per-model slot pools
// (popup-marine-pools.ts), each playing its own model's "PistolWalk" clip
// continuously rather than the combat module's Pistol*
// firing stances or its own PistolRun — a company marching to the front
// isn't sprinting or aiming yet, just walking there with its weapon
// carried. Clip time is derived from nowMs, not accumulated frame deltas,
// for the same scrub/rejoin-safe reason as the battle overlay. Formerly
// round dot instances (SphereGeometry, matching the old dot-swarm battle
// overlay's own look) — replaced by the same real 3D squads the battle
// overlay now uses.
//
// The big walkers take the column's head and tail (FORMATION's two
// centre-line positions with the most room around them), so they never
// tread on the infantry beside them.
//
// This trades InstancedMesh dot-spheres (near-free) for one skinned-mesh
// clone + AnimationMixer per soldier, so the concurrent-company cap is kept
// far below the dot version's MAX_TRANSITS: MAX_RENDERED_TRANSITS *
// SOLDIERS_PER_COMPANY marine slots exist up front (comparable to the battle
// overlay's own MAX_CONCURRENT_BATTLES * MARINES_PER_SIDE ceiling), and any
// transit beyond that cap simply isn't rendered.
const MAX_TRANSITS = 10;
const SOLDIERS_PER_COMPANY = 7;

const MODEL_Y_OFFSET = 0;
const UP_AXIS = new Vector3(0, 1, 0);

// Column formation: offsets along the direction of travel (behind the lead,
// negative = further back) and across it (left/right), in world (tile) units.
// Entries 0 (the lead) and 6 (the tail) are the centre-line positions the
// big units take (see companyFormation).
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
  // When set, the company doesn't vanish on arrival: it stands at ease
  // (PistolIdle) on the final path point until this timestamp — used to keep
  // troops on the target tile for the length of its frontier-claim timer.
  standUntil?: number;
  ownerColor: string;
  /** The marching empire's war industry: which specialists march with it. */
  gear?: SquadGear;
  /** Stable per-company seed (e.g. the flag tile's), so the company keeps
   * the same members in the same places every frame. */
  hashSeed?: number;
};

// Column positions the big units (UNIT_PROFILES scale > 1) take, in order.
const BIG_UNIT_POSITIONS = [0, 6];

/** Which unit marches in each FORMATION position: the company is the same
 * squad the battle overlay would field for this gear and seed, with its big
 * units moved to the head and tail of the column. */
export const companyFormation = (gear: SquadGear | undefined, seed: number): MarineUnitKind[] => {
  const units = squadUnitsFor(gear, seed, 0);
  const big = units.filter((u) => UNIT_PROFILES[u].scale > 1);
  const rest = units.filter((u) => UNIT_PROFILES[u].scale <= 1);
  const placed: (MarineUnitKind | undefined)[] = Array.from({ length: FORMATION.length }, () => undefined);
  big.forEach((unit, k) => {
    const position = BIG_UNIT_POSITIONS[k];
    if (position !== undefined) placed[position] = unit;
    else rest.push(unit);
  });
  return placed.map((unit) => unit ?? rest.shift() ?? "infantry");
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

/** `envMap`: what specialists' bare metal reflects (the shared building
 * environment map; see popup-marine-metal-material.ts). */
export const createMusterTransitOverlay = (scene: Scene, envMap?: Texture): MusterTransitOverlay => {
  // Every soldier marches as "side 0" of the shared pools: a march has no
  // opposing side, and the pools only use the side to keep two squads'
  // slots apart.
  const pools = createMarinePools(scene, MAX_TRANSITS * SOLDIERS_PER_COMPANY, envMap);

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
    pools.beginFrame();
    if (entries.length === 0) return;

    for (const e of entries) {
      const totalHops = e.path.length - 1;
      const span = Math.max(1, e.arriveAt - e.startAt);
      const rawT = Math.min(1, Math.max(0, (nowMs - e.startAt) / span));
      const standing = nowMs >= e.arriveAt;
      if (standing && (e.standUntil === undefined || nowMs >= e.standUntil)) continue;
      const t = easeInOutSine(rawT);
      const hopPos = t * totalHops;

      const lead = pointAtHop(e.path, hopPos);
      const perpX = -lead.dirZ, perpZ = lead.dirX;
      const yaw = Math.atan2(lead.dirX, lead.dirZ);

      const company = companyFormation(e.gear, e.hashSeed ?? 0);
      for (let m = 0; m < FORMATION.length; m++) {
        const member = FORMATION[m]!;
        const unit = UNIT_PROFILES[company[m]!];
        const soldier = pools.acquire(0, unit.model);
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
        soldier.root.scale.setScalar(MARINE_MODEL_SCALE * unit.scale);
        soldier.material.color.set(e.ownerColor);
        soldier.silhouette.material.color.set(e.ownerColor);
        soldier.root.visible = true;
        // Walking, or stood at ease on arrival -- the same time-derived
        // (scrub-safe) clip sampling the battle overlay uses.
        playMarineStance(soldier, standing ? "stand" : "walk", nowMs);
        soldier.root.updateMatrixWorld(true);
      }
    }
  };

  const dispose = (): void => {
    pools.dispose();
  };

  return { clear, addTransit, commit, tick, dispose };
};
