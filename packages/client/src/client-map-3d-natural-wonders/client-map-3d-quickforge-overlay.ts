import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Scene } from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Quickforge natural wonder: a rapid-action forge with animated pneumatic
 * pistons (see docs/natural-wonders-design.md §2.7). Once per UTC day, the
 * controller's rush-buy is free.
 */
const BODY_Y = 0.12;
const PISTON_BASE_Y = 0.16;
const PISTON_STROKE = 0.12;
const PISTON_SPEED = 0.004;

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

export const createQuickforgeOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "quickforge-overlay";
  scene.add(group);

  const bodyGeometry = new BoxGeometry(0.42, 0.22, 0.3);
  const bodyMaterial = new MeshStandardMaterial({ color: "#1e1c1a", emissive: "#ff3010", emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.7 });
  const pistonGeometry = new CylinderGeometry(0.035, 0.035, PISTON_STROKE, 8);
  const pistonMaterial = new MeshStandardMaterial({ color: "#4a4440", roughness: 0.3, metalness: 0.85 });

  const bodyMesh = new InstancedMesh(bodyGeometry, bodyMaterial, maxTiles);
  const pistonMesh = new InstancedMesh(pistonGeometry, pistonMaterial, maxTiles * 2);
  for (const mesh of [bodyMesh, pistonMesh]) mesh.frustumCulled = false;
  group.add(bodyMesh, pistonMesh);

  const wonders: ActiveWonder[] = [];
  const m = new Matrix4();

  const clear = (): void => { wonders.length = 0; };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    const hash = (((centerX * 92_821) ^ (centerZ * 68_917)) >>> 0);
    wonders.push({ centerX, centerZ, surfaceY, phase: ((hash % 1000) / 1000) * Math.PI * 2 });
  };

  const update = (nowMs: number): void => {
    const count = wonders.length;
    bodyMesh.count = count;
    pistonMesh.count = count * 2;

    for (let i = 0; i < count; i += 1) {
      const w = wonders[i]!;
      m.identity();
      m.setPosition(w.centerX, w.surfaceY + BODY_Y, w.centerZ);
      bodyMesh.setMatrixAt(i, m);
      bodyMaterial.emissiveIntensity = 0.4 + 0.3 * Math.sin(nowMs * 0.0025 + w.phase);

      for (let p = 0; p < 2; p += 1) {
        // Out-of-phase pistons for a busy, mechanical feel.
        const extend = 0.5 + 0.5 * Math.sin(nowMs * PISTON_SPEED + w.phase + p * Math.PI);
        m.identity();
        m.setPosition(w.centerX + (p === 0 ? -0.1 : 0.1), w.surfaceY + PISTON_BASE_Y + extend * PISTON_STROKE, w.centerZ + 0.2);
        pistonMesh.setMatrixAt(i * 2 + p, m);
      }
    }

    bodyMesh.instanceMatrix.needsUpdate = true;
    pistonMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    bodyGeometry.dispose(); pistonGeometry.dispose();
    bodyMaterial.dispose(); pistonMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
