import { Color, ConeGeometry, InstancedMesh, MeshBasicMaterial, Object3D, Scene } from "three";

import { buildTowerPartSpecs, computeTowerAnim, type TowerAnim } from "./client-map-3d-muster-tower-parts.js";

// Muster overlay: the same steampunk tower/banner model that used to mark
// a single waypoint now marks every mustering tile — a tower reads as a
// rallying point far better than it does as a mere movement destination.
// Soldier dots still march from tile perimeter toward the tower base,
// showing troops assembling; the waypoint queue now uses a small pennant
// instead (client-map-3d-waypoint-flag/), which never shows soldier dots.
//
// Design:
//   • Up to MAX towers on screen at once — mustering on several border
//     tiles simultaneously is an explicit play pattern, so every part is
//     one InstancedMesh shared across all mustering tiles rather than a
//     Group of raw meshes per tile (that would be MAX * ~20 draw calls).
//   • Tinted parts (glow ring, pedestal glow, banner, medallion face,
//     smoke) get the tile owner's color per-instance via instanceColor;
//     brighter (lerped toward white) in ADVANCE mode reads as more urgent.
//   • Dot count scales with fill ratio (sparse at start, dense near full).
//   • ADVANCE mode: soldier dots march faster.

// Matches the original (pre-tower) pennant overlay's cap — the per-frame
// matrix-recompute cost at this ceiling (MAX * ~19 tower parts) is the same
// order of magnitude as the soldier-dot cost already paid every frame below
// (MAX * SOLDIERS_MAX), so there's no perf reason to cap lower than before.
const MAX = 256;
const FLAG_Y = 0.014; // rise above surface

const SOLDIER_W = 0.022;
const SOLDIER_H = 0.048;
const SOLDIER_Y = SOLDIER_H * 0.5 + 0.006;
const SOLDIERS_MAX = 16;
const SOLDIERS_MIN = 3;
const MARCH_HOLD_MS = 3400;
const MARCH_ADVANCE_MS = 2000;

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

  const edge = Math.floor(hash01(wx, wy, i, 31) * 4);
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
  tintColor: Color;
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
  const specs = buildTowerPartSpecs();
  const meshes = specs.map((spec) => {
    const mesh = new InstancedMesh(spec.geometry, spec.material, MAX * spec.subCount);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = spec.renderOrder;
    return mesh;
  });

  const soldierGeom = new ConeGeometry(SOLDIER_W * 0.5, SOLDIER_H, 4); // tiny soldier silhouette
  const soldierMat  = new MeshBasicMaterial({ toneMapped: false, color: "#0a0d18", depthTest: false, depthWrite: false, transparent: true });
  const soldierMesh = new InstancedMesh(soldierGeom, soldierMat, MAX * SOLDIERS_MAX);
  soldierMesh.frustumCulled = false;
  soldierMesh.count = 0;
  soldierMesh.renderOrder = 36;

  scene.add(...meshes, soldierMesh);

  const entries: TileEntry[] = [];
  const tmpColor = new Color();
  const dummy = new Object3D();

  const clear = (): void => { entries.length = 0; };

  const addMuster = (
    sceneX: number, sceneZ: number, surfaceY: number,
    fillRatio: number, ownerColor: string, advance: boolean,
    worldTileX: number, worldTileY: number
  ): void => {
    if (entries.length >= MAX) return;
    tmpColor.set(ownerColor);
    if (advance) tmpColor.lerp(new Color("#ffffff"), 0.30); // brighter in ADVANCE
    entries.push({ sceneX, sceneZ, surfaceY, fillRatio, advance, worldTileX, worldTileY, tintColor: tmpColor.clone() });
  };

  const commit = (): void => {
    for (let p = 0; p < specs.length; p++) {
      const spec = specs[p]!;
      const mesh = meshes[p]!;
      mesh.count = entries.length * spec.subCount;
      if (!spec.tinted) continue;
      for (let i = 0; i < entries.length; i++) {
        const color = entries[i]!.tintColor;
        for (let sub = 0; sub < spec.subCount; sub++) mesh.setColorAt(i * spec.subCount + sub, color);
      }
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, mesh.count * 3);
        mesh.instanceColor.needsUpdate = true;
      }
    }
  };

  const applyTowerMatrices = (nowMs: number): void => {
    if (entries.length === 0) return;
    const perEntry: Array<{ anim: TowerAnim; base: number }> = entries.map((e) => {
      const phase = hash01(e.worldTileX, e.worldTileY, 0, 99) * Math.PI * 2;
      const t = nowMs / 1000 + phase;
      return { anim: computeTowerAnim(t), base: e.surfaceY + FLAG_Y + Math.sin(t * 1.4) * 0.03 };
    });
    for (let p = 0; p < specs.length; p++) {
      const spec = specs[p]!;
      const mesh = meshes[p]!;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!;
        const { anim, base } = perEntry[i]!;
        for (let sub = 0; sub < spec.subCount; sub++) {
          const local = spec.local(sub, anim);
          dummy.position.set(e.sceneX + local.x, base + local.y, e.sceneZ + local.z);
          dummy.rotation.set(local.rx, local.ry, local.rz);
          dummy.updateMatrix();
          mesh.setMatrixAt(i * spec.subCount + sub, dummy.matrix);
        }
      }
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const applySoldierMatrices = (nowMs: number): void => {
    if (entries.length === 0) { soldierMesh.count = 0; return; }
    let writeIdx = 0;
    for (const e of entries) {
      const period = e.advance ? MARCH_ADVANCE_MS : MARCH_HOLD_MS;
      const activeSoldiers = Math.max(
        SOLDIERS_MIN,
        Math.round(SOLDIERS_MIN + e.fillRatio * (SOLDIERS_MAX - SOLDIERS_MIN))
      );
      for (let i = 0; i < activeSoldiers; i++) {
        const { x, z } = soldierPos(nowMs, e.worldTileX, e.worldTileY, i, period);
        dummy.position.set(e.sceneX + x, e.surfaceY + SOLDIER_Y, e.sceneZ + z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        soldierMesh.setMatrixAt(writeIdx++, dummy.matrix);
      }
    }
    soldierMesh.count = writeIdx;
    soldierMesh.instanceMatrix.clearUpdateRanges();
    soldierMesh.instanceMatrix.addUpdateRange(0, soldierMesh.count * 16);
    soldierMesh.instanceMatrix.needsUpdate = true;
  };

  const tick = (nowMs: number): void => {
    applyTowerMatrices(nowMs);
    applySoldierMatrices(nowMs);
  };

  const dispose = (): void => {
    scene.remove(...meshes, soldierMesh);
    for (const spec of specs) { spec.geometry.dispose(); spec.material.dispose(); }
    soldierGeom.dispose();
    soldierMat.dispose();
  };

  return { clear, addMuster, commit, tick, dispose };
};
