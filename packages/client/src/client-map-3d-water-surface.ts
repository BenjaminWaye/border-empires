import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  RepeatWrapping,
  Scene,
  Vector2
} from "three";

export const WATER_SURFACE_Y = -0.06;

// The water mesh itself is a flat, zero-thickness sheet (see commit() below)
// — unlike land tiles, which get their own vertical "skirt" wall dropped at
// every coastal edge (client-map-3d-heightfield.ts) so they read as solid
// from any angle. Water relied entirely on that land-side skirt to hide the
// void beneath it, which only covers edges where land is actually adjacent
// this frame — anywhere water borders water-that-isn't-drawn-this-tick, a
// different owner's fog boundary, or simply sits mid-sea, there was no wall
// at all, so a grazing/underside view saw straight through to empty
// background (black) right under the water surface. Matches the land
// skirt's own depth so the two skirts meet with no gap at the coastline.
const WATER_SKIRT_BOTTOM_Y = -0.6;
// Skirt color is the tile's own water color dimmed by a flat, non-lit
// factor (baked into the vertex color, not computed from scene lighting) —
// the same technique the land skirt uses and for the same reason: a
// lit material here would read solid from some angles and black from
// others depending on where the sun happens to be, which is the exact bug
// class DoubleSide above was added to fix. Baking the shade into the vertex
// color guarantees a consistent look regardless of camera or light angle.
const WATER_SKIRT_SHADE = 0.55;

// Normal map repeats every UV_WORLD_SCALE world units (tiles).
const UV_WORLD_SCALE = 6.0;

