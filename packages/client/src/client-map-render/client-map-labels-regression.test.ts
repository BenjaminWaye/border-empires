import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relativePath: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, relativePath), "utf8");
};

// Map names (player names over garrisoned land when zoomed out, island names
// when zoomed in) live in client-map-name-labels/, drawn once per frame from
// the runtime loop. Guards against an ad-hoc second label path creeping back
// into main.ts, and against the labels being gated to one renderer.
describe("map name label regression guard", () => {
  it("keeps territory name drawing out of main.ts", () => {
    const main = source("../main.ts");
    expect(main).not.toContain("const visibleTerritoryLabels =");
    expect(main).not.toContain("const drawCurvedTerritoryLabel =");
  });

  it("renders map name labels unconditionally from the runtime loop, so both renderers get them", () => {
    const loop = source("../client-runtime-loop.ts");
    const renderLine = loop.split("\n").find((line) => line.includes("mapNameLabels.render("));
    expect(renderLine).toBeDefined();
    expect(renderLine).not.toContain("isTrue3DRendererActive");
    expect(renderLine).toContain("deps.worldToScreen");
  });
});
