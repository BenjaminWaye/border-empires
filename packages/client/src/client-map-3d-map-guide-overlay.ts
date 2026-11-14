import { DynamicDrawUsage, Color, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { houseChargeMarkerTiles, houseChargeTintTiles } from "./client-house-charges/client-house-charges-map.js";
import { createOnboardingChecklistHighlightOverlay, type OnboardingChecklistHighlightTile } from "./client-map-3d-onboarding-checklist-highlight.js";
import type { ClientState } from "./client-state/client-state.js";

// True-3D map guidance, the counterpart of the 2D client-map-guide-overlays-2d.ts:
// the onboarding guide's ring markers plus a focused House Charge's markers
// (one ring overlay, client-map-3d-onboarding-checklist-highlight.ts) and the
// charge's shaded area, drawn as flat tiles on the ground at each tile's real
// scene position (client-house-charges/client-house-charges-map.ts decides what).

const MAX_TINT_TILES = 1_200;
const TINT_SIZE = 0.94;
const GARRISONED = new Color("#8fd18a");
const OPEN = new Color("#f0b45c");

export type MapGuideScenePoint = OnboardingChecklistHighlightTile;
export type MapGuideState = Pick<ClientState, "onboardingHighlightTiles" | "houseCharges" | "houseChargeFocusId" | "tiles" | "me">;

export type MapGuideOverlay = {
  readonly sync: (state: MapGuideState, toScene: (x: number, y: number) => MapGuideScenePoint, nowMs: number) => void;
  readonly dispose: () => void;
};

export const createMapGuideOverlay = (scene: Scene): MapGuideOverlay => {
  const rings = createOnboardingChecklistHighlightOverlay(scene);
  const geometry = new PlaneGeometry(TINT_SIZE, TINT_SIZE);
  geometry.rotateX(-Math.PI * 0.5);
  const material = new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.45, depthWrite: false });
  const tint = new InstancedMesh(geometry, material, MAX_TINT_TILES);
  tint.name = "house-charge-area-tint";
  tint.instanceMatrix.setUsage(DynamicDrawUsage);
  tint.count = 0;
  tint.frustumCulled = false;
  tint.renderOrder = 0;
  scene.add(tint);
  const matrix = new Matrix4();

  return {
    sync: (state, toScene, nowMs) => {
      const markers = houseChargeMarkerTiles(state, WORLD_WIDTH, WORLD_HEIGHT);
      const ringTiles = markers.length > 0 ? [...state.onboardingHighlightTiles, ...markers] : state.onboardingHighlightTiles;
      rings.sync(ringTiles.map((tile) => toScene(tile.x, tile.y)), nowMs);
      const tiles = houseChargeTintTiles(state);
      const count = Math.min(tiles.length, MAX_TINT_TILES);
      for (let index = 0; index < count; index += 1) {
        const tile = tiles[index]!;
        const point = toScene(tile.x, tile.y);
        matrix.makeTranslation(point.sceneX, point.surfaceY, point.sceneZ);
        tint.setMatrixAt(index, matrix);
        tint.setColorAt(index, tile.garrisoned ? GARRISONED : OPEN);
      }
      tint.count = count;
      if (count > 0) {
        tint.instanceMatrix.needsUpdate = true;
        if (tint.instanceColor) tint.instanceColor.needsUpdate = true;
      }
    },
    dispose: () => {
      rings.dispose();
      scene.remove(tint);
      geometry.dispose();
      material.dispose();
    }
  };
};
