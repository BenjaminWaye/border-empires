import { describe, expect, it } from "vitest";
import { HUD_V2_STORAGE_KEY, readHudV2Flag } from "./client-hud-v2-flag.js";
import { isCompactViewport, selectHudV2Layout, type HudV2LayoutInput } from "./client-hud-v2-layout.js";

const memoryStorage = (): Pick<Storage, "getItem" | "setItem" | "removeItem"> => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key)
  };
};

const input = (over: Partial<HudV2LayoutInput>): HudV2LayoutInput => ({ enabled: true, narrow: false, shortTouch: false, ...over });

// Viewports: portrait phone 390x844 (narrow), landscape large phone 932x430 (short + touch), desktop 1440x900.
const PORTRAIT_PHONE = { narrow: true, shortTouch: false };
const LANDSCAPE_PHONE = { narrow: false, shortTouch: true };
const DESKTOP = { narrow: false, shortTouch: false };

describe("HUD v2 layout selection", () => {
  it("draws the desktop layout on desktop and nothing when the flag is off", () => {
    expect(selectHudV2Layout(input(DESKTOP))).toBe("desktop");
    expect(selectHudV2Layout(input({ ...DESKTOP, enabled: false }))).toBe("off");
  });

  it("draws the compact layout on phones by default; ?hud=legacy (flag off) puts them back on the legacy HUD", () => {
    expect(selectHudV2Layout(input(PORTRAIT_PHONE))).toBe("compact");
    expect(selectHudV2Layout(input({ ...PORTRAIT_PHONE, enabled: false }))).toBe("off");
  });

  // Regression: the phone check looked at width only, so a large phone held sideways (932x430) counted as
  // desktop and got the 360px + 420px town columns on a 430px-tall screen.
  it("treats a phone in landscape as a compact viewport", () => {
    expect(isCompactViewport(LANDSCAPE_PHONE)).toBe(true);
    expect(selectHudV2Layout(input(LANDSCAPE_PHONE))).toBe("compact");
  });
});

describe("?hud= links", () => {
  it("?hud=compact, the old phone opt-in, switches the new HUD back on", () => {
    const storage = memoryStorage();
    storage.setItem(HUD_V2_STORAGE_KEY, "0");
    expect(readHudV2Flag("?hud=compact", storage)).toBe(true);
    expect(readHudV2Flag("", storage)).toBe(true);
  });
});
