import {
  Box3,
  BufferGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// 3D FARM resource overlay — a baked "Emerald Crop Rows" tile (leafy crop rows inside a dirt
// border, Meshy-AI sculpt) instanced once per farm tile.
//
// Earlier implementations built the crop procedurally per tile: first ~1,400 tiny stalk
// cylinders (~2M sub-pixel triangles across a farm-heavy map), then a "shell texturing" stack of
// 8 alpha-cut planes + 2 soil mounds reusing a canvas-generated crop texture (10 preallocated
// InstancedMeshes at the tile budget). This version instead reuses the model-loading pattern
// already established by the popup-marine overlay (client-map-3d-popup-marine/popup-marine-asset.ts):
// load a single baked mesh once, then draw it through ONE InstancedMesh. That is both simpler and
// cheaper — 1 draw call per LOD level per farm tile instead of 10.
//
// The source .glb ships from Meshy at 24.6MB (2048x2048 base color + normal, a 4096x4096
// metallic-roughness map nothing on a flat crop tile needs) — see
// packages/client/scripts/bake-emerald-crop-field-model.sh for the gltf-transform pipeline that
// brought it down to ~730KB (512x512 WebP textures, geometry welded/simplified). Only the baked
// output (packages/client/public/models/emerald-crop-field.glb) ships to players.
//
// LOD: below BARLEY_DETAIL_MIN_ZOOM the real mesh's per-vertex detail can't resolve on screen
// (same reasoning as the old shell stack's far LOD), so a flat untextured green plane stands in —
// cheaper to draw and avoids texture minification shimmer at a distance.

const UP = new Vector3(0, 1, 0);

export type BarleyFieldVariant = 0 | 1 | 2;

export const barleyFieldVariantAt = (worldX: number, worldZ: number): BarleyFieldVariant => {
  const h = ((worldX * 374761393) ^ (worldZ * 668265263) ^ (402653189 * 1442695041)) >>> 0;
  return (h % 3) as BarleyFieldVariant;
};

// Deterministic per-tile PRNG so a tile's rotation/tint is stable across frames but differs from
// its neighbours. Seeded from world coords + a salt; mulberry32 core.
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

// Extreme zoom-out floor, same role the shell stack's LOD gate used to play: below this a tile
// covers only a few CSS pixels, where the model's own geometric detail cannot resolve. Real play
// sits at zoom ~64-160, well above this.
export const BARLEY_DETAIL_MIN_ZOOM = 32;

// Footprint the baked model is normalized to occupy (tile-space units), matching the old shell
// stack's CROP_SPAN so the crop patch reads at the same on-screen size as before.
const CROP_SPAN = 1.12;

const ACTIVE_MODEL_URL = "/models/emerald-crop-field.glb";

type CropFieldTemplate = {
  readonly geometry: BufferGeometry;
  readonly material: Material;
  /** Uniform XZ scale that normalizes the model's footprint to CROP_SPAN tile-space units. */
  readonly scale: number;
  /** Y offset (in scaled model units) that puts the model's lowest point at the tile surface. */
  readonly yOffset: number;
};

const firstMesh = (root: Object3D): Mesh => {
  let found: Mesh | undefined;
  root.traverse((child) => {
    if (found) return;
    if (child instanceof Mesh) found = child;
  });
  if (!found) throw new Error("emerald-crop-field model contains no Mesh");
  return found;
};

let cachedTemplate: Promise<CropFieldTemplate> | undefined;

/** Loads (and caches) the baked crop-field geometry/material every overlay instance draws
 * through its own InstancedMesh. Safe to call from multiple overlays — the GLTF fetch/parse only
 * ever happens once per page load. */
const loadCropFieldTemplate = (): Promise<CropFieldTemplate> => {
  if (!cachedTemplate) {
    const loader = new GLTFLoader();
    cachedTemplate = new Promise<CropFieldTemplate>((resolve, reject) => {
      loader.load(
        ACTIVE_MODEL_URL,
        (gltf) => {
          try {
            const mesh = firstMesh(gltf.scene);
            const geometry = mesh.geometry;
            // Always non-null after computeBoundingBox() runs on a geometry with a position
            // attribute, which every loaded mesh has.
            geometry.computeBoundingBox();
            const box: Box3 = geometry.boundingBox!;
            const width = box.max.x - box.min.x;
            const depth = box.max.z - box.min.z;
            const footprint = Math.max(width, depth, 1e-6);
            const scale = CROP_SPAN / footprint;
            resolve({ geometry, material: mesh.material as Material, scale, yOffset: -box.min.y * scale });
          } catch (err) {
            reject(err as Error);
          }
        },
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(String(err)))
      );
    });
  }
  return cachedTemplate;
};

