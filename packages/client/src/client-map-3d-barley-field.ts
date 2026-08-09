import {
  BufferGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3
} from "three";

// 3D barley field overlay — a dense, mature standing-grain crop that
// replaces the old FARM resource overlay (which rendered neat field
// plates, cross paths and orchard trees). The whole tile is the crop:
// no buildings, no equipment, no fences. A low irregular soil bed in
// dark fertile earth supports a carpet of slender golden-green stalks
// topped with elongated barley seed heads, with sparse pale awns among
// them that catch the key light. Plant positions, heights,
// leans and tones are deterministically seeded from the tile's world
// coordinates (same hash approach as the titanium deposit), so every
// farm tile is stable across frames but reads differently from its
// neighbour, and the patch silhouette stays organic rather than a
// geometric square. Three density/tone variants keep adjacent tiles
// from looking identical.

export type BarleyFieldVariant = 0 | 1 | 2;

export const barleyFieldVariantAt = (worldX: number, worldZ: number): BarleyFieldVariant => {
  const h = ((worldX * 374761393) ^ (worldZ * 668265263) ^ (402653189 * 1442695041)) >>> 0;
  return (h % 3) as BarleyFieldVariant;
};

// Deterministic per-tile PRNG so a tile paints the same field every
// frame. Seeded from the world coords + variant; mulberry32 core.
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

// Extreme zoom-out floor. At this zoom a tile covers ~10 CSS px (zoom is device px per tile,
// dpr 3 on the reference mobile device), where a ~1,400-piece crop carpet is physically
// unresolvable and renders as a flat colour block — which the soil bed already provides. Real
// play sits at zoom ~64-160, far above this, so the full crop is what actually gets drawn in
// every normal view; this only prevents building millions of sub-pixel instances when the
// player zooms all the way out.
export const BARLEY_DETAIL_MIN_ZOOM = 32;

