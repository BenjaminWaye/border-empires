import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  effectiveFogDisabled,
  getMapRevealEnabled,
  mapRevealAvailable,
  setMapRevealEnabled
} from "./client-map-reveal.js";

describe("client map reveal", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the toggle whenever the server allows it for this account, regardless of hostname", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { hostname: "staging.borderempires.com" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });

    expect(mapRevealAvailable({ enabledForAccount: false })).toBe(false);
    expect(mapRevealAvailable({ enabledForAccount: true })).toBe(true);
    // The per-account gate is the only gate now: `canToggleFog` (server) decides.
  });

  it("reads and writes the reveal preference per debug account", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { hostname: "staging.borderempires.com" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });

    const options = {
      enabledForAccount: true,
      authEmail: "bw199005@gmail.com"
    };

    expect(getMapRevealEnabled(options)).toBe(false);
    setMapRevealEnabled(true, options);
    expect(getMapRevealEnabled(options)).toBe(true);
    expect(storage.get("be-map-reveal:bw199005@gmail.com")).toBe("1");
    setMapRevealEnabled(false, options);
    expect(getMapRevealEnabled(options)).toBe(false);
  });

  it("ignores stored reveal state for accounts the server hasn't authorized", () => {
    vi.stubGlobal("window", {
      location: { hostname: "staging.borderempires.com" },
      localStorage: {
        getItem: () => "1",
        setItem: vi.fn(),
        removeItem: vi.fn()
      }
    });

    expect(
      getMapRevealEnabled({
        enabledForAccount: false,
        authEmail: "someone@example.com"
      })
    ).toBe(false);
  });

  it("uses the server fog flag as the source of truth for client rendering", () => {
    expect(effectiveFogDisabled({ fogDisabled: false })).toBe(false);
    expect(effectiveFogDisabled({ fogDisabled: true })).toBe(true);
  });
});
