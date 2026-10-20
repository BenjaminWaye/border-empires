import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import type { PodMeshKey } from "./client-map-3d-construction-pod-assets.js";

// Fills the shared delivery meshes (client-map-3d-construction-pod-assets.ts) one frame at a time:
// begin(), then put/putAt for every part of every delivery, then end() uploads the counts.
export type PodInstanceWriter = {
  readonly begin: () => void;
  // One instance with a full transform; `color` tints it (additive meshes: colour is opacity).
  readonly put: (key: PodMeshKey, matrix: Matrix4, color?: Color) => void;
  // An unrotated instance at a point, uniformly scaled, tinted `color` at `strength` (0..1).
  // Skipped when too faint or too small to see.
  readonly putAt: (key: PodMeshKey, x: number, y: number, z: number, size: number, color: Color, strength: number) => void;
  readonly end: () => void;
};

export const createPodInstanceWriter = (meshes: Readonly<Record<PodMeshKey, InstancedMesh>>): PodInstanceWriter => {
  const keys = Object.keys(meshes) as PodMeshKey[];
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<PodMeshKey, number>;
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identity = new Quaternion();
  const tint = new Color();

  const put: PodInstanceWriter["put"] = (key, m, color) => {
    const mesh = meshes[key];
    if (counts[key] >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(counts[key], m);
    if (color) mesh.setColorAt(counts[key], color);
    counts[key] += 1;
  };

  return {
    begin: (): void => {
      for (const key of keys) counts[key] = 0;
    },
    put,
    putAt: (key, x, y, z, size, color, strength) => {
      if (strength <= 0.003 || size <= 0) return;
      matrix.compose(position.set(x, y, z), identity, scale.set(size, size, size));
      put(key, matrix, tint.copy(color).multiplyScalar(Math.min(1, strength)));
    },
    end: (): void => {
      for (const key of keys) {
        const mesh = meshes[key];
        mesh.count = counts[key];
        mesh.visible = counts[key] > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  };
};
