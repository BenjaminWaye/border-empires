import type { Scene } from "three";
import { landingGroundKeysForSelection } from "../client-dock-landing-ground/client-dock-landing-ground.js";
import { hostileLandingGroundKeys } from "../client-dock-landing-ground/client-dock-landing-ground-threat.js";
import {
  HOSTILE_LANDING_BORDER_ALPHA,
  HOSTILE_LANDING_COLOR,
  HOSTILE_LANDING_FILL_ALPHA,
  LANDING_GROUND_BORDER_ALPHA,
  LANDING_GROUND_COLOR,
  LANDING_GROUND_FILL_ALPHA
} from "../client-dock-landing-ground/client-dock-landing-ground-style.js";
import type { SelectionRangeOverlaysDeps } from "../client-map-3d-selection-range-overlays/client-map-3d-selection-range-overlays.js";
import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";
import { createLandingMarkerLayer } from "./dock-landing-marker-layer.js";

// True-3D counterpart of client-dock-landing-ground-2d.ts, synced every frame by the
// selection-range overlay hub. Each landing tile gets a fill, a bright edge
// and chevrons sliding ashore (dock-landing-marker-layer.ts):
// - always on, the viewer's coast where a hostile dock's crossings can land
//   (hostileLandingGroundKeys), in warning orange;
// - selecting a dock marks the ground its sea lanes can land on, at both ends
//   (landingGroundKeysForSelection), in sea-foam, drawn over the orange.

// A dock's own landing ground is at most 9 tiles; this covers a dock with 7 links plus its own shore.
const MAX_LANDING_TILES = 72;
// Hostile docks facing the viewer's coast, x 9 tiles each.
const MAX_HOSTILE_LANDING_TILES = 512;

export type DockLandingGroundOverlay = {
  readonly sync: (deps: SelectionRangeOverlaysDeps) => void;
  readonly dispose: () => void;
};

export const createDockLandingGroundOverlay = (scene: Scene): DockLandingGroundOverlay => {
  const hostile = createLandingMarkerLayer(scene, {
    color: HOSTILE_LANDING_COLOR,
    fillOpacity: HOSTILE_LANDING_FILL_ALPHA + 0.1,
    edgeOpacity: HOSTILE_LANDING_BORDER_ALPHA,
    chevronOpacity: 1,
    waterlineOpacity: 0.7,
    rise: 0.014,
    renderOrder: 21
  }, MAX_HOSTILE_LANDING_TILES);
  const selection = createLandingMarkerLayer(scene, {
    color: LANDING_GROUND_COLOR,
    fillOpacity: LANDING_GROUND_FILL_ALPHA + 0.1,
    edgeOpacity: LANDING_GROUND_BORDER_ALPHA,
    chevronOpacity: 1,
    waterlineOpacity: 0.75,
    rise: 0.016,
    renderOrder: 24
  }, MAX_LANDING_TILES);

  const sync = (deps: SelectionRangeOverlaysDeps): void => {
    const nowMs = performance.now();
    const selected = landingGroundKeysForSelection(deps.state);
    const threatened = hostileLandingGroundKeys(deps.state, resolveMyReachCached(deps.state), Date.now());
    // A selected tile shows only the sea-foam marker, so two sets of chevrons never stack.
    for (const key of selected) threatened.delete(key);
    hostile.fill(deps, threatened, nowMs);
    selection.fill(deps, selected, nowMs);
  };

  const dispose = (): void => {
    hostile.dispose();
    selection.dispose();
  };

  return { sync, dispose };
};
