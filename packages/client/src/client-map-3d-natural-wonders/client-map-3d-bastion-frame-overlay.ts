import { CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, TorusGeometry } from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Bastion Frame natural wonder: a copper pipe and gearwork lattice with
 * aether energy flowing through it (see docs/natural-wonders-design.md
 * §2.5). All of the controller's forts gain +0.5x defense multiplier.
 */
const RING_Y = 0.3;
const PIPE_Y = 0.14;

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

export const createBastionFrameOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "bastion-frame-overlay";
  scene.add(group);

  const ringGeometry = new TorusGeometry(0.32, 0.035, 8, 24);
  const ringMaterial = new MeshStandardMaterial({ color: "#b87333", emissive: "#4a8c6a", emissiveIntensity: 0.4, roughness: 0.35, metalness: 0.8 });
  const pipeGeometry = new CylinderGeometry(0.03, 0.03, 0.4, 8);
  const pipeMaterial = new MeshStandardMaterial({ color: "#8b5e3c", emissive: "#4a8c6a", emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.75 });

  const ringMesh = new InstancedMesh(ringGeometry, ringMaterial, maxTiles);
  const pipeMesh = new InstancedMesh(pipeGeometry, pipeMaterial, maxTiles * 4);
  for (const mesh of [ringMesh, pipeMesh]) mesh.frustumCulled = false;
  group.add(ringMesh, pipeMesh);

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
    ringMesh.count = count;
    pipeMesh.count = count * 4;

    for (let i = 0; i < count; i += 1) {
      const w = wonders[i]!;
      rot.makeRotationX(Math.PI / 2);
      m.copy(rot);
      m.setPosition(w.centerX, w.surfaceY + RING_Y, w.centerZ);
      ringMesh.setMatrixAt(i, m);
      ringMaterial.emissiveIntensity = 0.3 + 0.35 * Math.sin(nowMs * 0.0012 + w.phase);

      for (let p = 0; p < 4; p += 1) {
        const angle = (p / 4) * Math.PI * 2 + Math.PI / 4;
        rot.makeRotationZ(Math.PI / 2);
        m.copy(rot);
        m.setPosition(w.centerX + Math.cos(angle) * 0.32, w.surfaceY + PIPE_Y, w.centerZ + Math.sin(angle) * 0.32);
        pipeMesh.setMatrixAt(i * 4 + p, m);
      }
    }

    ringMesh.instanceMatrix.needsUpdate = true;
    pipeMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    ringGeometry.dispose(); pipeGeometry.dispose();
    ringMaterial.dispose(); pipeMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
