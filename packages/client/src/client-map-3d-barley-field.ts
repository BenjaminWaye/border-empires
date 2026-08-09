import {
  BufferGeometry,
  CanvasTexture,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Vector3
} from "three";

// 3D barley field overlay — a dense, mature standing-grain crop that replaces the old FARM
// resource overlay. The whole tile is the crop: no buildings, no equipment, no fences. A low
// irregular soil bed in dark fertile earth supports a carpet of slender golden-green stalks
// topped with elongated barley seed heads, with pale awns among them catching the key light.
//
// RENDERING TECHNIQUE — shell texturing.
// The crop is NOT modelled as individual stalk meshes. A previous implementation built ~1,400
// tiny cylinders per tile (a stalk + seed head + awn per plant, ~600-800 plants), which meant
// ~2M sub-pixel triangles on screen for a modest number of farm tiles. Sub-pixel triangles are
// pathological for a GPU: each still shades a full 2x2 pixel quad, so almost all of that
// shading work was paid for geometry too small to see.
//
// Instead each tile draws a short stack of horizontal alpha-cut planes ("shells") through a
// procedurally generated crop texture. The texture's alpha encodes stalk HEIGHT, so shell N
// discards every texel shorter than its own height — the surviving texels shrink as the stack
// rises, which reads as thousands of individually tapering stalks. The camera sits ~34 degrees
// off vertical (PERSPECTIVE_TILT_RADIANS), so parallax between shells gives the stack real
// volume rather than looking like stacked decals. Seed heads are a second, wider-dotted texture
// on the upper shells. Per-shell darkening toward the base fakes the ambient occlusion a real
// crop canopy has.
//
// Cost per tile: 2 soil mounds + 8 shells, versus ~1,400 cylinders — with the visual density
// coming from texture resolution, which is nearly free, instead of from geometry.
//
// Plant positions, heights, leans and tones remain deterministically seeded (from the texture
// hash and per-tile rotation/tint), so every farm tile is stable across frames but reads
// differently from its neighbour, and the patch silhouette stays organic rather than a
// geometric square. Three density/tone variants keep adjacent tiles from looking identical.

const UP = new Vector3(0, 1, 0);

export type BarleyFieldVariant = 0 | 1 | 2;

export const barleyFieldVariantAt = (worldX: number, worldZ: number): BarleyFieldVariant => {
  const h = ((worldX * 374761393) ^ (worldZ * 668265263) ^ (402653189 * 1442695041)) >>> 0;
  return (h % 3) as BarleyFieldVariant;
};

// Deterministic per-tile PRNG so a tile paints the same field every frame. Seeded from the
// world coords + variant; mulberry32 core.
const hashSeed = (worldX: number, worldZ: number, salt: number): number => {
  let h = (worldX * 374761393) ^ (worldZ * 668265263) ^ (salt * 1442695041);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h;
};

