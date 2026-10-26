// Feature flag for the redesigned desktop HUD (client-hud-v2.ts). Off by
// default; `?hud=v2` turns it on for this browser and `?hud=legacy` turns it
// back off. Phones keep the legacy HUD until the mobile pass.

export const HUD_V2_STORAGE_KEY = "be.hudV2";

type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const safeStorage = (): FlagStorage | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

/** Applies a `?hud=` override from the URL, then reports whether the flag is on. */
export const readHudV2Flag = (search: string, storage: FlagStorage | undefined = safeStorage()): boolean => {
  const param = new URLSearchParams(search).get("hud");
  if (!storage) return param === "v2";
  try {
    if (param === "v2") storage.setItem(HUD_V2_STORAGE_KEY, "1");
    if (param === "legacy") storage.removeItem(HUD_V2_STORAGE_KEY);
    return storage.getItem(HUD_V2_STORAGE_KEY) === "1";
  } catch {
    return param === "v2";
  }
};

export const setHudV2Flag = (enabled: boolean, storage: FlagStorage | undefined = safeStorage()): void => {
  try {
    if (enabled) storage?.setItem(HUD_V2_STORAGE_KEY, "1");
    else storage?.removeItem(HUD_V2_STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the flag simply stays off.
  }
};

let enabledForSession = false;

export const initHudV2Flag = (search: string): boolean => {
  enabledForSession = readHudV2Flag(search);
  return enabledForSession;
};

/** True when the new HUD should drive this frame: flag on and not a phone layout. */
export const isHudV2Active = (isMobile: () => boolean): boolean => enabledForSession && !isMobile();
