// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import {
  applyPhotoModeCamera,
  bindPhotoModeSettingsControls,
  exitPhotoMode,
  PHOTO_MODE_BODY_CLASS,
  PHOTO_MODE_EXIT_CONTROL_ID,
  PHOTO_MODE_EXIT_IDLE_CLASS,
  PHOTO_MODE_EXIT_IDLE_MS,
  parsePhotoModeParams,
  togglePhotoMode,
  type PhotoModeSettingsState
} from "./client-photo-mode.js";

describe("parsePhotoModeParams", () => {
  it("is off unless photo is explicitly enabled", () => {
    expect(parsePhotoModeParams("")).toBeUndefined();
    expect(parsePhotoModeParams("?photoX=3&photoY=4")).toBeUndefined();
    expect(parsePhotoModeParams("?photo=0")).toBeUndefined();
  });

  it("enables HUD hiding alone without pinning the camera", () => {
    expect(parsePhotoModeParams("?photo=1")).toEqual({});
  });

  it("reads and rounds a camera pin, clamping zoom to the supported range", () => {
    expect(parsePhotoModeParams("?photo=true&photoX=408.4&photoY=85&photoZoom=40")).toEqual({ camX: 408, camY: 85, zoom: 40 });
    expect(parsePhotoModeParams("?photo=1&photoZoom=9999")?.zoom).toBe(MAX_ZOOM);
    expect(parsePhotoModeParams("?photo=1&photoZoom=0.5")?.zoom).toBe(MIN_ZOOM);
  });

  it("ignores a half-specified or non-numeric position", () => {
    expect(parsePhotoModeParams("?photo=1&photoX=10")).toEqual({});
    expect(parsePhotoModeParams("?photo=1&photoX=abc&photoY=2")).toEqual({});
  });
});

describe("applyPhotoModeCamera", () => {
  it("overrides position and zoom and zeroes the sub-tile drag offset", () => {
    const state = { camX: 1, camY: 2, camSubX: 0.4, camSubY: 0.7, zoom: 22 };
    applyPhotoModeCamera(state, { camX: 408, camY: 85, zoom: 40 });
    expect(state).toEqual({ camX: 408, camY: 85, camSubX: 0, camSubY: 0, zoom: 40 });
  });

  it("leaves the camera alone for a params object with nothing to pin", () => {
    const state = { camX: 1, camY: 2, camSubX: 0.4, camSubY: 0.7, zoom: 22 };
    applyPhotoModeCamera(state, {});
    expect(state).toEqual({ camX: 1, camY: 2, camSubX: 0.4, camSubY: 0.7, zoom: 22 });
  });
});

