import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene
} from "three";
import type { WeakDefensibilitySeverity } from "./client-defensibility-tile.js";

// 3D parity for the 2D weak-defensibility overlay drawn in
// client-runtime-loop.ts: when state.showWeakDefensibility is on, every
// SETTLED LAND tile owned by `me` with ≥2 exposed (non-shielded, non-self)
// sides gets a coloured square — orange for 2 exposed sides, red for 3+.
// In 3D we paint a flat translucent plane on the tile surface plus a
// small floating "pip" marker so the warning still reads from a low
// camera angle when ownership colour is also on the tile.

const PLANE_SIZE = 0.94;
const PLANE_Y_OFFSET = 0.014;

const PIP_SIZE = 0.18;
const PIP_HEIGHT = 0.04;
const PIP_Y_OFFSET = 0.32;

export type DefensibilityOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, severity: WeakDefensibilitySeverity) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createDefensibilityOverlay = (scene: Scene, maxTiles: number): DefensibilityOverlay => {
  const group = new Group();
  group.name = "defensibility-overlay";
  scene.add(group);

  const planeGeometry = new PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
  planeGeometry.rotateX(-Math.PI * 0.5);
  const pipGeometry = new BoxGeometry(PIP_SIZE, PIP_HEIGHT, PIP_SIZE);

  // Bright fills (higher alpha than the 2D 0.12/0.18 because the
  // ownership colour underneath would otherwise wash them out).
  const warningPlaneMaterial = new MeshBasicMaterial({
    color: "#ffad5c",
    transparent: true,
    opacity: 0.45,
    depthWrite: false
  });
  const criticalPlaneMaterial = new MeshBasicMaterial({
    color: "#ff5454",
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  const warningPipMaterial = new MeshBasicMaterial({
    color: "#ffc45c",
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  const criticalPipMaterial = new MeshBasicMaterial({
    color: "#ff5454",
    transparent: true,
    opacity: 0.98,
    depthWrite: false
  });

  const warningPlaneMesh = new InstancedMesh(planeGeometry, warningPlaneMaterial, maxTiles);
  const criticalPlaneMesh = new InstancedMesh(planeGeometry, criticalPlaneMaterial, maxTiles);
  const warningPipMesh = new InstancedMesh(pipGeometry, warningPipMaterial, maxTiles);
  const criticalPipMesh = new InstancedMesh(pipGeometry, criticalPipMaterial, maxTiles);
  const allMeshes = [warningPlaneMesh, criticalPlaneMesh, warningPipMesh, criticalPipMesh];

  for (const mesh of allMeshes) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Sit above ownership (renderOrder ~5) so the colour is not hidden,
    // but below town/fort silhouettes (renderOrder 7+).
    mesh.renderOrder = 6;
  }
  group.add(...allMeshes);

  const tempMatrix = new Matrix4();
  let warningCount = 0;
  let criticalCount = 0;

  const clear = (): void => {
    warningCount = 0;
    criticalCount = 0;
  };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number, severity: WeakDefensibilitySeverity): void => {
    if (severity === "critical") {
      if (criticalCount >= maxTiles) return;
      tempMatrix.makeTranslation(centerX, surfaceY + PLANE_Y_OFFSET, centerZ);
      criticalPlaneMesh.setMatrixAt(criticalCount, tempMatrix);
      tempMatrix.makeTranslation(centerX, surfaceY + PIP_Y_OFFSET, centerZ);
      criticalPipMesh.setMatrixAt(criticalCount, tempMatrix);
      criticalCount += 1;
    } else {
      if (warningCount >= maxTiles) return;
      tempMatrix.makeTranslation(centerX, surfaceY + PLANE_Y_OFFSET, centerZ);
      warningPlaneMesh.setMatrixAt(warningCount, tempMatrix);
      tempMatrix.makeTranslation(centerX, surfaceY + PIP_Y_OFFSET, centerZ);
      warningPipMesh.setMatrixAt(warningCount, tempMatrix);
      warningCount += 1;
    }
  };

  const commit = (): void => {
    warningPlaneMesh.count = warningCount;
    warningPipMesh.count = warningCount;
    criticalPlaneMesh.count = criticalCount;
    criticalPipMesh.count = criticalCount;
    warningPlaneMesh.instanceMatrix.needsUpdate = true;
    warningPipMesh.instanceMatrix.needsUpdate = true;
    criticalPlaneMesh.instanceMatrix.needsUpdate = true;
    criticalPipMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    planeGeometry.dispose();
    pipGeometry.dispose();
    warningPlaneMaterial.dispose();
    criticalPlaneMaterial.dispose();
    warningPipMaterial.dispose();
    criticalPipMaterial.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};
