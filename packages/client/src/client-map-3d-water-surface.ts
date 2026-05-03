import {
  BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene
} from "three";

export const WATER_SURFACE_Y = -0.06;
export const WATER_WAVE_AMPLITUDE = 0.025;
const WATER_PLANE_TILES = 240;
const WATER_PLANE_SEGMENTS = 60;
const WATER_WAVE_X_FREQUENCY = 0.42;
const WATER_WAVE_Z_FREQUENCY = 0.31;
const WATER_WAVE_SPEED_MS = 0.0008;

export type WaterSurface = {
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  readonly geometry: PlaneGeometry;
  readonly update: (nowMs: number, camX: number, camY: number) => void;
  readonly dispose: () => void;
};

export const createWaterSurface = (scene: Scene): WaterSurface => {
  const geometry = new PlaneGeometry(
    WATER_PLANE_TILES,
    WATER_PLANE_TILES,
    WATER_PLANE_SEGMENTS,
    WATER_PLANE_SEGMENTS
  );
  geometry.rotateX(-Math.PI / 2);
  const positionAttr = geometry.attributes.position as BufferAttribute | undefined;
  let baseXZ: Float32Array | undefined;
  if (positionAttr) {
    const arr = positionAttr.array as Float32Array;
    baseXZ = new Float32Array(arr.length);
    baseXZ.set(arr);
  }

  const material = new MeshStandardMaterial({
    color: "#1c4674",
    roughness: 0.28,
    metalness: 0.55,
    transparent: true,
    opacity: 0.86,
    depthWrite: false
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.position.set(0, WATER_SURFACE_Y, 0);
  scene.add(mesh);

  const update = (nowMs: number, _camX: number, _camY: number): void => {
    if (!positionAttr || !baseXZ) return;
    const arr = positionAttr.array as Float32Array;
    const t = nowMs * WATER_WAVE_SPEED_MS;
    for (let i = 0; i < arr.length; i += 3) {
      const x = baseXZ[i] ?? 0;
      const z = baseXZ[i + 2] ?? 0;
      const wave =
        Math.sin(x * WATER_WAVE_X_FREQUENCY + t) * 0.5 +
        Math.cos(z * WATER_WAVE_Z_FREQUENCY + t * 1.13) * 0.5;
      arr[i + 1] = wave * WATER_WAVE_AMPLITUDE;
    }
    positionAttr.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return { mesh, material, geometry, update, dispose };
};
