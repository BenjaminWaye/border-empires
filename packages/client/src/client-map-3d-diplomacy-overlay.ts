import { Group, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Scene } from "three";
import { DIPLOMACY_OVERLAY_COLORS, DIPLOMACY_OVERLAY_STANCES, type DiplomacyOverlayStance } from "./client-diplomacy-overlay/client-diplomacy-overlay.js";

// 3D parity for the 2D Diplomacy tint (client-map-2d-tile-intel.ts): while
// state.showDiplomacyOverlay is on, every other empire's tile gets a flat
// translucent plane in its stance colour (ally / truce / no agreement /
// barbarian), one instanced mesh per stance.

const PLANE_SIZE = 0.96;
// Just above the weak-defensibility plane (0.014) so both stay visible.
const PLANE_Y_OFFSET = 0.018;

export type DiplomacyOverlay3D = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, stance: DiplomacyOverlayStance) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createDiplomacyOverlay3D = (scene: Scene, maxTiles: number): DiplomacyOverlay3D => {
  const group = new Group();
  group.name = "diplomacy-overlay";
  scene.add(group);
  const geometry = new PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
  geometry.rotateX(-Math.PI * 0.5);
  const meshes = new Map<DiplomacyOverlayStance, InstancedMesh>();
  const counts = new Map<DiplomacyOverlayStance, number>();
  for (const stance of DIPLOMACY_OVERLAY_STANCES) {
    // Higher alpha than 2D's 0.36: the ownership colour underneath would otherwise wash it out.
    const material = new MeshBasicMaterial({ toneMapped: false, color: DIPLOMACY_OVERLAY_COLORS[stance], transparent: true, opacity: 0.5, depthWrite: false });
    const mesh = new InstancedMesh(geometry, material, maxTiles);
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Same band as the defensibility overlay: above ownership, below structures.
    mesh.renderOrder = 6;
    meshes.set(stance, mesh);
    counts.set(stance, 0);
    group.add(mesh);
  }
  const tempMatrix = new Matrix4();

  const clear = (): void => {
    for (const stance of DIPLOMACY_OVERLAY_STANCES) counts.set(stance, 0);
  };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number, stance: DiplomacyOverlayStance): void => {
    const mesh = meshes.get(stance);
    const count = counts.get(stance) ?? 0;
    if (!mesh || count >= maxTiles) return;
    tempMatrix.makeTranslation(centerX, surfaceY + PLANE_Y_OFFSET, centerZ);
    mesh.setMatrixAt(count, tempMatrix);
    counts.set(stance, count + 1);
  };

  const commit = (): void => {
    for (const [stance, mesh] of meshes) {
      mesh.count = counts.get(stance) ?? 0;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    geometry.dispose();
    for (const mesh of meshes.values()) {
      (mesh.material as MeshBasicMaterial).dispose();
      mesh.dispose();
    }
  };

  return { group, clear, addInstance, commit, dispose };
};
