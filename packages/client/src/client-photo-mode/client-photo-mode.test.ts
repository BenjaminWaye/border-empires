// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import {
  applyPhotoModeCamera,
  bindPhotoModeSettingsControls,
  exitPhotoMode,
  PHOTO_MODE_BODY_CLASS,
  PHOTO_MODE_EXIT_CONTROL_ID,
  parsePhotoModeParams,
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

describe("bindPhotoModeSettingsControls (Settings > Admin toggle)", () => {
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
    mapRevealEligible: true,
    authSessionReady: true,
    ...overrides
  });

  it("does nothing when the account is not fog-admin eligible", () => {
    document.body.innerHTML = `<div id="hud"><button data-photo-mode-toggle>Enter Photo Mode</button></div>`;
    const state = makeState({ mapRevealEligible: false });
    bindPhotoModeSettingsControls(document.getElementById("hud")!, state, () => {});

    document.querySelector<HTMLButtonElement>("[data-photo-mode-toggle]")!.click();

    expect(state.photoModeActive).toBe(false);
    expect(document.body.classList.contains(PHOTO_MODE_BODY_CLASS)).toBe(false);
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
});
