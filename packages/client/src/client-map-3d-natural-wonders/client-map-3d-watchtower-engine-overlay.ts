import { CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Scene } from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Watchtower Engine natural wonder: a tall brass telescope tower with a
 * sweeping aether beam (see docs/natural-wonders-design.md §2.8). Distinct
 * from the world-generated scouting Watchtower sites (client-map-3d-
 * watchtower-overlay.ts) — this is a rarer, single-per-map prize. All of
 * the controller's observatories gain +10 to every range type.
 */
const TOWER_HEIGHT = 0.7;
const BEAM_Y = 0.85;
const SWEEP_SPEED = 0.0007;

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

export const createWatchtowerEngineOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "watchtower-engine-overlay";
  scene.add(group);

  const towerGeometry = new CylinderGeometry(0.07, 0.13, TOWER_HEIGHT, 10);
  const towerMaterial = new MeshStandardMaterial({ color: "#c89830", roughness: 0.3, metalness: 0.85 });
  const dishGeometry = new CylinderGeometry(0.16, 0.07, 0.1, 12);
  const dishMaterial = new MeshStandardMaterial({ color: "#f0d060", emissive: "#40d8ff", emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.8 });
  const beamGeometry = new PlaneGeometry(0.22, 2.4, 1, 1);
  const beamMaterial = new MeshBasicMaterial({ color: "#40d8ff", transparent: true, opacity: 0.16, depthWrite: false });

  const towerMesh = new InstancedMesh(towerGeometry, towerMaterial, maxTiles);
  const dishMesh = new InstancedMesh(dishGeometry, dishMaterial, maxTiles);
  const beamMesh = new InstancedMesh(beamGeometry, beamMaterial, maxTiles);
  for (const mesh of [towerMesh, dishMesh, beamMesh]) mesh.frustumCulled = false;
  group.add(towerMesh, dishMesh, beamMesh);

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
    towerMesh.count = count;
    dishMesh.count = count;
    beamMesh.count = count;

    for (let i = 0; i < count; i += 1) {
      const w = wonders[i]!;
      m.identity();
      m.setPosition(w.centerX, w.surfaceY + TOWER_HEIGHT / 2, w.centerZ);
      towerMesh.setMatrixAt(i, m);

      const sweep = nowMs * SWEEP_SPEED + w.phase;
      rot.makeRotationY(sweep);
      m.copy(rot);
      m.setPosition(w.centerX, w.surfaceY + TOWER_HEIGHT + 0.06, w.centerZ);
      dishMesh.setMatrixAt(i, m);

      m.copy(rot);
      m.setPosition(w.centerX, w.surfaceY + BEAM_Y, w.centerZ);
      beamMesh.setMatrixAt(i, m);
      beamMaterial.opacity = 0.1 + 0.08 * Math.sin(nowMs * 0.003 + w.phase);
    }

    towerMesh.instanceMatrix.needsUpdate = true;
    dishMesh.instanceMatrix.needsUpdate = true;
    beamMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    towerGeometry.dispose(); dishGeometry.dispose(); beamGeometry.dispose();
    towerMaterial.dispose(); dishMaterial.dispose(); beamMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
