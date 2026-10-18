// True-3D props for the worldgen prospect clues (client-prospect-clue.ts), so
// a clue tile shows the thing its name describes (there is no ground tint):
// a purple swirl rising from blackwood forest every few seconds
// (client-map-3d-blackwood-swirl.ts), small grey titanium chips for ferrous
// dust, and a few pale, half-buried crystal glints. The 2D-canvas twin is
// client-prospect-signature-overlay.ts; keep the two in step (AGENTS.md
// renderer parity).
import {
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
import { createBlackwoodSwirls } from "./client-map-3d-blackwood-swirl.js";

/** Ground height at a tile-local offset (-0.5..0.5) from the tile centre. */
export type GroundYAt = (ox: number, oz: number) => number;

export type ProspectClueProps = {
  readonly clear: () => void;
  /**
   * `surfaceY`: the tile's highest point, where its forest stands (as createForest's do).
   * `groundYAt`: the actual ground under each fleck/shard, so they don't float on slopes and hills.
   * `forestOnTile`: the tile draws its forest; blackwood's swirl only rises from forest.
   */
  readonly addTile: (sceneX: number, sceneZ: number, surfaceY: number, groundYAt: GroundYAt, worldX: number, worldZ: number, signature: ProspectSignature, forestOnTile: boolean) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createProspectClueProps = (scene: Scene, maxTiles: number): ProspectClueProps => {
  const swirls = createBlackwoodSwirls(scene, maxTiles);
  // Ferrous dust: tiny squat chips in titanium grey scattered over the ground.
  const fleckGeometry = new IcosahedronGeometry(0.028, 0);
  const fleckMaterial = markUnexploredStormClip(new MeshStandardMaterial({ color: "#8e949b", roughness: 0.55, metalness: 0.5, flatShading: true }));
  // Refractive ground: a clue, not the deposit -- so only a pale glassy tip
  // or two catching the light, not bright glowing crystals.
  const shardGeometry = new OctahedronGeometry(0.035, 0);
  const shardMaterial = markUnexploredStormClip(new MeshStandardMaterial({ color: "#cfe3e0", emissive: "#7fb8c0", emissiveIntensity: 0.12, roughness: 0.25, metalness: 0.1, flatShading: true }));

  const fleckMesh = new InstancedMesh(fleckGeometry, fleckMaterial, maxTiles * prospectCluePropMax("FERROUS_DUST"));
  const shardMesh = new InstancedMesh(shardGeometry, shardMaterial, maxTiles * prospectCluePropMax("REFRACTIVE_GROUND"));
  // Flecks and shards are too small for a shadow to read, so they skip the shadow pass.
  const meshes = [fleckMesh, shardMesh];
  for (const mesh of meshes) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.receiveShadow = true;
  }
  scene.add(...meshes);

  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const tiltAxis = new Vector3();
  let fleckCount = 0;
  let shardCount = 0;

  const clear = (): void => {
    swirls.clear();
    fleckCount = 0;
    shardCount = 0;
  };

  const addFerrousFlecks = (sceneX: number, sceneZ: number, groundYAt: GroundYAt, worldX: number, worldZ: number): void => {
    const flecks = prospectCluePropCount("FERROUS_DUST", worldX, worldZ);
    for (let i = 0; i < flecks && fleckCount < fleckMesh.instanceMatrix.count; i += 1) {
      const s = 0.6 + (jitter(worldX, worldZ, 83 + i * 5) + 0.5) * 0.5;
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

  const addTile: ProspectClueProps["addTile"] = (sceneX, sceneZ, surfaceY, groundYAt, worldX, worldZ, signature, forestOnTile) => {
    if (signature === "BLACKWOOD_CANOPY") {
      if (forestOnTile) swirls.addTile(sceneX, sceneZ, surfaceY, worldX, worldZ);
    } else if (signature === "FERROUS_DUST") addFerrousFlecks(sceneX, sceneZ, groundYAt, worldX, worldZ);
    else addCrystalShards(sceneX, sceneZ, groundYAt, worldX, worldZ);
  };

  const commit = (): void => {
    swirls.commit();
    fleckMesh.count = fleckCount;
    shardMesh.count = shardCount;
    for (const mesh of meshes) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    swirls.dispose();
    scene.remove(...meshes);
    for (const mesh of meshes) mesh.geometry.dispose();
    for (const material of [fleckMaterial, shardMaterial]) material.dispose();
  };

  return { clear, addTile, commit, dispose };
};
