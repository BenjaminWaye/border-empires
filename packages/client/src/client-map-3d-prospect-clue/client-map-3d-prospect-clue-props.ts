// True-3D props for the worldgen prospect clues (client-prospect-clue.ts), so
// a clue tile shows the thing its name describes (there is no ground tint):
// gaunt violet-black blackwood trees, rust-red ferrous flecks, and
// a few pale, half-buried crystal glints. The 2D-canvas twin is
// client-prospect-signature-overlay.ts; keep the two in step (AGENTS.md
// renderer parity). Blackwood on a tile that already grows forest does not
// add trees here -- the caller darkens that tile's own trees with
// BLACKWOOD_FOREST_TINT instead, so the canopy itself turns black.
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Scene,
  Vector3
} from "three";
import type { ProspectSignature } from "@border-empires/shared";
import { markUnexploredStormClip } from "../client-map-3d-unexplored-storm/client-map-3d-unexplored-storm-clip.js";
import { prospectClueJitter as jitter, prospectCluePropCount, prospectCluePropMax, prospectCluePropOffset } from "../client-prospect-clue/client-prospect-clue.js";

/** Multiplied into a blackwood clue tile's own forest/sapling trees (see client-map-3d-instance-tint.ts). */
export const BLACKWOOD_FOREST_TINT = new Color("#5c4478");

const BLACKWOOD_TRUNK_HEIGHT = 0.24;
const BLACKWOOD_CANOPY_HEIGHT = 0.5;
const BLACKWOOD_CANOPY_Y = 0.14 + BLACKWOOD_CANOPY_HEIGHT / 2;

/** Ground height at a tile-local offset (-0.5..0.5) from the tile centre. */
export type GroundYAt = (ox: number, oz: number) => number;

