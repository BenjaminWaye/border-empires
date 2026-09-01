import {
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3
} from "three";

import { TOWN_PALETTE, TOWN_SLOT_DEFS, type TownColorName, type TownPiece, type TownSlotKey, type TownTier } from "./client-map-3d-town-overlay/town-tier-shapes.js";
import { TOWN_LAYOUTS } from "./client-map-3d-town-overlay/town-tier-capitals.js";

export { type TownTier } from "./client-map-3d-town-overlay/town-tier-shapes.js";

const AETHER_COLOR = "#bff2fb";
const AETHER_EMISSIVE = "#1fa9cf";
const AMBER_COLOR = "#ffe0a3";
const AMBER_EMISSIVE = "#ff9d2e";

type Slot = {
  readonly mesh: InstancedMesh;
  readonly kind: "iron" | "aether" | "amber";
  readonly capacity: number;
  index: number;
};

export type TownOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, tier: TownTier) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createTownOverlay = (scene: Scene, maxTiles: number): TownOverlay => {
  const group = new Group();
  group.name = "town-overlay";
  scene.add(group);

  const ironMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.62,
    metalness: 0.22,
    flatShading: true
  });
  const aetherMaterial = new MeshStandardMaterial({
    color: AETHER_COLOR,
    emissive: AETHER_EMISSIVE,
    emissiveIntensity: 0.95,
    roughness: 0.4,
    metalness: 0.1
  });
  const amberMaterial = new MeshStandardMaterial({
    color: AMBER_COLOR,
    emissive: AMBER_EMISSIVE,
    emissiveIntensity: 0.9,
    roughness: 0.4,
    metalness: 0.1
  });

  const materialByKind = {
    iron: ironMaterial,
    aether: aetherMaterial,
    amber: amberMaterial
  } as const;

  const colorCache = new Map<TownColorName, Color>();
  const getColor = (name: TownColorName): Color => {
    let color = colorCache.get(name);
    if (!color) {
      color = new Color(TOWN_PALETTE[name]);
      colorCache.set(name, color);
    }
    return color;
  };

  const slots = new Map<TownSlotKey, Slot>();
  const geometries: Array<{ readonly dispose: () => void }> = [];

  for (const [key, def] of Object.entries(TOWN_SLOT_DEFS) as Array<[TownSlotKey, (typeof TOWN_SLOT_DEFS)[TownSlotKey]]>) {
    const capacity = Math.max(1, Math.ceil(maxTiles * def.factor));
    const geometry = def.makeGeometry();
    geometries.push(geometry);
    const mesh = new InstancedMesh(geometry, materialByKind[def.kind], capacity);
    if (def.kind === "iron") {
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    }
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Town buildings are the most numerous structure on the map (every
    // settled tile) and one of the ones flagged as still not casting/
    // receiving a real shadow (client-map-3d-structure-builder.ts covers
    // everything else) -- without this they read as flatly lit regardless
    // of the sun's angle.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    slots.set(key, { mesh, kind: def.kind, capacity, index: 0 });
  }

  const tempMatrix = new Matrix4();
  const tempQuaternion = new Quaternion();
  const tempScale = new Vector3();
  const tempPosition = new Vector3();
  const Y_AXIS = new Vector3(0, 1, 0);

  const writePiece = (
    slot: Slot,
    centerX: number,
    centerZ: number,
    surfaceY: number,
    piece: TownPiece
  ): void => {
    if (slot.index >= slot.capacity) return;
    const { mesh } = slot;
    const ry = piece.ry ?? 0;
    if (ry !== 0) {
      tempQuaternion.setFromAxisAngle(Y_AXIS, ry);
    } else {
      tempQuaternion.identity();
    }
    tempPosition.set(centerX + piece.x, surfaceY + piece.y, centerZ + piece.z);
    tempScale.set(piece.sx ?? 1, piece.sy ?? 1, piece.sz ?? 1);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    mesh.setMatrixAt(slot.index, tempMatrix);
    if (slot.kind === "iron") {
      mesh.setColorAt(slot.index, getColor(piece.color ?? "iron"));
    }
    slot.index += 1;
  };

  const addInstance = (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    tier: TownTier
  ): void => {
    const layout = TOWN_LAYOUTS[tier];
    for (const piece of layout.pieces) {
      const slot = slots.get(piece.slot);
      if (slot) writePiece(slot, centerX, centerZ, surfaceY, piece);
    }
  };

  const clear = (): void => {
    for (const slot of slots.values()) {
      slot.index = 0;
    }
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      const { mesh } = slot;
      mesh.count = slot.index;
      // Upload only the instances actually used. Without an update range three.js does
      // gl.bufferSubData(target, 0, array) — the entire allocated capacity, however few
      // instances are drawn — every time needsUpdate is set. Town capacity is sized for
      // the worst-case tile-full-of-metropolises case, so most of it is idle most frames.
      mesh.instanceMatrix.clearUpdateRanges();
      if (mesh.instanceColor) mesh.instanceColor.clearUpdateRanges();
      if (slot.index === 0) continue;
      mesh.instanceMatrix.addUpdateRange(0, slot.index * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.addUpdateRange(0, slot.index * 3);
        mesh.instanceColor.needsUpdate = true;
      }
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    for (const slot of slots.values()) slot.mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    ironMaterial.dispose();
    aetherMaterial.dispose();
    amberMaterial.dispose();
    colorCache.clear();
  };

  return { group, clear, addInstance, commit, dispose };
};