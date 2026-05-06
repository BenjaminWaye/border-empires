import {
  CanvasTexture,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace
} from "three";

export const WATER_SURFACE_Y = -0.06;

const WATER_TEXTURE_SIZE = 64;
const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

type WaterTextureTone = {
  readonly baseR: number;
  readonly baseG: number;
  readonly baseB: number;
  readonly waveContrast: number;
};

const SHALLOW_TONE: WaterTextureTone = { baseR: 132, baseG: 198, baseB: 210, waveContrast: 22 };
const DEEP_TONE: WaterTextureTone = { baseR: 56, baseG: 110, baseB: 156, waveContrast: 18 };

const createWaterTexture = (tone: WaterTextureTone): CanvasTexture => {
  const size = WATER_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("failed to create water texture canvas context");
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      const wave1 = Math.sin((x * 0.42 + y * 0.18)) * 0.5;
      const wave2 = Math.cos((x * 0.18 - y * 0.36)) * 0.5;
      const wave3 = Math.sin((x * 0.07 + y * 0.05) * Math.PI) * 0.4;
      const grain =
        Math.sin((x * 12.9898 + y * 78.233) * 0.0173) * 0.5 +
        Math.sin((x * 93.17 - y * 51.11) * 0.0211) * 0.5;
      const delta =
        wave1 * tone.waveContrast * 0.6 +
        wave2 * tone.waveContrast * 0.45 +
        wave3 * tone.waveContrast +
        grain * (tone.waveContrast * 0.5);
      data[idx + 0] = clamp255(tone.baseR + delta * 0.7);
      data[idx + 1] = clamp255(tone.baseG + delta * 1.0);
      data[idx + 2] = clamp255(tone.baseB + delta * 0.5);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.needsUpdate = true;
  return texture;
};

export type WaterSurface = {
  readonly deepMesh: InstancedMesh;
  readonly shallowMesh: InstancedMesh;
  readonly clear: () => void;
  readonly addTile: (centerX: number, centerZ: number, shallow: boolean) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const buildMesh = (maxTiles: number, opacity: number, tone: WaterTextureTone, renderOrder: number): {
  geometry: PlaneGeometry;
  material: MeshStandardMaterial;
  texture: CanvasTexture;
  mesh: InstancedMesh;
} => {
  const geometry = new PlaneGeometry(1, 1, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const texture = createWaterTexture(tone);
  const material = new MeshStandardMaterial({
    color: "#ffffff",
    map: texture,
    roughness: 0.42,
    metalness: 0.32,
    transparent: true,
    opacity,
    depthWrite: false
  });
  const mesh = new InstancedMesh(geometry, material, maxTiles);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = renderOrder;
  return { geometry, material, texture, mesh };
};

export const createWaterSurface = (scene: Scene, maxTiles: number): WaterSurface => {
  const deep = buildMesh(maxTiles, 0.94, DEEP_TONE, 12);
  const shallow = buildMesh(maxTiles, 0.86, SHALLOW_TONE, 13);
  scene.add(deep.mesh, shallow.mesh);

  const tempMatrix = new Matrix4();
  let deepCount = 0;
  let shallowCount = 0;

  const clear = (): void => {
    deepCount = 0;
    shallowCount = 0;
  };

  const addTile = (centerX: number, centerZ: number, shallowTile: boolean): void => {
    const target = shallowTile ? shallow : deep;
    const count = shallowTile ? shallowCount : deepCount;
    if (count >= maxTiles) return;
    tempMatrix.makeTranslation(centerX, WATER_SURFACE_Y, centerZ);
    target.mesh.setMatrixAt(count, tempMatrix);
    if (shallowTile) shallowCount += 1;
    else deepCount += 1;
  };

  const commit = (): void => {
    deep.mesh.count = deepCount;
    shallow.mesh.count = shallowCount;
    deep.mesh.instanceMatrix.needsUpdate = true;
    shallow.mesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(deep.mesh, shallow.mesh);
    deep.geometry.dispose();
    shallow.geometry.dispose();
    deep.material.dispose();
    shallow.material.dispose();
    deep.texture.dispose();
    shallow.texture.dispose();
  };

  return { deepMesh: deep.mesh, shallowMesh: shallow.mesh, clear, addTile, commit, dispose };
};
