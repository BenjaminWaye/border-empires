import {
  Color,
  ConeGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  RGBADepthPacking,
  Scene,
  type Texture
} from "three";

import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { createMusterBannerClothMaterials } from "./client-map-3d-muster-banner/muster-banner-cloth-material.js";
import { getMusterBannerGeometry, MUSTER_PLINTH_LEDGES } from "./client-map-3d-muster-banner/muster-banner-geometry.js";
import { applyStoneFinish } from "./client-map-3d-muster-banner/muster-banner-stone-material.js";
import { TOWN_BASE_LIFT } from "./client-map-3d-town-overlay.js";

// Muster overlay: every mustering tile carries a war banner in its owner's
// colour, a board-game piece standing on the same octagonal stone-and-brass
// plate as the towns (client-map-3d-muster-banner/). The cloth flies in the
// wind entirely in its shader; soldier dots still march in from the tile's
// edges to the plinth, showing troops assembling. The waypoint queue uses a
// small pennant instead (client-map-3d-waypoint-flag/), with no soldiers.
//
// Design:
//   • Up to MAX banners on screen at once — mustering on several border
//     tiles simultaneously is an explicit play pattern, so each part (matte
//     stone, metalwork, owner-coloured enamel, cloth) is one InstancedMesh
//     shared across all mustering tiles, all four sharing one transform
//     buffer. The banners never move, so transforms upload on commit only.
//   • Lit, depth-tested and shadow-casting like the towns, so the pieces sit
//     in the world rather than float over it.
//   • ADVANCE mode: the colour is lifted toward white and the banner whips
//     faster in the wind; soldier dots march faster.
//   • Dot count scales with fill ratio (sparse at start, dense near full).

const MAX = 256;
const ADVANCE_WIND_SPEED = 1.6;

const SOLDIER_W = 0.022;
const SOLDIER_H = 0.048;
const SOLDIER_Y = SOLDIER_H * 0.5 + 0.006;
const SOLDIERS_MAX = 16;
const SOLDIERS_MIN = 3;
const MARCH_HOLD_MS = 3400;
const MARCH_ADVANCE_MS = 2000;
/** Soldiers halt at the plinth's rim rather than marching into it. */
const MARCH_REACH = 0.4;

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

