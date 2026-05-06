import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d terrain opt-in regression guard", () => {
  it("only mounts the 3d terrain renderer when ?renderer=3d is explicit", () => {
    const bootstrapSource = clientSource("./client-bootstrap.ts");
    // 3D renderer mounts iff prefersTrue3DRendererMode (i.e. ?renderer=3d).
    // No default-on path: bootstrap must NOT mount 3D when the user hasn't
    // explicitly asked for it.
    expect(bootstrapSource).toContain("const shouldUseThreeTerrainRenderer = prefersTrue3DRendererMode;");
    expect(bootstrapSource).not.toContain("const defaultThreeTerrainRenderer = !rendererModeExplicitlySet;");
    expect(bootstrapSource).not.toContain("prefersTrue3DRendererMode || defaultThreeTerrainRenderer");
    // The old gateway-only opt-in pattern must also stay out of bootstrap.
    expect(bootstrapSource).not.toContain('state.activeBackend === "gateway" && !rendererModeExplicitlySet');
  });
});
