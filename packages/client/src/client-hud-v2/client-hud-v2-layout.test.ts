import { describe, expect, it } from "vitest";
import { isCompactViewport, selectHudV2Layout } from "./client-hud-v2-layout.js";

// Viewports: portrait phone 390x844 (narrow), landscape large phone 932x430 (short + touch), desktop 1440x900.
const PORTRAIT_PHONE = { narrow: true, shortTouch: false };
const LANDSCAPE_PHONE = { narrow: false, shortTouch: true };
const DESKTOP = { narrow: false, shortTouch: false };

describe("HUD v2 layout selection", () => {
  it("draws the desktop layout on desktop and the compact layout on phones", () => {
    expect(selectHudV2Layout(DESKTOP)).toBe("desktop");
    expect(selectHudV2Layout(PORTRAIT_PHONE)).toBe("compact");
  });

  // Regression: the phone check looked at width only, so a large phone held sideways (932x430) counted as
  // desktop and got the 360px + 420px town columns on a 430px-tall screen.
  it("treats a phone in landscape as a compact viewport", () => {
    expect(isCompactViewport(LANDSCAPE_PHONE)).toBe(true);
    expect(selectHudV2Layout(LANDSCAPE_PHONE)).toBe("compact");
  });
});
