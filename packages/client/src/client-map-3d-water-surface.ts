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
  // All wave frequencies are integer multiples of (2π / size) so the
  // pattern wraps cleanly at the texture edge — RepeatWrapping then
  // tiles without visible seams. Pre-Jan-2026 build used non-seamless
  // 0.42 / 0.18 etc., which produced obvious per-tile boundaries.
  const k = (Math.PI * 2) / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      const wave1 = Math.sin(k * (5 * x + 2 * y)) * 0.5;
      const wave2 = Math.cos(k * (2 * x - 3 * y)) * 0.5;
      const wave3 = Math.sin(k * (1 * x + 1 * y)) * 0.4;
      const grain =
        Math.sin(k * (13 * x + 7 * y)) * 0.35 +
        Math.cos(k * (9 * x - 11 * y)) * 0.35;
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
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

// Subdividing the plane gives interior vertices we can displace each
// frame to fake a swell. Edges stay at Y=0 so neighbouring water tiles
// meet flush — see `applyWaveDisplacement` below for the math.
const PLANE_SEGMENTS = 6;
const PLANE_VERTEX_COUNT = (PLANE_SEGMENTS + 1) * (PLANE_SEGMENTS + 1);

const buildMesh = (maxTiles: number, opacity: number, tone: WaterTextureTone, renderOrder: number): {
  geometry: PlaneGeometry;
  material: MeshStandardMaterial;
  texture: CanvasTexture;
  mesh: InstancedMesh;
} => {
  const geometry = new PlaneGeometry(1, 1, PLANE_SEGMENTS, PLANE_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const texture = createWaterTexture(tone);
  // Lower roughness + higher metalness gives more visible sun glints
  // off the water surface; texture stays the dominant colour source.
  const material = new MeshStandardMaterial({
    color: "#ffffff",
    map: texture,
    roughness: 0.22,
    metalness: 0.55,
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

  // Animate the water by scrolling the texture's UV offset over time
  // and bobbing the subdivided plane vertices. Wave is sin(u·π)·sin(v·π)
  // so it's zero along all four plane edges → adjacent tiles meet flush
  // regardless of phase. All instances share the geometry, so writing
  // once per tick updates every tile.
  const applyWaveDisplacement = (geom: PlaneGeometry, seconds: number, phase: number, amplitude: number): void => {
    const positions = geom.attributes.position;
    if (!positions) return;
    const arr = positions.array as Float32Array;
    const swell = Math.sin(seconds * 1.4 + phase);
    const ripple = Math.cos(seconds * 2.3 + phase);
    for (let i = 0; i < PLANE_VERTEX_COUNT; i += 1) {
      const idx = i * 3;
      const u = arr[idx]! + 0.5; // local X mapped to [0,1]
      const v = arr[idx + 2]! + 0.5; // local Z mapped to [0,1]
      const edgeMask = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      const detail = Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI);
      arr[idx + 1] = amplitude * edgeMask * swell + amplitude * 0.5 * detail * edgeMask * ripple;
    }
    positions.needsUpdate = true;
  };

  const tick = (nowMs: number): void => {
    const seconds = nowMs / 1000;
    const deepU = (seconds * 0.018) % 1;
    const deepV = (seconds * 0.012) % 1;
    const shallowU = (seconds * 0.024) % 1;
    const shallowV = (seconds * 0.016) % 1;
    deep.texture.offset.set(deepU, deepV);
    shallow.texture.offset.set(shallowU, shallowV);
    applyWaveDisplacement(deep.geometry, seconds, 0, 0.045);
    applyWaveDisplacement(shallow.geometry, seconds, 1.7, 0.03);
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

  return { deepMesh: deep.mesh, shallowMesh: shallow.mesh, clear, addTile, commit, tick, dispose };
};
