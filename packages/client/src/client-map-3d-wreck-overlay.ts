// Instanced 3D wreck and battle-scar models (client-wreck-models/), drawn with
// the district/town production materials (createDistrictMaterials) so wrecks
// shade exactly like the buildings they were: env-mapped metal, glass,
// shadow-casting solids, flickering ember glow with light pools on the
// ground, and dark smoke on the animated steam layer. Under them, the burn
// marks each model leaves (GroundMark) are soft, ragged char decals rather
// than hard-edged discs. Each model's geometry is built once, on first use,
// and instanced with a per-tile turn.
import {
  DataTexture, InstancedBufferAttribute, InstancedMesh, LinearFilter, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion,
  RGBAFormat, Vector3, type Scene, type Texture
} from "three";
import { tickTownTime } from "./client-map-3d-town-overlay/town-animation-shaders.js";
import { DISTRICT_LAYERS, type DistrictGeometry } from "./client-town-district/district-geometry.js";
import { createDistrictMaterials } from "./client-town-district/district-materials.js";
import type { GroundMark } from "./client-wreck-models/wreck-kit.js";
import { createWreckGeometry, wreckModelKey, wreckModelVariants, type WreckModel } from "./client-wreck-models/wreck-models.js";

const MAX_WRECKS = 1024;
const MAX_MARKS = 8192;
const MARK_LIFT = 0.004;
const Y_AXIS = new Vector3(0, 1, 0);

type Placement = { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly scale: number };
type Slot = { readonly meshes: readonly InstancedMesh[]; readonly geometry: DistrictGeometry; readonly marks: readonly GroundMark[]; readonly capacity: number };

