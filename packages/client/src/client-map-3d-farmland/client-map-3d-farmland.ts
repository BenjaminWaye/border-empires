// Farm plot drawn on every FARM resource tile in the 3D renderer. Replaces
// the earlier procedural shell-stack barley field.
//
// Source: farmland4.glb — a low-poly farm tile (three crop fields, a silo,
// a hay bale and a few bushes) authored in Blender: 16 small meshes over 10
// flat-colour materials, ~1.1k triangles, ~0.95 x 0.3 x 0.98 units centred
// on the origin. No textures.
//
// At load every mesh is baked into ONE geometry (world transform applied,
// each material's base colour written to a vertex-colour attribute) so all
// farm tiles draw as a single InstancedMesh with one draw call, however
// many tiles are on screen. Each tile is turned by a random multiple of 90
// degrees (stable per world tile) so neighbouring plots don't look alike.
// The glb loads asynchronously; instances added before it lands are held
// and applied when it arrives.
import { Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import type { BufferGeometry, Material, Scene, Texture } from "three";
import { loadMergedGlbGeometry } from "../client-map-3d-merged-glb/client-map-3d-merged-glb.js";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";

export const FARMLAND_MODEL_URL = "/models/farmland.glb";

// The model's lowest point sits this far below its origin; lifted so the
// plot rests on the terrain instead of sinking into it.
export const FARMLAND_BASE_LIFT = 0.0457;

// Height above the terrain surface of the crop beds' tops once the plot is
// lifted by FARMLAND_BASE_LIFT (the three raised beds reach ~0.033 above the
// model origin). Anything that stands ON a farm tile — the battle marines —
// is raised by this so it walks on the crops instead of being swallowed by
// the opaque plot, which otherwise hides it entirely.
export const FARMLAND_STAND_LIFT = 0.079;

export type FarmlandOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
  /** How far above the terrain surface something standing on world tile
   * (worldTileX, worldTileY) must be lifted to sit on top of the plot:
   * FARMLAND_STAND_LIFT when the last rebuild placed a plot there, else 0. */
  readonly standLiftAt: (worldTileX: number, worldTileY: number) => number;
};

type Placement = { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number };

// One of 0, 90, 180, 270 degrees, stable per world tile.
export const farmlandYawAt = (worldX: number, worldZ: number): number => {
  let h = (worldX * 374761393) ^ (worldZ * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return ((h % 4) * Math.PI) / 2;
};

type LoadedFarmland = { readonly geometry: BufferGeometry };

let cached: Promise<LoadedFarmland> | undefined;

/** Loads (and caches) the merged farm geometry. The fetch/parse only happens
 * once per page load however many overlays ask. The geometry is shared, so
 * overlays must not dispose it. */
export const loadFarmland = (): Promise<LoadedFarmland> => {
  if (!cached) {
    cached = loadMergedGlbGeometry(FARMLAND_MODEL_URL).then((geometry) => ({ geometry }));
  }
  return cached;
};

export const createFarmlandOverlay = (scene: Scene, maxTiles: number, envMap?: Texture): FarmlandOverlay => {
  let placements: Placement[] = [];
  // World tiles holding a plot as of the last rebuild; cleared with
  // `placements`, so it is bounded by the visible tile count.
  let plotTiles = new Set<string>();
  let mesh: InstancedMesh | undefined;
  let disposed = false;

  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3(1, 1, 1);
  const euler = new Euler();

  const apply = (): void => {
    if (!mesh) return;
    const count = Math.min(placements.length, maxTiles);
    for (let i = 0; i < count; i += 1) {
      const p = placements[i]!;
      quaternion.setFromEuler(euler.set(0, p.yaw, 0));
      position.set(p.x, p.y, p.z);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  void loadFarmland().then(({ geometry }) => {
    if (disposed) return;
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true });
    applyBuildingEnvMap(material, envMap);
    mesh = new InstancedMesh(geometry, material, maxTiles);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    apply();
  }, (err: unknown) => {
    // A missing asset must not take down the map; the tile just has no plot.
    console.error("farmland model failed to load", err);
  });

  return {
    clear: () => { placements = []; plotTiles = new Set(); },
    addInstance: (sceneX, sceneZ, surfaceY, worldTileX, worldTileY) => {
      plotTiles.add(`${worldTileX},${worldTileY}`);
      placements.push({ x: sceneX, y: surfaceY + FARMLAND_BASE_LIFT, z: sceneZ, yaw: farmlandYawAt(worldTileX, worldTileY) });
    },
    commit: apply,
    standLiftAt: (worldTileX, worldTileY) => (plotTiles.has(`${worldTileX},${worldTileY}`) ? FARMLAND_STAND_LIFT : 0),
    dispose: () => {
      disposed = true;
      if (!mesh) return;
      scene.remove(mesh);
      (mesh.material as Material).dispose();
      mesh.dispose();
      mesh = undefined;
    }
  };
};
