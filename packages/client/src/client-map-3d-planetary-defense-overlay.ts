import { AnimationMixer, MeshStandardMaterial, Object3D, Quaternion, Scene, SkinnedMesh, Vector3, type AnimationAction } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  firstSkinnedMesh,
  loadPopupMarineTemplate,
  MARINE_CLIP_NAMES,
  type PopupMarineTemplate
} from "./client-map-3d-popup-marine/popup-marine-asset.js";
import { MARINE_MODEL_SCALE } from "./client-map-3d-popup-marine/popup-marine-timeline.js";
import { patrolPoseAt, SOLDIERS_PER_TILE } from "./client-map-3d-planetary-defense-patrol.js";
import type { ActiveBattleOverlay } from "./client-battle-overlay/client-battle-overlay.js";
import { isPlanetaryDefenseOwnerId, PLANETARY_DEFENSE_ARMOR_COLOR } from "./client-planetary-defense-style.js";

// Planetary Defense tile marker: a pair of dark-grey-armored soldiers
// patrolling every barbarian-owned tile ("barbarian" is still the internal
// owner id; players see "Planetary Defense" — what is left of the planet's
// own defense force after the world was prepared for the planetary games).
// Replaces the earlier Voidcrystal Colossus monster.
//
// The soldiers are the same skinned marine model the battle overlay uses
// (popup-marine-overlay-fx.ts), tinted PLANETARY_DEFENSE_ARMOR_COLOR. That
// is deliberate: syncBattleOverlayFx tints any Planetary Defense side of a
// real fight with the same armor color, so when combat happens the squad
// that marches out and fights IS these soldiers. While a tile is engaged in
// a battle (as its origin or target — see planetaryDefenseEngagedTileKeys),
// its patrol is hidden so the battle squad stands in for it instead of the
// same soldiers appearing twice.
//
// There is no discrete "barbarian unit" server-side — territory changes
// tile by tile. As before, a capture is synthesized by diffing which tile
// keys are barbarian-owned between rebuilds: a tile that drops out while an
// adjacent one appears is read as that patrol moving across, and its pooled
// slot jogs (PistolRun) from where it stood to its new patrol route instead
// of popping. A move into an engaged (fought-over) tile skips the jog —
// the battle squad already showed the advance — and the patrol simply
// appears there once the fight ends. Otherwise each soldier walks
// (PistolWalk) between waypoints inside its tile and pauses (PistolIdle).
const MAX_RENDERED_TILES = 32;
export const MOVE_DURATION_MS = 3500;
const UP_AXIS = new Vector3(0, 1, 0);
const CLIP_PHASE_STEP = 0.43;

type TileKey = string;
type Stance = "walk" | "stand" | "run";

type Soldier = {
  root: Object3D;
  material: MeshStandardMaterial;
  mixer: AnimationMixer;
  actions: Partial<Record<Stance, AnimationAction>>;
  phase: number;
};

type Slot = {
  soldiers: Soldier[];
  inUse: boolean;
  tileKey: TileKey;
  worldX: number;
  worldZ: number;
  surfaceY: number;
  wx: number;
  wy: number;
  // Per-soldier world positions the current move started from; undefined
  // when not moving between tiles. Stamped lazily in tick() (see commit()).
  moveFrom: Array<{ x: number; z: number }> | undefined;
  moveStartAt: number | undefined;
  movePending: boolean;
};

export type PlanetaryDefenseOverlay = {
  readonly clear: () => void;
  readonly addInstance: (tileKey: TileKey, worldX: number, worldZ: number, surfaceY: number, wx: number, wy: number) => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number, engagedTileKeys?: ReadonlySet<string>) => void;
  readonly dispose: () => void;
};

// Tiles whose Planetary Defense patrol is currently represented by a live
// battle squad instead (see module comment). `nowMs` is the same
// performance.now() clock ActiveBattleOverlay.endAt is stamped in.
export const planetaryDefenseEngagedTileKeys = (
  activeBattles: ReadonlyMap<string, ActiveBattleOverlay>,
  keyFor: (x: number, y: number) => string,
  nowMs: number
): Set<string> => {
  const engaged = new Set<string>();
  for (const battle of activeBattles.values()) {
    if (nowMs >= battle.endAt) continue;
    if (!isPlanetaryDefenseOwnerId(battle.attackerOwnerId) && !isPlanetaryDefenseOwnerId(battle.defenderOwnerId)) continue;
    engaged.add(keyFor(battle.originX, battle.originY));
    engaged.add(keyFor(battle.targetX, battle.targetY));
  }
  return engaged;
};

const isAdjacent = (aWx: number, aWy: number, bWx: number, bWy: number): boolean =>
  Math.abs(aWx - bWx) <= 1 && Math.abs(aWy - bWy) <= 1 && (aWx !== bWx || aWy !== bWy);