export type ProspectClueProps = {
  readonly clear: () => void;
  /**
   * `surfaceY`: the tile's highest point, where trees stand (as createForest's do).
   * `groundYAt`: the actual ground under each fleck/shard, so they don't float on slopes and hills.
   * `treesOnTile`: the tile already draws forest trees (blackwood then tints those instead of adding its own).
   */
  readonly addTile: (sceneX: number, sceneZ: number, surfaceY: number, groundYAt: GroundYAt, worldX: number, worldZ: number, signature: ProspectSignature, treesOnTile: boolean) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createProspectClueProps = (scene: Scene, maxTiles: number): ProspectClueProps => {
  // Blackwood: a narrow four-sided cone reads as a gaunt, spiky conifer --
  // distinct from createForest's five-sided pine/spruce even before colour.
  const blackwoodCanopyGeometry = new ConeGeometry(0.1, BLACKWOOD_CANOPY_HEIGHT, 4, 1, false);
  const blackwoodCanopyMaterial = markUnexploredStormClip(new MeshStandardMaterial({ color: "#2e2240", emissive: "#160b24", roughness: 0.92, metalness: 0, flatShading: true }));
  const blackwoodTrunkGeometry = new CylinderGeometry(0.022, 0.034, BLACKWOOD_TRUNK_HEIGHT, 5);
  const blackwoodTrunkMaterial = markUnexploredStormClip(new MeshStandardMaterial({ color: "#2b1f1d", roughness: 0.85, metalness: 0, flatShading: true }));
  // Ferrous dust: squat rust pebbles scattered over the ground.
  const fleckGeometry = new IcosahedronGeometry(0.045, 0);
  const fleckMaterial = markUnexploredStormClip(new MeshStandardMaterial({ color: "#b4582c", roughness: 0.7, metalness: 0.35, flatShading: true }));
  // Refractive ground: a clue, not the deposit -- so only a pale glassy tip
  // or two catching the light, not bright glowing crystals.
  const shardGeometry = new OctahedronGeometry(0.035, 0);
  const shardMaterial = markUnexploredStormClip(new MeshStandardMaterial({ color: "#cfe3e0", emissive: "#7fb8c0", emissiveIntensity: 0.12, roughness: 0.25, metalness: 0.1, flatShading: true }));

  const blackwoodCanopyMesh = new InstancedMesh(blackwoodCanopyGeometry, blackwoodCanopyMaterial, maxTiles * prospectCluePropMax("BLACKWOOD_CANOPY"));
  const blackwoodTrunkMesh = new InstancedMesh(blackwoodTrunkGeometry, blackwoodTrunkMaterial, maxTiles * prospectCluePropMax("BLACKWOOD_CANOPY"));
  const fleckMesh = new InstancedMesh(fleckGeometry, fleckMaterial, maxTiles * prospectCluePropMax("FERROUS_DUST"));
  const shardMesh = new InstancedMesh(shardGeometry, shardMaterial, maxTiles * prospectCluePropMax("REFRACTIVE_GROUND"));
  const meshes = [blackwoodCanopyMesh, blackwoodTrunkMesh, fleckMesh, shardMesh];
  for (const mesh of meshes) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.receiveShadow = true;
  }
  // Only the trees stand tall enough for a shadow to read; flecks and shards
  // skip the shadow pass.
  blackwoodCanopyMesh.castShadow = true;
  blackwoodTrunkMesh.castShadow = true;
  scene.add(...meshes);

  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const tiltAxis = new Vector3();
  let treeCount = 0;
  let fleckCount = 0;
  let shardCount = 0;

  const clear = (): void => {
    treeCount = 0;
    fleckCount = 0;
    shardCount = 0;
  };

  const addBlackwoodTrees = (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number): void => {
    const trees = prospectCluePropCount("BLACKWOOD_CANOPY", worldX, worldZ);
    for (let i = 0; i < trees && treeCount < blackwoodCanopyMesh.instanceMatrix.count; i += 1) {
      const { ox, oy: oz } = prospectCluePropOffset(worldX, worldZ, i);
      const s = 0.85 + (jitter(worldX, worldZ, 71 + i * 7) + 0.5) * 0.3;
      rotation.identity();
      scale.set(s, s, s);
      matrix.compose(position.set(sceneX + ox, surfaceY + (BLACKWOOD_TRUNK_HEIGHT / 2 - 0.03) * s, sceneZ + oz), rotation, scale);
      blackwoodTrunkMesh.setMatrixAt(treeCount, matrix);
      matrix.compose(position.set(sceneX + ox, surfaceY + BLACKWOOD_CANOPY_Y * s, sceneZ + oz), rotation, scale);
      blackwoodCanopyMesh.setMatrixAt(treeCount, matrix);
      treeCount += 1;
    }
  };

  const addFerrousFlecks = (sceneX: number, sceneZ: number, groundYAt: GroundYAt, worldX: number, worldZ: number): void => {
    const flecks = prospectCluePropCount("FERROUS_DUST", worldX, worldZ);
    for (let i = 0; i < flecks && fleckCount < fleckMesh.instanceMatrix.count; i += 1) {
      const s = 0.7 + (jitter(worldX, worldZ, 83 + i * 5) + 0.5) * 0.7;
      rotation.setFromAxisAngle(tiltAxis.set(0, 1, 0), (jitter(worldX, worldZ, 89 + i * 5) + 0.5) * Math.PI * 2);
      scale.set(s, s * 0.45, s);
      const { ox, oy: oz } = prospectCluePropOffset(worldX, worldZ, i);
      position.set(sceneX + ox, groundYAt(ox, oz) + 0.01, sceneZ + oz);
      fleckMesh.setMatrixAt(fleckCount, matrix.compose(position, rotation, scale));
      fleckCount += 1;
    }
  };

  const addCrystalShards = (sceneX: number, sceneZ: number, groundYAt: GroundYAt, worldX: number, worldZ: number): void => {
    const shards = prospectCluePropCount("REFRACTIVE_GROUND", worldX, worldZ);
    for (let i = 0; i < shards && shardCount < shardMesh.instanceMatrix.count; i += 1) {
      const s = 0.6 + (jitter(worldX, worldZ, 109 + i * 3) + 0.5) * 0.3;
      // Lean each shard a little off vertical so a cluster doesn't read as a row of pins.
      tiltAxis.set(jitter(worldX, worldZ, 113 + i * 3), 0, jitter(worldX, worldZ, 127 + i * 3)).normalize();
      rotation.setFromAxisAngle(tiltAxis.lengthSq() > 0 ? tiltAxis : tiltAxis.set(1, 0, 0), 0.35);
      scale.set(s, s * 1.5, s);
      const { ox, oy: oz } = prospectCluePropOffset(worldX, worldZ, i);
      // Centred at ground level, so the lower half stays buried.
      position.set(sceneX + ox, groundYAt(ox, oz) + 0.005, sceneZ + oz);
      shardMesh.setMatrixAt(shardCount, matrix.compose(position, rotation, scale));
      shardCount += 1;
    }
  };

  const addTile: ProspectClueProps["addTile"] = (sceneX, sceneZ, surfaceY, groundYAt, worldX, worldZ, signature, treesOnTile) => {
    if (signature === "BLACKWOOD_CANOPY") {
      if (!treesOnTile) addBlackwoodTrees(sceneX, sceneZ, surfaceY, worldX, worldZ);
    } else if (signature === "FERROUS_DUST") addFerrousFlecks(sceneX, sceneZ, groundYAt, worldX, worldZ);
    else addCrystalShards(sceneX, sceneZ, groundYAt, worldX, worldZ);
  };

  const commit = (): void => {
    blackwoodCanopyMesh.count = treeCount;
    blackwoodTrunkMesh.count = treeCount;
    fleckMesh.count = fleckCount;
    shardMesh.count = shardCount;
    for (const mesh of meshes) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    scene.remove(...meshes);
    for (const mesh of meshes) mesh.geometry.dispose();
    for (const material of [blackwoodCanopyMaterial, blackwoodTrunkMaterial, fleckMaterial, shardMaterial]) material.dispose();
  };

  return { clear, addTile, commit, dispose };
};
