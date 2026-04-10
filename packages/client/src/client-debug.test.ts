import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  debugTileSnapshot,
  debugEnabledForAccount,
  debugTileLoggingEnabled,
  setDebugAuthEmail,
  setDebugTileKey,
  setDebugTileLoggingEnabled,
  tileMatchesDebugKey
} from "./client-debug.js";

describe("client debug tile controls", () => {
  beforeEach(() => {
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
    setDebugAuthEmail("bw199005@gmail.com");
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
