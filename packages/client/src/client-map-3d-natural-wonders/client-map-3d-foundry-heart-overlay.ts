import { ConeGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Scene } from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Foundry Heart natural wonder: a pulsing cyan crystal geode embedded in
 * cracked ground (see docs/natural-wonders-design.md §2.1). Owner gains +1
 * slot of every resource type.
 */
const CORE_Y = 0.22;
const SHARD_COUNT = 5;
const PULSE_SPEED = 0.0016;

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

export const createFoundryHeartOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "foundry-heart-overlay";
  scene.add(group);

  const coreGeometry = new IcosahedronGeometry(0.24, 1);
  const coreMaterial = new MeshStandardMaterial({ color: "#0e2838", emissive: "#40d8ff", emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.1 });
  const shardGeometry = new ConeGeometry(0.07, 0.32, 5);
  const shardMaterial = new MeshStandardMaterial({ color: "#1a4060", emissive: "#40d8ff", emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.4 });

  const coreMesh = new InstancedMesh(coreGeometry, coreMaterial, maxTiles);
  const shardMesh = new InstancedMesh(shardGeometry, shardMaterial, maxTiles * SHARD_COUNT);
  for (const mesh of [coreMesh, shardMesh]) mesh.frustumCulled = false;
  group.add(coreMesh, shardMesh);

  const wonders: ActiveWonder[] = [];
  const m = new Matrix4();
  const rot = new Matrix4();
  const scl = new Matrix4();

  const clear = (): void => { wonders.length = 0; };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    const hash = (((centerX * 92_821) ^ (centerZ * 68_917)) >>> 0);
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    wonders.push({ centerX, centerZ, surfaceY, phase });
  };

  const update = (nowMs: number): void => {
    const count = wonders.length;
    coreMesh.count = count;
    shardMesh.count = count * SHARD_COUNT;

    for (let i = 0; i < count; i += 1) {
      const w = wonders[i]!;
      const pulse = 0.85 + 0.15 * Math.sin(nowMs * PULSE_SPEED + w.phase);
      scl.makeScale(pulse, pulse, pulse);
      rot.makeRotationY(nowMs * 0.0004 + w.phase);
      m.multiplyMatrices(rot, scl);
      m.setPosition(w.centerX, w.surfaceY + CORE_Y, w.centerZ);
      coreMesh.setMatrixAt(i, m);
      coreMaterial.emissiveIntensity = 0.9 + pulse * 0.5;

      for (let s = 0; s < SHARD_COUNT; s += 1) {
        const angle = (s / SHARD_COUNT) * Math.PI * 2 + w.phase;
        const radius = 0.34;
        const sx = w.centerX + Math.cos(angle) * radius;
        const sz = w.centerZ + Math.sin(angle) * radius;
        rot.makeRotationZ(0.25 * Math.sin(angle));
        m.copy(rot);
        m.setPosition(sx, w.surfaceY + 0.16, sz);
        shardMesh.setMatrixAt(i * SHARD_COUNT + s, m);
      }
    }

    coreMesh.instanceMatrix.needsUpdate = true;
    shardMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    coreGeometry.dispose();
    shardGeometry.dispose();
    coreMaterial.dispose();
    shardMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
