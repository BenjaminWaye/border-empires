import { CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, TorusGeometry } from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Calculating Engine natural wonder: a brass-and-glass computing machine
 * with rotating calculation rings (see docs/natural-wonders-design.md
 * §2.6). All tech research gold costs -10%.
 */
const RING_Y = 0.22;
const ORB_Y = 0.4;

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

export const createCalculatingEngineOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "calculating-engine-overlay";
  scene.add(group);

  const baseGeometry = new CylinderGeometry(0.3, 0.34, 0.1, 20);
  const baseMaterial = new MeshStandardMaterial({ color: "#1e1a10", roughness: 0.4, metalness: 0.7 });
  const ringGeometry = new TorusGeometry(0.24, 0.02, 6, 24);
  const ringMaterial = new MeshStandardMaterial({ color: "#d4a540", roughness: 0.25, metalness: 0.9 });
  const orbGeometry = new IcosahedronGeometry(0.1, 1);
  const orbMaterial = new MeshStandardMaterial({ color: "#0e2838", emissive: "#40c8e8", emissiveIntensity: 1.1, roughness: 0.2, metalness: 0.1 });

  const baseMesh = new InstancedMesh(baseGeometry, baseMaterial, maxTiles);
  const ringMesh = new InstancedMesh(ringGeometry, ringMaterial, maxTiles * 2);
  const orbMesh = new InstancedMesh(orbGeometry, orbMaterial, maxTiles);
  for (const mesh of [baseMesh, ringMesh, orbMesh]) mesh.frustumCulled = false;
  group.add(baseMesh, ringMesh, orbMesh);

  const wonders: ActiveWonder[] = [];
  const m = new Matrix4();
  const rot = new Matrix4();
  const spin = new Matrix4();

  const clear = (): void => { wonders.length = 0; };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    const hash = (((centerX * 92_821) ^ (centerZ * 68_917)) >>> 0);
    wonders.push({ centerX, centerZ, surfaceY, phase: ((hash % 1000) / 1000) * Math.PI * 2 });
  };

  const update = (nowMs: number): void => {
    const count = wonders.length;
    baseMesh.count = count;
    ringMesh.count = count * 2;
    orbMesh.count = count;

    for (let i = 0; i < count; i += 1) {
      const w = wonders[i]!;
      m.identity();
      m.setPosition(w.centerX, w.surfaceY + 0.05, w.centerZ);
      baseMesh.setMatrixAt(i, m);

      for (let r = 0; r < 2; r += 1) {
        const tilt = r === 0 ? Math.PI / 2.3 : -Math.PI / 2.3;
        const spinAngle = nowMs * (0.0006 + r * 0.0004) * (r === 0 ? 1 : -1) + w.phase;
        rot.makeRotationX(tilt);
        spin.makeRotationY(spinAngle);
        m.multiplyMatrices(spin, rot);
        m.setPosition(w.centerX, w.surfaceY + RING_Y, w.centerZ);
        ringMesh.setMatrixAt(i * 2 + r, m);
      }

      const bob = 0.02 * Math.sin(nowMs * 0.0018 + w.phase);
      rot.makeRotationY(nowMs * 0.0009 + w.phase);
      m.copy(rot);
      m.setPosition(w.centerX, w.surfaceY + ORB_Y + bob, w.centerZ);
      orbMesh.setMatrixAt(i, m);
      orbMaterial.emissiveIntensity = 0.9 + 0.4 * Math.sin(nowMs * 0.002 + w.phase);
    }

    baseMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    orbMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    baseGeometry.dispose(); ringGeometry.dispose(); orbGeometry.dispose();
    baseMaterial.dispose(); ringMaterial.dispose(); orbMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
