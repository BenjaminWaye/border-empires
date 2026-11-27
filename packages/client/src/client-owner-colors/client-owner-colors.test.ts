import { describe, expect, it } from "vitest";
import { fallbackOwnerColor, resolveOwnerColor } from "./client-owner-colors.js";

describe("resolveOwnerColor", () => {
  it("prefers the live player color over the hashed fallback", () => {
    const colors = new Map<string, string>([["nauticus", "#f59e0b"]]);
    expect(resolveOwnerColor("nauticus", colors, () => "#41d025")).toBe("#f59e0b");
  });

  it("falls back when the live player color is unavailable", () => {
    expect(resolveOwnerColor("unknown", new Map(), () => "#41d025")).toBe("#41d025");
  });

  it("always uses the fallback for barbarian owners, ignoring any stored player color", () => {
    const colors = new Map<string, string>([["barbarian-1", "#38f0e0"]]);
    expect(resolveOwnerColor("barbarian-1", colors, () => "#2f3842")).toBe("#2f3842");
    expect(resolveOwnerColor("barbarian", colors, () => "#2f3842")).toBe("#2f3842");
  });
});

// Playtest Run 4: Planetary Defense's near-black #2f3842, drawn at the 30% frontier tint every owner gets,
// read as a shadow on the ground, so players never saw its land spreading toward them.
describe("Planetary Defense land colour", () => {
  const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };

  it("is a light ash grey, not a near-black shadow", () => {
    expect(fallbackOwnerColor("barbarian-1")).toBe("#c8c1b6");
    expect(luminance(fallbackOwnerColor("barbarian-1"))).toBeGreaterThan(0.6);
  });

  it("is warm (red above blue), so it doesn't read as the cool fog haze, and has no strong hue of a House", () => {
    const hex = fallbackOwnerColor("barbarian-1");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(r!).toBeGreaterThan(b!);
    expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThan(24);
  });
});
