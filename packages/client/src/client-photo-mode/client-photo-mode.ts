// Photo mode hides the HUD/minimap/panels so the map can be screenshotted
// cleanly (marketing/link-preview captures, before/after renderer comparisons).
//
// Entry points:
//   - URL: `?photo=1` (optionally `&photoX=<tile>&photoY=<tile>&photoZoom=<zoom>`)
//   - Console, after toggling reveal: `borderEmpiresPhoto.enter({ x, y, zoom })`
//     to hide the HUD and pin the camera, `borderEmpiresPhoto.exit()` to restore.
//   - Settings > Gameplay's "Enter Photo Mode" button, or Ctrl+P anywhere —
//     these have no x/y/zoom to give, so they hide the HUD without pinning the
//     camera, and show a floating exit control since the toggle button that
//     started it is itself hidden by the HUD going away.
// A camera pin is applied every frame until the first pointer, wheel, or key
// input and then released, so a capturer can still pan to find a framing.
// Purely client-side and read-only — it never sends anything to the server.
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

// Only relevant to the Settings entry point: the button that started photo
// mode lives inside #hud, which the photo-mode CSS then hides along with
// everything else, so there is otherwise no way back to it. This id is
// carved out of that hider rule (see client-photo-mode-style.css) so it
// stays visible and clickable the whole time photo mode is active.
export const PHOTO_MODE_EXIT_CONTROL_ID = "photo-mode-exit-control";

let removeExitControl: (() => void) | undefined;

/** The exit control fades out after this long without input, so screenshots don't capture it (2026-11-14 playtest). */
export const PHOTO_MODE_EXIT_IDLE_MS = 2_500;
export const PHOTO_MODE_EXIT_IDLE_CLASS = "is-idle";
const EXIT_WAKE_EVENTS = ["pointermove", "pointerdown", "keydown", "touchstart"] as const;
const MODIFIER_KEYS = new Set(["Meta", "Shift", "Control", "Alt", "OS"]);

const showExitControl = (onExit: () => void): void => {
  removeExitControl?.();
  const button = document.createElement("button");
  button.id = PHOTO_MODE_EXIT_CONTROL_ID;
  button.type = "button";
  button.textContent = "Exit Photo Mode";
  const handleExit = (): void => {
    exitPhotoMode();
    onExit();
  };
  button.addEventListener("click", handleExit);
  const handleEscape = (event: KeyboardEvent): void => {
    if (event.key === "Escape") handleExit();
  };
  // Faded while idle but still clickable (client-photo-mode-style.css): on a phone, a tap on it is the only way out.
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const wake = (event?: Event): void => {
    // A modifier alone (Cmd+Shift+4, Win+Shift+S) is a screenshot shortcut starting, not a request for the button.
    if (event instanceof KeyboardEvent && MODIFIER_KEYS.has(event.key)) return;
    button.classList.remove(PHOTO_MODE_EXIT_IDLE_CLASS);
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => button.classList.add(PHOTO_MODE_EXIT_IDLE_CLASS), PHOTO_MODE_EXIT_IDLE_MS);
  };
  window.addEventListener("keydown", handleEscape, true);
  for (const type of EXIT_WAKE_EVENTS) window.addEventListener(type, wake, { capture: true, passive: true });
  document.body.append(button);
  wake();
  removeExitControl = () => {
    window.removeEventListener("keydown", handleEscape, true);
    for (const type of EXIT_WAKE_EVENTS) window.removeEventListener(type, wake, true);
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    button.remove();
    removeExitControl = undefined;
  };
};

// `onExitedViaControl` is only given from the Settings toggle / Ctrl+P (see
// togglePhotoMode) so it can sync ClientState's
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
  /** The selected tile: its outline is drawn by both map renderers, so it is cleared for the shot and restored after. */
  selected?: { x: number; y: number } | undefined;
};

let selectionBeforePhoto: { x: number; y: number } | undefined;

// Shared by the Settings > Gameplay button and the Ctrl+P shortcut. Checks the
// body class rather than only `photoModeActive` so Ctrl+P also backs out of a
// URL/console-started session, which never set the app-state flag.
export const togglePhotoMode = (state: PhotoModeSettingsState, renderHud: () => void): void => {
  const restoreSelection = (): void => {
    if (state.selected === undefined && selectionBeforePhoto) state.selected = selectionBeforePhoto;
    selectionBeforePhoto = undefined;
  };
  if (state.photoModeActive || document.body.classList.contains(PHOTO_MODE_BODY_CLASS)) {
    exitPhotoMode();
    state.photoModeActive = false;
    restoreSelection();
  } else {
    state.photoModeActive = true;
    selectionBeforePhoto = state.selected;
    state.selected = undefined;
    // No x/y/zoom to give from a settings click or shortcut -- just hide the
    // HUD from wherever the camera already is, so no camera pin is applied.
    enterPhotoMode(state, {}, () => {
      state.photoModeActive = false;
      restoreSelection();
      renderHud();
    });
  }
  renderHud();
};

export const isPhotoModeShortcut = (event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): boolean =>
  event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "p";

// The shortcut needs the live ClientState and HUD re-render, which only the HUD
// binder below has; it refreshes these on every bind and the window listener is
// installed once.
let shortcutTarget: { state: PhotoModeSettingsState; renderHud: () => void } | undefined;
let shortcutInstalled = false;

const installPhotoModeShortcut = (): void => {
  if (shortcutInstalled || typeof window === "undefined") return;
  shortcutInstalled = true;
  window.addEventListener("keydown", (event) => {
    if (!shortcutTarget || event.repeat || !isPhotoModeShortcut(event)) return;
    // Ctrl+P is the browser's print shortcut on Windows/Linux; claim it.
    event.preventDefault();
    togglePhotoMode(shortcutTarget.state, shortcutTarget.renderHud);
  });
};

// Wires Settings > Gameplay's "Enter Photo Mode" button (see
// photoModeSettingsFieldHtml in client-hud-settings-panel.ts) and the Ctrl+P
// shortcut — kept here, not inlined in client-hud.ts, which is already over the
// repo's 500-line cap and must not grow (AGENTS.md's file-and-type-discipline
// rule); client-hud.ts's render loop just calls this one function alongside
// its other settings control binders.
export const bindPhotoModeSettingsControls = (hud: ParentNode, state: PhotoModeSettingsState, renderHud: () => void): void => {
  shortcutTarget = { state, renderHud };
  installPhotoModeShortcut();
  const buttons = hud.querySelectorAll("[data-photo-mode-toggle]") as NodeListOf<HTMLButtonElement>;
  buttons.forEach((button) => {
    button.onclick = () => togglePhotoMode(state, renderHud);
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
