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
import { BufferAttribute, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import type { BufferGeometry, Material, Mesh, Scene, Texture } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";

export const FARMLAND_MODEL_URL = "/models/farmland.glb";

// The model's lowest point sits this far below its origin; lifted so the
// plot rests on the terrain instead of sinking into it.
export const FARMLAND_BASE_LIFT = 0.0457;

export type FarmlandOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
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
    cached = new Promise<LoadedFarmland>((resolve, reject) => {
      new GLTFLoader().load(
        FARMLAND_MODEL_URL,
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);
          const parts: BufferGeometry[] = [];
          gltf.scene.traverse((node) => {
            const mesh = node as Mesh;
            if (!mesh.isMesh) return;
            const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            const color = (material as MeshStandardMaterial | undefined)?.color;
            if (!color) return;
            // Drop everything but the attributes every part shares, so
            // mergeGeometries doesn't refuse a mismatched set.
            const part = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
            for (const name of Object.keys(part.attributes)) {
              if (name !== "position" && name !== "normal") part.deleteAttribute(name);
            }
            const count = part.getAttribute("position").count;
            const colors = new Float32Array(count * 3);
            for (let i = 0; i < count; i += 1) {
              colors[i * 3] = color.r;
              colors[i * 3 + 1] = color.g;
              colors[i * 3 + 2] = color.b;
            }
            part.setAttribute("color", new BufferAttribute(colors, 3));
            parts.push(part.index ? part.toNonIndexed() : part);
          });
          const geometry = parts.length > 0 ? mergeGeometries(parts, false) : null;
          if (!geometry) {
            reject(new Error("farmland.glb contains no mesh"));
            return;
          }
          resolve({ geometry });
        },
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(String(err)))
      );
    });
  }
  return cached;
};

export const createFarmlandOverlay = (scene: Scene, maxTiles: number, envMap?: Texture): FarmlandOverlay => {
  let placements: Placement[] = [];
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
    clear: () => { placements = []; },
    addInstance: (sceneX, sceneZ, surfaceY, worldTileX, worldTileY) => {
      placements.push({ x: sceneX, y: surfaceY + FARMLAND_BASE_LIFT, z: sceneZ, yaw: farmlandYawAt(worldTileX, worldTileY) });
    },
    commit: apply,
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
