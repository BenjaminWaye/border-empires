import { Color, ConeGeometry, InstancedMesh, MeshBasicMaterial, Object3D, Scene } from "three";

// Muster transit overlay: a company of soldier-dot instances marching along
// the straight-line ground path from a mustering flag to the enemy tile it's
// attacking, for the travel-time window between an ADVANCE/MARCH/manual
// muster attack firing and the (existing, unrelated) combat lock starting.
// Sits alongside the supply-line overlay (client-map-3d-supply-line-overlay.ts,
// the static/pulsing route line) rather than replacing it — the line marks
// the route, this renders the troops actually moving along it.
//
// Reuses the same tiny cone silhouette as the muster tower's assembling
// soldiers (client-map-3d-muster-overlay.ts) so a marching company reads as
// the same troops that were just massing on the flag, not a different unit
// type. One InstancedMesh shared across every in-flight transit, sized for
// MAX transits in flight at once (a player has at most MUSTER_MAX_TILES
// flags, so this comfortably covers every flag transiting simultaneously).

const MAX_TRANSITS = 64;
const SOLDIERS_PER_COMPANY = 7;

// Sized to read clearly while covering ground between tiles (unlike the
// muster tower's own soldier dots, which only ever wander within one tile's
// 0.9-unit footprint) — noticeably larger than those, roughly a fifth of a
// tile, so a marching company is legible at normal map zoom.
const SOLDIER_W = 0.11;
const SOLDIER_H = 0.22;
const SOLDIER_Y = SOLDIER_H * 0.5 + 0.01;

// Column formation: offsets along the direction of travel (behind the lead,
// negative = further back) and across it (left/right), in world (tile) units.
const FORMATION: ReadonlyArray<{ along: number; across: number }> = [
  { along: 0, across: 0 },
  { along: -0.26, across: -0.16 },
  { along: -0.26, across: 0.16 },
  { along: -0.52, across: -0.3 },
  { along: -0.52, across: 0 },
  { along: -0.52, across: 0.3 },
  { along: -0.78, across: 0 }
];

export type MusterTransit = {
  fromX: number; fromZ: number;
  toX: number; toZ: number;
  groundY: number;
  startAt: number;
  arriveAt: number;
  ownerColor: string;
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
  const geometry = new ConeGeometry(SOLDIER_W * 0.5, SOLDIER_H, 4);
  const material = new MeshBasicMaterial({ toneMapped: false, depthTest: false, depthWrite: false, transparent: true });
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
    if (entries.length >= MAX_TRANSITS) return;
    entries.push(transit);
  };
  const commit = (): void => {
    mesh.count = entries.length * SOLDIERS_PER_COMPANY;
  };

  const tick = (nowMs: number): void => {
    if (entries.length === 0) { mesh.count = 0; return; }
    let writeIdx = 0;
    for (const e of entries) {
      const span = Math.max(1, e.arriveAt - e.startAt);
      const rawT = Math.min(1, Math.max(0, (nowMs - e.startAt) / span));
      const t = easeInOutSine(rawT);

      const dx = e.toX - e.fromX;
      const dz = e.toZ - e.fromZ;
      const dist = Math.hypot(dx, dz) || 1;
      const dirX = dx / dist, dirZ = dz / dist;
      // perpendicular in the XZ ground plane
      const perpX = -dirZ, perpZ = dirX;

      tmpColor.set(e.ownerColor);
      for (const member of FORMATION) {
        // member.along/across are world (tile) units; along is converted to a
        // fraction of the path so trailing members ease in behind the lead
        // and the column visibly stretches out mid-march instead of moving
        // as one rigid block, regardless of how long the path itself is.
        const memberT = Math.min(1, Math.max(0, t + member.along / dist));
        const mx = e.fromX + dx * memberT + perpX * member.across;
        const mz = e.fromZ + dz * memberT + perpZ * member.across;
        dummy.position.set(mx, e.groundY + SOLDIER_Y, mz);
        dummy.rotation.set(0, -Math.atan2(dirZ, dirX) + Math.PI / 2, 0);
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
