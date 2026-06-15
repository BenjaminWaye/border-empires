import {
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene
} from "three";
import type { EdgeDirection } from "./client-defensibility-tile.js";

// Per-edge crack strips on own settled tiles when LOCAL_SUPPORT_DEFENSE_ENABLED.
// A thin dark-crimson strip is rendered along each exposed cardinal side
// (sides not backed by friendly-settled or barrier terrain), signalling that
// the combat-defence on that side is reduced by the local-support model.
//
// Two InstancedMeshes: one for N/S strips (wide in X, thin in Z) and one for
// E/W strips (thin in X, wide in Z).  Both share the same material.

const STRIP_LONG = 0.92;
const STRIP_SHORT = 0.11;
const STRIP_Y_OFFSET = 0.012;
const EDGE_OFFSET = 0.445;

export type SupportCrackOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addEdge: (centerX: number, centerZ: number, surfaceY: number, side: EdgeDirection) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createSupportCrackOverlay = (scene: Scene, maxEdges: number): SupportCrackOverlay => {
  const group = new Group();
  group.name = "support-crack-overlay";
  scene.add(group);

  // N/S strip: long in X, short in Z
  const hGeometry = new PlaneGeometry(STRIP_LONG, STRIP_SHORT);
  hGeometry.rotateX(-Math.PI * 0.5);

  // E/W strip: short in X, long in Z
  const vGeometry = new PlaneGeometry(STRIP_SHORT, STRIP_LONG);
  vGeometry.rotateX(-Math.PI * 0.5);

  const material = new MeshBasicMaterial({
    color: "#7a1818",
    transparent: true,
    opacity: 0.70,
    depthWrite: false
  });

  const hMesh = new InstancedMesh(hGeometry, material, maxEdges);
  const vMesh = new InstancedMesh(vGeometry, material, maxEdges);

  for (const mesh of [hMesh, vMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 6;
  }
  group.add(hMesh, vMesh);

  const tempMatrix = new Matrix4();
  let hCount = 0;
  let vCount = 0;

  const clear = (): void => {
    hCount = 0;
    vCount = 0;
  };

  const addEdge = (centerX: number, centerZ: number, surfaceY: number, side: EdgeDirection): void => {
    const y = surfaceY + STRIP_Y_OFFSET;
    if (side === "north" || side === "south") {
      if (hCount >= maxEdges) return;
      const oz = side === "north" ? centerZ - EDGE_OFFSET : centerZ + EDGE_OFFSET;
      tempMatrix.makeTranslation(centerX, y, oz);
      hMesh.setMatrixAt(hCount, tempMatrix);
      hCount += 1;
    } else {
      if (vCount >= maxEdges) return;
      const ox = side === "west" ? centerX - EDGE_OFFSET : centerX + EDGE_OFFSET;
      tempMatrix.makeTranslation(ox, y, centerZ);
      vMesh.setMatrixAt(vCount, tempMatrix);
      vCount += 1;
    }
  };

  const commit = (): void => {
    hMesh.count = hCount;
    vMesh.count = vCount;
    hMesh.instanceMatrix.needsUpdate = true;
    vMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    hGeometry.dispose();
    vGeometry.dispose();
    material.dispose();
  };

  return { group, clear, addEdge, commit, dispose };
};
