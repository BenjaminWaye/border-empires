import { setWorldTerrainStore, type WorldTerrainLayer, type WorldTerrainStore } from "@border-empires/shared";
import { CLIENT_BUILD_VERSION } from "../client-build-version.js";
import { markLoginTimeline } from "../client-init-transfer/client-login-timeline.js";

// Keeps the last world's computed terrain layers in localStorage so a returning
// login skips the whole-world terrain passes: raw terrain + coastal masks
// (~100 KB packed, ~137 KB as base64) and hills (~25 KB, ~34 KB as base64).
// One entry per layer: a new season, style or client build overwrites it.
// The build is part of the key because worldgen code can change without a
// worldgen version bump, and stale terrain would disagree with the server.
export const worldTerrainStorageKey = (layer: WorldTerrainLayer): string => `border-empires:world-${layer}`;

const CHUNK = 0x8000;

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
};

export const base64ToBytes = (text: string): Uint8Array => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// "stale" = an entry for another build or world (evicted on the next save).
export type WorldTerrainCacheOutcome = "hit" | "miss" | "stale" | "corrupt" | "saved" | "save-failed";
export type WorldTerrainCacheReport = (layer: WorldTerrainLayer, outcome: WorldTerrainCacheOutcome) => void;

// Lands in the [login-timeline] summary (and client diagnostics), so a cache that never
// hits in the field is visible instead of silently costing the full world build.
const reportToLoginTimeline: WorldTerrainCacheReport = (layer, outcome) =>
  markLoginTimeline(`worldTerrain:${layer}:${outcome}`, { [`worldTerrain_${layer}`]: outcome });

export const createLocalStorageWorldTerrainStore = (storage: Storage, build: string, report: WorldTerrainCacheReport = () => {}): WorldTerrainStore => {
  const prefixFor = (key: string): string => `${build}|${key}|`;
  return {
    load: (layer, key) => {
      const stored = storage.getItem(worldTerrainStorageKey(layer));
      const prefix = prefixFor(key);
      if (!stored || !stored.startsWith(prefix)) {
        report(layer, stored ? "stale" : "miss");
        return undefined;
      }
      try {
        const bytes = base64ToBytes(stored.slice(prefix.length));
        report(layer, "hit");
        return bytes;
      } catch {
        report(layer, "corrupt");
        return undefined;
      }
    },
    save: (layer, key, packed) => {
      try {
        storage.setItem(worldTerrainStorageKey(layer), prefixFor(key) + bytesToBase64(packed));
        report(layer, "saved");
      } catch {
        report(layer, "save-failed");
        // Quota or private mode: drop the stale entry so it is not re-read, and recompute next time.
        try {
          storage.removeItem(worldTerrainStorageKey(layer));
        } catch {
          // Storage unavailable.
        }
      }
    }
  };
};

export const installWorldTerrainStore = (): void => {
  try {
    setWorldTerrainStore(createLocalStorageWorldTerrainStore(window.localStorage, CLIENT_BUILD_VERSION, reportToLoginTimeline));
  } catch {
    // No localStorage (restricted context): terrain is computed every login as before.
  }
};
