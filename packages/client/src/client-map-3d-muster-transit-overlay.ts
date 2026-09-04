import { Color, InstancedMesh, MeshBasicMaterial, Object3D, Scene, SphereGeometry } from "three";

// Muster transit overlay: a company of dot instances marching hop-by-hop
// along the actual owned-territory path from a mustering flag to the enemy
// tile it's attacking, for the travel-time window between an ADVANCE/MARCH/
// manual muster attack firing and the (existing, unrelated) combat lock
// starting. Sits alongside the supply-line overlay
// (client-map-3d-supply-line-overlay.ts, the static/pulsing route line)
// rather than replacing it — the line marks the route, this renders the
// troops actually moving along it.
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
// Same round-dot look as the skirmish/battle overlay's combatants
// (client-map-3d-battle-overlay-fx.ts SphereGeometry, DOT_RADIUS 0.045) —
// deliberately not the muster tower's tall soldier-spike cone, which was
// tuned for troops wandering inside one tile's tiny footprint, not for
// reading clearly while covering ground between tiles.

const MAX_TRANSITS = 64;
const SOLDIERS_PER_COMPANY = 7;

const DOT_RADIUS = 0.045; // matches client-map-3d-battle-overlay-fx.ts DOT_RADIUS
const DOT_Y_OFFSET = 0.07; // matches client-map-3d-battle-overlay-fx.ts DOT_Y_OFFSET

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

export const createMusterTransitOverlay = (scene: Scene): MusterTransitOverlay => {
  const geometry = new SphereGeometry(DOT_RADIUS, 8, 6);
  // Deliberately no vertexColors:true — see client-map-3d-battle-overlay-fx.ts's
  // comment on the same pattern: InstancedMesh.setColorAt() tints each
  // instance on its own once instanceColor exists, and turning on
  // vertexColors for a geometry with no `color` attribute would zero every
  // instance out instead.
  const material = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", depthTest: false, depthWrite: false });
  const mesh = new InstancedMesh(geometry, material, MAX_TRANSITS * SOLDIERS_PER_COMPANY);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 38; // above the supply line (36) so troops read on top of the route
  scene.add(mesh);

  let entries: MusterTransit[] = [];
  const dummy = new Object3D();
  const tmpColor = new Color();

  const clear = (): void => { entries = []; };
  const addTransit = (transit: MusterTransit): void => {
    if (entries.length >= MAX_TRANSITS || transit.path.length < 2) return;
    entries.push(transit);
  };
  const commit = (): void => {
    mesh.count = entries.length * SOLDIERS_PER_COMPANY;
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
    if (entries.length === 0) { mesh.count = 0; return; }
    let writeIdx = 0;
    for (const e of entries) {
      const totalHops = e.path.length - 1;
      const span = Math.max(1, e.arriveAt - e.startAt);
      const rawT = Math.min(1, Math.max(0, (nowMs - e.startAt) / span));
      const t = easeInOutSine(rawT);
      const hopPos = t * totalHops;

      const lead = pointAtHop(e.path, hopPos);
      const perpX = -lead.dirZ, perpZ = lead.dirX;

      tmpColor.set(e.ownerColor);
      for (const member of FORMATION) {
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
        dummy.position.set(mx, e.groundY + DOT_Y_OFFSET, mz);
        dummy.updateMatrix();
        mesh.setMatrixAt(writeIdx, dummy.matrix);
        mesh.setColorAt(writeIdx, tmpColor);
        writeIdx++;
      }
    }
    mesh.count = writeIdx;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.clearUpdateRanges();
      mesh.instanceColor.addUpdateRange(0, mesh.count * 3);
      mesh.instanceColor.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return { clear, addTransit, commit, tick, dispose };
};
