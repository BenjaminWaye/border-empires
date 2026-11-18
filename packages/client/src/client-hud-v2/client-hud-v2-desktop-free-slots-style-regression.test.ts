// happy-dom does not resolve the cascade, so guard the desktop slot-chip rules in the stylesheet.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./client-hud-v2.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("desktop resource bar styles", () => {
  it("does not hide the free-slot summary outside the phone layout", () => {
    // Regression: the base stylesheet hid .hud-v2-chip-summary, so desktop showed used / total only.
    const hidden = [...css.matchAll(/([^{}]+)\{[^{}]*display:\s*none[^{}]*\}/g)].map(([, selectors]) => selectors ?? "");
    expect(hidden.some((selectors) => selectors.includes(".hud-v2-chip-summary"))).toBe(false);
    expect(css).toMatch(/\.hud-v2-chip-available\s*\{[^}]*color:\s*var\(--v2-green-hi\)/);
  });
});
