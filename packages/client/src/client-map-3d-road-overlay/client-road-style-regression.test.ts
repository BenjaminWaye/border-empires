import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const renderSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../client-map-render/client-map-road-2d.ts"), "utf8");
};

describe("road style regression guard", () => {
  it("draws 2D town links as an elevated monorail, not the old dirt-tan stroke", () => {
    const source = renderSource();

    expect(source).toContain('const RAIL_STEEL = "rgba(58, 64, 72, 0.96)"');
    expect(source).toContain('const RAIL_POWER = "rgba(95, 227, 255, 0.92)"');
    expect(source).toContain('const RAIL_SHADOW = "rgba(5, 8, 11, 0.28)"');
    expect(source).not.toContain("rgba(210, 180, 120, 0.92)");
  });
});
