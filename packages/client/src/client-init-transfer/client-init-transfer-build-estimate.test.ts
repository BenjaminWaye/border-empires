import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INIT_BUILD_MS_PER_KB,
  estimateInitBuildMs,
  readInitBuildMsPerKb,
  recordInitBuildDuration
} from "./client-init-transfer-build-estimate.js";

const createStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value)
  };
};

describe("init build estimate", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the default rate on a device with no measurement, with a 1s floor", () => {
    expect(readInitBuildMsPerKb()).toBe(DEFAULT_INIT_BUILD_MS_PER_KB);
    expect(estimateInitBuildMs(1000 * 1024)).toBe(1000 * DEFAULT_INIT_BUILD_MS_PER_KB);
    expect(estimateInitBuildMs(10 * 1024)).toBe(1_000);
  });

  it("learns this device's rate from a measured build and blends later ones", () => {
    recordInitBuildDuration(1000 * 1024, 2_000);
    expect(readInitBuildMsPerKb()).toBeCloseTo(2);
    recordInitBuildDuration(1000 * 1024, 4_000);
    expect(readInitBuildMsPerKb()).toBeCloseTo(3);
    expect(estimateInitBuildMs(2000 * 1024)).toBe(6_000);
  });

  it("falls back to the default when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      }
    });
    expect(() => recordInitBuildDuration(1000 * 1024, 2_000)).not.toThrow();
    expect(readInitBuildMsPerKb()).toBe(DEFAULT_INIT_BUILD_MS_PER_KB);
  });
});
