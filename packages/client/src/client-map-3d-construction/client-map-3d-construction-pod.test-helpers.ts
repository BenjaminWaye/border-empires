import { InstancedMesh, Matrix4, type Scene } from "three";
import { DRONE_ROTORS, POD_PANELS, podMeshName, type PodMeshKey } from "./client-map-3d-construction-pod-assets.js";

// Pods are instances of shared meshes (client-map-3d-construction-pod-assets.ts), not scene
// objects of their own, so tests read them back from the pod frame mesh after an update.
const podMesh = (scene: Scene, key: PodMeshKey): InstancedMesh | undefined => scene.getObjectByName(podMeshName(key)) as InstancedMesh | undefined;
const frameMesh = (scene: Scene): InstancedMesh | undefined => podMesh(scene, "frame");

// How many pods the last update drew (each draws its four walls until it has unpacked).
export const podsDrawn = (scene: Scene): number => (podMesh(scene, "panel")?.count ?? 0) / POD_PANELS;

// How many courier drones the last update drew (each has its ducted fans).
export const dronesDrawn = (scene: Scene): number => (podMesh(scene, "duct")?.count ?? 0) / DRONE_ROTORS;

// Ground-plane position of the first drawn pod (its base plate's centre: the pod is drawn before its drone).
export const firstPodXZ = (scene: Scene): { x: number; z: number } | undefined => {
  const mesh = frameMesh(scene);
  if (!mesh || mesh.count === 0) return undefined;
  const m = new Matrix4();
  mesh.getMatrixAt(0, m);
  return { x: m.elements[12]!, z: m.elements[14]! };
};
