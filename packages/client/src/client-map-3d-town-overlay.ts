// Procedural 3D towns. Each tier is baked once into a vertex-coloured,
// flat-shaded clockwork city (town-tier-geometry.ts): grey stone skyscrapers
// banded in the AFC's aged brass, lit by lamplight and aether, round an
// octagonal plaza plate. Drawn per tier as instanced meshes that share one
// transform buffer: the matte body, the metalwork (metallic, like the AFC's),
// the mirror glass, the unlit glow (window strips, shopfronts, lamps, aether,
// beacons), the additive light pools on the paving, and the steam.
// Cogs, orrery hoops, halos, crystals, courier gyros and circling airships turn,
// lamplight flickers, beacons blink and steam rises entirely in the shaders
// (town-animation-shaders.ts).
//
// Each town is turned a quarter-turn picked from its world tile, so
// neighbouring towns of the same tier don't read as stamped copies.
import {
  AdditiveBlending,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Quaternion,
  RGBADepthPacking,
  Vector3,
  type Scene,
  type Texture
} from "three";
import { applyTownSpin, applyTownSteam, tickTownTime } from "./client-map-3d-town-overlay/town-animation-shaders.js";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { getTownTierGeometry, TOWN_TIERS, type TownTier } from "./client-map-3d-town-overlay/town-tier-geometry.js";

export { TOWN_TIERS, type TownTier } from "./client-map-3d-town-overlay/town-tier-geometry.js";

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
  /** Metal, glass, glow, halo and steam meshes drawing with the body's instance matrices. */
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
  // Curtain walls: near-mirror glass, so the downtown towers carry the sky.
  const glassMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.85, flatShading: true });
  applyBuildingEnvMap(glassMaterial, envMap);
  // Unlit and outside tone mapping so windows and aether stay luminous under the warm sun.
  const glowMaterial = new MeshBasicMaterial({ toneMapped: false, vertexColors: true });
  // Pools of lamp- and shoplight added onto the paving under them: black
  // rims add nothing, so each fades out softly, and the low opacity keeps
  // sunlit paving from blowing out. Fog would add its own colour.
  const haloMaterial = new MeshBasicMaterial({
    toneMapped: false, vertexColors: true, transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false, fog: false
  });
  const steamMaterial = new MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, flatShading: true, transparent: true, opacity: 0.6, depthWrite: false
  });
  // Shadow pass: spins like the visible meshes, so a circling airship's shadow follows it.
  const depthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  applyTownSpin(bodyMaterial);
  applyTownSpin(metalMaterial);
  applyTownSpin(glassMaterial);
  applyTownSpin(glowMaterial, true);
  applyTownSpin(haloMaterial, true);
  applyTownSpin(depthMaterial);
  applyTownSteam(steamMaterial);

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
    body.customDepthMaterial = depthMaterial;
    // The one per-frame cost of the animation: the shaders' shared clock.
    body.onBeforeRender = tickTownTime;
    scene.add(body);
    const followers: InstancedMesh[] = [];
    for (const [suffix, part, material, shadowed] of [
      ["metal", geometry.metal, metalMaterial, true],
      ["glass", geometry.glass, glassMaterial, true],
      ["glow", geometry.glow, glowMaterial, false],
      ["halo", geometry.halo, haloMaterial, false],
      ["steam", geometry.steam, steamMaterial, false]
    ] as const) {
      if (!part) continue;
      const mesh = new InstancedMesh(part, material, capacity);
      mesh.name = `town-${tier}-${suffix}`;
      // Same transforms as the body: share its buffer so it is uploaded once.
      mesh.instanceMatrix = body.instanceMatrix;
      mesh.frustumCulled = false;
      mesh.castShadow = shadowed;
      mesh.receiveShadow = shadowed;
      if (shadowed) mesh.customDepthMaterial = depthMaterial;
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
    glassMaterial.dispose();
    haloMaterial.dispose();
    steamMaterial.dispose();
    depthMaterial.dispose();
    glowMaterial.dispose();
  };

  return { clear, addInstance, commit, dispose };
};