export const createBarleyFieldOverlay = (scene: Scene, maxTiles: number): BarleyFieldOverlay => {
  // ─── Materials (shared by piece type) ───────────────────────────────
  // Dark fertile soil bed — low metalness, high roughness so it stays
  // matte and recessive under the bright crop.
  const soilAMaterial = new MeshStandardMaterial({ color: "#4d3a26", roughness: 0.95, metalness: 0, flatShading: true });
  const soilBMaterial = new MeshStandardMaterial({ color: "#5c4630", roughness: 0.92, metalness: 0, flatShading: true });
  // Stalk tones run from fresh golden-green to warm straw so the field
  // reads as a real mature crop with depth, not one flat painted mass.
  const stalkGreenMaterial = new MeshStandardMaterial({ color: "#7d8f3f", roughness: 0.9, metalness: 0, flatShading: true });
  const stalkStrawMaterial = new MeshStandardMaterial({ color: "#9c9448", roughness: 0.88, metalness: 0, flatShading: true });
  // Seed heads: warm golden-yellow with a faint warm emissive so heads
  // stay bright even where the key light dips, and each flat facet picks
  // up the light naturally.
  const headGoldMaterial = new MeshStandardMaterial({
    color: "#d9ae3c",
    roughness: 0.55,
    metalness: 0,
    flatShading: true,
    emissive: "#7a5c10",
    emissiveIntensity: 0.18
  });
  const headPaleMaterial = new MeshStandardMaterial({
    color: "#e9c552",
    roughness: 0.5,
    metalness: 0,
    flatShading: true,
    emissive: "#8a6c18",
    emissiveIntensity: 0.22
  });
  // Long awns — the barley's signature bristles. Pale and low-roughness
  // so they glint across the field.
  const awnMaterial = new MeshStandardMaterial({
    color: "#f1df8a",
    roughness: 0.45,
    metalness: 0,
    flatShading: true,
    emissive: "#a78a2a",
    emissiveIntensity: 0.25
  });

  // ─── Geometries (shared) ────────────────────────────────────────────
  // 0-subdivision icosahedron = 20 flat triangular facets; flattened it
  // makes an organic low soil mound with a ragged, non-square footprint.
  const soilGeo = new IcosahedronGeometry(0.18, 0);
  // Slender tapered stalk (5-sided low-poly cylinder), 0.17 tall — half
  // the original plant size so the dense carpet reads as fine grain.
  const stalkGeo = new CylinderGeometry(0.006, 0.008, 0.17, 5);
  // Elongated barley seed head — slightly tapered (narrower at the top
  // like a ripening spike), 0.10 tall.
  const headGeo = new CylinderGeometry(0.007, 0.011, 0.1, 5);
  // Very thin long awn bristle, 0.12 tall.
  const awnGeo = new CylinderGeometry(0.002, 0.002, 0.12, 3);

  // ─── InstancedMesh registry ────────────────────────────────────────
  type Slot = { mesh: InstancedMesh; count: number; cap: number };
  const slots = new Map<string, Slot>();

  const make = (key: string, geo: BufferGeometry, mat: MeshStandardMaterial, cap: number): Slot => {
    const mesh = new InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    const slot: Slot = { mesh, count: 0, cap };
    slots.set(key, slot);
    return slot;
  };

  // Cap sizing. An InstancedMesh eagerly allocates cap * 16 float32s (64 bytes/instance) for
  // its matrix buffer, on the CPU heap AND mirrored in VRAM — and commit() re-uploads that
  // whole buffer (see commit()). Sizing caps as maxTiles (14,000) * ~300 pieces, i.e. assuming
  // every visible tile could simultaneously be a max-density farm tile, allocated ~1.33 GB and
  // re-uploaded it to the GPU on every terrain rebuild. Every other 3D overlay in this codebase
  // uses a per-tile multiplier of 2-12; a dense crop needs a per-tile budget instead.
  //
  // So: crop capacity is budgeted per farm tile actually drawn at detail, not per visible tile.
  // 512 is deliberately generous — at the zoom range real play sits in, the whole visible
  // window is only ~600-1,300 tiles, so this only binds if the great majority of the screen is
  // farmland at once. In every ordinary view the full crop draws exactly as before; the budget
  // exists so the worst case degrades (to soil bed, still a tilled field) instead of
  // reserving a gigabyte for a situation that never happens.
  const MAX_DETAIL_TILES = 512;
  // Per-detail-tile reservations, set comfortably above the densest variant's expected usage
  // (560 plants + 200 dwarf heads, split across tone buckets by the layout RNG) so ordinary
  // variance never silently drops pieces. The pool is shared across detail tiles, so per-tile
  // over/under-use averages out well before the cap binds.
  make("soilA", soilGeo, soilAMaterial, maxTiles);
  make("soilB", soilGeo, soilBMaterial, maxTiles);
  make("stalkGreen", stalkGeo, stalkGreenMaterial, MAX_DETAIL_TILES * 400);
  make("stalkStraw", stalkGeo, stalkStrawMaterial, MAX_DETAIL_TILES * 360);
  make("headGold", headGeo, headGoldMaterial, MAX_DETAIL_TILES * 460);
  make("headPale", headGeo, headPaleMaterial, MAX_DETAIL_TILES * 420);
  make("awn", awnGeo, awnMaterial, MAX_DETAIL_TILES * 260);

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();

  // Places a piece using an already-computed quaternion (qx,qy,qz,qw) rather than raw Euler
  // angles — see BarleyPiece below. Quaternion.setFromEuler does real trig work per axis, and
  // almost every stalk/head has a non-zero tilt, so doing that conversion here (on every
  // rebuild, for every piece) rather than once per tile (cached) would undo most of the point
  // of caching the layout in the first place.
  const placePiece = (
    key: string,
    wx: number,
    sy: number,
    wz: number,
    ox: number,
    oy: number,
    oz: number,
    sx: number,
    sy2: number,
    sz: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number
  ): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(wx + ox, sy + oy, wz + oz);
    scale.set(sx, sy2, sz);
    tmpQuat.set(qx, qy, qz, qw);
    matrix.compose(position, tmpQuat, scale);
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.count += 1;
  };

  // ─── Field layout ───────────────────────────────────────────────────
  // Each tile gets one low soil bed (two overlapping mounds, slightly
  // offset so the dark fertile earth peeks out around the crop edge and
  // in the thinnest patches) plus a scatter of barley plants. Plant
  // radii bias toward the tile centre but a few plants push past the
  // nominal edge so the silhouette stays irregular.
  const STALK_H = 0.17;
  const HEAD_H = 0.1;

  // A tile's ~600-800 plants are fully determined by its world coordinates (the RNG is seeded
  // from worldTileX/worldTileY, not the camera-relative scene position addInstance is called
  // with — the same world tile always paints the same crop). rebuildVisibleTerrain() calls
  // addInstance again for every visible farm tile on every terrain rebuild — which, before the
  // rebuild throttle, could be dozens of times a second during a zoom/pan gesture — so
  // regenerating ~600-800 RNG-driven pieces (each with several rng()/Math.cos/sin/sqrt calls)
  // from scratch every single time was pure waste: the layout came out identical regardless.
  // This caches the deterministic relative-offset layout per world tile, computed once, and
  // replays it (via addPiece) against the current camera-relative origin on every subsequent
  // call — skipping the RNG/trig regeneration while still writing fresh instance matrices
  // (unavoidable: those must reflect the current camera-relative frame).
  // Quaternion, not raw Euler angles: Quaternion.setFromEuler does real trig per axis, and
  // almost every piece has a non-zero tilt, so it's computed once here (cache build) rather
  // than by placePiece on every rebuild (see placePiece's comment above).
  type BarleyPiece = {
    key: string;
    ox: number; oy: number; oz: number;
    sx: number; sy2: number; sz: number;
    qx: number; qy: number; qz: number; qw: number;
  };
  // Soil bed and crop are stored separately so the soil-only LOD path (see addInstance) can
  // draw the field's ground without walking the ~1,400-piece crop list.
  type BarleyLayout = { soil: BarleyPiece[]; crop: BarleyPiece[] };
  // Bounded like client-map-facade.ts's terrainColorCache: a long session that pans across many
  // distinct farm tiles shouldn't grow this indefinitely (each entry is ~600-800 small objects).
  const LAYOUT_CACHE_LIMIT = 500;
  const layoutCache = new Map<string, BarleyLayout>();
  const layoutCacheOrder: string[] = [];

  const buildBarleyFieldLayout = (worldTileX: number, worldTileY: number, v: BarleyFieldVariant): BarleyLayout => {
    const rng = mulberry(hashSeed(worldTileX, worldTileY, 7919 + v * 131));
    const soil: BarleyPiece[] = [];
    const crop: BarleyPiece[] = [];
    let target = soil;
    const push = (key: string, ox: number, oy: number, oz: number, sx = 1, sy2 = 1, sz = 1, rotY = 0, rotX = 0, rotZ = 0): void => {
      let qx = 0, qy = 0, qz = 0, qw = 1; // identity
      if (rotX !== 0 || rotY !== 0 || rotZ !== 0) {
        tmpEuler.set(rotX, rotY, rotZ, "XYZ");
        tmpQuat.setFromEuler(tmpEuler);
        qx = tmpQuat.x;
        qy = tmpQuat.y;
        qz = tmpQuat.z;
        qw = tmpQuat.w;
      }
      target.push({ key, ox, oy, oz, sx, sy2, sz, qx, qy, qz, qw });
    };

    // Soil bed — two overlapping flattened mounds form the field mass.
    push("soilA", -0.05, 0.022, -0.03, 2.4, 0.16, 2.4, rng() * Math.PI * 2);
    push("soilB", 0.09, 0.026, 0.05, 2.1, 0.14, 2.1, rng() * Math.PI * 2);
    // Everything from here on is crop. The RNG draw order below is unchanged, so a tile's
    // layout is byte-for-byte what it was before the soil/crop split.
    target = crop;

    // Dense crop: base plant count per variant, biased taller/warmer as
    // the variant index rises so adjacent tiles read differently. Counts
    // are ~10x the original sparse field — the tile now reads as a solid
    // carpet of standing grain rather than scattered stalks.
    const plantCount = 480 + v * 40;
    for (let i = 0; i < plantCount; i += 1) {
      const r = 0.46 * Math.sqrt(rng());
      const a = rng() * Math.PI * 2;
      let ox = Math.cos(a) * r;
      let oz = Math.sin(a) * r;
      // Let a few plants stray past the nominal radius for a ragged edge.
      if (rng() < 0.1) {
        ox *= 1.2;
        oz *= 1.2;
      }
      const h = 0.85 + rng() * 0.4;
      const tiltAmt = (rng() - 0.5) * 0.24;
      const tiltDir = rng() * Math.PI * 2;
      const tx = Math.sin(tiltDir) * tiltAmt;
      const tz = Math.cos(tiltDir) * tiltAmt;

      // Stalk — mix of fresh green and straw tones.
      const stalkKey = rng() < 0.55 ? "stalkGreen" : "stalkStraw";
      push(stalkKey, ox, (STALK_H / 2) * h, oz, 1, h, 1, 0, tx, tz);

      // Seed head on most plants, slightly leaning with the stalk so the
      // crop reads as bending grain rather than rigid pickets.
      if (rng() < 0.82) {
        const headKey = rng() < 0.55 ? "headGold" : "headPale";
        const headTilt = tiltAmt * 0.7 + (rng() - 0.5) * 0.1;
        push(headKey, ox, STALK_H * h + (HEAD_H / 2) * h, oz, 1, h * 0.9, 1, 0, headTilt, 0);

        // Awns: a sparse bristle on ~40% of heads. At this density the
        // awn mesh was the single biggest allocation (~1/3 of the total),
        // so keep only a scattering to break up the carpet silhouette
        // without paying for a full set of bristles per plant.
        if (rng() < 0.4) {
          const awnDir = rng() * Math.PI * 2;
          const awnLean = 0.35 + rng() * 0.5;
          const awnX = Math.cos(awnDir);
          const awnZ = Math.sin(awnDir);
          push(
            "awn",
            ox + awnX * 0.01,
            STALK_H * h + HEAD_H * h * 0.9 + 0.06,
            oz + awnZ * 0.01,
            1, 1, 1,
            awnDir, awnLean, 0
          );
        }
      }
    }

    // A few short heads tucked low into the crop (no visible tall stalk)
    // thicken the golden carpet without adding silhouette clutter.
    const dwarfCount = 120 + v * 40;
    for (let i = 0; i < dwarfCount; i += 1) {
      const r = 0.3 * Math.sqrt(rng());
      const a = rng() * Math.PI * 2;
      const headKey = rng() < 0.5 ? "headGold" : "headPale";
      push(headKey, Math.cos(a) * r, (HEAD_H / 2) * 0.8, Math.sin(a) * r, 1, 0.8, 1, 0, (rng() - 0.5) * 0.12, 0);
    }

    return { soil, crop };
  };

  const layoutForTile = (worldTileX: number, worldTileY: number, v: BarleyFieldVariant): BarleyLayout => {
    const cacheKey = `${worldTileX},${worldTileY}`;
    const cached = layoutCache.get(cacheKey);
    if (cached) return cached;
    const layout = buildBarleyFieldLayout(worldTileX, worldTileY, v);
    layoutCache.set(cacheKey, layout);
    layoutCacheOrder.push(cacheKey);
    if (layoutCacheOrder.length > LAYOUT_CACHE_LIMIT) {
      const oldestKey = layoutCacheOrder.shift();
      if (oldestKey !== undefined) layoutCache.delete(oldestKey);
    }
    return layout;
  };

  const placeAll = (pieces: BarleyPiece[], wx: number, sy: number, wz: number): void => {
    for (const piece of pieces) {
      placePiece(piece.key, wx, sy, wz, piece.ox, piece.oy, piece.oz, piece.sx, piece.sy2, piece.sz, piece.qx, piece.qy, piece.qz, piece.qw);
    }
  };

  // ─── Public API ─────────────────────────────────────────────────────
  // Detail budget for the current frame. Reset by clear() (called once per terrain rebuild),
  // consumed by addInstance; see MAX_DETAIL_TILES above for why the crop is budgeted at all.
  let detailTilesUsed = 0;
  let detailEnabled = true;

  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
    detailTilesUsed = 0;
  };

  // Called once per terrain rebuild with whether the current zoom resolves individual crop
  // detail at all. Defaults to true so storybook/tests that never call it are unaffected.
  const setDetailEnabled = (enabled: boolean): void => {
    detailEnabled = enabled;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    const v = barleyFieldVariantAt(worldTileX, worldTileY);
    const layout = layoutForTile(worldTileX, worldTileY, v);
    // Soil bed always draws, so a farm tile never blinks out of existence — it just loses its
    // individual stalks past the budget / below the detail zoom.
    placeAll(layout.soil, sceneX, surfaceY, sceneZ);
    if (!detailEnabled || detailTilesUsed >= MAX_DETAIL_TILES) return;
    detailTilesUsed += 1;
    placeAll(layout.crop, sceneX, surfaceY, sceneZ);
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      slot.mesh.count = slot.count;
      // Upload only the instances actually used this frame. Without an update range three.js
      // does gl.bufferSubData(target, 0, array) — the ENTIRE capacity, regardless of how few
      // instances are drawn — so a large cap turns every commit into a full-buffer GPU upload.
      // That upload happens inside renderer.render(), not here, which is why it never showed
      // up in this module's own timings.
      slot.mesh.instanceMatrix.clearUpdateRanges();
      if (slot.count === 0) continue;
      slot.mesh.instanceMatrix.addUpdateRange(0, slot.count * 16);
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    layoutCache.clear();
    layoutCacheOrder.length = 0;
    for (const slot of slots.values()) scene.remove(slot.mesh);
    [soilGeo, stalkGeo, headGeo, awnGeo].forEach((g) => g.dispose());
    [
      soilAMaterial,
      soilBMaterial,
      stalkGreenMaterial,
      stalkStrawMaterial,
      headGoldMaterial,
      headPaleMaterial,
      awnMaterial
    ].forEach((m) => m.dispose());
  };

  return { clear, addInstance, setDetailEnabled, commit, dispose };
};
