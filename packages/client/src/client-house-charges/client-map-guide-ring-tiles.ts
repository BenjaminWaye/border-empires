// The tiles the map guide rings this frame, shared by the 2D canvas
// (client-map-guide-overlays-2d.ts) and true 3D (client-map-3d-map-guide-overlay.ts)
// so both draw the same list in the same order.
//
// A scout find the player just tapped goes first: the 3D ring overlay draws at
// most 32 markers and drops the rest, and the find is what they asked to see.

import type { ClientState } from "../client-state/client-state.js";
import { scoutFindingRingTiles } from "../client-scout-drone/client-scout-finding-highlight.js";
import { houseChargeMarkerTiles } from "./client-house-charges-map.js";

export type MapGuideRingState = Pick<ClientState, "onboardingHighlightTiles" | "houseCharges" | "houseChargeFocusId" | "tiles" | "me"> &
  Partial<Pick<ClientState, "scoutFindingHighlight">>;

export const mapGuideRingTiles = (state: MapGuideRingState, wallNowMs: number): ReadonlyArray<{ x: number; y: number }> => {
  const scout = scoutFindingRingTiles(state, wallNowMs);
  const charges = houseChargeMarkerTiles(state);
  if (scout.length === 0 && charges.length === 0) return state.onboardingHighlightTiles;
  return [...scout, ...state.onboardingHighlightTiles, ...charges];
};
