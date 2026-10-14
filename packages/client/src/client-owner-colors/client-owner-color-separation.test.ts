import { describe, expect, it } from "vitest";
import { normalizeColorForThree } from "../client-three-color/client-three-color.js";
import { MIN_HUE_SEPARATION_DEG, createSeparatedOwnerColor, separateRivalColor } from "./client-owner-color-separation.js";

const hueOf = (color: string): number => {
  const hex = normalizeColorForThree(color);
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};
const hueDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe("separateRivalColor", () => {
  it("pushes a near-identical rival blue at least the minimum hue away from my blue", () => {
    // Royal blue vs dark navy -- the clash from the screenshot that motivated this.
    const separated = separateRivalColor("#1f3fd8", "#2a4bff");
    expect(hueDistance(hueOf(separated), hueOf("#2a4bff"))).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION_DEG - 1);
  });

  it("leaves a rival that is already far from my hue untouched", () => {
    expect(separateRivalColor("#e53935", "#2a4bff")).toBe("#e53935");
  });

  it("keeps two close rivals on opposite sides of my hue apart instead of collapsing them", () => {
    const mine = "hsl(220 70% 48%)";
    const a = hueOf(separateRivalColor("hsl(210 70% 48%)", mine));
    const b = hueOf(separateRivalColor("hsl(230 70% 48%)", mine));
    expect(hueDistance(a, b)).toBeGreaterThanOrEqual(2 * MIN_HUE_SEPARATION_DEG - 2);
  });

  it("keeps the original order of several rivals crowding my hue", () => {
    // The real local clash: my #e25822 (orange-red) against #f58231 and #ffa500 on one side.
    const mine = "#e25822";
    const closer = hueDistance(hueOf(separateRivalColor("#f58231", mine)), hueOf(mine));
    const further = hueDistance(hueOf(separateRivalColor("#ffa500", mine)), hueOf(mine));
    expect(closer).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION_DEG - 1);
    expect(further).toBeGreaterThan(closer);
  });

  it("ignores greys, whose hue is meaningless", () => {
    expect(separateRivalColor("#808080", "#2a4bff")).toBe("#808080");
  });
});

describe("createSeparatedOwnerColor", () => {
  const colors: Record<string, string> = { me: "#2a4bff", rival: "#1f3fd8", far: "#e53935", "barbarian-1": "#2f3842" };
  const lookup = createSeparatedOwnerColor((id) => colors[id] ?? "#000000", () => "me");

  it("never changes the viewer's own colour", () => {
    expect(lookup("me")).toBe("#2a4bff");
  });

  it("separates only rivals that clash with the viewer", () => {
    expect(lookup("rival")).not.toBe("#1f3fd8");
    expect(lookup("far")).toBe("#e53935");
    expect(lookup("barbarian-1")).toBe("#2f3842");
  });

  it("is a no-op before the viewer's id is known", () => {
    const noMe = createSeparatedOwnerColor((id) => colors[id] ?? "#000000", () => undefined);
    expect(noMe("rival")).toBe("#1f3fd8");
  });
});
