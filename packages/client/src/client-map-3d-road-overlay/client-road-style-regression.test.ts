import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const renderSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../client-map-render/client-map-road-2d.ts"), "utf8");
};

describe("road style regression guard", () => {
  it("draws 2D roads in the sci-fi transit look, not the old dirt-tan stroke", () => {
    const source = renderSource();

    expect(source).toContain('const ROAD_DECK = "rgba(28, 36, 46, 0.92)"');
    expect(source).toContain('const ROAD_CORE = "rgba(120, 235, 255, 0.95)"');
    expect(source).not.toContain("rgba(210, 180, 120, 0.92)");
  });
});
