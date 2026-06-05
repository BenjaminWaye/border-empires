import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshPhysicalMaterial,
  RepeatWrapping,
  Scene,
  Vector2
} from "three";

export const WATER_SURFACE_Y = -0.06;

// Normal map repeats every UV_WORLD_SCALE world units (tiles).
const UV_WORLD_SCALE = 4.0;

// Deep navy / shallow teal — lerped per-vertex based on proximity to shore.
const DEEP_COLOR = new Color(0x1a4f70);
const SHALLOW_COLOR = new Color(0x3ec8d8);

// Generate a seamless tangent-space normal map from overlapping sine waves.
// `freq` controls wave frequency; `amp` controls slope steepness.
const createNormalMap = (freq: number, amp: number): CanvasTexture => {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("water normal map: failed to get 2d context");
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const k = (Math.PI * 2) / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Two wave directions give a cross-swell appearance.
      const dhu =
        amp * Math.cos(k * freq * (3 * x + 1 * y)) +
        amp * 0.5 * Math.cos(k * freq * (5 * x - 2 * y));
      const dhv =
        amp * Math.cos(k * freq * (1 * x + 3 * y)) +
        amp * 0.5 * Math.cos(k * freq * (-2 * x + 5 * y));
      const len = Math.sqrt(dhu * dhu + dhv * dhv + 1);
      const nx = -dhu / len;
      const ny = -dhv / len;
      d[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[idx + 2] = 255;
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
};

export type WaterSurface = {
  readonly clear: () => void;
  readonly addTile: (centerX: number, centerZ: number, shallow: boolean) => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

type TileEntry = { gc: number; gr: number; shallow: boolean };

const tileKey = (gc: number, gr: number): string => `${gc},${gr}`;

export const createWaterSurface = (scene: Scene, _maxTiles: number): WaterSurface => {
  // _maxTiles kept for API compatibility — merged geometry sizes itself.

  let tiles: TileEntry[] = [];
  const tileMap = new Map<string, boolean>(); // grid-coord key → shallow

  // Low-freq swell + high-freq chop scrolled independently for a
  // two-wave-system look.
  const swellMap = createNormalMap(1, 0.8);
  const choppyMap = createNormalMap(2, 0.35);

  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.06,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.90,
    normalMap: swellMap,
    normalScale: new Vector2(0.55, 0.55),
    clearcoatNormalMap: choppyMap,
    clearcoatNormalScale: new Vector2(0.3, 0.3),
    depthWrite: false
  });

  let mesh: Mesh | null = null;
  let geometry: BufferGeometry | null = null;

  const clear = (): void => {
    tiles = [];
    tileMap.clear();
  };

  const addTile = (centerX: number, centerZ: number, shallow: boolean): void => {
    // Tile centers arrive as dx+0.5, dy+0.5. Floor gives the integer
    // grid column/row (top-left corner of each tile in world space).
    const gc = Math.floor(centerX);
    const gr = Math.floor(centerZ);
    tiles.push({ gc, gr, shallow });
    tileMap.set(tileKey(gc, gr), shallow);
  };

  const commit = (): void => {
    if (mesh) {
      scene.remove(mesh);
      mesh = null;
    }
    if (geometry) {
      geometry.dispose();
      geometry = null;
    }
    if (tiles.length === 0) return;

    // Bounding box in grid coords.
    let minGC = Infinity, maxGC = -Infinity;
    let minGR = Infinity, maxGR = -Infinity;
    for (const t of tiles) {
      if (t.gc < minGC) minGC = t.gc;
      if (t.gc > maxGC) maxGC = t.gc;
      if (t.gr < minGR) minGR = t.gr;
      if (t.gr > maxGR) maxGR = t.gr;
    }

    const tileCols = maxGC - minGC + 1;
    const tileRows = maxGR - minGR + 1;
    const vCols = tileCols + 1; // vertex columns
    const vRows = tileRows + 1; // vertex rows
    const vCount = vCols * vRows;

    const positions = new Float32Array(vCount * 3);
    const uvs = new Float32Array(vCount * 2);
    const colors = new Float32Array(vCount * 3);
    const indices = new Uint32Array(tiles.length * 6); // 2 triangles × 3 indices

    // Vertex at (vc, vr) sits at world (minGC+vc, WATER_Y, minGR+vr).
    // Corners are integer world coords; tile centers sit between them.
    for (let vr = 0; vr < vRows; vr++) {
      for (let vc = 0; vc < vCols; vc++) {
        const vi = (vr * vCols + vc) * 3;
        const worldX = minGC + vc;
        const worldZ = minGR + vr;
        positions[vi]     = worldX;
        positions[vi + 1] = WATER_SURFACE_Y;
        positions[vi + 2] = worldZ;
        const ui = (vr * vCols + vc) * 2;
        uvs[ui]     = worldX / UV_WORLD_SCALE;
        uvs[ui + 1] = worldZ / UV_WORLD_SCALE;
      }
    }

    // Vertex color: blend deep/shallow based on how many of the up-to-4
    // surrounding tiles are shallow. This gives a gradient at coastlines.
    for (let vr = 0; vr < vRows; vr++) {
      for (let vc = 0; vc < vCols; vc++) {
        const adj: [number, number][] = [
          [minGC + vc - 1, minGR + vr - 1],
          [minGC + vc,     minGR + vr - 1],
          [minGC + vc - 1, minGR + vr    ],
          [minGC + vc,     minGR + vr    ]
        ];
        let waterCount = 0;
        let shallowCount = 0;
        for (const [agc, agr] of adj) {
          const sh = tileMap.get(tileKey(agc, agr));
          if (sh !== undefined) {
            waterCount++;
            if (sh) shallowCount++;
          }
        }
        const t = waterCount > 0 ? shallowCount / waterCount : 0;
        const ci = (vr * vCols + vc) * 3;
        colors[ci]     = DEEP_COLOR.r + t * (SHALLOW_COLOR.r - DEEP_COLOR.r);
        colors[ci + 1] = DEEP_COLOR.g + t * (SHALLOW_COLOR.g - DEEP_COLOR.g);
        colors[ci + 2] = DEEP_COLOR.b + t * (SHALLOW_COLOR.b - DEEP_COLOR.b);
      }
    }

    // Index buffer: one quad (2 triangles) per tile.
    let ii = 0;
    for (const { gc, gr } of tiles) {
      const vc = gc - minGC;
      const vr = gr - minGR;
      const tl = vr * vCols + vc;
      const tr = tl + 1;
      const bl = (vr + 1) * vCols + vc;
      const br = bl + 1;
      // CCW winding for top-view (normal pointing up).
      indices[ii++] = tl;
      indices[ii++] = bl;
      indices[ii++] = tr;
      indices[ii++] = tr;
      indices[ii++] = bl;
      indices[ii++] = br;
    }

    geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("uv",       new BufferAttribute(uvs, 2));
    geometry.setAttribute("color",    new BufferAttribute(colors, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    scene.add(mesh);
  };

  const tick = (nowMs: number): void => {
    const s = nowMs / 1000;
    // Swell and chop scroll in slightly different directions at different
    // speeds so they produce an organic interference pattern over time.
    swellMap.offset.set((s * 0.013) % 1,  (s * 0.009) % 1);
    choppyMap.offset.set((-s * 0.008) % 1, (s * 0.015) % 1);
  };

  const dispose = (): void => {
    if (mesh) scene.remove(mesh);
    geometry?.dispose();
    material.dispose();
    swellMap.dispose();
    choppyMap.dispose();
  };

  return { clear, addTile, commit, tick, dispose };
};
