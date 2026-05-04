import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3
} from "three";
import type { FortificationOpening, FortificationOverlayKind } from "./client-fortification-overlays.js";

// Fort 3D overlay: stone & wood forts get a 4-wall + 4-corner-tower
// silhouette (no floor — terrain shows through) with one wall optionally
// omitted to mirror the `fortificationOpeningForTile` rule (1 cardinal
// opening max). LIGHT_OUTPOST gets a single watchtower with a red flag;
// SIEGE_OUTPOST gets a watchtower with a catapult mounted on top.

const TILE_HALF = 0.46;

const WALL_LENGTH = 0.86;
const WALL_THICKNESS = 0.08;
const WALL_HEIGHT = 0.42;
const WALL_OFFSET = TILE_HALF - WALL_THICKNESS * 0.5;
const WALL_Y = WALL_HEIGHT * 0.5;

const TOWER_SIDE = 0.16;
const TOWER_HEIGHT = 0.58;
const TOWER_OFFSET = TILE_HALF - TOWER_SIDE * 0.5;
const TOWER_Y = TOWER_HEIGHT * 0.5;

const OUTPOST_TOWER_SIDE = 0.22;
const OUTPOST_TOWER_HEIGHT = 0.66;
const OUTPOST_TOWER_Y = OUTPOST_TOWER_HEIGHT * 0.5;
const OUTPOST_FLAGPOLE_HEIGHT = 0.32;
const OUTPOST_FLAGPOLE_RADIUS = 0.018;
const OUTPOST_FLAGPOLE_Y = OUTPOST_TOWER_HEIGHT + OUTPOST_FLAGPOLE_HEIGHT * 0.5;
const OUTPOST_FLAG_W = 0.18;
const OUTPOST_FLAG_H = 0.11;
const OUTPOST_FLAG_T = 0.012;
const OUTPOST_FLAG_Y = OUTPOST_TOWER_HEIGHT + OUTPOST_FLAGPOLE_HEIGHT * 0.78;
const OUTPOST_FLAG_X = OUTPOST_FLAG_W * 0.5 + 0.012;

// Catapult mounted on top of the SIEGE_OUTPOST watchtower:
//   - flat platform on the tower roof
//   - 2 thin axle posts (V-frame supports)
//   - throwing arm (cylinder tilted back-and-up)
//   - stone in the bucket at the high end
const CAT_BASE_W = 0.18;
const CAT_BASE_H = 0.025;
const CAT_BASE_D = 0.20;
const CAT_BASE_Y = OUTPOST_TOWER_HEIGHT + CAT_BASE_H * 0.5;
const CAT_POST_W = 0.024;
const CAT_POST_H = 0.13;
const CAT_POST_D = 0.024;
const CAT_POST_X = 0.05;
const CAT_POST_Y = OUTPOST_TOWER_HEIGHT + CAT_BASE_H + CAT_POST_H * 0.5;
const CAT_PIVOT_Y = OUTPOST_TOWER_HEIGHT + CAT_BASE_H + CAT_POST_H * 0.85;
const CAT_ARM_LENGTH = 0.24;
const CAT_ARM_RADIUS = 0.02;
// Arm tilts back and up. With cylinder default axis +Y, rotating about
// X by -60° points the +Y end up-and-back (-Z). Position the cylinder's
// center half its length along that direction from the pivot.
const CAT_ARM_TILT_X = -Math.PI * 0.33; // ~60° from vertical
const CAT_ARM_DIR_Y = Math.cos(CAT_ARM_TILT_X);
const CAT_ARM_DIR_Z = -Math.sin(CAT_ARM_TILT_X);
const CAT_ARM_CENTER_Y = CAT_PIVOT_Y + CAT_ARM_DIR_Y * CAT_ARM_LENGTH * 0.5;
const CAT_ARM_CENTER_Z = CAT_ARM_DIR_Z * CAT_ARM_LENGTH * 0.5;
const CAT_STONE_RADIUS = 0.045;
const CAT_STONE_Y = CAT_PIVOT_Y + CAT_ARM_DIR_Y * CAT_ARM_LENGTH;
const CAT_STONE_Z = CAT_ARM_DIR_Z * CAT_ARM_LENGTH;

