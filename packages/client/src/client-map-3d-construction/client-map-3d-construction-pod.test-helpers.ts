import { InstancedMesh, Matrix4, type Scene } from "three";
import { POD_FRAME_PARTS, podMeshName } from "./client-map-3d-construction-pod-assets.js";

// Pods are instances of shared meshes (client-map-3d-construction-pod-assets.ts), not scene
// objects of their own, so tests read them back from the pod frame mesh after an update.
const frameMesh = (scene: Scene): InstancedMesh | undefined => scene.getObjectByName(podMeshName("frame")) as InstancedMesh | undefined;

// How many pods the last update drew (each draws all its frame parts while in the air).
export const podsDrawn = (scene: Scene): number => (frameMesh(scene)?.count ?? 0) / POD_FRAME_PARTS;

// Ground-plane position of the first drawn pod (its base plate's centre).
export const firstPodXZ = (scene: Scene): { x: number; z: number } | undefined => {
  const mesh = frameMesh(scene);
  if (!mesh || mesh.count === 0) return undefined;
  const m = new Matrix4();
  mesh.getMatrixAt(0, m);
  return { x: m.elements[12]!, z: m.elements[14]! };
};
