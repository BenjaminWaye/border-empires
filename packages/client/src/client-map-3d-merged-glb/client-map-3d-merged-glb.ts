// Loads a flat-colour .glb (no textures) and bakes every mesh into ONE
// geometry: each mesh's world transform is applied and its material's base
// colour is written to a vertex-colour attribute. A model drawn from this
// geometry through a single InstancedMesh costs one draw call however many
// tiles use it. Shared by the farmland and fishing tile overlays.
import { BufferAttribute } from "three";
import type { BufferGeometry, Mesh, MeshStandardMaterial } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const loadMergedGlbGeometry = (url: string): Promise<BufferGeometry> =>
  new Promise<BufferGeometry>((resolve, reject) => {
    new GLTFLoader().load(
      url,
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
          reject(new Error(`${url} contains no mesh`));
          return;
        }
        resolve(geometry);
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(String(err)))
    );
  });