describe("bindPhotoModeSettingsControls (Settings > Gameplay toggle + Ctrl+P)", () => {
  afterEach(() => {
    exitPhotoMode();
    document.body.innerHTML = "";
    document.body.className = "";
  });

  const makeState = (overrides: Partial<PhotoModeSettingsState> = {}): PhotoModeSettingsState => ({
    camX: 5,
    camY: 6,
    camSubX: 0,
    camSubY: 0,
    zoom: 22,
    photoModeActive: false,
    ...overrides
  });

  it("hides the HUD without pinning the camera, and shows a floating exit control", () => {
    document.body.innerHTML = `<div id="hud"><button data-photo-mode-toggle>Enter Photo Mode</button></div>`;
    const state = makeState();
    let renders = 0;
    bindPhotoModeSettingsControls(document.getElementById("hud")!, state, () => {
      renders += 1;
    });

    document.querySelector<HTMLButtonElement>("[data-photo-mode-toggle]")!.click();

    expect(state.photoModeActive).toBe(true);
    expect(document.body.classList.contains(PHOTO_MODE_BODY_CLASS)).toBe(true);
    expect(state.camX).toBe(5); // no x/y/zoom given from Settings -- current camera position untouched
    expect(document.getElementById(PHOTO_MODE_EXIT_CONTROL_ID)).not.toBeNull();
    expect(renders).toBe(1);
  });

  it("the floating exit control restores the HUD and syncs photoModeActive back", () => {
    document.body.innerHTML = `<div id="hud"><button data-photo-mode-toggle>Enter Photo Mode</button></div>`;
    const state = makeState();
    let renders = 0;
    bindPhotoModeSettingsControls(document.getElementById("hud")!, state, () => {
      renders += 1;
    });
    document.querySelector<HTMLButtonElement>("[data-photo-mode-toggle]")!.click();

    document.getElementById(PHOTO_MODE_EXIT_CONTROL_ID)!.click();

    expect(state.photoModeActive).toBe(false);
    expect(document.body.classList.contains(PHOTO_MODE_BODY_CLASS)).toBe(false);
    expect(document.getElementById(PHOTO_MODE_EXIT_CONTROL_ID)).toBeNull();
    expect(renders).toBe(2); // once on enter, once when the exit control's callback fires
  });

  it("Escape also exits and removes the floating control", () => {
    document.body.innerHTML = `<div id="hud"><button data-photo-mode-toggle>Enter Photo Mode</button></div>`;
    const state = makeState();
    bindPhotoModeSettingsControls(document.getElementById("hud")!, state, () => {});
    document.querySelector<HTMLButtonElement>("[data-photo-mode-toggle]")!.click();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(state.photoModeActive).toBe(false);
    expect(document.body.classList.contains(PHOTO_MODE_BODY_CLASS)).toBe(false);
    expect(document.getElementById(PHOTO_MODE_EXIT_CONTROL_ID)).toBeNull();
  });

  it("clicking the settings button again while active exits without needing the floating control", () => {
    document.body.innerHTML = `<div id="hud"><button data-photo-mode-toggle>Enter Photo Mode</button></div>`;
    const state = makeState();
    bindPhotoModeSettingsControls(document.getElementById("hud")!, state, () => {});
    const button = document.querySelector<HTMLButtonElement>("[data-photo-mode-toggle]")!;
    button.click();

    button.click();

    expect(state.photoModeActive).toBe(false);
    expect(document.body.classList.contains(PHOTO_MODE_BODY_CLASS)).toBe(false);
  });
  const ctrlP = (init: KeyboardEventInit = {}): KeyboardEvent =>
    new KeyboardEvent("keydown", { key: "p", ctrlKey: true, cancelable: true, ...init });

  it("Ctrl+P enters photo mode, claims the browser's print shortcut, and Ctrl+P again exits", () => {
    document.body.innerHTML = `<div id="hud"></div>`;
    const state = makeState();
    let renders = 0;
    bindPhotoModeSettingsControls(document.getElementById("hud")!, state, () => {
      renders += 1;
    });

    const enter = ctrlP();
    window.dispatchEvent(enter);

    expect(enter.defaultPrevented).toBe(true);
    expect(state.photoModeActive).toBe(true);
    expect(document.body.classList.contains(PHOTO_MODE_BODY_CLASS)).toBe(true);
    expect(document.getElementById(PHOTO_MODE_EXIT_CONTROL_ID)).not.toBeNull();

    window.dispatchEvent(ctrlP());

    expect(state.photoModeActive).toBe(false);
    expect(document.body.classList.contains(PHOTO_MODE_BODY_CLASS)).toBe(false);
    expect(document.getElementById(PHOTO_MODE_EXIT_CONTROL_ID)).toBeNull();
    expect(renders).toBe(2);
  });

  it("ignores plain P, Cmd+P, Ctrl+Shift+P and key-repeat", () => {
    document.body.innerHTML = `<div id="hud"></div>`;
    const state = makeState();
    bindPhotoModeSettingsControls(document.getElementById("hud")!, state, () => {});

    for (const init of [{ ctrlKey: false }, { ctrlKey: false, metaKey: true }, { shiftKey: true }, { repeat: true }]) {
      const event = ctrlP(init);
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(state.photoModeActive).toBe(false);
    expect(document.body.classList.contains(PHOTO_MODE_BODY_CLASS)).toBe(false);
  });

  it("Ctrl+P also backs out of a URL/console-started session that never set photoModeActive", () => {
    document.body.innerHTML = `<div id="hud"></div>`;
    const state = makeState();
    bindPhotoModeSettingsControls(document.getElementById("hud")!, state, () => {});
    document.body.classList.add(PHOTO_MODE_BODY_CLASS);

    window.dispatchEvent(ctrlP());

    expect(document.body.classList.contains(PHOTO_MODE_BODY_CLASS)).toBe(false);
    expect(state.photoModeActive).toBe(false);
  });
});

// 2026-11-14 playtest: every photo-mode shot still had the selection square and the Exit button in it.
describe("photo mode keeps chrome out of the shot", () => {
  afterEach(() => {
    exitPhotoMode();
    document.body.innerHTML = "";
    document.body.className = "";
    vi.useRealTimers();
  });

  const state = (): PhotoModeSettingsState => ({ camX: 0, camY: 0, camSubX: 0, camSubY: 0, zoom: 22, photoModeActive: false, selected: { x: 3, y: 4 } });

  it("clears the selected tile while on and restores it after", () => {
    const s = state();
    togglePhotoMode(s, () => undefined);
    expect(s.selected).toBeUndefined();
    togglePhotoMode(s, () => undefined);
    expect(s.selected).toEqual({ x: 3, y: 4 });
  });

  it("restores the selection when left through the on-screen Exit button too", () => {
    const s = state();
    togglePhotoMode(s, () => undefined);
    document.getElementById(PHOTO_MODE_EXIT_CONTROL_ID)!.click();
    expect(s.selected).toEqual({ x: 3, y: 4 });
  });

  it("fades the Exit button out when idle and brings it back on any input", () => {
    vi.useFakeTimers();
    togglePhotoMode(state(), () => undefined);
    const exit = document.getElementById(PHOTO_MODE_EXIT_CONTROL_ID)!;
    expect(exit.classList.contains(PHOTO_MODE_EXIT_IDLE_CLASS)).toBe(false);
    vi.advanceTimersByTime(PHOTO_MODE_EXIT_IDLE_MS);
    expect(exit.classList.contains(PHOTO_MODE_EXIT_IDLE_CLASS)).toBe(true);
    window.dispatchEvent(new Event("pointerdown"));
    expect(exit.classList.contains(PHOTO_MODE_EXIT_IDLE_CLASS)).toBe(false);
  });
});

