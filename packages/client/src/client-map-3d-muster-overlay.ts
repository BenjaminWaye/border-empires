import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Scene
} from "three";

// Muster overlay: a small war pennant planted on each mustering tile,
// with converging soldier-dot animation showing troops marching to muster.
//
// Design:
//   • Smaller than the waypoint flag — multiple can coexist on adjacent tiles
//   • Triangular pennant in empire color, iron pole, 4-sided spike tip
//   • Soldier dots march from tile perimeter toward the flag (troops assembling)
//   • Dot count scales with fill ratio (sparse at start, dense near full)
//   • ADVANCE mode: pennant brighter, dots march faster

const POLE_H     = 0.50;
const POLE_R_BOT = 0.020;
const POLE_R_TOP = 0.015;
const PENNANT_W  = 0.22;
const PENNANT_H  = 0.13;
const SPIKE_H    = 0.085;
const SPIKE_R    = 0.020;
const FLAG_Y     = 0.014; // rise above surface

const SOLDIER_W  = 0.022;
const SOLDIER_H  = 0.048;
const SOLDIER_Y  = SOLDIER_H * 0.5 + 0.006;
const SOLDIERS_MAX  = 16;
const SOLDIERS_MIN  = 3;
const MARCH_HOLD_MS    = 3400;
const MARCH_ADVANCE_MS = 2000;

// Right-pointing triangle: top-left, bottom-left, right tip
const buildPennantGeometry = (): BufferGeometry => {
  const g = new BufferGeometry();
  const hh = PENNANT_H * 0.5;
  g.setAttribute("position", new BufferAttribute(new Float32Array([
    0,   hh,  0,
    0,  -hh,  0,
    PENNANT_W,  0,  0
  ]), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1
  ]), 3));
  g.setIndex([0, 1, 2]);
  return g;
};