const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

// Same paint-times-tint material the battle overlay uses (see
// popup-marine-overlay-fx.ts's buildMaterial), fixed to the armor color.
const buildMaterial = (): MeshStandardMaterial =>
  new MeshStandardMaterial({ color: PLANETARY_DEFENSE_ARMOR_COLOR, vertexColors: true, roughness: 0.55, metalness: 0.5 });

export const createPlanetaryDefenseOverlay = (scene: Scene): PlanetaryDefenseOverlay => {
  let disposed = false;
  let pool: Slot[] = [];
  const byTileKey = new Map<TileKey, Slot>();

  const makeSoldier = (template: PopupMarineTemplate, index: number): Soldier => {
    const root = cloneSkinned(template.root) as Object3D;
    const material = buildMaterial();
    const mesh = firstSkinnedMesh(root);
    mesh.material = material;
    mesh.frustumCulled = false;
    root.visible = false;
    root.scale.setScalar(MARINE_MODEL_SCALE);
    const mixer = new AnimationMixer(root);
    const actionFor = (clipName: string): AnimationAction | undefined => {
      const clip = template.clips.get(clipName);
      if (!clip) return undefined;
      const action = mixer.clipAction(clip);
      action.play();
      action.setEffectiveWeight(0);
      return action;
    };
    const actions: Partial<Record<Stance, AnimationAction>> = {};
    const walk = actionFor("PistolWalk");
    const stand = actionFor(MARINE_CLIP_NAMES.stand);
    const run = actionFor(MARINE_CLIP_NAMES.run);
    if (walk) actions.walk = walk;
    if (stand) actions.stand = stand;
    if (run) actions.run = run;
    scene.add(root);
    return { root, material, mixer, actions, phase: index * CLIP_PHASE_STEP };
  };

  const makeSlot = (template: PopupMarineTemplate, slotIndex: number): Slot => ({
    soldiers: Array.from({ length: SOLDIERS_PER_TILE }, (_, i) => makeSoldier(template, slotIndex * SOLDIERS_PER_TILE + i)),
    inUse: false,
    tileKey: "",
    worldX: 0,
    worldZ: 0,
    surfaceY: 0,
    wx: 0,
    wy: 0,
    moveFrom: undefined,
    moveStartAt: undefined,
    movePending: false
  });

  loadPopupMarineTemplate()
    .then((template) => {
      if (disposed) return;
      pool = Array.from({ length: MAX_RENDERED_TILES }, (_, i) => makeSlot(template, i));
    })
    .catch((err: unknown) => {
      // Nothing renders rather than crashing the 3D map.
      console.error("popup-marine model failed to load; Planetary Defense tiles will not render soldiers", err);
    });

  type Pending = { tileKey: TileKey; worldX: number; worldZ: number; surfaceY: number; wx: number; wy: number };
  let pendingTiles: Pending[] = [];

  const clear = (): void => {
    pendingTiles = [];
  };

  const addInstance = (tileKey: TileKey, worldX: number, worldZ: number, surfaceY: number, wx: number, wy: number): void => {
    pendingTiles.push({ tileKey, worldX, worldZ, surfaceY, wx, wy });
  };

  const hideSlot = (slot: Slot): void => {
    for (const soldier of slot.soldiers) soldier.root.visible = false;
  };

  const resetMove = (slot: Slot): void => {
    slot.moveFrom = undefined;
    slot.moveStartAt = undefined;
    slot.movePending = false;
  };

  const assign = (slot: Slot, tile: Pending): void => {
    slot.tileKey = tile.tileKey;
    slot.worldX = tile.worldX;
    slot.worldZ = tile.worldZ;
    slot.surfaceY = tile.surfaceY;
    slot.wx = tile.wx;
    slot.wy = tile.wy;
    byTileKey.set(tile.tileKey, slot);
  };

  const commit = (): void => {
    if (pool.length === 0) {
      pendingTiles = [];
      return;
    }
    const nextKeys = new Set(pendingTiles.map((p) => p.tileKey));
    const previousSlots = new Map(byTileKey);
    const departed = [...previousSlots.values()].filter((slot) => !nextKeys.has(slot.tileKey));
    const arrived = pendingTiles.filter((p) => !previousSlots.has(p.tileKey));

    // Tiles present in both rebuilds keep their slot, but world positions are
    // camera-window-relative (toroidal recentering on every rebuild), so
    // refresh them — and shift an in-progress move's start points by the
    // same delta so it doesn't drift off its route while the camera pans.
    for (const pending of pendingTiles) {
      const existing = previousSlots.get(pending.tileKey);
      if (!existing) continue;
      const deltaX = pending.worldX - existing.worldX;
      const deltaZ = pending.worldZ - existing.worldZ;
      existing.worldX = pending.worldX;
      existing.worldZ = pending.worldZ;
      existing.surfaceY = pending.surfaceY;
      existing.wx = pending.wx;
      existing.wy = pending.wy;
      for (const from of existing.moveFrom ?? []) {
        from.x += deltaX;
        from.z += deltaZ;
      }
    }

    // Pair each departed tile with an adjacent arrived one and move that
    // patrol across instead of despawn+spawn (a cosmetic tell, not a claim
    // about which server-side capture happened).
    const arrivedRemaining = [...arrived];
    for (const slot of departed) {
      byTileKey.delete(slot.tileKey);
      const matchIdx = arrivedRemaining.findIndex((a) => isAdjacent(slot.wx, slot.wy, a.wx, a.wy));
      if (matchIdx === -1) {
        slot.inUse = false;
        resetMove(slot);
        hideSlot(slot);
        continue;
      }
      const dest = arrivedRemaining.splice(matchIdx, 1)[0]!;
      resetMove(slot);
      // The start points are captured from the soldiers' last rendered
      // positions in tick(), on the same clock that times the move.
      slot.movePending = true;
      assign(slot, dest);
    }

    for (const spawn of arrivedRemaining) {
      if (byTileKey.has(spawn.tileKey)) continue;
      const free = pool.find((s) => !s.inUse);
      if (!free) break; // at MAX_RENDERED_TILES, silently drop like other capped overlays
      free.inUse = true;
      resetMove(free);
      assign(free, spawn);
    }
    pendingTiles = [];
  };

  const tmpQuat = new Quaternion();

  const pose = (soldier: Soldier, stance: Stance, nowMs: number): void => {
    for (const [name, action] of Object.entries(soldier.actions) as Array<[Stance, AnimationAction]>) {
      action.setEffectiveWeight(name === stance ? 1 : 0);
      const duration = action.getClip().duration;
      action.time = duration > 0 ? (nowMs * 0.001 + soldier.phase) % duration : 0;
    }
    soldier.mixer.update(0);
  };

  const tick = (nowMs: number, engagedTileKeys?: ReadonlySet<string>): void => {
    for (const slot of byTileKey.values()) {
      if (engagedTileKeys?.has(slot.tileKey)) {
        // The battle squad represents this patrol right now; when it ends,
        // the soldiers are simply back on patrol at this tile.
        resetMove(slot);
        hideSlot(slot);
        continue;
      }
      if (slot.movePending) {
        slot.moveFrom = slot.soldiers.map((s) => ({ x: s.root.position.x, z: s.root.position.z }));
        slot.moveStartAt = nowMs;
        slot.movePending = false;
      }
      const moveT =
        slot.moveFrom && slot.moveStartAt !== undefined ? Math.min(1, Math.max(0, (nowMs - slot.moveStartAt) / MOVE_DURATION_MS)) : 1;
      for (let i = 0; i < slot.soldiers.length; i += 1) {
        const soldier = slot.soldiers[i]!;
        const patrol = patrolPoseAt(slot.wx, slot.wy, i, nowMs);
        let x = slot.worldX + patrol.offsetX;
        let z = slot.worldZ + patrol.offsetZ;
        let yaw = patrol.yaw;
        let stance: Stance = patrol.walking ? "walk" : "stand";
        const from = slot.moveFrom?.[i];
        if (from && moveT < 1) {
          // Jog toward the live patrol position so arrival hands off to the
          // patrol without a pop.
          const t = easeInOutSine(moveT);
          const dx = x - from.x;
          const dz = z - from.z;
          x = from.x + dx * t;
          z = from.z + dz * t;
          if (dx !== 0 || dz !== 0) yaw = Math.atan2(dx, dz);
          stance = "run";
        }
        soldier.root.position.set(x, slot.surfaceY, z);
        tmpQuat.setFromAxisAngle(UP_AXIS, yaw);
        soldier.root.quaternion.copy(tmpQuat);
        soldier.root.visible = true;
        pose(soldier, stance, nowMs);
        soldier.root.updateMatrixWorld(true);
      }
      if (moveT >= 1) resetMove(slot);
    }
  };

  const dispose = (): void => {
    disposed = true;
    for (const slot of pool) {
      for (const soldier of slot.soldiers) {
        soldier.mixer.stopAllAction();
        soldier.mixer.uncacheRoot(soldier.root);
        scene.remove(soldier.root);
        soldier.root.traverse((child) => {
          if (child instanceof SkinnedMesh) child.geometry.dispose();
        });
        soldier.material.dispose();
      }
    }
    pool = [];
    byTileKey.clear();
  };

  return { clear, addInstance, commit, tick, dispose };
};
