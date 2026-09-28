import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import { applyPhotoModeCamera, parsePhotoModeParams } from "./client-photo-mode.js";

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
