import {
  DoubleSide, Group, InstancedMesh, Matrix4,
  MeshBasicMaterial, Scene
} from "three";
import { createRelicCoreGeometry } from "./relic-core-geometry.js";
import { createRelicAgedMaterial } from "./relic-aged-material.js";

export type RelicCoreOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (x: number, z: number, surfaceY: number, active: boolean) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

/** Shared weathered relic model, with a bounded instancing lifecycle. */
export const createRelicCoreOverlay = (scene: Scene, capacity: number): RelicCoreOverlay => {
  const geometry = createRelicCoreGeometry();
  const group = new Group();
  group.name = "relic-core-preview";
  scene.add(group);

  const shellMaterial = createRelicAgedMaterial("#465760", 0.12);
  const armourMaterial = createRelicAgedMaterial("#a3afb0", 0.08);
  const machineryMaterial = createRelicAgedMaterial("#586366", 0.30);
  const salvageMaterial = createRelicAgedMaterial("#9b7750", 0.20);
  const recessMaterial = new MeshBasicMaterial({ color: "#202b2e", side: DoubleSide });
  const liveMaterial = new MeshBasicMaterial({ color: "#b8bf86", toneMapped: false, side: DoubleSide });
  const idleMaterial = new MeshBasicMaterial({ color: "#414538", side: DoubleSide });
  const materials = [shellMaterial, armourMaterial, machineryMaterial, salvageMaterial, recessMaterial, liveMaterial, idleMaterial];

  const shell = new InstancedMesh(geometry.shell, shellMaterial, capacity);
  const armour = new InstancedMesh(geometry.armour, armourMaterial, capacity);
  const machinery = new InstancedMesh(geometry.machinery, machineryMaterial, capacity);
  const salvage = new InstancedMesh(geometry.salvage, salvageMaterial, capacity);
  const recess = new InstancedMesh(geometry.recess, recessMaterial, capacity);
  const liveLight = new InstancedMesh(geometry.light, liveMaterial, capacity);
  const idleLight = new InstancedMesh(geometry.light, idleMaterial, capacity);
  const fixed = [shell, armour, machinery, salvage, recess];
  const meshes = [...fixed, liveLight, idleLight];
  for (const mesh of meshes) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const matrix = new Matrix4();

  const clear = (): void => { for (const mesh of meshes) mesh.count = 0; };

  const addInstance = (x: number, z: number, surfaceY: number, active: boolean): void => {
    if (shell.count >= capacity) throw new RangeError("Relic core preview capacity exceeded");
    matrix.makeTranslation(x, surfaceY, z);
    for (const mesh of fixed) {
      mesh.setMatrixAt(mesh.count, matrix);
      mesh.count += 1;
    }
    const light = active ? liveLight : idleLight;
    light.setMatrixAt(light.count, matrix);
    light.count += 1;
  };

  const commit = (): void => {
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  };

  const update = (nowMs: number): void => {
    const flicker = 0.79 + Math.sin(nowMs * 0.0008) * 0.07 + Math.sin(nowMs * 0.0031) * 0.015;
    liveMaterial.color.setRGB(flicker * 0.72, flicker * 0.77, flicker * 0.45);
  };

  const dispose = (): void => {
    scene.remove(group);
    for (const mesh of meshes) mesh.dispose();
    for (const part of Object.values(geometry)) part.dispose();
    for (const material of materials) material.dispose();
    group.clear();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