const STONE_WALL_COLOR = "#aea99c";
const STONE_TOWER_COLOR = "#b8b3a4";
const WOOD_WALL_COLOR = "#8a6a47";
const WOOD_TOWER_COLOR = "#9a7a55";
const OUTPOST_TOWER_COLOR = "#9a8a72";
const OUTPOST_FLAGPOLE_COLOR = "#3a2a20";
const OUTPOST_FLAG_COLOR = "#c14a4a";
const CAT_WOOD_COLOR = "#5a4530";
const CAT_STONE_COLOR = "#3a3530";

export type FortOverlay = {
  readonly clear: () => void;
  readonly addInstance: (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    kind: FortificationOverlayKind,
    opening: FortificationOpening
  ) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type DirectionKey = "N" | "E" | "S" | "W";

const wallOffsetFor = (dir: DirectionKey): { dx: number; dz: number } => {
  switch (dir) {
    case "N": return { dx: 0, dz: -WALL_OFFSET };
    case "S": return { dx: 0, dz: WALL_OFFSET };
    case "E": return { dx: WALL_OFFSET, dz: 0 };
    case "W": return { dx: -WALL_OFFSET, dz: 0 };
  }
};

const openingToDirection = (opening: FortificationOpening): DirectionKey | undefined => {
  if (opening === "CLOSED") return undefined;
  return opening === "NORTH" ? "N" : opening === "EAST" ? "E" : opening === "SOUTH" ? "S" : "W";
};

export const createFortOverlay = (scene: Scene, maxTiles: number): FortOverlay => {
  const wallAlongXGeometry = new BoxGeometry(WALL_LENGTH, WALL_HEIGHT, WALL_THICKNESS);
  const wallAlongZGeometry = new BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, WALL_LENGTH);
  const towerGeometry = new BoxGeometry(TOWER_SIDE, TOWER_HEIGHT, TOWER_SIDE);
  const outpostTowerGeometry = new BoxGeometry(OUTPOST_TOWER_SIDE, OUTPOST_TOWER_HEIGHT, OUTPOST_TOWER_SIDE);
  const outpostFlagpoleGeometry = new CylinderGeometry(OUTPOST_FLAGPOLE_RADIUS, OUTPOST_FLAGPOLE_RADIUS, OUTPOST_FLAGPOLE_HEIGHT, 5);
  const outpostFlagGeometry = new BoxGeometry(OUTPOST_FLAG_W, OUTPOST_FLAG_H, OUTPOST_FLAG_T);
  const catBaseGeometry = new BoxGeometry(CAT_BASE_W, CAT_BASE_H, CAT_BASE_D);
  const catPostGeometry = new BoxGeometry(CAT_POST_W, CAT_POST_H, CAT_POST_D);
  const catArmGeometry = new CylinderGeometry(CAT_ARM_RADIUS, CAT_ARM_RADIUS, CAT_ARM_LENGTH, 5);
  const catStoneGeometry = new IcosahedronGeometry(CAT_STONE_RADIUS, 0);

  const stoneWallMaterial = new MeshStandardMaterial({ color: STONE_WALL_COLOR, roughness: 0.92, metalness: 0, flatShading: true });
  const stoneTowerMaterial = new MeshStandardMaterial({ color: STONE_TOWER_COLOR, roughness: 0.88, metalness: 0, flatShading: true });
  const woodWallMaterial = new MeshStandardMaterial({ color: WOOD_WALL_COLOR, roughness: 0.9, metalness: 0, flatShading: true });
  const woodTowerMaterial = new MeshStandardMaterial({ color: WOOD_TOWER_COLOR, roughness: 0.88, metalness: 0, flatShading: true });
  const outpostTowerMaterial = new MeshStandardMaterial({ color: OUTPOST_TOWER_COLOR, roughness: 0.9, metalness: 0, flatShading: true });
  const outpostFlagpoleMaterial = new MeshStandardMaterial({ color: OUTPOST_FLAGPOLE_COLOR, roughness: 0.85, metalness: 0, flatShading: true });
  const outpostFlagMaterial = new MeshStandardMaterial({ color: OUTPOST_FLAG_COLOR, roughness: 0.78, metalness: 0, flatShading: true });
  const catWoodMaterial = new MeshStandardMaterial({ color: CAT_WOOD_COLOR, roughness: 0.92, metalness: 0, flatShading: true });
  const catStoneMaterial = new MeshStandardMaterial({ color: CAT_STONE_COLOR, roughness: 0.88, metalness: 0.05, flatShading: true });

  const buildKindMeshes = (wallMat: MeshStandardMaterial, towerMat: MeshStandardMaterial) => {
    const wallN = new InstancedMesh(wallAlongXGeometry, wallMat, maxTiles);
    const wallS = new InstancedMesh(wallAlongXGeometry, wallMat, maxTiles);
    const wallE = new InstancedMesh(wallAlongZGeometry, wallMat, maxTiles);
    const wallW = new InstancedMesh(wallAlongZGeometry, wallMat, maxTiles);
    const towers = new InstancedMesh(towerGeometry, towerMat, maxTiles * 4);
    const all = [wallN, wallS, wallE, wallW, towers];
    for (const m of all) {
      m.frustumCulled = false;
      m.count = 0;
    }
    return { wallN, wallS, wallE, wallW, towers };
  };

  const stone = buildKindMeshes(stoneWallMaterial, stoneTowerMaterial);
  const wood = buildKindMeshes(woodWallMaterial, woodTowerMaterial);
  const outpostTowerMesh = new InstancedMesh(outpostTowerGeometry, outpostTowerMaterial, maxTiles);
  const outpostFlagpoleMesh = new InstancedMesh(outpostFlagpoleGeometry, outpostFlagpoleMaterial, maxTiles);
  const outpostFlagMesh = new InstancedMesh(outpostFlagGeometry, outpostFlagMaterial, maxTiles);
  const catBaseMesh = new InstancedMesh(catBaseGeometry, catWoodMaterial, maxTiles);
  const catPostLeftMesh = new InstancedMesh(catPostGeometry, catWoodMaterial, maxTiles);
  const catPostRightMesh = new InstancedMesh(catPostGeometry, catWoodMaterial, maxTiles);
  const catArmMesh = new InstancedMesh(catArmGeometry, catWoodMaterial, maxTiles);
  const catStoneMesh = new InstancedMesh(catStoneGeometry, catStoneMaterial, maxTiles);
  const outpostMeshes = [outpostTowerMesh, outpostFlagpoleMesh, outpostFlagMesh, catBaseMesh, catPostLeftMesh, catPostRightMesh, catArmMesh, catStoneMesh];
  for (const m of outpostMeshes) {
    m.frustumCulled = false;
    m.count = 0;
  }

  scene.add(
    stone.wallN, stone.wallS, stone.wallE, stone.wallW, stone.towers,
    wood.wallN, wood.wallS, wood.wallE, wood.wallW, wood.towers,
    outpostTowerMesh, outpostFlagpoleMesh, outpostFlagMesh,
    catBaseMesh, catPostLeftMesh, catPostRightMesh, catArmMesh, catStoneMesh
  );

  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3(1, 1, 1);
  const identityQuat = new Quaternion();
  const catArmQuat = new Quaternion().setFromEuler(new Euler(CAT_ARM_TILT_X, 0, 0, "XYZ"));

  type KindMeshes = ReturnType<typeof buildKindMeshes>;
  type Counters = { wallN: number; wallS: number; wallE: number; wallW: number; towers: number };
  const stoneCounters: Counters = { wallN: 0, wallS: 0, wallE: 0, wallW: 0, towers: 0 };
  const woodCounters: Counters = { wallN: 0, wallS: 0, wallE: 0, wallW: 0, towers: 0 };
  let outpostTowerCount = 0;
  let outpostFlagpoleCount = 0;
  let outpostFlagCount = 0;
  let catBaseCount = 0;
  let catPostLeftCount = 0;
  let catPostRightCount = 0;
  let catArmCount = 0;
  let catStoneCount = 0;

  const clear = (): void => {
    stoneCounters.wallN = 0; stoneCounters.wallS = 0; stoneCounters.wallE = 0; stoneCounters.wallW = 0; stoneCounters.towers = 0;
    woodCounters.wallN = 0; woodCounters.wallS = 0; woodCounters.wallE = 0; woodCounters.wallW = 0; woodCounters.towers = 0;
    outpostTowerCount = 0;
    outpostFlagpoleCount = 0;
    outpostFlagCount = 0;
    catBaseCount = 0;
    catPostLeftCount = 0;
    catPostRightCount = 0;
    catArmCount = 0;
    catStoneCount = 0;
  };

  const addFortPieces = (
    meshes: KindMeshes,
    counters: Counters,
    worldX: number,
    worldZ: number,
    surfaceY: number,
    skipDir: DirectionKey | undefined
  ): void => {
    const directions: DirectionKey[] = ["N", "E", "S", "W"];
    for (const dir of directions) {
      if (dir === skipDir) continue;
      const off = wallOffsetFor(dir);
      const mesh = dir === "N" ? meshes.wallN : dir === "S" ? meshes.wallS : dir === "E" ? meshes.wallE : meshes.wallW;
      const counterKey = dir === "N" ? "wallN" : dir === "S" ? "wallS" : dir === "E" ? "wallE" : "wallW";
      if (counters[counterKey] >= maxTiles) continue;
      matrix.makeTranslation(worldX + off.dx, surfaceY + WALL_Y, worldZ + off.dz);
      mesh.setMatrixAt(counters[counterKey], matrix);
      counters[counterKey] += 1;
    }

    const cornerOffsets: Array<{ dx: number; dz: number }> = [
      { dx: -TOWER_OFFSET, dz: -TOWER_OFFSET },
      { dx: TOWER_OFFSET, dz: -TOWER_OFFSET },
      { dx: -TOWER_OFFSET, dz: TOWER_OFFSET },
      { dx: TOWER_OFFSET, dz: TOWER_OFFSET }
    ];
    for (const corner of cornerOffsets) {
      if (counters.towers >= maxTiles * 4) break;
      matrix.makeTranslation(worldX + corner.dx, surfaceY + TOWER_Y, worldZ + corner.dz);
      meshes.towers.setMatrixAt(counters.towers, matrix);
      counters.towers += 1;
    }
  };

  const addOutpostPieces = (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    isSiege: boolean
  ): void => {
    if (outpostTowerCount >= maxTiles) return;
    matrix.makeTranslation(worldX, surfaceY + OUTPOST_TOWER_Y, worldZ);
    outpostTowerMesh.setMatrixAt(outpostTowerCount, matrix);
    outpostTowerCount += 1;

    if (isSiege) {
      // Catapult on the watchtower roof: base + 2 axle posts + tilted arm + stone.
      if (catBaseCount < maxTiles) {
        matrix.makeTranslation(worldX, surfaceY + CAT_BASE_Y, worldZ);
        catBaseMesh.setMatrixAt(catBaseCount, matrix);
        catBaseCount += 1;
      }
      if (catPostLeftCount < maxTiles) {
        matrix.makeTranslation(worldX - CAT_POST_X, surfaceY + CAT_POST_Y, worldZ);
        catPostLeftMesh.setMatrixAt(catPostLeftCount, matrix);
        catPostLeftCount += 1;
      }
      if (catPostRightCount < maxTiles) {
        matrix.makeTranslation(worldX + CAT_POST_X, surfaceY + CAT_POST_Y, worldZ);
        catPostRightMesh.setMatrixAt(catPostRightCount, matrix);
        catPostRightCount += 1;
      }
      if (catArmCount < maxTiles) {
        position.set(worldX, surfaceY + CAT_ARM_CENTER_Y, worldZ + CAT_ARM_CENTER_Z);
        matrix.compose(position, catArmQuat, scale);
        catArmMesh.setMatrixAt(catArmCount, matrix);
        catArmCount += 1;
      }
      if (catStoneCount < maxTiles) {
        matrix.makeTranslation(worldX, surfaceY + CAT_STONE_Y, worldZ + CAT_STONE_Z);
        catStoneMesh.setMatrixAt(catStoneCount, matrix);
        catStoneCount += 1;
      }
    } else {
      // Light outpost: simple flagpole + flag on the roof.
      if (outpostFlagpoleCount < maxTiles) {
        matrix.makeTranslation(worldX, surfaceY + OUTPOST_FLAGPOLE_Y, worldZ);
        outpostFlagpoleMesh.setMatrixAt(outpostFlagpoleCount, matrix);
        outpostFlagpoleCount += 1;
      }
      if (outpostFlagCount < maxTiles) {
        matrix.makeTranslation(worldX + OUTPOST_FLAG_X, surfaceY + OUTPOST_FLAG_Y, worldZ);
        outpostFlagMesh.setMatrixAt(outpostFlagCount, matrix);
        outpostFlagCount += 1;
      }
    }
  };

  const addInstance = (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    kind: FortificationOverlayKind,
    opening: FortificationOpening
  ): void => {
    if (kind === "FORT") {
      addFortPieces(stone, stoneCounters, worldX, worldZ, surfaceY, openingToDirection(opening));
    } else if (kind === "WOODEN_FORT") {
      addFortPieces(wood, woodCounters, worldX, worldZ, surfaceY, openingToDirection(opening));
    } else if (kind === "LIGHT_OUTPOST") {
      addOutpostPieces(worldX, worldZ, surfaceY, false);
    } else if (kind === "SIEGE_OUTPOST") {
      addOutpostPieces(worldX, worldZ, surfaceY, true);
    }
  };

  const commitKind = (meshes: KindMeshes, counters: Counters): void => {
    meshes.wallN.count = counters.wallN;
    meshes.wallS.count = counters.wallS;
    meshes.wallE.count = counters.wallE;
    meshes.wallW.count = counters.wallW;
    meshes.towers.count = counters.towers;
    meshes.wallN.instanceMatrix.needsUpdate = true;
    meshes.wallS.instanceMatrix.needsUpdate = true;
    meshes.wallE.instanceMatrix.needsUpdate = true;
    meshes.wallW.instanceMatrix.needsUpdate = true;
    meshes.towers.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => {
    commitKind(stone, stoneCounters);
    commitKind(wood, woodCounters);
    outpostTowerMesh.count = outpostTowerCount;
    outpostFlagpoleMesh.count = outpostFlagpoleCount;
    outpostFlagMesh.count = outpostFlagCount;
    catBaseMesh.count = catBaseCount;
    catPostLeftMesh.count = catPostLeftCount;
    catPostRightMesh.count = catPostRightCount;
    catArmMesh.count = catArmCount;
    catStoneMesh.count = catStoneCount;
    outpostTowerMesh.instanceMatrix.needsUpdate = true;
    outpostFlagpoleMesh.instanceMatrix.needsUpdate = true;
    outpostFlagMesh.instanceMatrix.needsUpdate = true;
    catBaseMesh.instanceMatrix.needsUpdate = true;
    catPostLeftMesh.instanceMatrix.needsUpdate = true;
    catPostRightMesh.instanceMatrix.needsUpdate = true;
    catArmMesh.instanceMatrix.needsUpdate = true;
    catStoneMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(
      stone.wallN, stone.wallS, stone.wallE, stone.wallW, stone.towers,
      wood.wallN, wood.wallS, wood.wallE, wood.wallW, wood.towers,
      outpostTowerMesh, outpostFlagpoleMesh, outpostFlagMesh,
      catBaseMesh, catPostLeftMesh, catPostRightMesh, catArmMesh, catStoneMesh
    );
    wallAlongXGeometry.dispose();
    wallAlongZGeometry.dispose();
    towerGeometry.dispose();
    outpostTowerGeometry.dispose();
    outpostFlagpoleGeometry.dispose();
    outpostFlagGeometry.dispose();
    catBaseGeometry.dispose();
    catPostGeometry.dispose();
    catArmGeometry.dispose();
    catStoneGeometry.dispose();
    stoneWallMaterial.dispose();
    stoneTowerMaterial.dispose();
    woodWallMaterial.dispose();
    woodTowerMaterial.dispose();
    outpostTowerMaterial.dispose();
    outpostFlagpoleMaterial.dispose();
    outpostFlagMaterial.dispose();
    catWoodMaterial.dispose();
    catStoneMaterial.dispose();
  };

  return { clear, addInstance, commit, dispose };
};
