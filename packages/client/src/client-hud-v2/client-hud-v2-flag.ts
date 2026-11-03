// Feature flag for the redesigned HUD (client-hud-v2.ts). On by default on
// desktop; `?hud=legacy` opts this browser back into the old HUD and `?hud=v2`
// switches it back on. Phones keep the legacy HUD unless the browser opted into
// the compact (phone) layout with `?hud=compact` (see client-hud-v2-layout.ts
// and docs/hud-v2-mobile-plan.md); `?hud=legacy` clears that opt-in too.

import { isPhoneViewport } from "../client-panel-nav/client-phone-viewport.js";
import { selectHudV2Layout, shortTouchViewport, type HudV2Layout } from "./client-hud-v2-layout.js";

export const HUD_V2_STORAGE_KEY = "be.hudV2";
export const HUD_V2_COMPACT_STORAGE_KEY = "be.hudV2Compact";
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
    if (param === "v2" || param === "compact") storage.setItem(HUD_V2_STORAGE_KEY, "1");
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

/** Applies a `?hud=` override, then reports whether this browser opted into the compact (phone) layout. */
export const readHudV2CompactOptIn = (search: string, storage: FlagStorage | undefined = safeStorage()): boolean => {
  const param = new URLSearchParams(search).get("hud");
  if (!storage) return param === "compact";
  try {
    if (param === "compact") storage.setItem(HUD_V2_COMPACT_STORAGE_KEY, "1");
    if (param === "legacy") storage.removeItem(HUD_V2_COMPACT_STORAGE_KEY);
    return storage.getItem(HUD_V2_COMPACT_STORAGE_KEY) === "1";
  } catch {
    return param === "compact";
  }
};

let enabledForSession = false;
let compactOptInForSession = false;

export const initHudV2Flag = (search: string): boolean => {
  enabledForSession = readHudV2Flag(search);
  compactOptInForSession = readHudV2CompactOptIn(search);
  return enabledForSession;
};

/**
 * The layout the new HUD should draw this frame, or "off" for the legacy HUD. Reads the raw phone viewport, not
 * `isMobile()`: that one turns false while the compact layout drives the phone (client-phone-viewport.ts).
 */
export const currentHudV2Layout = (narrow: () => boolean = isPhoneViewport): HudV2Layout =>
  selectHudV2Layout({ enabled: enabledForSession, compactOptIn: compactOptInForSession, narrow: narrow(), shortTouch: shortTouchViewport() });

/** True when the new HUD should drive this frame, in either layout. */
export const isHudV2Active = (): boolean => currentHudV2Layout() !== "off";

/** True when the compact (phone) layout drives this frame. */
export const isHudV2Compact = (): boolean => currentHudV2Layout() === "compact";

let drivingFrame = false;

/** Set by the new HUD's frame each tick: whether it is the HUD on screen right now (flag on, desktop width). */
export const setHudV2Driving = (driving: boolean): void => {
  drivingFrame = driving;
};

/** Legacy views the new HUD replaces (the activity dashboard) stand down while this is true. */
export const hudV2IsDriving = (): boolean => drivingFrame;
