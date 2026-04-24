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
    const source = clientSource("./client-map-3d.ts");
    expect(source).not.toContain("createClientThreeResourceLayer");
    expect(source).not.toContain("createClientThreeTownLayer");
    const runtimeLoop = clientSource("./client-runtime-loop.ts");
    expect(runtimeLoop).toContain("resourceFor3DPopulation");
    expect(runtimeLoop).toContain("const overlayTile = t ?? syntheticOverlayTileAt(wx, wy, t);");
    expect(runtimeLoop).toContain(
      "deps.drawCenteredOverlayWithAlpha(overlay, px, py, size, deps.resourceOverlayScaleForTile(overlayTile), alpha);"
    );
  });
});
