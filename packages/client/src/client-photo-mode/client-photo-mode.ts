// Photo mode hides the HUD/minimap/panels so the map can be screenshotted
// cleanly (marketing/link-preview captures, before/after renderer comparisons).
//
// Three entry points, because the fog-admin "Reveal Full Map" toggle resets on
// every login and needs the HUD to reach:
//   - URL: `?photo=1` (optionally `&photoX=<tile>&photoY=<tile>&photoZoom=<zoom>`)
//   - Console, after toggling reveal: `borderEmpiresPhoto.enter({ x, y, zoom })`
//     to hide the HUD and pin the camera, `borderEmpiresPhoto.exit()` to restore.
//   - Settings > Gameplay (same fog-admin card as "Reveal Full Map", see
//     client-hud-settings-panel.ts's mapRevealCardHtml) — this path has no
//     x/y/zoom to give, so it hides the HUD without pinning the camera, and
//     shows a floating exit control since the toggle button that started it
//     is itself hidden by the HUD going away.
// A camera pin is applied every frame until the first pointer, wheel, or key
// input and then released, so a capturer can still pan to find a framing.
// Purely client-side and read-only — it never sends anything to the server and
// is not linked from any normal player UI (the Settings entry is gated behind
// the same fog-admin eligibility as map reveal).
import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import { mapRevealAvailable } from "../client-map-reveal/client-map-reveal.js";

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

// Only relevant to the Settings entry point: the button that started photo
// mode lives inside #hud, which the photo-mode CSS then hides along with
// everything else, so there is otherwise no way back to it. This id is
// carved out of that hider rule (see client-photo-mode-style.css) so it
// stays visible and clickable the whole time photo mode is active.
export const PHOTO_MODE_EXIT_CONTROL_ID = "photo-mode-exit-control";

let removeExitControl: (() => void) | undefined;

const showExitControl = (onExit: () => void): void => {
  removeExitControl?.();
  const button = document.createElement("button");
  button.id = PHOTO_MODE_EXIT_CONTROL_ID;
  button.type = "button";
  button.textContent = "Exit Photo Mode (Esc)";
  const handleExit = (): void => {
    exitPhotoMode();
    onExit();
  };
  button.addEventListener("click", handleExit);
  const handleEscape = (event: KeyboardEvent): void => {
    if (event.key === "Escape") handleExit();
  };
  window.addEventListener("keydown", handleEscape, true);
  document.body.append(button);
  removeExitControl = () => {
    window.removeEventListener("keydown", handleEscape, true);
    button.remove();
    removeExitControl = undefined;
  };
};

// `onExitedViaControl` is only given from the Settings toggle (see
// client-hud.ts's photoModeButtons binding) so it can sync ClientState's
// `photoModeActive` flag and re-render the HUD once the floating control or
// Escape ends photo mode; the URL/console entry points have no app state to
// sync back and omit it, matching their existing "just hide the HUD" contract.
export const enterPhotoMode = (state: PhotoModeCameraState, params: PhotoModeParams, onExitedViaControl?: () => void): void => {
  document.body.classList.add(PHOTO_MODE_BODY_CLASS);
  pinCamera(state, params);
  if (onExitedViaControl) showExitControl(onExitedViaControl);
};

export const exitPhotoMode = (): void => {
  releasePin?.();
  removeExitControl?.();
  document.body.classList.remove(PHOTO_MODE_BODY_CLASS);
};

export type PhotoModeConsoleApi = {
  enter: (options?: { x?: number; y?: number; zoom?: number }) => void;
  exit: () => void;
};

export type PhotoModeSettingsState = PhotoModeCameraState & {
  photoModeActive: boolean;
  mapRevealEligible: boolean;
  authSessionReady: boolean;
};

// Wires Settings > Gameplay's "Enter/Exit Photo Mode" button (see
// mapRevealCardHtml in client-hud-settings-panel.ts) — kept here, not inlined
// in client-hud.ts, which is already over the repo's 500-line cap and must
// not grow (AGENTS.md's file-and-type-discipline rule); client-hud.ts's
// render loop just calls this one function alongside its other settings
// control binders. Gated behind the same fog-admin eligibility as map reveal,
// since the two are meant to be used together and this stays out of normal
// player UI.
export const bindPhotoModeSettingsControls = (hud: ParentNode, state: PhotoModeSettingsState, renderHud: () => void): void => {
  const buttons = hud.querySelectorAll("[data-photo-mode-toggle]") as NodeListOf<HTMLButtonElement>;
  buttons.forEach((button) => {
    button.onclick = () => {
      if (!mapRevealAvailable({ enabledForAccount: state.mapRevealEligible && state.authSessionReady })) return;
      if (state.photoModeActive) {
        exitPhotoMode();
        state.photoModeActive = false;
      } else {
        state.photoModeActive = true;
        // No x/y/zoom to give from a settings click -- just hide the HUD from
        // wherever the camera already is, so no camera pin is applied.
        enterPhotoMode(state, {}, () => {
          state.photoModeActive = false;
          renderHud();
        });
      }
      renderHud();
    };
  });
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