export const createBarleyFieldOverlay = (scene: Scene, maxTiles: number): BarleyFieldOverlay => {
  // ─── Far LOD ────────────────────────────────────────────────────────
  // Flat, untextured plane standing in for the model once a tile is too small on screen for the
  // baked crop detail to read — matching the old shell stack's canopy fallback.
  const farGeo = new PlaneGeometry(CROP_SPAN, CROP_SPAN);
  farGeo.rotateX(-Math.PI / 2);
  const farMaterial = new MeshStandardMaterial({ color: "#7a9a4a", roughness: 0.9, metalness: 0 });
  const farMesh = new InstancedMesh(farGeo, farMaterial, maxTiles);
  farMesh.frustumCulled = false;
  farMesh.count = 0;
  scene.add(farMesh);

  // ─── Detail mesh (populated once the baked model finishes loading) ────
  let detailMesh: InstancedMesh | null = null;
  let template: CropFieldTemplate | null = null;

  // ─── Placement bookkeeping ──────────────────────────────────────────
  type Placement = { readonly sceneX: number; readonly sceneZ: number; readonly surfaceY: number; readonly worldTileX: number; readonly worldTileY: number };
  let placements: Placement[] = [];
  let detailEnabled = true;

  const matrix = new Matrix4();
  const position = new Vector3();
  const scaleVec = new Vector3();
  const quat = new Quaternion();

  const clear = (): void => {
    placements = [];
  };

  const setDetailEnabled = (enabled: boolean): void => {
    detailEnabled = enabled;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    if (placements.length >= maxTiles) return;
    placements.push({ sceneX, sceneZ, surfaceY, worldTileX, worldTileY });
  };

  const flush = (mesh: InstancedMesh, count: number): void => {
    mesh.count = count;
    // Upload only the instances actually used, matching the update-range pattern the rest of the
    // 3D overlays use — otherwise three.js re-uploads the full preallocated capacity every frame.
    mesh.instanceMatrix.clearUpdateRanges();
    if (count === 0) return;
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => {
    const showDetail = detailEnabled && detailMesh !== null && template !== null;
    const active = showDetail ? detailMesh! : farMesh;
    const idle = showDetail ? farMesh : detailMesh;

    let count = 0;
    for (const p of placements) {
      const variant = barleyFieldVariantAt(p.worldTileX, p.worldTileY);
      // Full-turn spin (not just 90-degree steps) so neighbouring farm tiles never show the
      // model's crop-row direction in the same orientation — the model's own asymmetric dirt
      // border already reads fine at any angle.
      const rng = mulberry(hashSeed(p.worldTileX, p.worldTileY, 7919 + variant * 131));
      const spin = rng() * Math.PI * 2;

      if (showDetail) {
        position.set(p.sceneX, p.surfaceY + template!.yOffset, p.sceneZ);
        scaleVec.set(template!.scale, template!.scale, template!.scale);
      } else {
        position.set(p.sceneX, p.surfaceY, p.sceneZ);
        scaleVec.set(1, 1, 1);
      }
      quat.setFromAxisAngle(UP, spin);
      matrix.compose(position, quat, scaleVec);
      active.setMatrixAt(count, matrix);
      count += 1;
    }

    flush(active, count);
    if (idle) flush(idle, 0);
  };

  loadCropFieldTemplate()
    .then((loaded) => {
      template = loaded;
      const mesh = new InstancedMesh(loaded.geometry, loaded.material, maxTiles);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      detailMesh = mesh;
      // A rebuild may already have queued placements while the model was still loading; flush
      // them now instead of waiting for the next terrain rebuild to trigger.
      commit();
    })
    .catch((err) => {
      // Leaves detailMesh null — farMesh keeps drawing at every zoom, so a load failure degrades
      // to "always distant-looking crop" rather than an invisible farm tile.
      console.error("emerald-crop-field model failed to load", err);
    });

  const dispose = (): void => {
    scene.remove(farMesh);
    farGeo.dispose();
    farMaterial.dispose();
    if (detailMesh) scene.remove(detailMesh);
    // geometry/material for the detail mesh are the shared, cached template — not owned by this
    // overlay instance, so they are intentionally not disposed here (mirrors popup-marine-asset.ts,
    // which never disposes its cached template either).
  };

  return { clear, addInstance, setDetailEnabled, commit, dispose };
};
