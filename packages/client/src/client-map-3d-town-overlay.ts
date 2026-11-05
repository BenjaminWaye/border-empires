// Procedural 3D towns. Each tier is baked once into a vertex-coloured,
// flat-shaded clockwork city (town-tier-geometry.ts): grey stone skyscrapers
// banded in the AFC's aged brass, lit by lamplight and aether, round an
// octagonal plaza plate. Drawn per tier as instanced meshes that share one
// transform buffer: the matte body, the metalwork (metallic, like the AFC's),
// the mirror glass, the unlit glow (window strips, lamps, aether,
// beacons), the additive light pools on the paving, the steam, and the base
// plate (street top, kerb, wall and course) in polished marble, like the
// muster banner's plinth.
// Cogs, orrery hoops, halos, crystals, courier gyros and circling airships turn,
// lamplight flickers, beacons blink and steam rises entirely in the shaders
// (town-animation-shaders.ts).
//
// A town remembered under fog (seen before, out of sight now) is drawn as
// last seen but standing still: a second, smaller set of meshes per tier with
// plain materials (no spin, flicker or steam -- the baked geometry is the rest
// pose) and its lights turned down.
//
// Each town is turned a quarter-turn picked from its world tile, so
// neighbouring towns of the same tier don't read as stamped copies.
import {
  AdditiveBlending,
  FrontSide,
  InstancedMesh,
  type Material,
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
import { applyMarbleFinish } from "./client-map-3d-muster-banner/muster-banner-marble-material.js";
import { TOWN_PLINTH_LEDGES } from "./client-map-3d-town-overlay/town-parts.js";
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
  /** Metal, glass, glow, halo, steam and marble plinth meshes drawing with the body's instance matrices. */
  readonly followers: readonly InstancedMesh[];
  readonly capacity: number;
  count: number;
};

export type TownOverlay = {
  readonly clear: () => void;
  /** (tileX, tileY) are the world tile coords, used only to pick the town's rotation.
   * `still`: remembered under fog -- drawn without animation, lights dimmed. */
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, tier: TownTier, tileX?: number, tileY?: number, still?: boolean) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

/** How bright a remembered town's windows, lamps and light pools stay. */
export const REMEMBERED_TOWN_GLOW = 0.4;
/** Remembered towns are a small share of the tiles in view, so their meshes hold fewer instances. */
const REMEMBERED_TOWN_CAPACITY_SHARE = 1 / 8;
const HALO_OPACITY = 0.32;

type TownMaterials = {
  readonly body: MeshStandardMaterial;
  readonly metal: MeshStandardMaterial;
  readonly glass: MeshStandardMaterial;
  readonly glow: MeshBasicMaterial;
  readonly halo: MeshBasicMaterial;
  /** Absent for remembered towns: no steam rises from them. */
  readonly steam: MeshStandardMaterial | undefined;
  readonly plinth: MeshStandardMaterial;
  readonly depth: MeshDepthMaterial;
  readonly all: readonly Material[];
};

const createTownMaterials = (envMap: Texture | undefined, animated: boolean): TownMaterials => {
  const body = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, flatShading: true });
  applyBuildingEnvMap(body, envMap);
  // Matches the AFC's iron/brass finish (client-map-3d-fabrication-complex.ts).
  const metal = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.7, flatShading: true });
  applyBuildingEnvMap(metal, envMap);
  // Curtain walls: near-mirror glass, so the downtown towers carry the sky.
  const glass = new MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.85, flatShading: true });
  applyBuildingEnvMap(glass, envMap);
  // Unlit and outside tone mapping so windows and aether stay luminous under the warm sun.
  const glow = new MeshBasicMaterial({ toneMapped: false, vertexColors: true });
  // Pools of lamplight added onto the paving under them: black
  // rims add nothing, so each fades out softly, and the low opacity keeps
  // sunlit paving from blowing out. Fog would add its own colour.
  // Pulled towards the camera, since the pools sit closer over the paving
  // than the depth buffer resolves when zoomed right out.
  const halo = new MeshBasicMaterial({
    toneMapped: false, vertexColors: true, transparent: true, opacity: HALO_OPACITY, blending: AdditiveBlending, depthWrite: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4
  });
  const steam = animated ? new MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, flatShading: true, transparent: true, opacity: 0.6, depthWrite: false
  }) : undefined;
  // The base plate (its street top, kerb, wall and course): the muster
  // banner plinth's polished marble (client-map-3d-muster-overlay.ts), so the
  // town stands on the same premium board-game base instead of a grey tray.
  // Without the muster's clearcoat: this covers every town's whole
  // footprint, so it skips that second specular lobe per fragment.
  const plinth = new MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0, flatShading: true });
  applyMarbleFinish(plinth, TOWN_PLINTH_LEDGES);
  applyBuildingEnvMap(plinth, envMap);
  // Shadow pass: spins like the visible meshes, so a circling airship's shadow follows it.
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  // The tier geometry drops the undersides of static parts, which three's
  // shadow pass would otherwise draw (it renders a FrontSide material's back
  // faces), so these cast from their front faces instead.
  for (const material of [body, metal, glass, plinth]) material.shadowSide = FrontSide;
  if (animated) {
    applyTownSpin(body);
    applyTownSpin(metal);
    applyTownSpin(glass);
    applyTownSpin(glow, true);
    applyTownSpin(halo, true);
    applyTownSpin(depth);
    if (steam) applyTownSteam(steam);
  } else {
    // Every spinning part already sits in its rest pose in the baked geometry.
    glow.color.setScalar(REMEMBERED_TOWN_GLOW);
    halo.opacity = HALO_OPACITY * REMEMBERED_TOWN_GLOW;
  }
  const all = [body, metal, glass, glow, halo, plinth, depth, ...(steam ? [steam] : [])];
  return { body, metal, glass, glow, halo, steam, plinth, depth, all };
};

