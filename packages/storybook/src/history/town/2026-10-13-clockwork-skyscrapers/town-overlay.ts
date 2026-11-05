// History snapshot: packages/client/src/client-map-3d-town-overlay.ts at commit 2e4f2f72 (2026-10-13).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// Procedural 3D towns. Each tier is baked once into a vertex-coloured,
// flat-shaded clockwork city (town-tier-geometry.ts): grey stone skyscrapers
// banded in the AFC's aged brass, lit by lamplight and aether, round an
// octagonal plaza plate. Drawn per tier as three instanced meshes that share one
// transform buffer: the matte body, the metalwork (metallic, like the AFC's)
// and the unlit glow (window strips, lamps, aether).
//
// Each town is turned a quarter-turn picked from its world tile, so
// neighbouring towns of the same tier don't read as stamped copies.
import {
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Scene,
  type Texture
} from "three";
import { applyBuildingEnvMap } from "@client/client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { getTownTierGeometry, TOWN_TIERS, type TownTier } from "./town-tier-geometry.js";

export { TOWN_TIERS, type TownTier } from "./town-tier-geometry.js";

/** Lifts the town's ground pad just clear of the terrain and the contact-shadow
 * decal under it (client-map-3d-contact-shadow.ts lifts that 0.012). */
export const TOWN_BASE_LIFT = 0.016;

/** Quarter-turn (0..3) for a town on world tile (tileX, tileY). */
export const townQuarterTurnForTile = (tileX: number, tileY: number): number => {
  let h = Math.imul(tileX | 0, 0x27d4eb2d) ^ Math.imul(tileY | 0, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) & 3;
};

type TierSlot = {
  readonly body: InstancedMesh;
  /** Metal and glow meshes drawing with the body's instance matrices. */
  readonly followers: readonly InstancedMesh[];
  count: number;
};

export type TownOverlay = {
  readonly clear: () => void;
  /** (tileX, tileY) are the world tile coords, used only to pick the town's rotation. */
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, tier: TownTier, tileX?: number, tileY?: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createTownOverlay = (scene: Scene, maxTiles: number, envMap?: Texture): TownOverlay => {
  const bodyMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, flatShading: true });
  applyBuildingEnvMap(bodyMaterial, envMap);
  // Matches the AFC's iron/brass finish (client-map-3d-fabrication-complex.ts).
  const metalMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.7, flatShading: true });
  applyBuildingEnvMap(metalMaterial, envMap);
  // Unlit and outside tone mapping so windows and aether stay luminous under the warm sun.
  const glowMaterial = new MeshBasicMaterial({ toneMapped: false, vertexColors: true });

  const capacity = Math.max(1, maxTiles);
  const slots = new Map<TownTier, TierSlot>();
  for (const tier of TOWN_TIERS) {
    const geometry = getTownTierGeometry(tier);
    const body = new InstancedMesh(geometry.body, bodyMaterial, capacity);
    body.name = `town-${tier}`;
    body.frustumCulled = false;
    body.castShadow = true;
    body.receiveShadow = true;
    body.count = 0;
    scene.add(body);
    const followers: InstancedMesh[] = [];
    for (const [suffix, part, material, shadowed] of [
      ["metal", geometry.metal, metalMaterial, true],
      ["glow", geometry.glow, glowMaterial, false]
    ] as const) {
      if (!part) continue;
      const mesh = new InstancedMesh(part, material, capacity);
      mesh.name = `town-${tier}-${suffix}`;
      // Same transforms as the body: share its buffer so it is uploaded once.
      mesh.instanceMatrix = body.instanceMatrix;
      mesh.frustumCulled = false;
      mesh.castShadow = shadowed;
      mesh.receiveShadow = shadowed;
      mesh.count = 0;
      scene.add(mesh);
      followers.push(mesh);
    }
    slots.set(tier, { body, followers, count: 0 });
  }

  const matrix = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const unitScale = new Vector3(1, 1, 1);
  const yAxis = new Vector3(0, 1, 0);

  const addInstance: TownOverlay["addInstance"] = (centerX, centerZ, surfaceY, tier, tileX = 0, tileY = 0) => {
    const slot = slots.get(tier);
    if (!slot || slot.count >= capacity) return;
    quaternion.setFromAxisAngle(yAxis, townQuarterTurnForTile(tileX, tileY) * (Math.PI / 2));
    position.set(centerX, surfaceY + TOWN_BASE_LIFT, centerZ);
    slot.body.setMatrixAt(slot.count, matrix.compose(position, quaternion, unitScale));
    slot.count += 1;
  };

  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      slot.body.count = slot.count;
      for (const follower of slot.followers) follower.count = slot.count;
      // Upload only the instances actually drawn, not the whole tile-budget buffer.
      slot.body.instanceMatrix.clearUpdateRanges();
      if (slot.count === 0) continue;
      slot.body.instanceMatrix.addUpdateRange(0, slot.count * 16);
      slot.body.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const slot of slots.values()) {
      scene.remove(slot.body);
      slot.body.dispose();
      for (const follower of slot.followers) scene.remove(follower);
    }
    slots.clear();
    bodyMaterial.dispose();
    metalMaterial.dispose();
    glowMaterial.dispose();
  };

  return { clear, addInstance, commit, dispose };
};
