import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("rewrite renderer default regression guard", () => {
  it("defaults gateway backend sessions to 3d terrain unless renderer is explicitly overridden", () => {
    const bootstrapSource = clientSource("./client-bootstrap.ts");
    expect(bootstrapSource).toContain('const prefersRewrite3DDefault = state.activeBackend === "gateway" && !rendererModeExplicitlySet;');
    expect(bootstrapSource).toContain('window.location.hostname === "localhost"');
    expect(bootstrapSource).toContain(
      "const shouldUseThreeTerrainRenderer = prefersTrue3DRendererMode || prefersRewrite3DDefault || localhost3DDefault;"
    );
  });
});
