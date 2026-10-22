import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relativePath: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, relativePath), "utf8");
};

// Map names (player names over garrisoned land when zoomed out, island names
// when zoomed in) come from client-map-name-labels/. The 2D map draws them in
// the runtime loop's overlay pass; true-3D inks them onto the ground
// (client-map-3d-name-decal) so buildings and units stand on top. Guards
// against an ad-hoc second label path creeping back into main.ts, and
// against either renderer losing its half.
describe("map name label regression guard", () => {
  it("keeps territory name drawing out of main.ts", () => {
    const main = source("../main.ts");
    expect(main).not.toContain("const visibleTerritoryLabels =");
    expect(main).not.toContain("const drawCurvedTerritoryLabel =");
  });

  it("draws the 2D names in the runtime loop's overlay pass, and only there for 2D", () => {
    const loop = source("../client-runtime-loop.ts");
    const renderLine = loop.split("\n").find((line) => line.includes("mapNameLabels.render("));
    expect(renderLine).toContain("!isTrue3DRendererActive()");
  });

  it("inks the 3D names on the ground and refreshes them every frame", () => {
    const map3d = source("../client-map-3d/client-map-3d.ts");
    expect(map3d).toContain("createNameDecalForMap(");
    expect(map3d).toContain("nameDecal.sync(");
    expect(map3d).toContain("nameDecal.tick(nowMs)");
    expect(map3d).toContain("nameDecal.dispose()");
  });
});
