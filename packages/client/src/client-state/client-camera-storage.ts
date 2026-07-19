import { CAMERA_LOCATION_STORAGE_KEY, DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import { storageGet } from "./client-state.js";

// Reads the last-viewed map location saved by saveCameraLocation() in
// client-view-refresh.ts. Returns null if nothing is stored or the payload
// is malformed, so callers fall back to the default (0,0) / home-tile camera.
export const readStoredCameraLocation = (): { x: number; y: number; zoom: number } | null => {
  const raw = storageGet(CAMERA_LOCATION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown; zoom?: unknown };
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    const zoom = Number.isFinite(parsed.zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(parsed.zoom))) : DEFAULT_ZOOM;
    return { x: Number(parsed.x), y: Number(parsed.y), zoom };
  } catch {
    return null;
  }
};