const mulberry = (seed: number): (() => number) => {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type BarleyFieldOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
  readonly setDetailEnabled: (enabled: boolean) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

// Extreme zoom-out floor. Below this a tile covers only a few CSS pixels (zoom is device px
// per tile; dpr 3 on the reference mobile device), where the shell stack's parallax cannot
// resolve at all. Rather than dropping to bare soil — a field seen from altitude reads as
// golden crop, not brown dirt — the far LOD draws a single golden canopy plane over the bed.
// Real play sits at zoom ~64-160, well above this, so the full stack is what normally renders.
export const BARLEY_DETAIL_MIN_ZOOM = 32;

// Shell stack. STALK_SHELLS spans the green stalk body, HEAD_SHELLS the golden seed heads
// above it. Eight total is enough for the parallax to read as a continuous canopy at the zooms
// this is drawn at; more shells cost overdraw for detail the tile size cannot show.
const STALK_SHELLS = 5;
const HEAD_SHELLS = 3;
const STALK_H = 0.17;
const HEAD_H = 0.1;
// Slightly wider than a tile so the alpha-cut silhouette can spill past the nominal edge,
// matching the ragged, non-square footprint the per-plant scatter used to produce.
const CROP_SPAN = 1.12;
const TEXTURE_SIZE = 256;

type CropTextureSpec = {
  readonly dotCount: number;
  readonly radiusPx: number;
  readonly palette: ReadonlyArray<readonly [number, number, number]>;
  readonly salt: number;
};

// Where the round crop patch starts thinning, as a fraction of the texture's half-width, and
// how ragged that boundary is. The field is a disc rather than a square: real farmland worked
// around a settlement reads as a patch, and a hard square of crop butting against its
// neighbours looked like tiling. Jitter keeps the rim organic instead of a drawn-compass circle.
// 0.78 of the half-span, jittering to 0.94, puts the rim at ~0.44-0.53 tiles from centre — the
// crop now fills almost the whole tile, well clear of the soil bed's ~0.31 radius, so the mound
// only shows as a thin collar of dark earth instead of swallowing the grain.
const PATCH_EDGE_START = 0.78;
const PATCH_EDGE_JITTER = 0.16;

// Fraction of full height a plant keeps at distance `nd` (0 at patch centre, 1 at the texture
// edge). Plants past the rim are dropped entirely; plants approaching it get shorter, so the
// patch domes down at its edge instead of ending on a flat cliff — and because the shells cut
// on height, the whole stack narrows toward the rim on its own.
const patchHeightFalloff = (nd: number, rimJitter: number): number => {
  const rim = PATCH_EDGE_START + rimJitter * PATCH_EDGE_JITTER;
  if (nd >= rim) return 0;
  const t = 1 - nd / rim;
  // Smoothstep so the crop thins gradually rather than stepping down.
  return t * t * (3 - 2 * t);
};

// Builds an RGBA texture whose ALPHA is a height field and whose RGB is per-dot colour. Each
// dot is one plant cross-section: alpha falls off linearly to its edge, so raising a shell's
// alphaTest shrinks every dot at once and the stack tapers like real stalks. The dot field is
// masked to a jittered disc (see patchHeightFalloff) so the tile's crop reads as a round patch.
export const buildCropTextureData = (spec: CropTextureSpec): Uint8ClampedArray => {
  const size = TEXTURE_SIZE;
  const half = size / 2;
  const data = new Uint8ClampedArray(size * size * 4);
  const rng = mulberry(hashSeed(spec.salt, spec.dotCount, 7919));

  const stamp = (cx: number, cy: number, radius: number, peak: number, r: number, g: number, b: number): void => {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(size - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(size - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) continue;
        const height = peak * (1 - d / radius);
        const idx = (y * size + x) * 4;
        // Tallest plant wins the texel, so overlapping dots occlude rather than blend.
        if (height * 255 <= data[idx + 3]!) continue;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = height * 255;
      }
    }
  };

  for (let i = 0; i < spec.dotCount; i += 1) {
    const cx = rng() * size;
    const cy = rng() * size;
    const radius = spec.radiusPx * (0.75 + rng() * 0.5);
    // Height spread keeps the canopy from terminating on one flat plane.
    const peak = 0.72 + rng() * 0.28;
    const tone = spec.palette[Math.floor(rng() * spec.palette.length)]!;
    const nd = Math.hypot(cx - half, cy - half) / half;
    const falloff = patchHeightFalloff(nd, rng());
    if (falloff <= 0) continue;
    stamp(cx, cy, radius, peak * falloff, tone[0], tone[1], tone[2]);
  }

  return data;
};

