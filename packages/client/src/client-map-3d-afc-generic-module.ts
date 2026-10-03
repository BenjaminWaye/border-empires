// Generic AFC module cartridge — the stand-in that docks into a socket for an
// AFC-Module tech that has no bespoke 3D family yet (see
// client-map-3d-afc-module-family.ts). Without it such a module took up a
// socket index but rendered nothing, so an unlocked module looked like it
// never attached. It is deliberately plain: a seated iron drum with a brass
// band and a cyan power cap, matching the visual language of the real
// families (blackened iron, aged brass, restrained cyan emissive).
import { CylinderGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Scene, Vector3, type Texture } from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";

export type AfcGenericModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createAfcGenericModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): AfcGenericModuleOverlay => {
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const cyanMaterial = new MeshStandardMaterial({ color: "#05222a", roughness: 0.3, metalness: 0.1, flatShading: true, emissive: "#41f6ff", emissiveIntensity: 1.6 });
  // Piece layout: bottom y offset above the pad-top attachment point + height.
  const parts: ReadonlyArray<{ readonly geo: CylinderGeometry; readonly mat: MeshStandardMaterial; readonly y: number }> = [
    { geo: new CylinderGeometry(0.13, 0.15, 0.16, 12), mat: ironMaterial, y: 0.08 },
    { geo: new CylinderGeometry(0.155, 0.155, 0.035, 12), mat: brassMaterial, y: 0.1 },
    { geo: new CylinderGeometry(0.06, 0.08, 0.05, 10), mat: cyanMaterial, y: 0.185 }
  ];
  const meshes = parts.map(({ geo, mat }) => {
    applyBuildingEnvMap(mat, buildingEnvironmentTexture);
    const mesh = new InstancedMesh(geo, mat, maxInstances);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });
  const matrix = new Matrix4();
  const position = new Vector3();
  const unitScale = new Vector3(1, 1, 1);
  const identityQuat = new Quaternion();
  let count = 0;

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number): number => {
    if (count >= maxInstances) return -1;
    parts.forEach(({ y }, i) => {
      position.set(sceneX, surfaceY + y, sceneZ);
      matrix.compose(position, identityQuat, unitScale);
      meshes[i]!.setMatrixAt(count, matrix);
    });
    count += 1;
    return count - 1;
  };
  const commit = (): void => {
    for (const mesh of meshes) {
      mesh.count = count;
      if (count === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  const dispose = (): void => {
    for (const mesh of meshes) scene.remove(mesh);
    for (const { geo } of parts) geo.dispose();
    ironMaterial.dispose();
    brassMaterial.dispose();
    cyanMaterial.dispose();
  };
  return { clear: () => { count = 0; }, addInstance, commit, update: () => {}, dispose };
};
