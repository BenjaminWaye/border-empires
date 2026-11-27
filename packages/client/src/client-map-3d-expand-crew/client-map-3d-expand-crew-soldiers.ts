import { AnimationMixer, Object3D, Quaternion, Scene, SkinnedMesh, Vector3, type AnimationAction, type MeshStandardMaterial, type Texture } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  firstSkinnedMesh,
  loadPopupMarineTemplate,
  MARINE_CLIP_NAMES,
  type PopupMarineTemplate
} from "../client-map-3d-popup-marine/popup-marine-asset.js";
import { MARINE_MODEL_SCALE } from "../client-map-3d-popup-marine/popup-marine-timeline.js";
import { createMarineMaterial } from "../client-map-3d-popup-marine/popup-marine-material.js";
import { MARINE_MODEL_KEYS, marineModelFallbacks, marineModelSurfaceMasked, perMarineModel, type MarineModelKey } from "../client-map-3d-popup-marine/popup-marine-gear.js";
import { FRONTIER_CLAIM_PLATE_CAP } from "../client-map-3d-frontier-claim-plate/client-map-3d-frontier-claim-plate.js";
import type { PlacedFrontierClaim } from "../client-map-3d-frontier-claim-plates.js";
import { EXPAND_CREW_SIZE, expandCrewFigurePose, type ExpandCrewStance } from "../client-expand-crew/client-expand-crew.js";
import { wanderHash01 } from "../client-ancillary-wander/client-ancillary-wander.js";

// 3D expand crew: the two ancillary soldiers that walk out onto a neutral
// tile, idly patrol it while its claim plate fills, and kneel to plant the
// claim (client-expand-crew.ts holds the paths; the 2D canvas twin is
// client-expand-crew-2d/). The same skinned marine the muster transit and
// battle overlays use, tinted in the expanding empire's colour like a
// marching company, walking (PistolWalk) and pausing (PistolIdle) the way
// the Planetary Defense patrol does (client-map-3d-planetary-defense-
// overlay.ts). Unarmed-looking it is not -- that's the point: the same
// soldiers who fight the empire's battles also stake its new ground.
//
// Clip time comes from the wall clock plus a phase hashed from the claim and
// soldier (never the pool slot), so a pose is a pure function of (claim,
// clock) like the paths themselves: slots are simply handed out in claim
// order every frame, and a soldier moving to another slot when an earlier
// claim resolves doesn't pop mid-stride. With motion off (the unit motion
// gate: slow device or reduced motion) each soldier holds the clip's first
// frame and is posed once, then skipped, like the Planetary Defense patrol's
// standStill -- the gate exists to shed this per-frame skinning work. Models
// load on the first expand, not at renderer start. They wear whatever armour the
// empire's other soldiers wear (marineModelFor its weapons-factory gear, as
// the muster transit overlay does): the heavy model's pool is only built the
// first time it's needed, and until it has loaded they wear the standard one.
const MAX_SOLDIERS = FRONTIER_CLAIM_PLATE_CAP * EXPAND_CREW_SIZE;
const UP_AXIS = new Vector3(0, 1, 0);
// Spread of the per-soldier clip phase, in seconds (covers every clip loop).
const CLIP_PHASE_SPAN_S = 10;

const CLIP_FOR_STANCE: Record<ExpandCrewStance, string> = {
  walk: "PistolWalk",
  stand: MARINE_CLIP_NAMES.stand,
  kneel: MARINE_CLIP_NAMES.kneel
};

type Soldier = {
  readonly root: Object3D;
  readonly material: MeshStandardMaterial;
  readonly mixer: AnimationMixer;
  readonly actions: Partial<Record<ExpandCrewStance, AnimationAction>>;
  // Motion off: what this soldier was last posed as, so an unchanged still
  // soldier is skipped. Undefined while animating.
  stillKey: string | undefined;
};

export type ExpandCrewSoldiers = {
  // ownerColor: this player's territory colour as the map draws it
  // (effectiveOverlayColor, so the diplomacy lens recolour matches the
  // marching companies and the 2D crew); crew claims are always its own.
  readonly update: (placed: readonly PlacedFrontierClaim[], nowEpochMs: number, animate: boolean, model: MarineModelKey, ownerColor: string) => void;
  readonly dispose: () => void;
};

