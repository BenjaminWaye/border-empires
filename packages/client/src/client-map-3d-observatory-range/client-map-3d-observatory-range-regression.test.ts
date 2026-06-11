import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d observatory range regression", () => {
  it("renders selected observatory ranges in the 3d scene instead of the flat canvas overlay", () => {
    const map3dSource = clientSource("../client-map-3d/client-map-3d.ts");
    const runtimeLoopSource = clientSource("../client-runtime-loop.ts");

    expect(map3dSource).toContain("syncObservatoryRangeMarkers");
    expect(map3dSource).toContain("writeObservatoryRangeBorderGeometry");
    expect(map3dSource).toContain("writeObservatoryRangeFillGeometry");
    expect(runtimeLoopSource).toContain("if (!isTrue3DRendererActive() && selectedWorld && selectedWorld.observatory)");
  });
});
