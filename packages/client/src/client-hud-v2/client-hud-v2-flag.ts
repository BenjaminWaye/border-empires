// Feature flag for the redesigned desktop HUD (client-hud-v2.ts). On by
// default; `?hud=legacy` opts this browser back into the old HUD and `?hud=v2`
// clears that opt-out. Phones keep the legacy HUD until the mobile pass.

export const HUD_V2_STORAGE_KEY = "be.hudV2";
/** Stored when the player opts out with `?hud=legacy`; anything else means the new HUD. */
const HUD_V2_OPT_OUT = "0";

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
  if (!storage) return param !== "legacy";
  try {
    if (param === "v2") storage.setItem(HUD_V2_STORAGE_KEY, "1");
    if (param === "legacy") storage.setItem(HUD_V2_STORAGE_KEY, HUD_V2_OPT_OUT);
    return storage.getItem(HUD_V2_STORAGE_KEY) !== HUD_V2_OPT_OUT;
  } catch {
    return param !== "legacy";
  }
};

export const setHudV2Flag = (enabled: boolean, storage: FlagStorage | undefined = safeStorage()): void => {
  try {
    storage?.setItem(HUD_V2_STORAGE_KEY, enabled ? "1" : HUD_V2_OPT_OUT);
  } catch {
    // Private mode or blocked storage: the flag falls back to its default (on).
  }
};

let enabledForSession = false;

export const initHudV2Flag = (search: string): boolean => {
  enabledForSession = readHudV2Flag(search);
  return enabledForSession;
};

/** True when the new HUD should drive this frame: flag on and not a phone layout. */
export const isHudV2Active = (isMobile: () => boolean): boolean => enabledForSession && !isMobile();

let drivingFrame = false;

/** Set by the new HUD's frame each tick: whether it is the HUD on screen right now (flag on, desktop width). */
export const setHudV2Driving = (driving: boolean): void => {
  drivingFrame = driving;
};

/** Legacy views the new HUD replaces (the activity dashboard) stand down while this is true. */
export const hudV2IsDriving = (): boolean => drivingFrame;
