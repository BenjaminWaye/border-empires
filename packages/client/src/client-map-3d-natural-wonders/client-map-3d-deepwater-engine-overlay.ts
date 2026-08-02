import { CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, SphereGeometry, TorusGeometry } from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Deepwater Engine natural wonder: a half-submerged industrial pump facility
 * with a rotating gear-driven mechanism (see docs/natural-wonders-design.md
 * §2.2). Owner's dock gold income is doubled; dock-originated attacks +15%.
 */
const HOUSING_Y = 0.14;
const GEAR_Y = 0.32;
const GEAR_SPEED = 0.0011;

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

export const createDeepwaterEngineOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "deepwater-engine-overlay";
  scene.add(group);

  const housingGeometry = new CylinderGeometry(0.28, 0.32, 0.28, 10);
  const housingMaterial = new MeshStandardMaterial({ color: "#103848", roughness: 0.5, metalness: 0.6 });
  const gearGeometry = new TorusGeometry(0.2, 0.05, 8, 16);
  const gearMaterial = new MeshStandardMaterial({ color: "#8b5e3c", emissive: "#20c8b0", emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.7 });
  const bubbleGeometry = new SphereGeometry(0.06, 8, 6);
  const bubbleMaterial = new MeshStandardMaterial({ color: "#20c8b0", emissive: "#20c8b0", emissiveIntensity: 0.8, transparent: true, opacity: 0.7, roughness: 0.1 });

  const housingMesh = new InstancedMesh(housingGeometry, housingMaterial, maxTiles);
  const gearMesh = new InstancedMesh(gearGeometry, gearMaterial, maxTiles);
  const bubbleMesh = new InstancedMesh(bubbleGeometry, bubbleMaterial, maxTiles);
  for (const mesh of [housingMesh, gearMesh, bubbleMesh]) mesh.frustumCulled = false;
  group.add(housingMesh, gearMesh, bubbleMesh);

  const wonders: ActiveWonder[] = [];
  const m = new Matrix4();
  const rot = new Matrix4();

  const clear = (): void => { wonders.length = 0; };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    const hash = (((centerX * 92_821) ^ (centerZ * 68_917)) >>> 0);
    wonders.push({ centerX, centerZ, surfaceY, phase: ((hash % 1000) / 1000) * Math.PI * 2 });
  };

  const update = (nowMs: number): void => {
    const count = wonders.length;
    housingMesh.count = count;
    gearMesh.count = count;
    bubbleMesh.count = count;

    for (let i = 0; i < count; i += 1) {
      const w = wonders[i]!;
      m.identity();
      m.setPosition(w.centerX, w.surfaceY + HOUSING_Y, w.centerZ);
      housingMesh.setMatrixAt(i, m);

      rot.makeRotationX(nowMs * GEAR_SPEED + w.phase);
      m.copy(rot);
      m.setPosition(w.centerX, w.surfaceY + GEAR_Y, w.centerZ);
      gearMesh.setMatrixAt(i, m);

      const bob = 0.4 + 0.4 * Math.sin(nowMs * 0.002 + w.phase);
      m.identity();
      m.setPosition(w.centerX + 0.22, w.surfaceY + HOUSING_Y + bob * 0.3, w.centerZ + 0.22);
      bubbleMesh.setMatrixAt(i, m);
      bubbleMaterial.opacity = 0.4 + bob * 0.4;
    }

    housingMesh.instanceMatrix.needsUpdate = true;
    gearMesh.instanceMatrix.needsUpdate = true;
    bubbleMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    housingGeometry.dispose(); gearGeometry.dispose(); bubbleGeometry.dispose();
    housingMaterial.dispose(); gearMaterial.dispose(); bubbleMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
