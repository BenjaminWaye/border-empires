import { Box3, BufferAttribute, DoubleSide, Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { BufferGeometry, Object3D, Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";

export const FISHING_MODEL_URL = "/models/fishing-site.glb";
export type FishingLayer = "body" | "metal" | "water";
export type FishingGeometry = ReadonlyArray<{ readonly layer: FishingLayer; readonly geometry: BufferGeometry }>;

/** Exported proposal is already scaled to 80% in tile units. Center only;
 * fitting to the old footprint would undo the approved size reduction. */
export const mergeFishingLayers = (root: Object3D): FishingGeometry => {
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root, true);
  const center = bounds.getCenter(new Vector3());
  const buckets: Record<FishingLayer, BufferGeometry[]> = { body: [], metal: [], water: [] };
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const source = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    const groups = source.groups.length ? source.groups : [{ start: 0, count: source.getAttribute("position").count, materialIndex: 0 }];
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0];
      if (!(material instanceof MeshStandardMaterial)) continue;
      const part = source.clone();
      for (const name of Object.keys(part.attributes)) {
        if (name !== "position" && name !== "normal") { part.deleteAttribute(name); continue; }
        const attribute = part.getAttribute(name);
        const data = new Float32Array(group.count * attribute.itemSize);
        for (let i = 0; i < group.count; i++) for (let c = 0; c < attribute.itemSize; c++) {
          data[i * attribute.itemSize + c] = attribute.getComponent(group.start + i, c);
        }
        part.setAttribute(name, new BufferAttribute(data, attribute.itemSize));
      }
      part.clearGroups();
      part.applyMatrix4(node.matrixWorld).translate(-center.x, -bounds.min.y, -center.z);
      const colors = new Float32Array(group.count * 3);
      for (let i = 0; i < group.count; i++) colors.set(material.color.toArray(), i * 3);
      part.setAttribute("color", new BufferAttribute(colors, 3));
      const layer: FishingLayer = material.roughness < 0.2 ? "water" : material.metalness > 0.3 ? "metal" : "body";
      buckets[layer].push(part);
    }
    source.dispose();
  });
  return (Object.keys(buckets) as FishingLayer[]).flatMap(layer => {
    const parts = buckets[layer];
    if (!parts.length) return [];
    const geometry = mergeGeometries(parts, false);
    parts.forEach(part => part.dispose());
    if (!geometry) throw new Error(`Cannot merge fishing ${layer}`);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return [{ layer, geometry }];
  });
};

let cached: Promise<FishingGeometry> | undefined;
export const loadFishingLayers = (): Promise<FishingGeometry> => cached ??= new GLTFLoader().loadAsync(FISHING_MODEL_URL).then(gltf => {
  try { return mergeFishingLayers(gltf.scene); }
  finally {
    gltf.scene.traverse(node => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
    });
  }
});

export const fishingLayerMaterial = (layer: FishingLayer, envMap?: Texture): MeshStandardMaterial => {
  const response = { body: [0.64, 0.04], metal: [0.32, 0.76], water: [0.16, 0.45] } as const;
  const [roughness, metalness] = response[layer];
  const material = new MeshStandardMaterial({ vertexColors: true, roughness, metalness, side: DoubleSide });
  applyBuildingEnvMap(material, envMap);
  return material;
};
