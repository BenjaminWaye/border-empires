import {
  EXPAND_MANPOWER_COST,
  FRONTIER_CLAIM_COST,
  MUSTER_TRANSIT_MS_PER_TILE,
  OBSERVATORY_CAST_RADIUS as SHARED_OBSERVATORY_CAST_RADIUS,
  OBSERVATORY_PROTECTION_RADIUS as SHARED_OBSERVATORY_PROTECTION_RADIUS,
  OBSERVATORY_VISION_BONUS as SHARED_OBSERVATORY_VISION_BONUS,
  SETTLE_MANPOWER_COST,
  SETTLE_MS,
  frontierClaimDurationMsAt,
  grassShadeAt,
  isForestTileAt,
  isHillsTileAt,
  isTropicalForestLatitudeAt,
  landBiomeAt,
  seeded01,
  wasForestBeforeClearingAt,
  worldSeed
} from "@border-empires/shared";


export const OBSERVATORY_VISION_BONUS = SHARED_OBSERVATORY_VISION_BONUS;
export const OBSERVATORY_PROTECTION_RADIUS = SHARED_OBSERVATORY_PROTECTION_RADIUS;
export const OBSERVATORY_CAST_RADIUS = SHARED_OBSERVATORY_CAST_RADIUS;
export const AIRPORT_BOMBARD_RADIUS = 30;
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 192;
export const DEFAULT_ZOOM = 22;
// Both tuned empirically on-device via the Settings zoom debug readout,
// not derived from DEFAULT_ZOOM — mobile screens want a level closer to
// MAX_ZOOM than the desktop default.
export const MOBILE_LOGIN_ZOOM = 58;
export const DOUBLE_TAP_ZOOM_STEP = 32;
export const GOLD_COST_EPSILON = 1e-6;
export const RENDERER_PROMPT_STORAGE_KEY = "border-empires-renderer-prompt-v1";
export const CAMERA_LOCATION_STORAGE_KEY = "border-empires-camera-location-v1";
export const DISCOVERED_TILES_STORAGE_KEY = "border-empires-discovered-tiles-v1";
// Shared across every "still waiting on auth/session" overlay (the initial
// Firebase auth busy modal in client-auth-ui.ts, and the post-connect
// map-loading overlay in client-map-loading-view.ts). A warm login on
// staging/prod completes in well under 5s, so anything past 8s is already
// abnormal enough to justify a low-risk "grab diagnostics" affordance, even
// though it isn't yet long enough to offer more drastic actions like retry
// or reload (see ACTION_AFFORDANCE_THRESHOLD_MS in client-map-loading-view.ts).
export const AUTH_BUSY_DIAGNOSTICS_THRESHOLD_MS = 8_000;

// A backgrounded tab's socket getting dropped and reconnected (Chrome
// suspends/throttles hidden tabs) is the single most common reason
// state.connection briefly leaves "initialized". Reconnecting in place
// usually finishes well under a second, so blocking the whole game with the
// full map-loading overlay for every one of those blips is worse than the
// disconnect itself. This grace window lets client-hud.ts hold off showing
// that overlay until a disconnect has actually outlasted a normal in-place
// reconnect — see state.disconnectedSince in client-state.ts.
export const RECONNECT_OVERLAY_GRACE_MS = 1_200;

export { MUSTER_TRANSIT_MS_PER_TILE };
export const MUSTER_AUTO_FLAG_THRESHOLD_TILES = 20;
// A parked attack's auto-created flag (SET_MUSTER) is fire-and-forget — no
// optimistic local state, no ack tracking. If the server rejects it (e.g.
// MUSTER_LIMIT: "max 3 muster tiles per player") the pending attack would
// otherwise wait forever on a flag that will never exist. Comfortably past
// any real round trip, so a legitimate in-flight request is never mistaken
// for a rejected one.
export const MUSTER_FLAG_REQUEST_TIMEOUT_MS = 5_000;

export const canAffordCost = (gold: number, cost: number): boolean => gold + GOLD_COST_EPSILON >= cost;

export const formatGoldAmount = (gold: number): string => gold.toFixed(2);
export const formatManpowerAmount = (manpower: number): string => manpower.toFixed(0);

export const isForestTile = isForestTileAt;
export const isHillsTile = isHillsTileAt;
// Call only for a tile already known to draw as forest (see isTropicalForestLatitudeAt).
export const isTropicalForestLatitude = isTropicalForestLatitudeAt;

// Purely cosmetic (no vision/claim-timing effect, unlike isForestTile/
// isHillsTile above): a sparse decorative scattering of the leaf/deciduous
// tree species (see client-map-3d-forest.ts / client-map-render-forest-
// overlay.ts) on light-shaded grass tiles, so light grass doesn't read as
// completely bare next to dense dark-grass forest. Never on a tile that's
// already a real forest or hills tile, nor on one an AFC landing cleared of
// forest (that ground is meant to read as cleared).
const LIGHT_GRASS_SCATTER_CHANCE = 0.3;
export const isLightGrassScatterTile = (x: number, y: number): boolean => {
  if (isForestTile(x, y) || isHillsTile(x, y) || wasForestBeforeClearingAt(x, y)) return false;
  if (landBiomeAt(x, y) !== "GRASS" || grassShadeAt(x, y) !== "LIGHT") return false;
  return seeded01(x * 131 + 7, y * 197 + 13, worldSeed() + 90210) < LIGHT_GRASS_SCATTER_CHANCE;
};

// Was previously reimplemented locally -- now delegates to the shared
// formula so it can't drift out of sync with the sim's authoritative one.
export const frontierClaimDurationMsForTile = frontierClaimDurationMsAt;
export const settleDurationMsForTile = (x: number, y: number): number => {
  // Matches the 1.5x forest/hills penalty used by frontierClaimDurationMsForTile —
  // this used to be a flat 2x, which didn't get the memo when claim was retuned.
  if (isForestTile(x, y)) return SETTLE_MS * 1.5;
  if (isHillsTile(x, y)) return SETTLE_MS * 1.5;
  return SETTLE_MS;
};

export const frontierClaimCostLabelForTile = (x: number, y: number): string => {
  const seconds = Math.round(frontierClaimDurationMsForTile(x, y) / 1000);
  const costLabel = `${EXPAND_MANPOWER_COST} manpower + ${FRONTIER_CLAIM_COST} coin`;
  if (isForestTile(x, y)) return `${costLabel} • ${seconds}s (Forest)`;
  if (isHillsTile(x, y)) return `${costLabel} • ${seconds}s (Hills)`;
  return `${costLabel} • ${seconds}s`;
};
