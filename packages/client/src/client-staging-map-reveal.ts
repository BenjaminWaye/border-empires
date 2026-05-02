import { isStagingHostname } from "./client-backend-selector.js";
import { debugAuthIdentityKeyForEmail } from "./client-debug.js";

const STAGING_MAP_REVEAL_STORAGE_KEY = "be-staging-map-reveal";

const browserHostname = (): string => {
  try {
    return window.location.hostname ?? "";
  } catch {
    return "";
  }
};

const stagingMapRevealStorageKey = (identityKey: string): string => `${STAGING_MAP_REVEAL_STORAGE_KEY}:${identityKey}`;

type StagingMapRevealOptions = {
  hostname?: string;
  enabledForAccount?: boolean;
  authEmail?: string | null;
};

const resolveHostname = (hostname?: string): string => hostname ?? browserHostname();
const resolveIdentityKey = (authEmail?: string | null): string => debugAuthIdentityKeyForEmail(authEmail);

export const stagingMapRevealAvailable = (options?: StagingMapRevealOptions): boolean =>
  isStagingHostname(resolveHostname(options?.hostname)) && Boolean(options?.enabledForAccount);

export const getStagingMapRevealEnabled = (options?: StagingMapRevealOptions): boolean => {
  if (!stagingMapRevealAvailable(options)) return false;
  try {
    return window.localStorage.getItem(stagingMapRevealStorageKey(resolveIdentityKey(options?.authEmail))) === "1";
  } catch {
    return false;
  }
};

export const setStagingMapRevealEnabled = (enabled: boolean, options?: StagingMapRevealOptions): void => {
  if (!stagingMapRevealAvailable(options)) return;
  try {
    const storageKey = stagingMapRevealStorageKey(resolveIdentityKey(options?.authEmail));
    if (enabled) window.localStorage.setItem(storageKey, "1");
    else window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const effectiveFogDisabled = (state: { fogDisabled: boolean; stagingMapRevealEnabled?: boolean }): boolean =>
  state.fogDisabled || Boolean(state.stagingMapRevealEnabled);
