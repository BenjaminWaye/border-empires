import { CAMERA_LOCATION_STORAGE_KEY, DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import { storageGet } from "./client-state.js";

// Reads a deep-linked tile from the page URL, e.g. the "Go to tile" link in
// an attack-alert email (see sendAttackAlert() in
// apps/realtime-gateway/src/email-alerts/email-alerts.ts): "?x=141&y=174".
// Returns null when either coordinate is missing or not a finite number, so
// callers fall back to the stored/default camera location.
export const readUrlTileFocus = (
  locationLike: Pick<Location, "search"> | undefined = typeof window !== "undefined" ? window.location : undefined
): { x: number; y: number } | null => {
  if (!locationLike) return null;
  const params = new URLSearchParams(locationLike.search);
  const rawX = params.get("x");
  const rawY = params.get("y");
  if (rawX === null || rawY === null) return null;
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
};

// Strips the ?x=&y= deep-link params (see readUrlTileFocus() above) from the
// address bar once they've been consumed, so a later reload doesn't keep
// jumping the camera back to a stale tile instead of restoring the player's
// last-viewed location.
export const clearUrlTileFocus = (): void => {
  if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("x") && !url.searchParams.has("y")) return;
  url.searchParams.delete("x");
  url.searchParams.delete("y");
  window.history.replaceState(window.history.state, document.title, url.toString());
};

// Reads the last-viewed map location saved by saveCameraLocation() in
// client-view-refresh.ts. Returns null if nothing is stored or the payload
// is malformed, so callers fall back to the default (0,0) / home-tile camera.
// seasonId (if present) is the season the saved position belongs to — see
// cameraLocationInitialState() for why this is needed on a fresh page load.
export const readStoredCameraLocation = (): { x: number; y: number; zoom: number; seasonId: string | undefined } | null => {
  const raw = storageGet(CAMERA_LOCATION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown; zoom?: unknown; seasonId?: unknown };
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    const zoom = Number.isFinite(parsed.zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(parsed.zoom))) : DEFAULT_ZOOM;
    const seasonId = typeof parsed.seasonId === "string" ? parsed.seasonId : undefined;
    return { x: Number(parsed.x), y: Number(parsed.y), zoom, seasonId };
  } catch {
    return null;
  }
};

// Bundles the restored (or default) camera fields for createInitialState()
// as a single spreadable object, so the caller doesn't need a local variable
// or multiple readStoredCameraLocation() calls. cameraRestoredFromStorage is
// consumed once by the first automatic centerOnOwnedTile() fallback in
// client-network.ts, so a restored location isn't discarded before the
// player's owned tiles have loaded in. cameraRestoredSeasonId is the season
// the restored position was saved under (undefined if never recorded) — the
// INIT handler (client-network-init-message.ts) uses it to detect a season
// rollover that happened while the tab was closed, since bridgeDebugSeasonId
// itself is always "" at this point (in-memory-only, reset every reload).
export const cameraLocationInitialState = (): {
  camX: number;
  camY: number;
  // Sub-tile fraction of an in-progress pan, in [0, 1) on each axis — camX/camY
  // stay whole tiles (every other consumer assumes that); the 3D camera folds
  // this into its pan offset (client-map-3d-perspective-camera.ts) so panning
  // glides between tiles instead of snapping. Always 0 on load, never persisted.
  camSubX: number;
  camSubY: number;
  zoom: number;
  cameraRestoredFromStorage: boolean;
  cameraRestoredSeasonId: string | undefined;
} => {
  const urlFocus = readUrlTileFocus();
  if (urlFocus) {
    return {
      camX: urlFocus.x,
      camY: urlFocus.y,
      camSubX: 0,
      camSubY: 0,
      zoom: DEFAULT_ZOOM,
      // Reuses the "restored" one-shot skip (consumed in client-network.ts)
      // so the initial centerOnOwnedTile() fallback doesn't override a tile
      // the player was explicitly linked to.
      cameraRestoredFromStorage: true,
      cameraRestoredSeasonId: undefined
    };
  }

  const stored = readStoredCameraLocation();
  return {
    camX: stored?.x ?? 0,
    camY: stored?.y ?? 0,
    camSubX: 0,
    camSubY: 0,
    zoom: stored?.zoom ?? DEFAULT_ZOOM,
    cameraRestoredFromStorage: stored !== null,
    cameraRestoredSeasonId: stored?.seasonId
  };
};
