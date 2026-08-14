import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3
} from "three";

import {
  TOWN_PALETTE,
  TOWN_SLOT_DEFS,
  type TownColorName,
  type TownPiece,
  type TownSlotKey,
  type TownTier
} from "./client-map-3d-town-overlay/town-tier-shapes.js";

import { CITY_LAYOUT, SETTLEMENT_LAYOUT, TOWN_LAYOUT } from "./client-map-3d-town-overlay/town-tier-cities.js";
import { GREAT_CITY_LAYOUT, METROPOLIS_LAYOUT } from "./client-map-3d-town-overlay/town-tier-capitals.js";
import type { TownLayout } from "./client-map-3d-town-overlay/town-tier-shapes.js";

export type { TownTier };

const LAYOUTS: Record<TownTier, TownLayout> = {
  SETTLEMENT: SETTLEMENT_LAYOUT,
  TOWN: TOWN_LAYOUT,
  CITY: CITY_LAYOUT,
  GREAT_CITY: GREAT_CITY_LAYOUT,
  METROPOLIS: METROPOLIS_LAYOUT
};

export type TownOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, tier: TownTier) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type Slot = {
  readonly mesh: InstancedMesh;
  readonly colorable: boolean;
  cap: number;
  count: number;
};

// Instancing engine for the five steampunk settlement tiers. Each slot is an
// InstancedMesh at unit geometry scale capped at `maxTiles * factor`; pieces
// are composed from the static per-tier layouts in town-tier-cities/capitals.
// Iron/stone/brass slots share one flat material and are tinted per instance
// with setColorAt; aether/amber glow slots carry their own emissive material.
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
    color: "#bff2fb",
    emissive: "#1fa9cf",
    emissiveIntensity: 0.95,
    flatShading: true
  });

  const amberMaterial = new MeshStandardMaterial({
    color: "#ffe0a3",
    emissive: "#ff9d2e",
    emissiveIntensity: 0.9,
    flatShading: true
  });

  const colorCache = new Map<TownColorName, Color>();
  const colorFor = (name: TownColorName): Color => {
    let c = colorCache.get(name);
    if (!c) {
      c = new Color(TOWN_PALETTE[name]);
      colorCache.set(name, c);
    }
    return c;
  };

  const slots = new Map<TownSlotKey, Slot>();
  const geos = new Set<import("three").BufferGeometry>();
  for (const def of TOWN_SLOT_DEFS) {
    const geo = def.makeGeo();
    geos.add(geo);
    const material = def.kind === "iron" ? ironMaterial : def.kind === "aether" ? aetherMaterial : amberMaterial;
    const cap = Math.ceil(maxTiles * def.factor);
    const mesh = new InstancedMesh(geo, material, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    group.add(mesh);
    slots.set(def.key, { mesh, colorable: def.kind === "iron", cap, count: 0 });
  }

  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const ryQuat = new Quaternion();

  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
  };

  const addInstance = (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    tier: TownTier
  ): void => {
    const layout = LAYOUTS[tier];
    for (const piece of layout) {
      writePiece(piece, centerX, surfaceY, centerZ);
    }
  };

  // Write one piece, adding the tile origin to the tile-local X/Y/Z.
  const writePiece = (piece: TownPiece, ox: number, oy: number, oz: number): void => {
    const slot = slots.get(piece.slot);
    if (!slot || slot.count >= slot.cap) return;
    position.set(ox + piece.x, oy + piece.y, oz + piece.z);
    scale.set(piece.sx, piece.sy, piece.sz);
    if (piece.ry === 0) {
      matrix.compose(position, identityQuat, scale);
    } else {
      ryQuat.setFromAxisAngle(VECTOR_UP, piece.ry);
      matrix.compose(position, ryQuat, scale);
    }
    slot.mesh.setMatrixAt(slot.count, matrix);
    if (slot.colorable && "color" in piece) {
      slot.mesh.setColorAt(slot.count, colorFor(piece.color));
    }
    slot.count += 1;
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      slot.mesh.count = slot.count;
      slot.mesh.instanceMatrix.needsUpdate = true;
      if (slot.mesh.instanceColor) {
        slot.mesh.instanceColor.needsUpdate = true;
      }
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    for (const geo of geos) geo.dispose();
    ironMaterial.dispose();
    aetherMaterial.dispose();
    amberMaterial.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};

const VECTOR_UP = new Vector3(0, 1, 0);