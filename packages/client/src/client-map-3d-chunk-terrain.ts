import { landBiomeAt } from "@border-empires/shared";
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Scene
} from "three";
import { terrainShadeVariantAt } from "./client-map-3d-terrain-variation.js";
import type { Tile, TileVisibilityState } from "./client-types.js";

type TerrainLayerDeps = {
  scene: Scene;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  tileAt: (x: number, y: number) => Tile | undefined;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
};

type TerrainChunkView = {
  group: Group;
  meshes: Mesh[];
};

type TerrainBucket = {
  positions: number[];
  normals: number[];
  uvs: number[];
};

type TerrainMaterialSet = {
  landA: MeshStandardMaterial;
  landB: MeshStandardMaterial;
  landC: MeshStandardMaterial;
  sandA: MeshStandardMaterial;
  sandB: MeshStandardMaterial;
  sandC: MeshStandardMaterial;
  mountain: MeshStandardMaterial;
  coastWater: MeshStandardMaterial;
  deepWater: MeshStandardMaterial;
};

const CHUNK_SIZE = 16;
const WORLD_CHUNK_COLUMNS = Math.ceil(512 / CHUNK_SIZE);
const WORLD_CHUNK_ROWS = Math.ceil(512 / CHUNK_SIZE);
const SEA_LEVEL = -0.08;

const clamp255 = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
const tint = (r: number, g: number, b: number, delta: number): [number, number, number] => [
  clamp255(r + delta),
  clamp255(g + delta),
  clamp255(b + delta)
];

const hash01 = (x: number, y: number, seed: number): number => {
  const h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
  return h / 4294967295;
};

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const valueNoise = (x: number, y: number, cell: number, seed: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const tx = x / cell - gx;
  const ty = y / cell - gy;
  const sx = smoothstep(tx);
  const sy = smoothstep(ty);
  const n00 = hash01(gx, gy, seed);
  const n10 = hash01(gx + 1, gy, seed);
  const n01 = hash01(gx, gy + 1, seed);
  const n11 = hash01(gx + 1, gy + 1, seed);
  const nx0 = lerp(n00, n10, sx);
  const nx1 = lerp(n01, n11, sx);
  return lerp(nx0, nx1, sy);
};

