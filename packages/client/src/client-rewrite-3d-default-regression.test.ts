import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d terrain default regression guard", () => {
  it("mounts the 3d terrain renderer by default; 2d only when ?renderer=2d is explicit", () => {
    const bootstrapSource = clientSource("./client-bootstrap.ts");
    // 3D is the default. bootstrap must wire shouldUseThreeTerrainRenderer
    // directly to prefersTrue3DRendererMode (which is true unless ?renderer=2d).
    expect(bootstrapSource).toContain("const shouldUseThreeTerrainRenderer = prefersTrue3DRendererMode;");
    // Guard against accidentally reverting to an opt-in pattern.
    expect(bootstrapSource).not.toContain("const defaultThreeTerrainRenderer = !rendererModeExplicitlySet;");
    expect(bootstrapSource).not.toContain('state.activeBackend === "gateway" && !rendererModeExplicitlySet');
  });
});