const createTierSlots = (scene: Scene, materials: TownMaterials, capacity: number, namePrefix: string, animated: boolean): Map<TownTier, TierSlot> => {
  const slots = new Map<TownTier, TierSlot>();
  for (const tier of TOWN_TIERS) {
    const geometry = getTownTierGeometry(tier);
    const body = new InstancedMesh(geometry.body, materials.body, capacity);
    body.name = `${namePrefix}-${tier}`;
    body.frustumCulled = false;
    body.castShadow = true;
    body.receiveShadow = true;
    body.count = 0;
    body.customDepthMaterial = materials.depth;
    // The one per-frame cost of the animation: the shaders' shared clock.
    if (animated) body.onBeforeRender = tickTownTime;
    scene.add(body);
    const followers: InstancedMesh[] = [];
    for (const [suffix, part, material, shadowed] of [
      ["metal", geometry.metal, materials.metal, true],
      ["glass", geometry.glass, materials.glass, true],
      ["glow", geometry.glow, materials.glow, false],
      ["halo", geometry.halo, materials.halo, false],
      ["steam", geometry.steam, materials.steam, false],
      ["plinth", geometry.plinth, materials.plinth, true]
    ] as const) {
      if (!part || !material) continue;
      const mesh = new InstancedMesh(part, material, capacity);
      mesh.name = `${namePrefix}-${tier}-${suffix}`;
      // Same transforms as the body: share its buffer so it is uploaded once.
      mesh.instanceMatrix = body.instanceMatrix;
      mesh.frustumCulled = false;
      mesh.castShadow = shadowed;
      mesh.receiveShadow = shadowed;
      if (shadowed) mesh.customDepthMaterial = materials.depth;
      mesh.count = 0;
      scene.add(mesh);
      followers.push(mesh);
    }
    slots.set(tier, { body, followers, capacity, count: 0 });
  }
  return slots;
};

export const createTownOverlay = (scene: Scene, maxTiles: number, envMap?: Texture): TownOverlay => {
  const liveMaterials = createTownMaterials(envMap, true);
  const stillMaterials = createTownMaterials(envMap, false);
  const capacity = Math.max(1, maxTiles);
  const slots = createTierSlots(scene, liveMaterials, capacity, "town", true);
  const stillSlots = createTierSlots(scene, stillMaterials, Math.max(1, Math.ceil(maxTiles * REMEMBERED_TOWN_CAPACITY_SHARE)), "town-still", false);
  const allSlots = [...slots.values(), ...stillSlots.values()];

  const matrix = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const unitScale = new Vector3(1, 1, 1);
  const yAxis = new Vector3(0, 1, 0);

  const addInstance: TownOverlay["addInstance"] = (centerX, centerZ, surfaceY, tier, tileX = 0, tileY = 0, still = false) => {
    const slot = (still ? stillSlots : slots).get(tier);
    if (!slot || slot.count >= slot.capacity) return;
    quaternion.setFromAxisAngle(yAxis, townQuarterTurnForTile(tileX, tileY) * (Math.PI / 2));
    position.set(centerX, surfaceY + TOWN_BASE_LIFT, centerZ);
    slot.body.setMatrixAt(slot.count, matrix.compose(position, quaternion, unitScale));
    slot.count += 1;
  };

  const clear = (): void => {
    for (const slot of allSlots) slot.count = 0;
  };

  const commit = (): void => {
    for (const slot of allSlots) {
      slot.body.count = slot.count;
      // A tier with no town on screen costs no draw calls at all.
      slot.body.visible = slot.count > 0;
      for (const follower of slot.followers) {
        follower.count = slot.count;
        follower.visible = slot.count > 0;
      }
      // Upload only the instances actually drawn, not the whole tile-budget buffer.
      slot.body.instanceMatrix.clearUpdateRanges();
      if (slot.count === 0) continue;
      slot.body.instanceMatrix.addUpdateRange(0, slot.count * 16);
      slot.body.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const slot of allSlots) {
      scene.remove(slot.body);
      slot.body.dispose();
      for (const follower of slot.followers) scene.remove(follower);
    }
    slots.clear();
    stillSlots.clear();
    for (const material of [...liveMaterials.all, ...stillMaterials.all]) material.dispose();
  };

  return { clear, addInstance, commit, dispose };
};
