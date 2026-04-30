import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d terrain default regression guard", () => {
  it("defaults all sessions to 3d terrain unless renderer is explicitly overridden", () => {
    const bootstrapSource = clientSource("./client-bootstrap.ts");
    expect(bootstrapSource).toContain("const defaultThreeTerrainRenderer = !rendererModeExplicitlySet;");
    expect(bootstrapSource).toContain("const shouldUseThreeTerrainRenderer = prefersTrue3DRendererMode || defaultThreeTerrainRenderer;");
    expect(bootstrapSource).not.toContain('state.activeBackend === "gateway" && !rendererModeExplicitlySet');
  });
});
