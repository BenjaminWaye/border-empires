import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  effectiveFogDisabled,
  getStagingMapRevealEnabled,
  setStagingMapRevealEnabled,
  stagingMapRevealAvailable
} from "./client-staging-map-reveal.js";

describe("client staging map reveal", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("only exposes the toggle on staging hostnames for the debug account", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { hostname: "staging.borderempires.com" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });

    expect(stagingMapRevealAvailable({ hostname: "staging.borderempires.com", enabledForAccount: false })).toBe(false);
    expect(stagingMapRevealAvailable({ hostname: "staging.borderempires.com", enabledForAccount: true })).toBe(true);
    expect(
      stagingMapRevealAvailable({
        hostname: "border-empires-client-staging-benjaminwayes-projects.vercel.app",
        enabledForAccount: true
      })
    ).toBe(true);
    expect(stagingMapRevealAvailable({ hostname: "borderempires.com", enabledForAccount: true })).toBe(false);
  });

  it("reads and writes the staging reveal preference only for the debug account on staging", () => {
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
      hostname: "staging.borderempires.com",
      enabledForAccount: true,
      authEmail: "bw199005@gmail.com"
    };

    expect(getStagingMapRevealEnabled(options)).toBe(false);
    setStagingMapRevealEnabled(true, options);
    expect(getStagingMapRevealEnabled(options)).toBe(true);
    expect(storage.get("be-staging-map-reveal:bw199005@gmail.com")).toBe("1");
    setStagingMapRevealEnabled(false, options);
    expect(getStagingMapRevealEnabled(options)).toBe(false);
  });

  it("ignores stored reveal state for other accounts even on staging", () => {
    vi.stubGlobal("window", {
      location: { hostname: "staging.borderempires.com" },
      localStorage: {
        getItem: () => "1",
        setItem: vi.fn(),
        removeItem: vi.fn()
      }
    });

    expect(
      getStagingMapRevealEnabled({
        hostname: "staging.borderempires.com",
        enabledForAccount: false,
        authEmail: "someone@example.com"
      })
    ).toBe(false);
  });

  it("treats the staging reveal like disabled fog for client rendering", () => {
    expect(effectiveFogDisabled({ fogDisabled: false, stagingMapRevealEnabled: false })).toBe(false);
    expect(effectiveFogDisabled({ fogDisabled: false, stagingMapRevealEnabled: true })).toBe(true);
    expect(effectiveFogDisabled({ fogDisabled: true, stagingMapRevealEnabled: false })).toBe(true);
  });
});
