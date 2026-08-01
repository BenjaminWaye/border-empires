import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Scene } from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Warpress natural wonder: a massive stamping forge with an animated hammer
 * striking an anvil (see docs/natural-wonders-design.md §2.4). Mustering
 * flags fill 2x faster; +1 flag slot (max 6).
 */
const ANVIL_Y = 0.1;
const HAMMER_PIVOT_Y = 0.55;
const HAMMER_SWING_SPEED = 0.0022;

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

export const createWarpressOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "warpress-overlay";
  scene.add(group);

  const anvilGeometry = new BoxGeometry(0.34, 0.14, 0.22);
  const anvilMaterial = new MeshStandardMaterial({ color: "#2a2825", roughness: 0.4, metalness: 0.8 });
  const hammerHeadGeometry = new BoxGeometry(0.22, 0.1, 0.14);
  const hammerHeadMaterial = new MeshStandardMaterial({ color: "#1e1c1a", emissive: "#ff6020", emissiveIntensity: 0.2, roughness: 0.3, metalness: 0.85 });
  const sparkGeometry = new BoxGeometry(0.05, 0.05, 0.05);
  const sparkMaterial = new MeshStandardMaterial({ color: "#ff6020", emissive: "#ff8040", emissiveIntensity: 2, transparent: true, opacity: 0 });

  const anvilMesh = new InstancedMesh(anvilGeometry, anvilMaterial, maxTiles);
  const hammerMesh = new InstancedMesh(hammerHeadGeometry, hammerHeadMaterial, maxTiles);
  const sparkMesh = new InstancedMesh(sparkGeometry, sparkMaterial, maxTiles);
  for (const mesh of [anvilMesh, hammerMesh, sparkMesh]) mesh.frustumCulled = false;
  group.add(anvilMesh, hammerMesh, sparkMesh);

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
    anvilMesh.count = count;
    hammerMesh.count = count;
    sparkMesh.count = count;

    for (let i = 0; i < count; i += 1) {
      const w = wonders[i]!;
      m.identity();
      m.setPosition(w.centerX, w.surfaceY + ANVIL_Y, w.centerZ);
      anvilMesh.setMatrixAt(i, m);

      // Swing: rests high, snaps down to strike, rebounds. Sawtooth-ish via abs(sin).
      const cycle = Math.abs(Math.sin(nowMs * HAMMER_SWING_SPEED + w.phase));
      const swingAngle = -0.9 * cycle;
      const drop = cycle * 0.28;
      rot.makeRotationX(swingAngle);
      m.copy(rot);
      m.setPosition(w.centerX, w.surfaceY + HAMMER_PIVOT_Y - drop, w.centerZ);
      hammerMesh.setMatrixAt(i, m);

      const isImpact = cycle > 0.93;
      m.identity();
      m.setPosition(w.centerX, w.surfaceY + ANVIL_Y + 0.1, w.centerZ);
      sparkMesh.setMatrixAt(i, m);
      sparkMaterial.opacity = isImpact ? (cycle - 0.93) / 0.07 : 0;
    }

    anvilMesh.instanceMatrix.needsUpdate = true;
    hammerMesh.instanceMatrix.needsUpdate = true;
    sparkMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    anvilGeometry.dispose(); hammerHeadGeometry.dispose(); sparkGeometry.dispose();
    anvilMaterial.dispose(); hammerHeadMaterial.dispose(); sparkMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