export type WreckOverlay3D = {
  readonly clear: () => void;
  /** A wreck model at a tile centre; `seed` picks its variant and turn. `yaw` overrides the seeded turn. */
  readonly add: (model: WreckModel, x: number, surfaceY: number, z: number, seed: number, yaw?: number, scale?: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

/** Ragged char: dark, opaque at the heart, breaking up into blotches toward a soft edge. */
const createCharTexture = (): DataTexture => {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const noise = (x: number, y: number): number => {
    const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const smooth = (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const a = noise(ix, iy), b = noise(ix + 1, iy), c = noise(ix, iy + 1), d = noise(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / (size - 1)) * 2 - 1, v = (y / (size - 1)) * 2 - 1;
      const r = Math.hypot(u, v);
      const ragged = 0.55 * smooth(x / 6, y / 6) + 0.3 * smooth(x / 2.5 + 9, y / 2.5 + 3);
      const alpha = Math.max(0, Math.min(1, (1 - r) * 1.9 - 0.35 + ragged * 0.75 - r * ragged * 0.6));
      const i = (y * size + x) * 4;
      // Brown-black char, lighter ash flecks toward the edge.
      const ash = smooth(x / 1.7 + 4, y / 1.7) > 0.82 && r > 0.35 ? 40 : 0;
      data[i] = 26 + ash; data[i + 1] = 21 + ash; data[i + 2] = 17 + ash;
      data[i + 3] = Math.round(alpha * 235);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

export const createWreckOverlay3D = (scene: Scene, envMap?: Texture): WreckOverlay3D => {
  const materials = createDistrictMaterials(envMap);
  // This overlay's own material set: wreck smoke is soot, denser than town steam,
  // so the ground doesn't tint it through the puffs.
  const smoke = materials.layers.steam;
  smoke.opacity = 0.88;
  const slots = new Map<string, Slot>();
  const models = new Map<string, { model: WreckModel; variant: number }>();
  const pending = new Map<string, Placement[]>();
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const offset = new Vector3();
  const spin = new Quaternion();
  let total = 0;

  const charTexture = createCharTexture();
  const markGeometry = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const markMaterial = new MeshBasicMaterial({ toneMapped: false, map: charTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  const marks = new InstancedMesh(markGeometry, markMaterial, MAX_MARKS);
  marks.name = "wreck-ground-marks";
  marks.count = 0;
  marks.frustumCulled = false;
  marks.renderOrder = -1;
  scene.add(marks);

  const releaseMeshes = (slot: Slot): void => {
    for (const mesh of slot.meshes) { scene.remove(mesh); mesh.dispose(); }
  };

  const slotFor = (key: string, count: number): Slot => {
    const current = slots.get(key);
    if (current && current.capacity >= count) return current;
    // Geometry is reused when only the capacity grows.
    const entry = models.get(key)!;
    const built = current ?? createWreckGeometry(entry.model, entry.variant);
    if (current) releaseMeshes(current);
    const capacity = 2 ** Math.ceil(Math.log2(Math.max(1, count)));
    const states = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    // Operational (embers and smoke animate), never cut by a construction height.
    for (let i = 0; i < capacity; i += 1) states.setXY(i, 1, 1000);
    const meshes: InstancedMesh[] = [];
    for (const layer of DISTRICT_LAYERS) {
      const geo = built.geometry.layers[layer];
      if (!geo) continue;
      geo.setAttribute("districtState", states);
      const mesh = new InstancedMesh(geo, materials.layers[layer], capacity);
      mesh.name = `wreck-${key}-${layer}`;
      mesh.frustumCulled = false;
      mesh.castShadow = layer === "body" || layer === "metal" || layer === "glass";
      mesh.receiveShadow = mesh.castShadow || layer === "plinth";
      mesh.customDepthMaterial = materials.depth;
      mesh.onBeforeRender = tickTownTime;
      mesh.count = 0;
      meshes.push(mesh);
      scene.add(mesh);
    }
    const slot = { meshes, geometry: built.geometry, marks: built.marks, capacity };
    slots.set(key, slot);
    return slot;
  };

  const add = (model: WreckModel, x: number, surfaceY: number, z: number, seed: number, yaw?: number, size = 1): void => {
    if (total >= MAX_WRECKS) return;
    const hash = Math.abs(Math.floor(seed * 2654435761)) >>> 0;
    const variant = hash % wreckModelVariants(model);
    const key = wreckModelKey(model, variant);
    if (!models.has(key)) models.set(key, { model, variant });
    const turn = yaw ?? ((hash >>> 8) % 360) * (Math.PI / 180);
    const entries = pending.get(key) ?? [];
    entries.push({ x, y: surfaceY, z, yaw: turn, scale: size });
    pending.set(key, entries);
    total += 1;
  };

  const clear = (): void => {
    pending.clear();
    total = 0;
    marks.count = 0;
    for (const slot of slots.values()) for (const mesh of slot.meshes) mesh.count = 0;
  };

  const commit = (): void => {
    let markCount = 0;
    for (const [key, placements] of pending) {
      const slot = slotFor(key, placements.length);
      placements.forEach((p, index) => {
        rotation.setFromAxisAngle(Y_AXIS, p.yaw);
        matrix.compose(position.set(p.x, p.y, p.z), rotation, scale.setScalar(p.scale));
        for (const mesh of slot.meshes) mesh.setMatrixAt(index, matrix);
        slot.marks.forEach((mark, m) => {
          if (markCount >= MAX_MARKS) return;
          offset.set(mark.x, 0, mark.z).applyQuaternion(rotation).multiplyScalar(p.scale);
          // Each mark turned its own way so overlapping ones never line up.
          spin.setFromAxisAngle(Y_AXIS, p.yaw + m * 2.39996);
          matrix.compose(position.set(p.x + offset.x, p.y + MARK_LIFT + m * 0.0002, p.z + offset.z), spin, scale.setScalar(mark.radius * p.scale));
          marks.setMatrixAt(markCount, matrix);
          markCount += 1;
        });
      });
      for (const mesh of slot.meshes) {
        mesh.count = placements.length;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    marks.count = markCount;
    marks.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    for (const slot of slots.values()) {
      releaseMeshes(slot);
      for (const geometry of Object.values(slot.geometry.layers)) geometry.dispose();
    }
    slots.clear();
    pending.clear();
    scene.remove(marks);
    marks.dispose();
    markGeometry.dispose();
    markMaterial.dispose();
    charTexture.dispose();
    materials.dispose();
  };

  return { clear, add, commit, dispose };
};