// Deep dark navy — reads as opaque depth.
// Shallow is washed-out light blue — combined with lower opacity lets terrain show through.
const DEEP_COLOR = new Color(0x0a2e42);
const SHALLOW_COLOR = new Color(0x6abbc8);

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
  // Swell: large lazy undulations. Chop: fine wind-riffled texture on top.
  const swellMap = createNormalMap(1, 0.3);
  const choppyMap = createNormalMap(2, 0.15);

  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.28,             // broad but visible specular — shimmer, not lightning
    metalness: 0.0,
    clearcoat: 0.4,
    clearcoatRoughness: 0.4,
    transparent: true,
    opacity: 0.78,
    // Floor brightness = a dim tint of DEEP_COLOR (not near-black) so water
    // reads as dark sea, not a black hole, when lit faces turn away from
    // the camera (e.g. viewed from the south, opposite the sun/fill lights).
    emissive: DEEP_COLOR.clone().multiplyScalar(0.4),
    emissiveIntensity: 1.0,
    normalMap: swellMap,
    normalScale: new Vector2(0.32, 0.32),
    clearcoatNormalMap: choppyMap,
    clearcoatNormalScale: new Vector2(0.12, 0.12),
    // The mesh only winds a front face (normal pointing up, see commit()
    // below) — without DoubleSide, any view angle that catches the
    // underside (looking up from below water level, or a steep enough
    // camera angle) renders nothing at all, showing empty background
    // through the hole instead of water.
    side: DoubleSide,
    depthWrite: false
  });

  // toneMapped: false — this is a flat gameplay-legibility fill (baked
  // shade, not lit geometry), not something the scene's filmic tone curve
  // should touch. See client-map-3d-tone-mapping-regression.test.ts.
  const skirtMaterial = new MeshBasicMaterial({ toneMapped: false, vertexColors: true, side: DoubleSide });
  let skirtMesh: Mesh | null = null;
  let skirtGeometry: BufferGeometry | null = null;

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
    const key = tileKey(gc, gr);
    if (tileMap.has(key)) return; // guard against double-add within one rebuild cycle
    tiles.push({ gc, gr, shallow });
    tileMap.set(key, shallow);
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
    const posAttr = new BufferAttribute(positions, 3);
    posAttr.setUsage(DynamicDrawUsage); // updated every frame in tick()
    geometry.setAttribute("position", posAttr);
    geometry.setAttribute("uv",       new BufferAttribute(uvs, 2));
    geometry.setAttribute("color",    new BufferAttribute(colors, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    scene.add(mesh);

    // Skirt: a vertical wall dropped to WATER_SKIRT_BOTTOM_Y along every
    // tile edge that doesn't border another water tile — see
    // WATER_SKIRT_BOTTOM_Y above for why the flat sheet needs this.
    if (skirtMesh) {
      scene.remove(skirtMesh);
      skirtMesh = null;
    }
    if (skirtGeometry) {
      skirtGeometry.dispose();
      skirtGeometry = null;
    }

    const skirtPositions: number[] = [];
    const skirtColors: number[] = [];
    const skirtIndices: number[] = [];
    const tmpColor = new Color();

    const emitSkirtEdge = (ax: number, az: number, bx: number, bz: number, shallow: boolean): void => {
      tmpColor.copy(shallow ? SHALLOW_COLOR : DEEP_COLOR).multiplyScalar(WATER_SKIRT_SHADE);
      const base = skirtPositions.length / 3;
      skirtPositions.push(
        ax, WATER_SURFACE_Y, az,
        bx, WATER_SURFACE_Y, bz,
        ax, WATER_SKIRT_BOTTOM_Y, az,
        bx, WATER_SKIRT_BOTTOM_Y, bz
      );
      for (let v = 0; v < 4; v++) skirtColors.push(tmpColor.r, tmpColor.g, tmpColor.b);
      skirtIndices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    };

    // Only the south edge (gr+1, the side facing the default isometric
    // camera) gets a skirt. North/east/west skirts sat right where the
    // land skirt's own coastal wall runs (client-map-3d-heightfield.ts) —
    // two near-coplanar unlit walls animating independently z-fought and
    // flickered against each other every frame. South-facing coastline is
    // also where the camera actually needs the wall (the far/back edges
    // are rarely seen edge-on), so dropping the other three is the
    // pragmatic fix rather than trying to reconcile two skirts' depths.
    for (const { gc, gr, shallow } of tiles) {
      if (!tileMap.has(tileKey(gc, gr + 1))) emitSkirtEdge(gc + 1, gr + 1, gc, gr + 1, shallow);
    }

    if (skirtPositions.length > 0) {
      skirtGeometry = new BufferGeometry();
      const skirtPosAttr = new BufferAttribute(new Float32Array(skirtPositions), 3);
      skirtPosAttr.setUsage(DynamicDrawUsage); // top row updated every frame in tick()
      skirtGeometry.setAttribute("position", skirtPosAttr);
      skirtGeometry.setAttribute("color", new BufferAttribute(new Float32Array(skirtColors), 3));
      skirtGeometry.setIndex(skirtIndices);
      skirtMesh = new Mesh(skirtGeometry, skirtMaterial);
      skirtMesh.frustumCulled = false;
      skirtMesh.renderOrder = 11;
      scene.add(skirtMesh);
    }
  };

  // Same swell+chop formula the main surface uses in tick() below — shared
  // so the skirt's top edge (see waveY use in tick()) stays flush with the
  // surface instead of leaving a gap when the surface waves above it.
  const waveY = (wx: number, wz: number, s: number): number => {
    const swell = Math.sin(wx * 0.7 + s * 0.65) * Math.cos(wz * 0.55 + s * 0.5) * 0.16;
    const chop  = Math.sin(wx * 1.4 - s * 0.45) * Math.cos(wz * 1.2 + s * 0.7) * 0.06;
    return WATER_SURFACE_Y + swell + chop;
  };

  const tick = (nowMs: number): void => {
    const s = nowMs / 1000;

    // Vertex Y displacement — two overlapping sine waves in world space.
    // Amplitude 0.10 is clearly visible at isometric zoom without being absurd.
    if (geometry) {
      const posAttr = geometry.attributes["position"] as BufferAttribute;
      const pos = posAttr.array as Float32Array;
      const n = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const wx = pos[i * 3] ?? 0;
        const wz = pos[i * 3 + 2] ?? 0;
        pos[i * 3 + 1] = waveY(wx, wz, s);
      }
      posAttr.needsUpdate = true;
    }

    // Skirt top edge rides the same wave as the surface — every 4th/4th+1
    // vertex pair is the top of a wall segment (see emitSkirtEdge above),
    // the other two are the static bottom. Without this the skirt's flat
    // top sits below the surface at wave crests, exposing a gap.
    if (skirtGeometry) {
      const skirtPosAttr = skirtGeometry.attributes["position"] as BufferAttribute;
      const skirtPos = skirtPosAttr.array as Float32Array;
      const n = skirtPos.length / 3;
      for (let i = 0; i < n; i++) {
        if (i % 4 >= 2) continue; // bottom-row vertex — stays put
        const wx = skirtPos[i * 3] ?? 0;
        const wz = skirtPos[i * 3 + 2] ?? 0;
        skirtPos[i * 3 + 1] = waveY(wx, wz, s);
      }
      skirtPosAttr.needsUpdate = true;
    }

    // Normal map scroll for surface texture shimmer.
    swellMap.offset.set((s * 0.009) % 1,  (s * 0.006) % 1);
    choppyMap.offset.set((-s * 0.005) % 1, (s * 0.010) % 1);
  };

  const dispose = (): void => {
    if (mesh) scene.remove(mesh);
    if (skirtMesh) scene.remove(skirtMesh);
    geometry?.dispose();
    skirtGeometry?.dispose();
    material.dispose();
    skirtMaterial.dispose();
    swellMap.dispose();
    choppyMap.dispose();
  };

  return { clear, addTile, commit, tick, dispose };
};
