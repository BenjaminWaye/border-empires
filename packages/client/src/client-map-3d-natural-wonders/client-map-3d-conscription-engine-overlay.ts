import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Scene } from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Conscription Engine natural wonder: an industrial compound with barracks
 * wings and a smokestack (see docs/natural-wonders-design.md §2.3). +2000
 * flat manpower cap; instant +2000 manpower on first claim.
 */
const TOWER_HEIGHT = 0.55;
const STACK_HEIGHT = 0.5;

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

export const createConscriptionEngineOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "conscription-engine-overlay";
  scene.add(group);

  const towerGeometry = new BoxGeometry(0.16, TOWER_HEIGHT, 0.16);
  const towerMaterial = new MeshStandardMaterial({ color: "#3a3835", roughness: 0.6, metalness: 0.5 });
  const barrackGeometry = new BoxGeometry(0.5, 0.16, 0.3);
  const barrackMaterial = new MeshStandardMaterial({ color: "#2a1e14", roughness: 0.7, metalness: 0.2 });
  const stackGeometry = new CylinderGeometry(0.035, 0.05, STACK_HEIGHT, 8);
  const stackMaterial = new MeshStandardMaterial({ color: "#2a2825", emissive: "#e8a030", emissiveIntensity: 0.4, roughness: 0.5, metalness: 0.6 });

  const towerMesh = new InstancedMesh(towerGeometry, towerMaterial, maxTiles);
  const barrackMesh = new InstancedMesh(barrackGeometry, barrackMaterial, maxTiles);
  const stackMesh = new InstancedMesh(stackGeometry, stackMaterial, maxTiles);
  for (const mesh of [towerMesh, barrackMesh, stackMesh]) mesh.frustumCulled = false;
  group.add(towerMesh, barrackMesh, stackMesh);

  const wonders: ActiveWonder[] = [];
  const m = new Matrix4();

  const clear = (): void => { wonders.length = 0; };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    const hash = (((centerX * 92_821) ^ (centerZ * 68_917)) >>> 0);
    wonders.push({ centerX, centerZ, surfaceY, phase: ((hash % 1000) / 1000) * Math.PI * 2 });
  };

  const update = (nowMs: number): void => {
    const count = wonders.length;
    towerMesh.count = count;
    barrackMesh.count = count;
    stackMesh.count = count;

    for (let i = 0; i < count; i += 1) {
      const w = wonders[i]!;
      m.identity();
      m.setPosition(w.centerX, w.surfaceY + TOWER_HEIGHT / 2, w.centerZ);
      towerMesh.setMatrixAt(i, m);

      m.identity();
      m.setPosition(w.centerX - 0.2, w.surfaceY + 0.08, w.centerZ + 0.15);
      barrackMesh.setMatrixAt(i, m);

      m.identity();
      m.setPosition(w.centerX + 0.15, w.surfaceY + STACK_HEIGHT / 2, w.centerZ - 0.15);
      stackMesh.setMatrixAt(i, m);
      stackMaterial.emissiveIntensity = 0.3 + 0.25 * Math.sin(nowMs * 0.0015 + w.phase);
    }

    towerMesh.instanceMatrix.needsUpdate = true;
    barrackMesh.instanceMatrix.needsUpdate = true;
    stackMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    towerGeometry.dispose(); barrackGeometry.dispose(); stackGeometry.dispose();
    towerMaterial.dispose(); barrackMaterial.dispose(); stackMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