// envMap: the shared building environment map the heavy armour's bare metal
// reflects (same as the muster transit overlay).
export const createExpandCrewSoldiers = (scene: Scene, envMap?: Texture): ExpandCrewSoldiers => {
  let disposed = false;
  const pools: Record<MarineModelKey, Soldier[]> = perMarineModel((): Soldier[] => []);
  const requested = new Set<MarineModelKey>();
  // Soldiers left visible last frame, per pool.
  const shown: Record<MarineModelKey, number> = perMarineModel(() => 0);
  const tmpQuat = new Quaternion();

  const makeSoldier = (template: PopupMarineTemplate, model: MarineModelKey): Soldier => {
    const root = cloneSkinned(template.root) as Object3D;
    const material = createMarineMaterial(marineModelSurfaceMasked(model), envMap);
    // Drawn in the transparent pass after the claim plate (renderOrder 7, no
    // depth test) so the plate doesn't wash over the soldiers standing on it.
    material.transparent = true;
    const mesh = firstSkinnedMesh(root);
    mesh.material = material;
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    root.visible = false;
    root.scale.setScalar(MARINE_MODEL_SCALE);
    const mixer = new AnimationMixer(root);
    const actions: Partial<Record<ExpandCrewStance, AnimationAction>> = {};
    for (const stance of Object.keys(CLIP_FOR_STANCE) as ExpandCrewStance[]) {
      const clip = template.clips.get(CLIP_FOR_STANCE[stance]);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.play();
      action.setEffectiveWeight(0);
      actions[stance] = action;
    }
    scene.add(root);
    return { root, material, mixer, actions, stillKey: undefined };
  };

  const request = (model: MarineModelKey): void => {
    if (requested.has(model)) return;
    requested.add(model);
    loadPopupMarineTemplate(model)
      .then((template) => {
        if (disposed) return;
        pools[model] = Array.from({ length: MAX_SOLDIERS }, () => makeSoldier(template, model));
      })
      .catch((err: unknown) => {
        // The claim plate still shows; a missing standard model leaves no
        // crew, a missing heavy one keeps the crew in standard armour.
        console.error(`popup-marine ${model} model failed to load; the expand crew falls back or will not render`, err);
      });
  };

  // clipTimeS: seconds into every clip (the active one is weighted 1).
  const pose = (soldier: Soldier, stance: ExpandCrewStance, clipTimeS: number): void => {
    // Fall back to standing if the asset lacks a clip (e.g. kneel).
    const active = soldier.actions[stance] ? stance : "stand";
    for (const [name, action] of Object.entries(soldier.actions) as Array<[ExpandCrewStance, AnimationAction]>) {
      action.setEffectiveWeight(name === active ? 1 : 0);
      const duration = action.getClip().duration;
      action.time = duration > 0 ? clipTimeS % duration : 0;
    }
    soldier.mixer.update(0);
  };

  const update: ExpandCrewSoldiers["update"] = (placed, nowEpochMs, animate, wanted, ownerColor) => {
    if (placed.some((p) => p.claim.crew > 0)) {
      request("standard");
      for (const candidate of marineModelFallbacks(wanted)) if (candidate !== "standard") request(candidate);
    }
    const model: MarineModelKey = marineModelFallbacks(wanted).find((candidate) => pools[candidate].length > 0) ?? "standard";
    const pool = pools[model];
    for (const other of MARINE_MODEL_KEYS) {
      if (other === model) continue;
      for (let k = 0; k < shown[other]; k += 1) pools[other][k]!.root.visible = false;
      shown[other] = 0;
    }
    if (pool.length === 0 || (placed.length === 0 && shown[model] === 0)) return;
    let used = 0;
    for (const { claim, sceneX, sceneZ, surfaceY, fromSurfaceY } of placed) {
      for (let i = 0; i < claim.crew && used < pool.length; i += 1) {
        const crewPose = expandCrewFigurePose(claim, i, nowEpochMs, animate);
        if (!crewPose) continue;
        const soldier = pool[used]!;
        used += 1;
        // Still on (or stepping off) the origin tile: stand on its ground.
        const outside = Math.max(0, -crewPose.x, crewPose.x - 1, -crewPose.y, crewPose.y - 1);
        const groundY = surfaceY + (fromSurfaceY - surfaceY) * Math.min(1, outside * 2);
        const x = sceneX + crewPose.x;
        const z = sceneZ + crewPose.y;
        if (!animate) {
          const stillKey = `${x},${groundY},${z},${crewPose.yaw},${crewPose.stance},${ownerColor}`;
          if (soldier.stillKey === stillKey && soldier.root.visible) continue;
          soldier.stillKey = stillKey;
        } else {
          soldier.stillKey = undefined;
        }
        soldier.material.color.set(ownerColor);
        soldier.root.position.set(x, groundY, z);
        tmpQuat.setFromAxisAngle(UP_AXIS, crewPose.yaw);
        soldier.root.quaternion.copy(tmpQuat);
        soldier.root.visible = true;
        // With motion off, hold the clip's first frame instead of looping.
        const phaseS = wanderHash01(claim.targetX, claim.targetY, i, 307) * CLIP_PHASE_SPAN_S;
        pose(soldier, crewPose.stance, animate ? nowEpochMs * 0.001 + phaseS : 0);
        soldier.root.updateMatrixWorld(true);
      }
    }
    for (let k = used; k < shown[model]; k += 1) pool[k]!.root.visible = false;
    shown[model] = used;
  };

  const dispose = (): void => {
    disposed = true;
    for (const soldier of MARINE_MODEL_KEYS.flatMap((key) => pools[key])) {
      soldier.mixer.stopAllAction();
      soldier.mixer.uncacheRoot(soldier.root);
      scene.remove(soldier.root);
      soldier.root.traverse((child) => {
        if (child instanceof SkinnedMesh) child.geometry.dispose();
      });
      soldier.material.dispose();
    }
    for (const key of MARINE_MODEL_KEYS) {
      pools[key] = [];
      shown[key] = 0;
    }
  };

  return { update, dispose };
};
