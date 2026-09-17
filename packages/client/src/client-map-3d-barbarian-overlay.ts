import { AnimationMixer, Group, Object3D, Quaternion, Scene, SkinnedMesh, Vector3, type AnimationAction } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  loadVoidcrystalColossusTemplate,
  VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME,
  VOIDCRYSTAL_COLOSSUS_WALKING_CLIP_NAME,
  type VoidcrystalColossusTemplate
} from "./client-map-3d-voidcrystal-colossus-asset.js";
import { createColossusMarineSkirmish, type SkirmishFight } from "./client-map-3d-colossus-marine-skirmish.js";
import type { ActiveBattleOverlay } from "./client-battle-overlay/client-battle-overlay.js";

// Barbarian-tile marker: a Voidcrystal Colossus standing on every currently
// barbarian-owned tile, replacing the earlier procedural "skull on a spike".
//
// There is no discrete "barbarian unit" anywhere server-side (see
// runtime-barbarian-walk.ts / system-job-barbarian-planner.ts) — "barbarian"
// is purely a per-tile ownerId label, and territory changes tile-by-tile as
// one owned tile eats a neighbor and (for the sub-multiply-threshold case)
// vacates itself. So "a barbarian walking to a tile" isn't a server event
// this overlay can subscribe to; it's synthesized here by diffing which
// tile keys are barbarian-owned frame to frame: a tile that drops out while
// an adjacent tile picks up ownership in the same rebuild is read as that
// colossus moving from the first tile to the second, and its pooled
// instance transitions between them instead of popping in place. A tile
// losing ownership with no adjacent gain (eaten by a player, multiplied
// instead of walked) just frees its slot; a tile gaining ownership with no
// adjacent loss (new/split barbarian growth) spawns a standing instance
// directly.
//
// Every capture walks (playing "Walking") from the origin tile to the
// destination FIRST — a capture is never an instant pop. What happens once
// it arrives depends on what the destination was:
//   - Settled (a town or other structure) — a real fight. The colossus
//     plays the "Attack" clip in place at the destination for
//     FIGHT_DURATION_MS, then stands there. (This is also what the client
//     naturally reads as "walked from an adjacent frontier tile the
//     barbarian previously ate up to the border it's now attacking".)
//   - Frontier (bare land) — the barbarian planner's routine one-tile
//     expansion, not a fight. It arrives and stands, no fight phase.
// The "Attack" clip plays ONLY during the fighting phase (a real fight
// against a settled tile, always AFTER arrival, never before); "Walking"
// plays ONLY while translating between tiles. A slot that is neither
// fighting nor moving holds an exact, unmoving bind pose: no idle
// sway/bob, so a standing colossus reads as genuinely stationary rather
// than a subtly looping prop.
//
// This only ever animates a WIN: a capture is inferred purely from tile
// ownership flipping to barbarian (see the diffing note below), and a
// barbarian ATTACK that LOSES never flips ownership, so there is nothing
// here to observe for a loss. That case — the colossus walking up, fighting,
// and being destroyed instead — is handled separately by
// client-map-3d-barbarian-loss-overlay.ts, which watches the real combat
// broadcast (state.activeBattles) instead of tile deltas, since a loss is
// exactly the case where no tile-ownership signal exists to diff.
const MAX_RENDERED_COLOSSI = 24;
// Exported for design-review stories that need to time other FX (e.g. a
// marine battle) to line up with when the colossus actually arrives/fights.
export const RUN_DURATION_MS = 10000;
export const FIGHT_DURATION_MS = 1500;
// The converted glb's raw height is ~1.70 world units (pinned by
// client-map-3d-voidcrystal-colossus-asset.test.ts). This brings a
// standing colossus to roughly double the height of the skull-marker pole
// it replaces, reading as a towering unit without dwarfing nearby structures.
const MODEL_SCALE = 1.4 / 1.70;
const UP_AXIS = new Vector3(0, 1, 0);

const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

type TileKey = string;
type Phase = "idle" | "fighting" | "running";

type Slot = {
  root: Object3D;
  inUse: boolean;
  tileKey: TileKey;
  worldX: number;
  worldZ: number;
  surfaceY: number;
  wx: number;
  wy: number;
  phase: Phase;
  moveFromX: number | undefined;
  moveFromZ: number | undefined;
  moveStartAt: number | undefined;
  moveArriveAt: number | undefined;
  fightStartAt: number | undefined;
  fightPending: boolean;
  mixer: AnimationMixer | undefined;
  actionsByClip: Map<string, AnimationAction>;
};