// Murmur3-style hash [0,1) — same mixing as the settle overlay wanderHash.
const hash01 = (wx: number, wy: number, i: number, salt: number): number => {
  let h = Math.imul(wx | 0, 374761393);
  h = Math.imul(h + ((wy | 0) ^ 0x5bd1e995), -1640531535);
  h = Math.imul(h + (i | 0), -549389765);
  h = Math.imul(h + (salt | 0), 1597334677);
  h = Math.imul(h ^ (h >>> 16), -2048144789);
  h = Math.imul(h ^ (h >>> 13), -1028477387);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

// Returns tile-local {x, z} in [-0.46, 0.46] for a soldier marching toward center.
const soldierPos = (
  nowMs: number, wx: number, wy: number, i: number, periodMs: number
): { x: number; z: number } => {
  const offset = hash01(wx, wy, i, 7) * periodMs;
  const t = ((nowMs + offset) % periodMs) / periodMs; // 0=edge, 1=center

  const edge  = Math.floor(hash01(wx, wy, i, 31) * 4);
  const along = (hash01(wx, wy, i, 53) - 0.5) * 0.9;
  let sx = 0, sz = 0;
  if      (edge === 0) { sx = -0.46; sz = along; }
  else if (edge === 1) { sx =  0.46; sz = along; }
  else if (edge === 2) { sx = along; sz = -0.46; }
  else                 { sx = along; sz =  0.46; }

  return { x: sx * (1 - t), z: sz * (1 - t) };
};

type TileEntry = {
  sceneX: number; sceneZ: number; surfaceY: number;
  fillRatio: number; advance: boolean;
  worldTileX: number; worldTileY: number;
};

export type MusterOverlay = {
  readonly clear: () => void;
  readonly addMuster: (
    sceneX: number, sceneZ: number, surfaceY: number,
    fillRatio: number, ownerColor: string, advance: boolean,
    worldTileX: number, worldTileY: number
  ) => void;
  readonly commit: () => void;
  readonly tick:    (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createMusterOverlay = (scene: Scene): MusterOverlay => {
  const MAX = 256;

  const poleGeom = new CylinderGeometry(POLE_R_TOP, POLE_R_BOT, POLE_H, 6);
  const poleMat  = new MeshBasicMaterial({ color: "#2d2d3c", depthTest: false, depthWrite: false, transparent: true });
  const poleMesh = new InstancedMesh(poleGeom, poleMat, MAX);

  const pennantGeom = buildPennantGeometry();
  const pennantMat  = new MeshBasicMaterial({ color: "#ffffff", side: DoubleSide, depthTest: false, depthWrite: false, transparent: true });
  const pennantMesh = new InstancedMesh(pennantGeom, pennantMat, MAX);

  const spikeGeom = new ConeGeometry(SPIKE_R, SPIKE_H, 4);
  const spikeMat  = new MeshBasicMaterial({ color: "#4a4a5c", depthTest: false, depthWrite: false, transparent: true });
  const spikeMesh = new InstancedMesh(spikeGeom, spikeMat, MAX);

  const soldierGeom = new ConeGeometry(SOLDIER_W * 0.5, SOLDIER_H, 4); // tiny soldier silhouette
  const soldierMat  = new MeshBasicMaterial({ color: "#0a0d18", depthTest: false, depthWrite: false, transparent: true });
  const soldierMesh = new InstancedMesh(soldierGeom, soldierMat, MAX * SOLDIERS_MAX);

  for (const m of [poleMesh, pennantMesh, spikeMesh, soldierMesh]) {
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = 36;
  }
  scene.add(poleMesh, pennantMesh, spikeMesh, soldierMesh);

  const entries: TileEntry[] = [];
  const tmpColor = new Color();
  const tmpM = new Matrix4();

  const clear = (): void => { entries.length = 0; };

  const addMuster = (
    sceneX: number, sceneZ: number, surfaceY: number,
    fillRatio: number, ownerColor: string, advance: boolean,
    worldTileX: number, worldTileY: number
  ): void => {
    if (entries.length >= MAX) return;
    entries.push({ sceneX, sceneZ, surfaceY, fillRatio, advance, worldTileX, worldTileY });
    tmpColor.set(ownerColor);
    if (advance) tmpColor.lerp(new Color("#ffffff"), 0.30); // brighter in ADVANCE
    pennantMesh.setColorAt(entries.length - 1, tmpColor);
  };

  const commit = (): void => {
    poleMesh.count    = entries.length;
    pennantMesh.count = entries.length;
    spikeMesh.count   = entries.length;
    if (pennantMesh.instanceColor) pennantMesh.instanceColor.needsUpdate = true;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      const base = e.surfaceY + FLAG_Y;

      tmpM.makeTranslation(e.sceneX, base + POLE_H * 0.5, e.sceneZ);
      poleMesh.setMatrixAt(i, tmpM);

      // Pennant top-left corner anchors at pole top, hangs rightward
      tmpM.makeTranslation(e.sceneX, base + POLE_H - PENNANT_H * 0.5, e.sceneZ);
      pennantMesh.setMatrixAt(i, tmpM);

      tmpM.makeTranslation(e.sceneX, base + POLE_H + SPIKE_H * 0.5, e.sceneZ);
      spikeMesh.setMatrixAt(i, tmpM);
    }
    poleMesh.instanceMatrix.needsUpdate    = true;
    pennantMesh.instanceMatrix.needsUpdate = true;
    spikeMesh.instanceMatrix.needsUpdate   = true;
  };

  const tick = (nowMs: number): void => {
    if (entries.length === 0) { soldierMesh.count = 0; return; }
    let writeIdx = 0;
    for (let ei = 0; ei < entries.length; ei++) {
      const e = entries[ei]!;
      const period = e.advance ? MARCH_ADVANCE_MS : MARCH_HOLD_MS;
      const activeSoldiers = Math.max(
        SOLDIERS_MIN,
        Math.round(SOLDIERS_MIN + e.fillRatio * (SOLDIERS_MAX - SOLDIERS_MIN))
      );
      for (let i = 0; i < activeSoldiers; i++) {
        const { x, z } = soldierPos(nowMs, e.worldTileX, e.worldTileY, i, period);
        tmpM.makeTranslation(e.sceneX + x, e.surfaceY + SOLDIER_Y, e.sceneZ + z);
        soldierMesh.setMatrixAt(writeIdx++, tmpM);
      }
    }
    soldierMesh.count = writeIdx;
    soldierMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(poleMesh, pennantMesh, spikeMesh, soldierMesh);
    for (const g of [poleGeom, pennantGeom, spikeGeom, soldierGeom]) g.dispose();
    for (const m of [poleMat, pennantMat, spikeMat, soldierMat]) m.dispose();
  };

  return { clear, addMuster, commit, tick, dispose };
};
