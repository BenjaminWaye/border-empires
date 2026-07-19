import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "./client-state.js";
import { CAMERA_LOCATION_STORAGE_KEY, DEFAULT_ZOOM } from "../client-constants.js";
import { saveCameraLocation } from "../client-view-refresh.js";

describe("client state camera-location restore regression", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  const stubLocalStorage = (): Map<string, string> => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    return storage;
  };

  it("defaults the camera to (0,0) and does not mark a restored location when nothing is stored", () => {
    stubLocalStorage();
    const state = createInitialState();
    expect(state.camX).toBe(0);
    expect(state.camY).toBe(0);
    expect(state.zoom).toBe(DEFAULT_ZOOM);
    expect(state.cameraRestoredFromStorage).toBe(false);
  });

  it("restores the last-viewed map location saved by saveCameraLocation()", () => {
    stubLocalStorage();
    saveCameraLocation({ camX: 128, camY: -64, zoom: 40 });

    const state = createInitialState();
    expect(state.camX).toBe(128);
    expect(state.camY).toBe(-64);
    expect(state.zoom).toBe(40);
    expect(state.cameraRestoredFromStorage).toBe(true);
  });

  it("falls back to the default camera when the stored payload is malformed", () => {
    const storage = stubLocalStorage();
    storage.set(CAMERA_LOCATION_STORAGE_KEY, "not-json");

    const state = createInitialState();
    expect(state.camX).toBe(0);
    expect(state.camY).toBe(0);
    expect(state.cameraRestoredFromStorage).toBe(false);
  });
});