// Returns tile-local {x, z} for a soldier marching from the tile edge toward the plinth.
const soldierPos = (
  nowMs: number, wx: number, wy: number, i: number, periodMs: number
): { x: number; z: number } => {
  const offset = hash01(wx, wy, i, 7) * periodMs;
  const t = ((nowMs + offset) % periodMs) / periodMs; // 0=edge, 1=plinth

  const edge = Math.floor(hash01(wx, wy, i, 31) * 4);
  const along = (hash01(wx, wy, i, 53) - 0.5) * 0.9;
  let sx = 0, sz = 0;
  if      (edge === 0) { sx = -0.46; sz = along; }
  else if (edge === 1) { sx =  0.46; sz = along; }
  else if (edge === 2) { sx = along; sz = -0.46; }
  else                 { sx = along; sz =  0.46; }

  const scale = 1 - t * MARCH_REACH;
  return { x: sx * scale, z: sz * scale };
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

export const createMusterOverlay = (scene: Scene, envMap?: Texture): MusterOverlay => {
  const geometry = getMusterBannerGeometry();
  // The towns' AFC-style metalwork (client-map-3d-town-overlay.ts); the stone
  // gets a painted-stone finish so it doesn't read as plastic up close.
  const bodyMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02, flatShading: true });
  applyStoneFinish(bodyMaterial, MUSTER_PLINTH_LEDGES);
  const metalMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.7, flatShading: true });
  // Lacquered enamel in the owner's colour, from instanceColor: a clearcoat
  // over the paint, like a premium miniature's varnish.
  const enamelMaterial = new MeshPhysicalMaterial({
    color: "#ffffff", roughness: 0.4, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, flatShading: true
  });
  for (const material of [bodyMaterial, metalMaterial, enamelMaterial]) applyBuildingEnvMap(material, envMap);
  const clothMaterials = createMusterBannerClothMaterials();
  applyBuildingEnvMap(clothMaterials.cloth, envMap);
  const depthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });

  // Each overlay gets its own copy of the cloth so its per-instance wind
  // attribute never clashes with another overlay's.
  const clothGeometry = geometry.cloth.clone();
  const wind = new InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
  clothGeometry.setAttribute("aBannerWind", wind);

  const body = new InstancedMesh(geometry.body, bodyMaterial, MAX);
  const metal = new InstancedMesh(geometry.metal, metalMaterial, MAX);
  const enamel = new InstancedMesh(geometry.tinted, enamelMaterial, MAX);
  const cloth = new InstancedMesh(clothGeometry, clothMaterials.cloth, MAX);
  body.customDepthMaterial = depthMaterial;
  metal.customDepthMaterial = depthMaterial;
  enamel.customDepthMaterial = depthMaterial;
  cloth.customDepthMaterial = clothMaterials.depth;
  const pieceMeshes = [body, metal, enamel, cloth];
  for (const [i, mesh] of pieceMeshes.entries()) {
    mesh.name = `muster-banner-${["body", "metal", "enamel", "cloth"][i]}`;
    // One transform buffer, uploaded once for all four parts.
    if (mesh !== body) mesh.instanceMatrix = body.instanceMatrix;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
  }

  const soldierGeom = new ConeGeometry(SOLDIER_W * 0.5, SOLDIER_H, 4); // tiny soldier silhouette
  const soldierMat  = new MeshBasicMaterial({ toneMapped: false, color: "#0a0d18", depthTest: false, depthWrite: false, transparent: true });
  const soldierMesh = new InstancedMesh(soldierGeom, soldierMat, MAX * SOLDIERS_MAX);
  soldierMesh.frustumCulled = false;
  soldierMesh.count = 0;
  soldierMesh.renderOrder = 36;

  scene.add(...pieceMeshes, soldierMesh);

  const entries: TileEntry[] = [];
  const tmpColor = new Color();
  const white = new Color("#ffffff");
  const matrix = new Matrix4();
  const dummy = new Object3D();

  const clear = (): void => { entries.length = 0; };

  const addMuster = (
    sceneX: number, sceneZ: number, surfaceY: number,
    fillRatio: number, ownerColor: string, advance: boolean,
    worldTileX: number, worldTileY: number
  ): void => {
    if (entries.length >= MAX) return;
    tmpColor.set(ownerColor);
    if (advance) tmpColor.lerp(white, 0.30); // brighter in ADVANCE
    entries.push({ sceneX, sceneZ, surfaceY, fillRatio, advance, worldTileX, worldTileY, tintColor: tmpColor.clone() });
  };

  const commit = (): void => {
    const count = entries.length;
    for (const mesh of pieceMeshes) mesh.count = count;
    for (let i = 0; i < count; i++) {
      const e = entries[i]!;
      body.setMatrixAt(i, matrix.makeTranslation(e.sceneX, e.surfaceY + TOWN_BASE_LIFT, e.sceneZ));
      enamel.setColorAt(i, e.tintColor);
      cloth.setColorAt(i, e.tintColor);
      wind.setXY(i, hash01(e.worldTileX, e.worldTileY, 0, 99), e.advance ? ADVANCE_WIND_SPEED : 1);
    }
    body.instanceMatrix.clearUpdateRanges();
    wind.clearUpdateRanges();
    if (count === 0) return;
    body.instanceMatrix.addUpdateRange(0, count * 16);
    body.instanceMatrix.needsUpdate = true;
    wind.addUpdateRange(0, count * 2);
    wind.needsUpdate = true;
    for (const mesh of [enamel, cloth]) {
      const colors = mesh.instanceColor;
      if (!colors) continue;
      colors.clearUpdateRanges();
      colors.addUpdateRange(0, count * 3);
      colors.needsUpdate = true;
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
    clothMaterials.tick(nowMs);
    applySoldierMatrices(nowMs);
  };

  const dispose = (): void => {
    scene.remove(...pieceMeshes, soldierMesh);
    // The baked plinth geometry is shared across overlays; only the cloth copy is ours.
    clothGeometry.dispose();
    for (const material of [bodyMaterial, metalMaterial, enamelMaterial, depthMaterial]) material.dispose();
    clothMaterials.dispose();
    for (const mesh of pieceMeshes) mesh.dispose();
    soldierGeom.dispose();
    soldierMat.dispose();
  };

  return { clear, addMuster, commit, tick, dispose };
};
