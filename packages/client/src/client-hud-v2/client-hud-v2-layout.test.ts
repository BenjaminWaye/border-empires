import { describe, expect, it } from "vitest";
import { HUD_V2_COMPACT_STORAGE_KEY, HUD_V2_STORAGE_KEY, readHudV2CompactOptIn, readHudV2Flag } from "./client-hud-v2-flag.js";
import { isCompactViewport, selectHudV2Layout, type HudV2LayoutInput } from "./client-hud-v2-layout.js";

const memoryStorage = (): Pick<Storage, "getItem" | "setItem" | "removeItem"> => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key)
  };
};

const input = (over: Partial<HudV2LayoutInput>): HudV2LayoutInput => ({ enabled: true, compactOptIn: false, narrow: false, shortTouch: false, ...over });

// Viewports: portrait phone 390x844 (narrow), landscape large phone 932x430 (short + touch), desktop 1440x900.
const PORTRAIT_PHONE = { narrow: true, shortTouch: false };
const LANDSCAPE_PHONE = { narrow: false, shortTouch: true };
const DESKTOP = { narrow: false, shortTouch: false };

describe("HUD v2 layout selection", () => {
  it("keeps desktop on the desktop layout and the flag-off browser on legacy", () => {
    expect(selectHudV2Layout(input(DESKTOP))).toBe("desktop");
    expect(selectHudV2Layout(input({ ...DESKTOP, enabled: false }))).toBe("off");
    expect(selectHudV2Layout(input({ ...DESKTOP, compactOptIn: true }))).toBe("desktop");
  });

  it("keeps phones on the legacy HUD until they opt into the compact layout", () => {
    expect(selectHudV2Layout(input(PORTRAIT_PHONE))).toBe("off");
    expect(selectHudV2Layout(input({ ...PORTRAIT_PHONE, compactOptIn: true }))).toBe("compact");
    expect(selectHudV2Layout(input({ ...PORTRAIT_PHONE, compactOptIn: true, enabled: false }))).toBe("off");
  });

  // Regression: the phone check looked at width only, so a large phone held sideways (932x430) counted as
  // desktop and got the 360px + 420px town columns on a 430px-tall screen.
  it("treats a phone in landscape as a compact viewport", () => {
    expect(isCompactViewport(LANDSCAPE_PHONE)).toBe(true);
    expect(selectHudV2Layout(input({ ...LANDSCAPE_PHONE, compactOptIn: true }))).toBe("compact");
    // Without the opt-in it keeps today's desktop HUD rather than dropping to legacy.
    expect(selectHudV2Layout(input(LANDSCAPE_PHONE))).toBe("desktop");
  });
});

describe("compact layout opt-in", () => {
  it("is off by default and turned on by ?hud=compact, which also turns the HUD flag on", () => {
    const storage = memoryStorage();
    storage.setItem(HUD_V2_STORAGE_KEY, "0");
    expect(readHudV2CompactOptIn("", storage)).toBe(false);
    expect(readHudV2Flag("?hud=compact", storage)).toBe(true);
    expect(readHudV2CompactOptIn("?hud=compact", storage)).toBe(true);
    expect(readHudV2CompactOptIn("", storage)).toBe(true);
    expect(readHudV2Flag("", storage)).toBe(true);
  });

  it("is cleared by ?hud=legacy and left alone by ?hud=v2", () => {
    const storage = memoryStorage();
    readHudV2CompactOptIn("?hud=compact", storage);
    expect(readHudV2CompactOptIn("?hud=v2", storage)).toBe(true);
    expect(readHudV2CompactOptIn("?hud=legacy", storage)).toBe(false);
    expect(storage.getItem(HUD_V2_COMPACT_STORAGE_KEY)).toBeNull();
  });

  it("does not opt in early ?hud=v2 testers, who stored be.hudV2=1", () => {
    const storage = memoryStorage();
    storage.setItem(HUD_V2_STORAGE_KEY, "1");
    expect(readHudV2CompactOptIn("", storage)).toBe(false);
  });

  it("follows the URL alone when storage is unavailable", () => {
    expect(readHudV2CompactOptIn("?hud=compact", undefined)).toBe(true);
    expect(readHudV2CompactOptIn("", undefined)).toBe(false);
  });
});
