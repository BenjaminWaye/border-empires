import {
  AdditiveBlending,
  AnimationMixer,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SkinnedMesh,
  SphereGeometry,
  Vector3,
  type AnimationAction,
  type Scene
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import type { ActiveBattleOverlay } from "./client-battle-overlay/client-battle-overlay.js";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import {
  loadVoidcrystalColossusTemplate,
  VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME,
  type VoidcrystalColossusTemplate
} from "./client-map-3d-voidcrystal-colossus-asset.js";
import { createColossusMarineSkirmish, type SkirmishFight } from "./client-map-3d-colossus-marine-skirmish.js";

const TILE_CENTER_OFFSET = 0.5;

// Extracts the barbarian-loses subset of state.activeBattles (the same map
// syncBattleOverlayFx already reads for the marine battle overlay -- see
// client-map-3d-capture-overlays.ts's own toroidDelta placement math,
// mirrored here) into this overlay's own input shape. Covers BOTH
// directions a barbarian can lose a fight -- frontier-combat.ts's
// rollFrontierCombat is symmetric, with no special-casing on which side is
// the barbarian (verified against runtime-lock-resolution.ts's
// hasDefendingForce/combatBroadcastJson):
//   - The Bleed is the ATTACKER and loses (attacking a player's settled
//     tile and failing the roll) -- ownership never changes, so this is
//     the ONLY place that outcome is visible at all client-side.
//   - The Bleed is the DEFENDER and a player attacker wins (defeating a
//     barbarian-held tile) -- ownership DOES change here (the tile becomes
//     the winning player's FRONTIER tile, not their SETTLED tile -- see
//     runtime-lock-resolution.ts's ownershipState assignment), and
//     client-map-3d-barbarian-overlay.ts's own tile-diffing already frees
//     that tile's standing idle marker the instant the delta lands. This
//     overlay's death animation is a separate, independently-timed visual
//     keyed off the combat broadcast, not the tile delta -- the two may
//     overlap on screen for a moment, which reads fine (the persistent
//     territorial marker vanishing exactly as the battle FX plays out the
//     kill is the correct sequence, not a bug).
export const buildBarbarianLossBattles = (
  activeBattles: ReadonlyMap<string, ActiveBattleOverlay>,
  heightfield: Heightfield,
  sceneOriginX: number,
  sceneOriginY: number
): Map<string, BarbarianLossBattle> => {
  const result = new Map<string, BarbarianLossBattle>();
  for (const [key, battle] of activeBattles) {
    const barbarianAttackerLost = battle.attackerOwnerId.startsWith("barbarian") && !battle.attackerWon;
    const barbarianDefenderLost = battle.defenderOwnerId.startsWith("barbarian") && battle.attackerWon;
    if (!barbarianAttackerLost && !barbarianDefenderLost) continue;
    const tgtDx = toroidDelta(sceneOriginX, battle.targetX, WORLD_WIDTH);
    const tgtDy = toroidDelta(sceneOriginY, battle.targetY, WORLD_HEIGHT);
    result.set(key, {
      targetWorldX: tgtDx + TILE_CENTER_OFFSET,
      targetWorldZ: tgtDy + TILE_CENTER_OFFSET,
      surfaceY: Math.max(heightfield.elevationAt(battle.targetX, battle.targetY), heightfield.cornerYAt(battle.targetX, battle.targetY)),
      endAt: battle.endAt
    });
  }
  return result;
};

// Renders the ONE barbarian-capture outcome client-map-3d-barbarian-overlay.ts
// structurally cannot see: a LOST attack. That overlay infers everything
// from tile-ownership deltas, and a lost attack never changes ownership —
// there is no tile to diff. This module instead watches the real combat
// broadcast (state.activeBattles, populated by
// client-battle-overlay.ts's registerActiveBattleFromTileDelta from the
// server's combatJson) directly for entries where the attacker is a
// barbarian tile and it lost: `attackerOwnerId.startsWith("barbarian") &&
// !attackerWon`. Verified this isn't hypothetical -- a barbarian ATTACK on
// a settled (defended) tile goes through the same probabilistic combat
// roll as a player's (frontier-combat.ts's rollFrontierCombat), so it can
// and does lose exactly like a player's attack can.
//
// Unlike the win case, a lost attack's combat broadcast arrives already
// resolved at the firing line (see registerActiveBattleFromTileDelta's own
// comment: clashAt is stamped to "now", the approach is never replayed) --
// there is no earlier "walking over" telemetry to animate before the
// fight. So this renders: colossus appears already standing at the
// DEFENDED (target) tile playing "Attack" for the clash window, then
// dissolves into a blue smoke puff and disappears for the rout window,
// while a defender-only marine squad (client-map-3d-colossus-marine-
// skirmish.ts, shared with the win-case fight in
// client-map-3d-barbarian-overlay.ts) fires on it the whole time and never
// takes losses -- colossusWins: false. The tile itself never changes hands.
const MAX_CONCURRENT_LOSSES = 6;
const SMOKE_PARTICLES_PER_DEATH = 14;
const MAX_SMOKE_PARTICLES = MAX_CONCURRENT_LOSSES * SMOKE_PARTICLES_PER_DEATH;
const MODEL_SCALE = 1.4 / 1.70; // matches client-map-3d-barbarian-overlay.ts
const SMOKE_COLOR = new Color("#5fb3ff");
// How long before a slot's own endAt it starts visibly shrinking/puffing
// away -- independent of how long the battle's overall rout window is, so
// the dissolve always reads as "just before it vanishes" rather than
// stretching or compressing to fit.
const DISSOLVE_WINDOW_MS = 900;

export type BarbarianLossBattle = {
  readonly targetWorldX: number;
  readonly targetWorldZ: number;
  readonly surfaceY: number;
  readonly endAt: number;
};

type Slot = {
  root: Object3D;
  inUse: boolean;
  battleKey: string;
  worldX: number;
  worldZ: number;
  surfaceY: number;
  spawnedAt: number;
  endAt: number;
  mixer: AnimationMixer | undefined;
  attackAction: AnimationAction | undefined;
};

export type BarbarianLossOverlay = {
  // Called once per frame with the CURRENT set of lost-attack battles,
  // keyed the same way state.activeBattles already is (by target tile
  // key) -- spawns a colossus for any newly-seen key, retires one whose
  // key is no longer present (battle pruned/expired) or past its own endAt.
  readonly sync: (battles: ReadonlyMap<string, BarbarianLossBattle>, nowMs: number) => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createBarbarianLossOverlay = (scene: Scene): BarbarianLossOverlay => {
  let disposed = false;
  let loadedTemplate: VoidcrystalColossusTemplate | undefined;
  let pool: Slot[] = [];
  const byBattleKey = new Map<string, Slot>();
  const skirmish = createColossusMarineSkirmish(scene);

  // Small pool of "puff" spheres shared across all concurrent deaths -- an
  // InstancedMesh so a burst of particles costs one draw call, not
  // SMOKE_PARTICLES_PER_DEATH * MAX_CONCURRENT_LOSSES of them.
  const smokeGeometry = new SphereGeometry(0.06, 6, 5);
  const smokeMaterial = new MeshBasicMaterial({ toneMapped: false, color: SMOKE_COLOR, transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false });
  const smokeMesh = new InstancedMesh(smokeGeometry, smokeMaterial, MAX_SMOKE_PARTICLES);
  smokeMesh.frustumCulled = false;
  smokeMesh.count = 0;
  smokeMesh.visible = false;
  scene.add(smokeMesh);
  const smokeMatrix = new Matrix4();
  const smokePos = new Vector3();
  const smokeScale = new Vector3();
  const identityQuat = new Quaternion();

  const makeSlot = (root: Object3D): Slot => {
    const clonedRoot = cloneSkinned(root) as Object3D;
    clonedRoot.visible = false;
    clonedRoot.frustumCulled = false;
    clonedRoot.scale.setScalar(MODEL_SCALE);
    clonedRoot.traverse((child) => {
      if (child instanceof SkinnedMesh) child.frustumCulled = false;
    });
    scene.add(clonedRoot);
    return { root: clonedRoot, inUse: false, battleKey: "", worldX: 0, worldZ: 0, surfaceY: 0, spawnedAt: 0, endAt: 0, mixer: undefined, attackAction: undefined };
  };

  loadVoidcrystalColossusTemplate()
    .then((template) => {
      if (disposed) return;
      loadedTemplate = template;
      pool = Array.from({ length: MAX_CONCURRENT_LOSSES }, () => makeSlot(template.root));
    })
    .catch((err: unknown) => {
      console.error("voidcrystal-colossus model failed to load; lost barbarian attacks will not render a marker", err);
    });

  const ensureAttackAction = (slot: Slot): AnimationAction | undefined => {
    if (slot.attackAction) return slot.attackAction;
    if (!loadedTemplate) return undefined;
    const clip = loadedTemplate.clips.get(VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME);
    if (!clip) return undefined;
    slot.mixer = new AnimationMixer(slot.root);
    slot.attackAction = slot.mixer.clipAction(clip);
    return slot.attackAction;
  };

  const freeSlot = (slot: Slot): void => {
    slot.mixer?.stopAllAction();
    slot.inUse = false;
    slot.root.visible = false;
    slot.root.scale.setScalar(MODEL_SCALE);
    byBattleKey.delete(slot.battleKey);
  };

  const sync = (battles: ReadonlyMap<string, BarbarianLossBattle>, nowMs: number): void => {
    if (pool.length === 0) return;

    for (const [key, slot] of byBattleKey) {
      if (!battles.has(key) || nowMs >= slot.endAt) freeSlot(slot);
    }

    for (const [key, battle] of battles) {
      if (byBattleKey.has(key)) continue;
      if (nowMs >= battle.endAt) continue; // stale entry -- don't resurrect a slot retired above in this same call
      const freeIdx = pool.findIndex((s) => !s.inUse);
      if (freeIdx === -1) break; // at MAX_CONCURRENT_LOSSES, silently drop -- concurrent barbarian losses in view are rare
      const slot = pool[freeIdx]!;
      slot.inUse = true;
      slot.battleKey = key;
      slot.worldX = battle.targetWorldX;
      slot.worldZ = battle.targetWorldZ;
      slot.surfaceY = battle.surfaceY;
      slot.spawnedAt = nowMs;
      slot.endAt = battle.endAt;
      slot.root.visible = true;
      slot.root.scale.setScalar(MODEL_SCALE);
      slot.root.position.set(battle.targetWorldX, battle.surfaceY, battle.targetWorldZ);
      slot.root.updateMatrixWorld(true);
      ensureAttackAction(slot)?.reset().play();
      byBattleKey.set(key, slot);
    }
  };

  const tick = (nowMs: number): void => {
    const fights = new Map<string, SkirmishFight>();
    let smokeCount = 0;
    for (const slot of byBattleKey.values()) {
      slot.mixer?.update(0.016);

      const dissolve = Math.min(1, Math.max(0, 1 - (slot.endAt - nowMs) / DISSOLVE_WINDOW_MS));
      slot.root.scale.setScalar(MODEL_SCALE * (1 - dissolve));
      slot.root.updateMatrixWorld(true);

      fights.set(slot.battleKey, {
        colossusWorldX: slot.worldX,
        colossusWorldZ: slot.worldZ,
        colossusSurfaceY: slot.surfaceY,
        startAt: slot.spawnedAt,
        endAt: slot.endAt,
        colossusWins: false
      });

      if (dissolve <= 0) continue;
      const seedBase = slot.battleKey.length * 7919;
      for (let i = 0; i < SMOKE_PARTICLES_PER_DEATH && smokeCount < MAX_SMOKE_PARTICLES; i += 1) {
        const seed = seedBase + i * 104729;
        const angle = ((seed % 360) / 360) * Math.PI * 2;
        const radius = 0.15 + dissolve * 0.55 + ((seed % 17) / 17) * 0.2;
        const height = 0.1 + dissolve * 0.9 + ((seed % 13) / 13) * 0.3;
        smokePos.set(slot.worldX + Math.cos(angle) * radius, slot.surfaceY + height, slot.worldZ + Math.sin(angle) * radius);
        smokeScale.setScalar((1 - dissolve) * 0.5 + 0.15);
        smokeMatrix.compose(smokePos, identityQuat, smokeScale);
        smokeMesh.setMatrixAt(smokeCount, smokeMatrix);
        smokeCount += 1;
      }
    }
    smokeMesh.count = smokeCount;
    smokeMesh.visible = smokeCount > 0;
    smokeMesh.instanceMatrix.needsUpdate = true;
    skirmish.sync(fights, nowMs);
    skirmish.tick(nowMs);
  };

  const dispose = (): void => {
    disposed = true;
    skirmish.dispose();
    for (const slot of pool) {
      slot.mixer?.stopAllAction();
      scene.remove(slot.root);
      slot.root.traverse((child) => {
        if (child instanceof SkinnedMesh) child.geometry.dispose();
      });
    }
    pool = [];
    byBattleKey.clear();
    scene.remove(smokeMesh);
    smokeGeometry.dispose();
    smokeMaterial.dispose();
  };

  return { sync, tick, dispose };
};
