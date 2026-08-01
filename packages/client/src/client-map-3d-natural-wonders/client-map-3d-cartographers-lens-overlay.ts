import { Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, TorusGeometry, Vector3 } from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Cartographer's Lens natural wonder: a brass astrolabe with concentric
 * rotating rings and a prismatic lens (see docs/natural-wonders-design.md
 * §2.9). All of the controller's tiles gain +1 vision range.
 */
const LENS_Y = 0.3;
const RING_COUNT = 3;

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

export const createCartographersLensOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "cartographers-lens-overlay";
  scene.add(group);

  const baseGeometry = new CylinderGeometry(0.24, 0.28, 0.08, 20);
  const baseMaterial = new MeshStandardMaterial({ color: "#c89830", roughness: 0.3, metalness: 0.85 });
  const ringGeometry = new TorusGeometry(0.18, 0.015, 6, 24);
  const ringMaterial = new MeshStandardMaterial({ color: "#f0d060", roughness: 0.25, metalness: 0.9 });
  const lensGeometry = new CylinderGeometry(0.1, 0.1, 0.015, 20);
  const lensMaterial = new MeshStandardMaterial({ color: "#101018", emissive: "#ffffff", emissiveIntensity: 0.5, roughness: 0.05, metalness: 0.1 });

  const baseMesh = new InstancedMesh(baseGeometry, baseMaterial, maxTiles);
  const ringMesh = new InstancedMesh(ringGeometry, ringMaterial, maxTiles * RING_COUNT);
  const lensMesh = new InstancedMesh(lensGeometry, lensMaterial, maxTiles);
  for (const mesh of [baseMesh, ringMesh, lensMesh]) mesh.frustumCulled = false;
  group.add(baseMesh, ringMesh, lensMesh);

  const wonders: ActiveWonder[] = [];
  const m = new Matrix4();
  const rot = new Matrix4();
  const tilt = new Matrix4();
  const scaleVec = new Vector3();
  const rainbow = new Color();

  const clear = (): void => { wonders.length = 0; };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    const hash = (((centerX * 92_821) ^ (centerZ * 68_917)) >>> 0);
    wonders.push({ centerX, centerZ, surfaceY, phase: ((hash % 1000) / 1000) * Math.PI * 2 });
  };

  const update = (nowMs: number): void => {
    const count = wonders.length;
    baseMesh.count = count;
    ringMesh.count = count * RING_COUNT;
    lensMesh.count = count;

    for (let i = 0; i < count; i += 1) {
      const w = wonders[i]!;
      m.identity();
      m.setPosition(w.centerX, w.surfaceY + 0.04, w.centerZ);
      baseMesh.setMatrixAt(i, m);

      for (let r = 0; r < RING_COUNT; r += 1) {
        const radiusScale = 1 - r * 0.28;
        const spinSpeed = 0.0004 + r * 0.0003;
        const direction = r % 2 === 0 ? 1 : -1;
        rot.makeRotationX(Math.PI / 2.4);
        tilt.makeRotationY(nowMs * spinSpeed * direction + w.phase);
        m.multiplyMatrices(tilt, rot);
        m.scale(scaleVec.set(radiusScale, radiusScale, radiusScale));
        m.setPosition(w.centerX, w.surfaceY + LENS_Y, w.centerZ);
        ringMesh.setMatrixAt(i * RING_COUNT + r, m);
      }

      m.identity();
      m.setPosition(w.centerX, w.surfaceY + LENS_Y, w.centerZ);
      lensMesh.setMatrixAt(i, m);
      const hue = ((nowMs * 0.00006 + w.phase) % (Math.PI * 2)) / (Math.PI * 2);
      rainbow.setHSL(hue, 0.7, 0.6);
      lensMaterial.emissive.copy(rainbow);
    }

    baseMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    lensMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    baseGeometry.dispose(); ringGeometry.dispose(); lensGeometry.dispose();
    baseMaterial.dispose(); ringMaterial.dispose(); lensMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
