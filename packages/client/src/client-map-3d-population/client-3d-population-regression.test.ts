import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d reveal population regression guard", () => {
  it("keeps resources on svg overlays instead of 3d mesh props", () => {
    const source = clientSource("../client-map-3d/client-map-3d.ts");
    expect(source).not.toContain("createClientThreeResourceLayer");
    expect(source).not.toContain("createClientThreeTownLayer");
    const runtimeLoop = clientSource("../client-runtime-loop.ts");
    expect(runtimeLoop).toContain("resourceFor3DPopulation");
    expect(runtimeLoop).toContain("const overlayTile = t ?? syntheticOverlayTileAt(wx, wy, t);");
    // The sprite draw itself lives in the shared 2D helper both tile loops call
    // (it used to be duplicated inline in client-runtime-loop.ts).
    expect(runtimeLoop).toContain("drawResourceOverlay2D(deps, overlayTile, px, py, size, nowMs)");
    expect(clientSource("../client-resource-overlay-2d/client-resource-overlay-2d.ts")).toContain(
      "deps.drawCenteredOverlayWithAlpha(overlay, px, py, size, scale,"
    );
    // Narrowed from also asserting a blanket `not.toContain("populationTier")`:
    // that catch-all blocked the unrelated (and legitimate) support-ring 2D
    // highlight reading selected.town.populationTier -- this specific function
    // name is the actual removed-feature signal this guard cares about.
    expect(runtimeLoop).not.toContain("townTierFor3DPopulation");
  });
});
