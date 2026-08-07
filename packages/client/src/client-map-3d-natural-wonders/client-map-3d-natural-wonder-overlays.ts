import type { Scene } from "three";
import type { NaturalWonderType } from "@border-empires/shared";
import { createFoundryHeartOverlay } from "./client-map-3d-foundry-heart-overlay.js";
import { createDeepwaterEngineOverlay } from "./client-map-3d-deepwater-engine-overlay.js";
import { createConscriptionEngineOverlay } from "./client-map-3d-conscription-engine-overlay.js";
import { createWarpressOverlay } from "./client-map-3d-warpress-overlay.js";
import { createBastionFrameOverlay } from "./client-map-3d-bastion-frame-overlay.js";
import { createCalculatingEngineOverlay } from "./client-map-3d-calculating-engine-overlay.js";
import { createQuickforgeOverlay } from "./client-map-3d-quickforge-overlay.js";
import { createWatchtowerEngineOverlay } from "./client-map-3d-watchtower-engine-overlay.js";
import { createCartographersLensOverlay } from "./client-map-3d-cartographers-lens-overlay.js";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";
import type { TerrainCornerSampler } from "./client-map-3d-wonder-ground-contour.js";

export type NaturalWonderOverlays = {
  readonly clear: () => void;
  readonly addInstance: (type: NaturalWonderType, centerX: number, centerZ: number, surfaceY: number, wx: number, wy: number) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

/**
 * Since exactly one of each NaturalWonderType exists per map (docs/natural-
 * wonders-design.md §1), each per-wonder overlay only ever needs a handful
 * of instance slots — 4 is a comfortable margin above the theoretical max
 * of 1 (covers a stale-frame overlap during ownership/visibility churn).
 */
const MAX_WONDER_INSTANCES = 4;

export const createNaturalWonderOverlays = (scene: Scene, cornerYAt: TerrainCornerSampler): NaturalWonderOverlays => {
  const overlaysByType: Record<NaturalWonderType, WonderOverlay> = {
    FOUNDRY_HEART: createFoundryHeartOverlay(scene, MAX_WONDER_INSTANCES, cornerYAt),
    DEEPWATER_ENGINE: createDeepwaterEngineOverlay(scene, MAX_WONDER_INSTANCES, cornerYAt),
    CONSCRIPTION_ENGINE: createConscriptionEngineOverlay(scene, MAX_WONDER_INSTANCES, cornerYAt),
    WARPRESS: createWarpressOverlay(scene, MAX_WONDER_INSTANCES, cornerYAt),
    BASTION_FRAME: createBastionFrameOverlay(scene, MAX_WONDER_INSTANCES, cornerYAt),
    CALCULATING_ENGINE: createCalculatingEngineOverlay(scene, MAX_WONDER_INSTANCES, cornerYAt),
    QUICKFORGE: createQuickforgeOverlay(scene, MAX_WONDER_INSTANCES, cornerYAt),
    WATCHTOWER_ENGINE: createWatchtowerEngineOverlay(scene, MAX_WONDER_INSTANCES, cornerYAt),
    CARTOGRAPHERS_LENS: createCartographersLensOverlay(scene, MAX_WONDER_INSTANCES, cornerYAt)
  };
  const overlays = Object.values(overlaysByType);

  const clear = (): void => { for (const overlay of overlays) overlay.clear(); };
  const addInstance = (type: NaturalWonderType, centerX: number, centerZ: number, surfaceY: number, wx: number, wy: number): void => {
    overlaysByType[type].addInstance(centerX, centerZ, surfaceY, wx, wy);
  };
  const commit = (): void => { for (const overlay of overlays) overlay.commit(); };
  const update = (nowMs: number): void => { for (const overlay of overlays) overlay.update(nowMs); };
  const dispose = (): void => { for (const overlay of overlays) overlay.dispose(); };

  return { clear, addInstance, commit, update, dispose };
};