const makeCropTexture = (spec: CropTextureSpec): CanvasTexture | null => {
  // Tests and any non-DOM consumer construct the overlay without a document; the geometry and
  // instancing all still work, the shells just render untextured. Mirrors the guard in
  // client-map-3d-terrain-textures.ts.
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  image.data.set(buildCropTextureData(spec));
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

export const createBarleyFieldOverlay = (scene: Scene, maxTiles: number): BarleyFieldOverlay => {
  // ─── Soil bed ───────────────────────────────────────────────────────
  // Dark fertile soil, low metalness and high roughness so it stays matte and recessive under
  // the bright crop. Two overlapping flattened mounds give the field an organic, non-square
  // footprint. 0-subdivision icosahedron = 20 flat facets, flattened into a low mound.
  const soilAMaterial = new MeshStandardMaterial({ color: "#4d3a26", roughness: 0.95, metalness: 0, flatShading: true });
  const soilBMaterial = new MeshStandardMaterial({ color: "#5c4630", roughness: 0.92, metalness: 0, flatShading: true });
  const soilGeo = new IcosahedronGeometry(0.18, 0);

  // ─── Crop textures ──────────────────────────────────────────────────
  // Stalks: many fine dots in fresh golden-green through warm straw, so the field reads as a
  // real mature crop with tonal depth rather than one flat painted mass.
  const stalkTexture = makeCropTexture({
    dotCount: 3400,
    radiusPx: 2.1,
    salt: 17,
    palette: [
      [125, 143, 63],
      [143, 152, 70],
      [156, 148, 72],
      [110, 132, 58]
    ]
  });
  // Seed heads: fewer, wider dots in warm gold with pale awn flecks among them.
  const headTexture = makeCropTexture({
    dotCount: 1950,
    radiusPx: 3.4,
    salt: 71,
    palette: [
      [217, 174, 60],
      [233, 197, 82],
      [241, 223, 138],
      [200, 158, 52]
    ]
  });

  // ─── Shell meshes ───────────────────────────────────────────────────
  // One horizontal plane, reused by every shell level; the per-level height, alpha cutoff and
  // shading live in the instance matrix and the level's own material.
  const shellGeo = new PlaneGeometry(CROP_SPAN, CROP_SPAN);
  shellGeo.rotateX(-Math.PI / 2);

  type Shell = { mesh: InstancedMesh; y: number; count: number };
  const shells: Shell[] = [];
  const shellMaterials: MeshStandardMaterial[] = [];

  const addShellLevel = (y: number, alphaTest: number, shade: number, texture: CanvasTexture | null): Shell => {
    const material = new MeshStandardMaterial({
      // Shade darkens lower shells so the canopy has depth instead of reading as flat layers —
      // the cheap stand-in for the ambient occlusion a real crop has near the ground.
      color: new Color(shade, shade, shade),
      roughness: 0.85,
      metalness: 0,
      // alphaTest (not transparency) keeps these fully opaque draws: no depth sorting, no
      // blend-order artifacts between a tile's own shells or against neighbouring tiles.
      alphaTest,
      ...(texture ? { map: texture } : {})
    });
    shellMaterials.push(material);
    const mesh = new InstancedMesh(shellGeo, material, maxTiles);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    const shell: Shell = { mesh, y, count: 0 };
    shells.push(shell);
    return shell;
  };

  // Stalk shells: rise through the stalk body, cutting away shorter plants as they go.
  for (let i = 0; i < STALK_SHELLS; i += 1) {
    const t = i / STALK_SHELLS;
    addShellLevel(STALK_H * ((i + 0.5) / STALK_SHELLS), 0.06 + t * 0.62, 0.62 + t * 0.38, stalkTexture);
  }
  // Head shells: sit above the stalks on the wider seed-head texture.
  for (let i = 0; i < HEAD_SHELLS; i += 1) {
    const t = i / HEAD_SHELLS;
    addShellLevel(STALK_H + HEAD_H * ((i + 0.5) / HEAD_SHELLS), 0.1 + t * 0.5, 0.9 + t * 0.1, headTexture);
  }
  const detailShellCount = shells.length;

  // Far LOD: one golden canopy plane at mid-crop height, standing in for the whole stack once
  // the tile is too small for parallax to resolve. A low alpha cutoff keeps it nearly solid so
  // it covers the dark soil bed — a distant field should read as golden grain, not bare dirt —
  // while the texture's alpha still gives it an organic, non-square edge.
  const canopyShell = addShellLevel(STALK_H * 0.9, 0.04, 1, headTexture);

  const soilA = new InstancedMesh(soilGeo, soilAMaterial, maxTiles);
  const soilB = new InstancedMesh(soilGeo, soilBMaterial, maxTiles);
  for (const mesh of [soilA, soilB]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
  }
  let soilACount = 0;
  let soilBCount = 0;

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scaleVec = new Vector3();
  const quat = new Quaternion();
  const tintColor = new Color();

  // Per-variant tone and vigour: higher variants read slightly taller and warmer, so adjacent
  // farm tiles never look stamped from the same die.
  const variantTint: ReadonlyArray<readonly [number, number, number]> = [
    [0.94, 0.97, 0.9],
    [1, 1, 1],
    [1.06, 1.02, 0.94]
  ];
  const variantHeightScale = [0.94, 1, 1.07] as const;

  const placeShell = (shell: Shell, sceneX: number, surfaceY: number, sceneZ: number, spin: number, heightScale: number, tint: readonly [number, number, number]): void => {
    if (shell.count >= maxTiles) return;
    position.set(sceneX, surfaceY + shell.y * heightScale, sceneZ);
    // Spinning the plane rotates its texture sample with it, which is what keeps neighbouring
    // tiles from showing the same crop pattern in the same orientation.
    quat.setFromAxisAngle(UP, spin);
    scaleVec.set(1, 1, 1);
    matrix.compose(position, quat, scaleVec);
    shell.mesh.setMatrixAt(shell.count, matrix);
    shell.mesh.setColorAt(shell.count, tintColor.setRGB(tint[0], tint[1], tint[2]));
    shell.count += 1;
  };

  const placeSoil = (mesh: InstancedMesh, count: number, sceneX: number, surfaceY: number, sceneZ: number, ox: number, oy: number, oz: number, s: number, sy: number, spin: number): number => {
    if (count >= maxTiles) return count;
    position.set(sceneX + ox, surfaceY + oy, sceneZ + oz);
    quat.setFromAxisAngle(UP, spin);
    scaleVec.set(s, sy, s);
    matrix.compose(position, quat, scaleVec);
    mesh.setMatrixAt(count, matrix);
    return count + 1;
  };

  // ─── Public API ─────────────────────────────────────────────────────
  let detailEnabled = true;

  const clear = (): void => {
    for (const shell of shells) shell.count = 0;
    soilACount = 0;
    soilBCount = 0;
  };

  // Called once per terrain rebuild with whether the current zoom resolves crop detail at all.
  // Defaults to true so storybook and tests that never call it get the full stack.
  const setDetailEnabled = (enabled: boolean): void => {
    detailEnabled = enabled;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    const variant = barleyFieldVariantAt(worldTileX, worldTileY);
    const rng = mulberry(hashSeed(worldTileX, worldTileY, 7919 + variant * 131));
    const spin = rng() * Math.PI * 2;
    const heightScale = variantHeightScale[variant];
    const tint = variantTint[variant]!;

    soilACount = placeSoil(soilA, soilACount, sceneX, surfaceY, sceneZ, -0.04, 0.014, -0.02, 1.7, 0.1, rng() * Math.PI * 2);
    soilBCount = placeSoil(soilB, soilBCount, sceneX, surfaceY, sceneZ, 0.06, 0.017, 0.04, 1.5, 0.09, rng() * Math.PI * 2);

    if (!detailEnabled) {
      placeShell(canopyShell, sceneX, surfaceY, sceneZ, spin, heightScale, tint);
      return;
    }
    for (let i = 0; i < detailShellCount; i += 1) {
      placeShell(shells[i]!, sceneX, surfaceY, sceneZ, spin, heightScale, tint);
    }
  };

  const commit = (): void => {
    const flush = (mesh: InstancedMesh, count: number): void => {
      mesh.count = count;
      // Upload only the instances actually used. Without an update range three.js does
      // gl.bufferSubData(target, 0, array) — the entire allocated capacity, however few
      // instances are drawn — and that upload happens inside renderer.render(), where this
      // module's own timings never see it.
      mesh.instanceMatrix.clearUpdateRanges();
      if (mesh.instanceColor) mesh.instanceColor.clearUpdateRanges();
      if (count === 0) return;
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.addUpdateRange(0, count * 3);
        mesh.instanceColor.needsUpdate = true;
      }
    };
    for (const shell of shells) flush(shell.mesh, shell.count);
    flush(soilA, soilACount);
    flush(soilB, soilBCount);
  };

  const dispose = (): void => {
    for (const shell of shells) scene.remove(shell.mesh);
    scene.remove(soilA);
    scene.remove(soilB);
    shellGeo.dispose();
    soilGeo.dispose();
    for (const material of shellMaterials) material.dispose();
    soilAMaterial.dispose();
    soilBMaterial.dispose();
    stalkTexture?.dispose();
    headTexture?.dispose();
  };

  return { clear, addInstance, setDetailEnabled, commit, dispose };
};
