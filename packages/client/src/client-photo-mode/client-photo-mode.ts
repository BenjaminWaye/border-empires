// Photo mode hides the HUD/minimap/panels so the map can be screenshotted
// cleanly (marketing/link-preview captures, before/after renderer comparisons).
//
// Two entry points, because the fog-admin "Reveal Full Map" toggle resets on
// every login and needs the HUD to reach:
//   - URL: `?photo=1` (optionally `&photoX=<tile>&photoY=<tile>&photoZoom=<zoom>`)
//   - Console, after toggling reveal: `borderEmpiresPhoto.enter({ x, y, zoom })`
//     to hide the HUD and pin the camera, `borderEmpiresPhoto.exit()` to restore.
// A camera pin is applied every frame until the first pointer, wheel, or key
// input and then released, so a capturer can still pan to find a framing.
// Purely client-side and read-only — it never sends anything to the server and
// is not linked from any player UI.
import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";

export type PhotoModeParams = {
  readonly camX?: number;
  readonly camY?: number;
  readonly zoom?: number;
};

type PhotoModeCameraState = { camX: number; camY: number; camSubX: number; camSubY: number; zoom: number };

const finiteParam = (params: URLSearchParams, key: string): number | undefined => {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

const enabledParam = (raw: string | null): boolean => {
  const value = raw?.trim().toLowerCase() ?? "";
  return value === "1" || value === "true" || value === "on";
};

export const parsePhotoModeParams = (search: string): PhotoModeParams | undefined => {
  const params = new URLSearchParams(search);
  if (!enabledParam(params.get("photo"))) return undefined;
  const camX = finiteParam(params, "photoX");
  const camY = finiteParam(params, "photoY");
  const zoom = finiteParam(params, "photoZoom");
  return {
    // The camera pin is all-or-nothing on position: half a coordinate would jump the view to an arbitrary row/column.
    ...(camX !== undefined && camY !== undefined ? { camX: Math.round(camX), camY: Math.round(camY) } : {}),
    ...(zoom !== undefined ? { zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) } : {})
  };
};

export const applyPhotoModeCamera = (state: PhotoModeCameraState, params: PhotoModeParams): void => {
  if (params.camX !== undefined && params.camY !== undefined) {
    state.camX = params.camX;
    state.camY = params.camY;
    state.camSubX = 0;
    state.camSubY = 0;
  }
  if (params.zoom !== undefined) state.zoom = params.zoom;
};

export const PHOTO_MODE_BODY_CLASS = "photo-mode";

let releasePin: (() => void) | undefined;

const pinCamera = (state: PhotoModeCameraState, params: PhotoModeParams): void => {
  releasePin?.();
  if (params.camX === undefined && params.zoom === undefined) return;
  let released = false;
  const release = (): void => {
    released = true;
    for (const type of PIN_RELEASE_EVENTS) window.removeEventListener(type, release, true);
  };
  releasePin = release;
  for (const type of PIN_RELEASE_EVENTS) window.addEventListener(type, release, { capture: true, passive: true });
  const tick = (): void => {
    if (released) return;
    applyPhotoModeCamera(state, params);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const PIN_RELEASE_EVENTS = ["pointerdown", "wheel", "keydown", "touchstart"] as const;

export const enterPhotoMode = (state: PhotoModeCameraState, params: PhotoModeParams): void => {
  document.body.classList.add(PHOTO_MODE_BODY_CLASS);
  pinCamera(state, params);
};

export const exitPhotoMode = (): void => {
  releasePin?.();
  document.body.classList.remove(PHOTO_MODE_BODY_CLASS);
};

export type PhotoModeConsoleApi = {
  enter: (options?: { x?: number; y?: number; zoom?: number }) => void;
  exit: () => void;
};

export const startPhotoMode = (state: PhotoModeCameraState, search: string): void => {
  (window as unknown as { borderEmpiresPhoto?: PhotoModeConsoleApi }).borderEmpiresPhoto = {
    enter: (options = {}) => {
      const query = new URLSearchParams({ photo: "1" });
      if (options.x !== undefined) query.set("photoX", String(options.x));
      if (options.y !== undefined) query.set("photoY", String(options.y));
      if (options.zoom !== undefined) query.set("photoZoom", String(options.zoom));
      enterPhotoMode(state, parsePhotoModeParams(query.toString()) ?? {});
    },
    exit: exitPhotoMode
  };
  const params = parsePhotoModeParams(search);
  if (params) enterPhotoMode(state, params);
};