const createLegacyTerrainTexture = (
  base: [number, number, number],
  options: { grain: number; waveA?: number; waveB?: number; crack?: number; grass?: boolean; rock?: boolean }
): CanvasTexture => {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("failed to create chunk terrain texture canvas context");
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const [br, bg, bb] = base;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const wave =
        Math.sin((x + y * 0.8) * (options.waveA ?? 0)) * 0.5 +
        Math.cos((y - x * 0.6) * (options.waveB ?? 0)) * 0.5;
      const grain =
        Math.sin((x * 12.9898 + y * 78.233) * 0.017) * 0.5 +
        Math.sin((x * 93.17 - y * 51.11) * 0.021) * 0.5;
      let delta = grain * options.grain + wave * (options.waveA ? 10 : 0);
      if (options.crack) {
        const crack = Math.sin((x * 0.9 + y * 0.2) * 0.25) + Math.cos((y * 1.1 - x * 0.3) * 0.21);
        delta -= Math.max(0, crack) * options.crack;
      }
      if (options.grass) {
        const blade = Math.sin((x * 0.7 + y * 1.3) * 0.33) * 8 + Math.cos((x * 1.1 - y * 0.8) * 0.27) * 6;
        delta += blade * 0.25;
      }
      if (options.rock) {
        const pebble = Math.sin((x * 0.42 + y * 0.58) * 0.9) * Math.cos((x * 0.66 - y * 0.31) * 0.8);
        delta += pebble * 14;
      }
      const [r, g, b] = tint(br, bg, bb, delta);
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
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

const createTerrainMaterials = (): { materials: TerrainMaterialSet; textures: CanvasTexture[] } => {
  const grassLightTexture = createLegacyTerrainTexture([111, 165, 89], { grain: 8, waveA: 0.22, waveB: 0.18, grass: true });
  const grassDarkTexture = createLegacyTerrainTexture([89, 140, 71], { grain: 8, waveA: 0.22, waveB: 0.18, grass: true });
  const sandTexture = createLegacyTerrainTexture([214, 184, 135], { grain: 11, waveA: 0.18, waveB: 0.14 });
  const seaDeepTexture = createLegacyTerrainTexture([71, 128, 158], { grain: 9, waveA: 0.34, waveB: 0.28 });
  const seaCoastTexture = createLegacyTerrainTexture([103, 154, 182], { grain: 8, waveA: 0.31, waveB: 0.26 });
  const rockTexture = createLegacyTerrainTexture([85, 88, 96], { grain: 8, waveA: 0.2, waveB: 0.16, crack: 5, rock: true });

  const make = (map: CanvasTexture, roughness: number, bumpScale: number): MeshStandardMaterial =>
    new MeshStandardMaterial({
      color: "#ffffff",
      map,
      roughness,
      roughnessMap: map,
      bumpMap: map,
      bumpScale,
      metalness: 0.01,
      flatShading: true
    });

  return {
    materials: {
      landA: make(grassLightTexture, 0.79, 0.02),
      landB: make(grassDarkTexture, 0.8, 0.02),
      landC: make(grassLightTexture, 0.78, 0.018),
      sandA: make(sandTexture, 0.74, 0.017),
      sandB: make(sandTexture, 0.74, 0.016),
      sandC: make(sandTexture, 0.73, 0.015),
      mountain: make(rockTexture, 0.9, 0.028),
      coastWater: new MeshStandardMaterial({
        color: new Color("#7ab8cf"),
        map: seaCoastTexture,
        roughness: 0.46,
        roughnessMap: seaCoastTexture,
        bumpMap: seaCoastTexture,
        bumpScale: 0.02,
        metalness: 0.06,
        flatShading: true,
        transparent: true,
        opacity: 0.95
      }),
      deepWater: new MeshStandardMaterial({
        color: new Color("#477b99"),
        map: seaDeepTexture,
        roughness: 0.42,
        roughnessMap: seaDeepTexture,
        bumpMap: seaDeepTexture,
        bumpScale: 0.022,
        metalness: 0.07,
        flatShading: true,
        transparent: true,
        opacity: 0.95
      })
    },
    textures: [grassLightTexture, grassDarkTexture, sandTexture, seaDeepTexture, seaCoastTexture, rockTexture]
  };
};

const createBucket = (): TerrainBucket => ({ positions: [], normals: [], uvs: [] });

const pushVertex = (
  bucket: TerrainBucket,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  u: number,
  v: number
): void => {
  bucket.positions.push(x, y, z);
  bucket.normals.push(nx, ny, nz);
  bucket.uvs.push(u, v);
};

const pushQuad = (
  bucket: TerrainBucket,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  normal: [number, number, number]
): void => {
  const [nx, ny, nz] = normal;
  pushVertex(bucket, a[0], a[1], a[2], nx, ny, nz, 0, 0);
  pushVertex(bucket, b[0], b[1], b[2], nx, ny, nz, 1, 0);
  pushVertex(bucket, c[0], c[1], c[2], nx, ny, nz, 1, 1);
  pushVertex(bucket, a[0], a[1], a[2], nx, ny, nz, 0, 0);
  pushVertex(bucket, c[0], c[1], c[2], nx, ny, nz, 1, 1);
  pushVertex(bucket, d[0], d[1], d[2], nx, ny, nz, 0, 1);
};

const toGeometry = (bucket: TerrainBucket): BufferGeometry | undefined => {
  if (bucket.positions.length === 0) return undefined;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(bucket.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(bucket.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(bucket.uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
};

const terrainNoise = (wx: number, wy: number): number => valueNoise(wx + 41, wy - 17, 6, 47);
const mountainNoise = (wx: number, wy: number): number => valueNoise(wx - 211, wy + 89, 4, 83);

export const terrainSurfaceHeightAt = (wx: number, wy: number, terrain: Tile["terrain"]): number => {
  if (terrain === "SEA") return SEA_LEVEL;
  const biome = landBiomeAt(wx, wy);
  const baseNoise = terrainNoise(wx, wy);
  if (terrain === "MOUNTAIN") {
    const ridge = mountainNoise(wx, wy);
    return 0.9 + ridge * 0.68;
  }
  if (biome === "SAND" || biome === "COASTAL_SAND") {
    return 0.22 + baseNoise * 0.08;
  }
  return 0.29 + baseNoise * 0.11;
};

const isCoastalSea = (wx: number, wy: number, deps: Pick<TerrainLayerDeps, "terrainAt" | "wrapX" | "wrapY">): boolean => {
  if (deps.terrainAt(wx, wy) !== "SEA") return false;
  const neighbors = [
    deps.terrainAt(deps.wrapX(wx), deps.wrapY(wy - 1)),
    deps.terrainAt(deps.wrapX(wx + 1), deps.wrapY(wy)),
    deps.terrainAt(deps.wrapX(wx), deps.wrapY(wy + 1)),
    deps.terrainAt(deps.wrapX(wx - 1), deps.wrapY(wy))
  ];
  return neighbors.some((neighbor) => neighbor === "LAND" || neighbor === "MOUNTAIN");
};

const chunkKeyFor = (cx: number, cy: number): string => `${cx},${cy}`;

const modChunkIndex = (value: number, max: number): number => {
  const normalized = value % max;
  return normalized < 0 ? normalized + max : normalized;
};

export const createClientThreeChunkTerrainLayer = (deps: TerrainLayerDeps) => {
  const root = new Group();
  root.name = "terrain-chunks";
  deps.scene.add(root);

  const { materials, textures } = createTerrainMaterials();
  const activeChunks = new Map<string, TerrainChunkView>();
  const pickables: Object3D[] = [];

  const destroyChunk = (chunk: TerrainChunkView): void => {
    for (const mesh of chunk.meshes) {
      mesh.geometry.dispose();
      root.remove(mesh);
    }
  };

  const syncPickables = (): void => {
    pickables.length = 0;
    for (const chunk of activeChunks.values()) {
      for (const mesh of chunk.meshes) pickables.push(mesh);
    }
  };

  const buildChunk = (chunkX: number, chunkY: number): TerrainChunkView => {
    const landA = createBucket();
    const landB = createBucket();
    const landC = createBucket();
    const sandA = createBucket();
    const sandB = createBucket();
    const sandC = createBucket();
    const mountain = createBucket();
    const coastWater = createBucket();
    const deepWater = createBucket();

    const bucketFor = (wx: number, wy: number, terrain: Tile["terrain"]): TerrainBucket => {
      if (terrain === "MOUNTAIN") return mountain;
      if (terrain === "SEA") return isCoastalSea(wx, wy, deps) ? coastWater : deepWater;
      const variant = terrainShadeVariantAt(wx, wy);
      const biome = landBiomeAt(wx, wy);
      const sand = biome === "SAND" || biome === "COASTAL_SAND";
      if (sand) return variant === 0 ? sandA : variant === 1 ? sandB : sandC;
      return variant === 0 ? landA : variant === 1 ? landB : landC;
    };

    for (let localY = 0; localY < CHUNK_SIZE; localY += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const wx = deps.wrapX(chunkX * CHUNK_SIZE + localX);
        const wy = deps.wrapY(chunkY * CHUNK_SIZE + localY);
        const tile = deps.tileAt(wx, wy);
        const visibility = deps.tileVisibilityStateAt(wx, wy, tile);
        if (visibility === "unexplored") continue;
        const terrain = tile?.terrain ?? deps.terrainAt(wx, wy);
        const top = terrainSurfaceHeightAt(wx, wy, terrain);
        const bucket = bucketFor(wx, wy, terrain);
        const x0 = localX;
        const x1 = localX + 1;
        const z0 = localY;
        const z1 = localY + 1;
        pushQuad(bucket, [x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1], [0, 1, 0]);

        const neighbors = [
          { dx: 0, dy: -1, a: [x0, top, z0] as [number, number, number], b: [x1, top, z0] as [number, number, number], normal: [0, 0, -1] as [number, number, number] },
          { dx: 1, dy: 0, a: [x1, top, z0] as [number, number, number], b: [x1, top, z1] as [number, number, number], normal: [1, 0, 0] as [number, number, number] },
          { dx: 0, dy: 1, a: [x1, top, z1] as [number, number, number], b: [x0, top, z1] as [number, number, number], normal: [0, 0, 1] as [number, number, number] },
          { dx: -1, dy: 0, a: [x0, top, z1] as [number, number, number], b: [x0, top, z0] as [number, number, number], normal: [-1, 0, 0] as [number, number, number] }
        ] as const;

        for (const edge of neighbors) {
          const nx = deps.wrapX(wx + edge.dx);
          const ny = deps.wrapY(wy + edge.dy);
          const neighborTerrain = deps.tileAt(nx, ny)?.terrain ?? deps.terrainAt(nx, ny);
          const neighborTop = terrainSurfaceHeightAt(nx, ny, neighborTerrain);
          if (top - neighborTop < 0.08) continue;
          const lower = Math.max(SEA_LEVEL - 0.16, neighborTop);
          const c: [number, number, number] = [edge.b[0], lower, edge.b[2]];
          const d: [number, number, number] = [edge.a[0], lower, edge.a[2]];
          pushQuad(bucket, edge.a, edge.b, c, d, edge.normal);
        }
      }
    }

    const meshEntries: Array<[BufferGeometry | undefined, MeshStandardMaterial]> = [
      [toGeometry(landA), materials.landA],
      [toGeometry(landB), materials.landB],
      [toGeometry(landC), materials.landC],
      [toGeometry(sandA), materials.sandA],
      [toGeometry(sandB), materials.sandB],
      [toGeometry(sandC), materials.sandC],
      [toGeometry(mountain), materials.mountain],
      [toGeometry(coastWater), materials.coastWater],
      [toGeometry(deepWater), materials.deepWater]
    ];

    const group = new Group();
    group.position.set(0, 0, 0);
    const meshes: Mesh[] = [];
    for (const [geometry, material] of meshEntries) {
      if (!geometry) continue;
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
      meshes.push(mesh);
    }
    root.add(group);
    return { group, meshes };
  };

  const positionChunk = (chunk: TerrainChunkView, chunkX: number, chunkY: number, camX: number, camY: number): void => {
    const worldOriginX = chunkX * CHUNK_SIZE;
    const worldOriginY = chunkY * CHUNK_SIZE;
    let dx = worldOriginX - camX;
    let dy = worldOriginY - camY;
    if (dx > 256) dx -= 512;
    if (dx < -256) dx += 512;
    if (dy > 256) dy -= 512;
    if (dy < -256) dy += 512;
    chunk.group.position.set(dx, 0, dy);
  };

  const updateVisibleChunks = (camX: number, camY: number, halfW: number, halfH: number): void => {
    const minChunkX = Math.floor((camX - halfW - 2) / CHUNK_SIZE);
    const maxChunkX = Math.floor((camX + halfW + 2) / CHUNK_SIZE);
    const minChunkY = Math.floor((camY - halfH - 2) / CHUNK_SIZE);
    const maxChunkY = Math.floor((camY + halfH + 2) / CHUNK_SIZE);
    const needed = new Set<string>();

    for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        const wrappedChunkX = modChunkIndex(chunkX, WORLD_CHUNK_COLUMNS);
        const wrappedChunkY = modChunkIndex(chunkY, WORLD_CHUNK_ROWS);
        const key = chunkKeyFor(wrappedChunkX, wrappedChunkY);
        needed.add(key);
        const existing = activeChunks.get(key);
        if (existing) {
          positionChunk(existing, wrappedChunkX, wrappedChunkY, camX, camY);
          continue;
        }
        const nextChunk = buildChunk(wrappedChunkX, wrappedChunkY);
        positionChunk(nextChunk, wrappedChunkX, wrappedChunkY, camX, camY);
        activeChunks.set(key, nextChunk);
      }
    }

    for (const [key, chunk] of activeChunks) {
      if (needed.has(key)) continue;
      destroyChunk(chunk);
      activeChunks.delete(key);
    }
    syncPickables();
  };

  const dispose = (): void => {
    for (const chunk of activeChunks.values()) destroyChunk(chunk);
    activeChunks.clear();
    root.removeFromParent();
    for (const material of Object.values(materials)) material.dispose();
    for (const texture of textures) texture.dispose();
  };

  return {
    updateVisibleChunks,
    surfaceHeightAt: (wx: number, wy: number): number => terrainSurfaceHeightAt(wx, wy, deps.tileAt(wx, wy)?.terrain ?? deps.terrainAt(wx, wy)),
    pickableObjects: (): Object3D[] => pickables,
    dispose
  };
};
