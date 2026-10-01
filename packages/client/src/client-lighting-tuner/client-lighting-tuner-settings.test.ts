import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LIGHTING,
  LIGHTING_NUMBER_RANGES,
  getLightingSettings,
  lightingIsDefault,
  lightingSettingsAsSource,
  resetLightingSettings,
  setLightingSetting,
  subscribeLightingSettings
} from "./client-lighting-tuner-settings.js";

const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value)
  };
};

describe("lighting tuner settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    resetLightingSettings();
  });

  it("starts from the shipped defaults", () => {
    expect(lightingIsDefault(getLightingSettings())).toBe(true);
    expect(getLightingSettings().sunIntensity).toBe(1.55);
  });

  it("keeps the default sun direction identical to the original fixed (8, 42, 60) offset", () => {
    const az = (DEFAULT_LIGHTING.sunAzimuthDeg * Math.PI) / 180;
    const el = (DEFAULT_LIGHTING.sunElevationDeg * Math.PI) / 180;
    const distance = Math.hypot(8, 42, 60);
    expect(Math.sin(az) * Math.cos(el) * distance).toBeCloseTo(8, 6);
    expect(Math.sin(el) * distance).toBeCloseTo(42, 6);
    expect(Math.cos(az) * Math.cos(el) * distance).toBeCloseTo(60, 6);
  });

  it("notifies subscribers, clamps to the slider range, and rejects malformed colours", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLightingSettings(listener);
    setLightingSetting("sunIntensity", 999);
    expect(getLightingSettings().sunIntensity).toBe(LIGHTING_NUMBER_RANGES.sunIntensity.max);
    setLightingSetting("sunColor", "not-a-colour");
    expect(getLightingSettings().sunColor).toBe(DEFAULT_LIGHTING.sunColor);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setLightingSetting("hemiIntensity", 1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("persists overrides and clears storage again on reset", () => {
    setLightingSetting("envIntensity", 0.4);
    expect(window.localStorage.getItem("be-lighting-tuner")).toContain("0.4");
    resetLightingSettings();
    expect(window.localStorage.getItem("be-lighting-tuner")).toBeNull();
    expect(lightingIsDefault(getLightingSettings())).toBe(true);
  });

  it("prints the settings as pasteable source", () => {
    const source = lightingSettingsAsSource(DEFAULT_LIGHTING);
    expect(source).toContain("sunIntensity: 1.55");
    expect(source).toContain('sunColor: "#fff0c0"');
  });
});
