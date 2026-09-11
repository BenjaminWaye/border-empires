import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Scene } from "three";
import type { FortificationOpening, FortificationOverlayKind } from "./client-fortification-overlays/client-fortification-overlays.js";

// Fort 3D overlay: stone, wood, and the two metal fort-ladder variants
// (TITANIUM_BASTION, THUNDER_BASTION) each get a 4-wall + 4-corner-tower
// silhouette (no floor — terrain shows through) with one wall optionally
// omitted to mirror the `fortificationOpeningForTile` rule (1 cardinal
// opening max). SIEGE_OUTPOST and RELAY_BEACON each have their own dedicated
// overlay (client-map-3d-siege-outpost-overlay.ts and
// client-map-3d-relay-beacon-overlay.ts).

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

const STONE_WALL_COLOR = "#aea99c";
const STONE_TOWER_COLOR = "#b8b3a4";
const WOOD_WALL_COLOR = "#8a6a47";
const WOOD_TOWER_COLOR = "#9a7a55";
const TITANIUM_WALL_COLOR = "#9aa7b3";
const TITANIUM_TOWER_COLOR = "#b0bdc9";
const THUNDER_WALL_COLOR = "#4e5864";
const THUNDER_TOWER_COLOR = "#5e6874";

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

  const stoneWallMaterial = new MeshStandardMaterial({ color: STONE_WALL_COLOR, roughness: 0.92, metalness: 0, flatShading: true });
  const stoneTowerMaterial = new MeshStandardMaterial({ color: STONE_TOWER_COLOR, roughness: 0.88, metalness: 0, flatShading: true });
  const woodWallMaterial = new MeshStandardMaterial({ color: WOOD_WALL_COLOR, roughness: 0.9, metalness: 0, flatShading: true });
  const woodTowerMaterial = new MeshStandardMaterial({ color: WOOD_TOWER_COLOR, roughness: 0.88, metalness: 0, flatShading: true });
  const titaniumWallMaterial = new MeshStandardMaterial({ color: TITANIUM_WALL_COLOR, roughness: 0.45, metalness: 0.7, flatShading: true });
  const titaniumTowerMaterial = new MeshStandardMaterial({ color: TITANIUM_TOWER_COLOR, roughness: 0.4, metalness: 0.75, flatShading: true });
  const thunderWallMaterial = new MeshStandardMaterial({ color: THUNDER_WALL_COLOR, roughness: 0.4, metalness: 0.8, flatShading: true });
  const thunderTowerMaterial = new MeshStandardMaterial({ color: THUNDER_TOWER_COLOR, roughness: 0.35, metalness: 0.85, flatShading: true });

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
      m.castShadow = true;
      m.receiveShadow = true;
    }
    return { wallN, wallS, wallE, wallW, towers };
  };

  const stone = buildKindMeshes(stoneWallMaterial, stoneTowerMaterial);
  const wood = buildKindMeshes(woodWallMaterial, woodTowerMaterial);
  const titanium = buildKindMeshes(titaniumWallMaterial, titaniumTowerMaterial);
  const thunder = buildKindMeshes(thunderWallMaterial, thunderTowerMaterial);

  scene.add(
    stone.wallN, stone.wallS, stone.wallE, stone.wallW, stone.towers,
    wood.wallN, wood.wallS, wood.wallE, wood.wallW, wood.towers,
    titanium.wallN, titanium.wallS, titanium.wallE, titanium.wallW, titanium.towers,
    thunder.wallN, thunder.wallS, thunder.wallE, thunder.wallW, thunder.towers
  );

  const matrix = new Matrix4();

  type KindMeshes = ReturnType<typeof buildKindMeshes>;
  type Counters = { wallN: number; wallS: number; wallE: number; wallW: number; towers: number };
  const stoneCounters: Counters = { wallN: 0, wallS: 0, wallE: 0, wallW: 0, towers: 0 };
  const woodCounters: Counters = { wallN: 0, wallS: 0, wallE: 0, wallW: 0, towers: 0 };
  const titaniumCounters: Counters = { wallN: 0, wallS: 0, wallE: 0, wallW: 0, towers: 0 };
  const thunderCounters: Counters = { wallN: 0, wallS: 0, wallE: 0, wallW: 0, towers: 0 };

  const clear = (): void => {
    stoneCounters.wallN = 0; stoneCounters.wallS = 0; stoneCounters.wallE = 0; stoneCounters.wallW = 0; stoneCounters.towers = 0;
    woodCounters.wallN = 0; woodCounters.wallS = 0; woodCounters.wallE = 0; woodCounters.wallW = 0; woodCounters.towers = 0;
    titaniumCounters.wallN = 0; titaniumCounters.wallS = 0; titaniumCounters.wallE = 0; titaniumCounters.wallW = 0; titaniumCounters.towers = 0;
    thunderCounters.wallN = 0; thunderCounters.wallS = 0; thunderCounters.wallE = 0; thunderCounters.wallW = 0; thunderCounters.towers = 0;
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

  const addInstance = (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    kind: FortificationOverlayKind,
    opening: FortificationOpening
  ): void => {
    if (kind === "FORT") {
      addFortPieces(stone, stoneCounters, worldX, worldZ, surfaceY, openingToDirection(opening));
    } else if (kind === "TITANIUM_BASTION") {
      addFortPieces(titanium, titaniumCounters, worldX, worldZ, surfaceY, openingToDirection(opening));
    } else if (kind === "THUNDER_BASTION") {
      addFortPieces(thunder, thunderCounters, worldX, worldZ, surfaceY, openingToDirection(opening));
    } else if (kind === "WOODEN_FORT") {
      addFortPieces(wood, woodCounters, worldX, worldZ, surfaceY, openingToDirection(opening));
    }
  };

  const commitKind = (meshes: KindMeshes, counters: Counters): void => {
    meshes.wallN.count = counters.wallN;
    meshes.wallS.count = counters.wallS;
    meshes.wallE.count = counters.wallE;
    meshes.wallW.count = counters.wallW;
    meshes.towers.count = counters.towers;
    meshes.wallN.instanceMatrix.clearUpdateRanges();
    meshes.wallN.instanceMatrix.addUpdateRange(0, meshes.wallN.count * 16);
    meshes.wallN.instanceMatrix.needsUpdate = true;
    meshes.wallS.instanceMatrix.clearUpdateRanges();
    meshes.wallS.instanceMatrix.addUpdateRange(0, meshes.wallS.count * 16);
    meshes.wallS.instanceMatrix.needsUpdate = true;
    meshes.wallE.instanceMatrix.clearUpdateRanges();
    meshes.wallE.instanceMatrix.addUpdateRange(0, meshes.wallE.count * 16);
    meshes.wallE.instanceMatrix.needsUpdate = true;
    meshes.wallW.instanceMatrix.clearUpdateRanges();
    meshes.wallW.instanceMatrix.addUpdateRange(0, meshes.wallW.count * 16);
    meshes.wallW.instanceMatrix.needsUpdate = true;
    meshes.towers.instanceMatrix.clearUpdateRanges();
    meshes.towers.instanceMatrix.addUpdateRange(0, meshes.towers.count * 16);
    meshes.towers.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => {
    commitKind(stone, stoneCounters);
    commitKind(wood, woodCounters);
    commitKind(titanium, titaniumCounters);
    commitKind(thunder, thunderCounters);
  };

  const dispose = (): void => {
    scene.remove(
      stone.wallN, stone.wallS, stone.wallE, stone.wallW, stone.towers,
      wood.wallN, wood.wallS, wood.wallE, wood.wallW, wood.towers,
      titanium.wallN, titanium.wallS, titanium.wallE, titanium.wallW, titanium.towers,
      thunder.wallN, thunder.wallS, thunder.wallE, thunder.wallW, thunder.towers
    );
    wallAlongXGeometry.dispose();
    wallAlongZGeometry.dispose();
    towerGeometry.dispose();
    stoneWallMaterial.dispose();
    stoneTowerMaterial.dispose();
    woodWallMaterial.dispose();
    woodTowerMaterial.dispose();
    titaniumWallMaterial.dispose();
    titaniumTowerMaterial.dispose();
    thunderWallMaterial.dispose();
    thunderTowerMaterial.dispose();
  };

  return { clear, addInstance, commit, dispose };
};
