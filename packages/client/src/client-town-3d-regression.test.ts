import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d town rendering regression guard", () => {
  it("the 3D town overlay supersedes the SVG icon when true-3D is mounted", () => {
    const map3dSource = clientSource("./client-map-3d.ts");
    // The orchestrator must not embed the legacy three-town/resource layers.
    expect(map3dSource).not.toContain("createClientThreeTownLayer");
    // The 3D town overlay drives town visuals through this entry point.
    expect(map3dSource).toContain("townOverlay.addInstance");
    // Bootstrap suppresses the SVG town icon when the true-3D renderer is mounted.
    const bootstrapSource = clientSource("./client-bootstrap.ts");
    expect(bootstrapSource).toContain("if (threeTerrainRenderer) return;");
    // The 2D drawing path still calls drawTownOverlay through the dep
    // wrapper, so non-3D renderers keep their SVG town icons.
    const runtimeSource = clientSource("./client-runtime-loop.ts");
    expect(runtimeSource).toContain(
      'overlayTile && overlayVisible && overlayTile.town && overlayTile.terrain === "LAND") deps.drawTownOverlay(overlayTile, px, py, size);'
    );
  });
});
