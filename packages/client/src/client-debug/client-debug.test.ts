import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  debugAuthIdentityKeyForEmail,
  debugTileSnapshot,
  debugEnabledForAccount,
  debugTileLoggingEnabled,
  setDebugAuthEmail,
  setGuestIdentityUid,
  setDebugTileKey,
  setDebugTileLoggingEnabled,
  tileMatchesDebugKey
} from "./client-debug.js";

describe("client debug tile controls", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ADMIN_EMAIL", "admin@borderempires.com");
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        }
      }
    });
    window.localStorage.clear();
  });

  it("requires the admin account before tile debug can be enabled", () => {
    setDebugAuthEmail("someone@example.com");
    setDebugTileLoggingEnabled(true);

    expect(debugEnabledForAccount()).toBe(false);
    expect(debugTileLoggingEnabled()).toBe(false);
    expect(tileMatchesDebugKey(78, 322, 0, { fallbackTile: { x: 78, y: 322 } })).toBe(false);
  });

  it("follows the selected tile for the admin account when enabled", () => {
    setDebugAuthEmail("admin@borderempires.com");
    setDebugTileLoggingEnabled(true);
    setDebugTileKey(undefined);

    expect(debugEnabledForAccount()).toBe(true);
    expect(debugTileLoggingEnabled()).toBe(true);
    expect(tileMatchesDebugKey(78, 322, 1, { fallbackTile: { x: 78, y: 322 } })).toBe(true);
    expect(tileMatchesDebugKey(80, 322, 0, { fallbackTile: { x: 78, y: 322 } })).toBe(false);
  });

  it("summarizes tile state for timeline logs", () => {
    expect(
      debugTileSnapshot({
        x: 78,
        y: 322,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "FRONTIER",
        optimisticPending: "expand",
        detailLevel: "summary",
        fogged: false,
        lastChangedAt: 123
      } as any)
    ).toEqual({
      x: 78,
      y: 322,
      ownerId: "me",
      ownershipState: "FRONTIER",
      optimisticPending: "expand",
      detailLevel: "summary",
      fogged: false,
      lastChangedAt: 123,
      terrain: "LAND",
      resource: undefined
    });
    expect(debugTileSnapshot(undefined)).toBeNull();
  });
});

describe("per-account storage scope", () => {
  afterEach(() => setGuestIdentityUid(""));

  it("gives each guest its own scope instead of one shared anonymous key", () => {
    // Regression: every guest on a browser shared "anonymous", so a new guest
    // inherited an earlier guest's checklist completion and skipped "A foothold".
    setGuestIdentityUid("uid-a");
    const first = debugAuthIdentityKeyForEmail("");
    setGuestIdentityUid("uid-b");
    expect(first).toBe("guest:uid-a");
    expect(debugAuthIdentityKeyForEmail(null)).toBe("guest:uid-b");
    // An email account is keyed by its email whatever the guest uid.
    expect(debugAuthIdentityKeyForEmail(" Player@Example.com ")).toBe("player@example.com");
    setGuestIdentityUid("");
    expect(debugAuthIdentityKeyForEmail(undefined)).toBe("anonymous");
  });
});