export type BarbarianOverlay = {
  readonly clear: () => void;
  readonly addInstance: (
    tileKey: TileKey,
    worldX: number,
    worldZ: number,
    surfaceY: number,
    wx: number,
    wy: number,
    isSettled: boolean
  ) => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

const isAdjacent = (aWx: number, aWy: number, bWx: number, bWy: number): boolean =>
  Math.abs(aWx - bWx) <= 1 && Math.abs(aWy - bWy) <= 1 && (aWx !== bWx || aWy !== bWy);

// A barbarian capture's RESULTING ownershipState is unconditionally SETTLED
// for barbarian-1 regardless of what it captured (see
// runtime-lock-resolution.ts's resolvedTarget: `ownershipState:
// lock.playerId === "barbarian-1" ? "SETTLED" : "FRONTIER"`, applied to both
// ATTACK and EXPAND) -- so the freshly-captured tile's OWN ownershipState can
// never distinguish "this was a real fight against a defended tile" from
// "this was a routine frontier land-grab" the way it does for every other
// player. The one signal that DOES make that distinction is whether a real
// combat broadcast landed for this tile: hasDefendingForce/combatBroadcastJson
// in runtime-lock-resolution.ts only fire for an ATTACK against a non-FRONTIER
// (i.e. actually defended) previous target, and client-battle-overlay.ts's
// registerActiveBattleFromTileDelta registers that broadcast into
// state.activeBattles keyed by this same tile, in the same delta that flips
// ownership -- so its presence there is the correct "was this settled" check.
export const wasSettledCapture = (activeBattles: ReadonlyMap<string, ActiveBattleOverlay>, tileKey: string): boolean => {
  const battle = activeBattles.get(tileKey);
  return battle !== undefined && battle.attackerOwnerId.startsWith("barbarian") && battle.attackerWon;
};

export const createBarbarianOverlay = (scene: Scene, _maxTiles: number): BarbarianOverlay => {
  let disposed = false;
  // Owns its own defender-only marine squad visual for the "fighting"
  // phase -- NOT popup-marine-overlay-fx.ts's two-sided battle FX, which
  // has no way to represent "one side is a colossus, not marines" and
  // shipped a confusing marines-vs-marines look once already.
  const skirmish = createColossusMarineSkirmish(scene);
  let pool: Slot[] = [];
  let loadedTemplate: VoidcrystalColossusTemplate | undefined;
  const byTileKey = new Map<TileKey, Slot>();

  const makeSlot = (root: Group): Slot => {
    const clonedRoot = cloneSkinned(root) as Object3D;
    clonedRoot.visible = false;
    clonedRoot.frustumCulled = false;
    clonedRoot.scale.setScalar(MODEL_SCALE);
    clonedRoot.traverse((child) => {
      if (child instanceof SkinnedMesh) child.frustumCulled = false;
    });
    scene.add(clonedRoot);
    return {
      root: clonedRoot,
      inUse: false,
      tileKey: "",
      worldX: 0,
      worldZ: 0,
      surfaceY: 0,
      wx: 0,
      wy: 0,
      phase: "idle",
      moveFromX: undefined,
      moveFromZ: undefined,
      moveStartAt: undefined,
      moveArriveAt: undefined,
      fightStartAt: undefined,
      fightPending: false,
      mixer: undefined,
      actionsByClip: new Map()
    };
  };

  // AnimationMixer/AnimationAction are only created for a slot the first
  // time it actually needs one (fights or runs) — a slot that only ever
  // stands never pays for either.
  const ensureClipAction = (slot: Slot, clipName: string): AnimationAction | undefined => {
    const cached = slot.actionsByClip.get(clipName);
    if (cached) return cached;
    if (!loadedTemplate) return undefined;
    const clip = loadedTemplate.clips.get(clipName);
    if (!clip) return undefined;
    if (!slot.mixer) slot.mixer = new AnimationMixer(slot.root);
    const action = slot.mixer.clipAction(clip);
    slot.actionsByClip.set(clipName, action);
    return action;
  };

  const stopAllActions = (slot: Slot): void => {
    for (const action of slot.actionsByClip.values()) action.stop();
  };

  loadVoidcrystalColossusTemplate()
    .then((template) => {
      if (disposed) return;
      loadedTemplate = template;
      pool = Array.from({ length: MAX_RENDERED_COLOSSI }, () => makeSlot(template.root));
    })
    .catch((err: unknown) => {
      // Nothing renders rather than crashing the 3D map: barbarian tiles
      // simply show no marker instead of taking down the renderer.
      console.error("voidcrystal-colossus model failed to load; barbarian tiles will not render a marker", err);
    });

  // Tile keys seen during the CURRENT rebuild pass (clear→addInstance*→commit),
  // used at commit() to diff against byTileKey (last frame's committed set).
  type Pending = { tileKey: TileKey; worldX: number; worldZ: number; surfaceY: number; wx: number; wy: number; isSettled: boolean };
  let pendingTileKeys: Pending[] = [];

  const clear = (): void => {
    pendingTileKeys = [];
  };

  const addInstance = (
    tileKey: TileKey,
    worldX: number,
    worldZ: number,
    surfaceY: number,
    wx: number,
    wy: number,
    isSettled: boolean
  ): void => {
    pendingTileKeys.push({ tileKey, worldX, worldZ, surfaceY, wx, wy, isSettled });
  };

  const resetTransitionState = (slot: Slot): void => {
    slot.moveFromX = undefined;
    slot.moveFromZ = undefined;
    slot.moveStartAt = undefined;
    slot.moveArriveAt = undefined;
    slot.fightStartAt = undefined;
    slot.fightPending = false;
    stopAllActions(slot);
  };

  const freeSlot = (slot: Slot): void => {
    slot.inUse = false;
    slot.phase = "idle";
    slot.root.visible = false;
    resetTransitionState(slot);
    byTileKey.delete(slot.tileKey);
  };

  const commit = (): void => {
    if (pool.length === 0) {
      pendingTileKeys = [];
      return;
    }

    const nextKeys = new Set(pendingTileKeys.map((p) => p.tileKey));
    const previousSlots = new Map(byTileKey);

    const departed = [...previousSlots.values()].filter((slot) => !nextKeys.has(slot.tileKey));
    const arrived = pendingTileKeys.filter((p) => !previousSlots.has(p.tileKey));

    // Tiles present in BOTH frames (still barbarian, not a fresh capture)
    // keep their existing slot untouched by the pairing/spawn logic below
    // -- but world positions here are camera-window-relative (toroidal
    // wrapping recenters them on every rebuild whose sceneOrigin shifted),
    // so a colossus whose slot.worldX/Z was never refreshed would silently
    // drift off its own tile as the camera panned. This applies whether the
    // slot is standing OR mid-walk: a walk can span up to RUN_DURATION_MS
    // (10s), long enough for several camera-window rebuilds to land inside
    // it, so pinning the destination once at commit-time (as this used to)
    // let it go stale and made the colossus visibly walk past/short of the
    // tile once the camera moved underneath it. Shift moveFromX/Z by the
    // SAME delta as worldX/Z so an in-progress walk's start/end stay
    // consistent with each other in the new frame instead of only the
    // endpoint moving.
    for (const pending of pendingTileKeys) {
      const existing = previousSlots.get(pending.tileKey);
      if (!existing) continue;
      const deltaX = pending.worldX - existing.worldX;
      const deltaZ = pending.worldZ - existing.worldZ;
      existing.worldX = pending.worldX;
      existing.worldZ = pending.worldZ;
      existing.surfaceY = pending.surfaceY;
      existing.wx = pending.wx;
      existing.wy = pending.wy;
      if (existing.moveFromX !== undefined && existing.moveFromZ !== undefined) {
        existing.moveFromX += deltaX;
        existing.moveFromZ += deltaZ;
      }
    }

    // Pair each departed tile with the nearest still-unmatched arrived tile
    // adjacent to it, reusing that slot as a transition instead of
    // despawn+spawn. Multiple adjacent candidates (e.g. a multiply splitting
    // outward) resolve to the first match — good enough for a cosmetic tell,
    // not a claim about which server-side capture actually happened.
    const arrivedRemaining = [...arrived];
    for (const slot of departed) {
      const matchIdx = arrivedRemaining.findIndex((a) => isAdjacent(slot.wx, slot.wy, a.wx, a.wy));
      if (matchIdx === -1) {
        freeSlot(slot);
        continue;
      }
      const dest = arrivedRemaining.splice(matchIdx, 1)[0]!;
      byTileKey.delete(slot.tileKey);
      resetTransitionState(slot);

      // Every capture walks first; moveStartAt/fightStartAt are left
      // undefined here and lazily stamped from tick()'s own nowMs on its
      // first look at this slot -- commit() and tick() aren't guaranteed
      // to observe the same clock reading (tick() takes nowMs as an
      // explicit argument precisely so callers can drive it, e.g. in
      // tests or when scrubbing), so timing derives entirely from tick().
      slot.moveFromX = slot.worldX;
      slot.moveFromZ = slot.worldZ;
      slot.phase = "running";
      // Settled destination: fight in place once the walk arrives.
      // Frontier: arrive and just stand, no fight phase.
      slot.fightPending = dest.isSettled;

      slot.tileKey = dest.tileKey;
      slot.worldX = dest.worldX;
      slot.worldZ = dest.worldZ;
      slot.surfaceY = dest.surfaceY;
      slot.wx = dest.wx;
      slot.wy = dest.wy;
      byTileKey.set(dest.tileKey, slot);
    }

    // Anything still unmatched appeared with no plausible walk origin
    // (fresh growth/multiply) — place it standing immediately.
    for (const spawn of arrivedRemaining) {
      if (byTileKey.has(spawn.tileKey)) continue;
      const freeIdx = pool.findIndex((s) => !s.inUse);
      if (freeIdx === -1) break; // at MAX_RENDERED_COLOSSI, silently drop like other capped overlays
      const slot = pool[freeIdx]!;
      slot.inUse = true;
      slot.phase = "idle";
      slot.tileKey = spawn.tileKey;
      slot.worldX = spawn.worldX;
      slot.worldZ = spawn.worldZ;
      slot.surfaceY = spawn.surfaceY;
      slot.wx = spawn.wx;
      slot.wy = spawn.wy;
      resetTransitionState(slot);
      byTileKey.set(spawn.tileKey, slot);
    }

    pendingTileKeys = [];
  };

  const tmpQuat = new Quaternion();

  const tick = (nowMs: number): void => {
    const fights = new Map<string, SkirmishFight>();
    for (const slot of byTileKey.values()) {
      slot.root.visible = true;
      let x = slot.worldX;
      let z = slot.worldZ;

      if (slot.phase === "running" && slot.moveFromX !== undefined && slot.moveFromZ !== undefined) {
        if (slot.moveStartAt === undefined) {
          slot.moveStartAt = nowMs;
          slot.moveArriveAt = nowMs + RUN_DURATION_MS;
          ensureClipAction(slot, VOIDCRYSTAL_COLOSSUS_WALKING_CLIP_NAME)?.reset().play();
        }
        const span = Math.max(1, slot.moveArriveAt! - slot.moveStartAt);
        const rawT = Math.min(1, Math.max(0, (nowMs - slot.moveStartAt) / span));
        const t = easeInOutSine(rawT);
        x = slot.moveFromX + (slot.worldX - slot.moveFromX) * t;
        z = slot.moveFromZ + (slot.worldZ - slot.moveFromZ) * t;
        slot.mixer?.update(0.016);

        const dx = slot.worldX - slot.moveFromX;
        const dz = slot.worldZ - slot.moveFromZ;
        if (dx !== 0 || dz !== 0) {
          tmpQuat.setFromAxisAngle(UP_AXIS, Math.atan2(dx, dz));
          slot.root.quaternion.copy(tmpQuat);
        }

        if (rawT >= 1) {
          if (slot.fightPending) {
            // Arrived at a settled tile it just fought to a win -- fight
            // in place here (not at the origin) before finally standing.
            stopAllActions(slot);
            slot.phase = "fighting";
            slot.moveStartAt = undefined;
            slot.moveArriveAt = undefined;
            slot.fightPending = false;
            ensureClipAction(slot, VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME)?.reset().play();
          } else {
            slot.phase = "idle";
            resetTransitionState(slot);
          }
        }
      } else if (slot.phase === "fighting" && slot.moveFromX !== undefined && slot.moveFromZ !== undefined) {
        if (slot.fightStartAt === undefined) slot.fightStartAt = nowMs;
        // Fighting happens AT the destination it just walked to, not the
        // origin -- worldX/worldZ, not moveFromX/moveFromZ.
        x = slot.worldX;
        z = slot.worldZ;
        slot.mixer?.update(0.016);
        const fightEndAt = slot.fightStartAt + FIGHT_DURATION_MS;
        if (nowMs >= fightEndAt) {
          slot.phase = "idle";
          resetTransitionState(slot);
        } else {
          // This slot only ever reaches "fighting" on a win (see the
          // module comment) -- the marines here always lose one by one.
          fights.set(slot.tileKey, {
            colossusWorldX: slot.worldX,
            colossusWorldZ: slot.worldZ,
            colossusSurfaceY: slot.surfaceY,
            startAt: slot.fightStartAt,
            endAt: fightEndAt,
            colossusWins: true
          });
        }
      }

      slot.root.position.set(x, slot.surfaceY, z);
      slot.root.updateMatrixWorld(true);
    }
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
    byTileKey.clear();
  };

  return { clear, addInstance, commit, tick, dispose };
};
