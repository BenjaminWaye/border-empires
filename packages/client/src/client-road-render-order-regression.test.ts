import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("road render ordering regression guard", () => {
  it("renders roads in a dedicated pass before tile overlays", () => {
    const frame = clientSource("./client-runtime-frame.ts");
    expect(frame).toContain("const overlayTiles: VisibleRenderTile[] = [];");
    expect(frame).toContain("drawRuntimeRoadPass(state, deps, overlayTiles, runtimeState.roadNetwork);");
    expect(frame).toContain("for (const overlayTile of overlayTiles) {");
    expect(frame.indexOf("drawRuntimeRoadPass(state, deps, overlayTiles, runtimeState.roadNetwork);")).toBeLessThan(
      frame.indexOf("for (const overlayTile of overlayTiles) {")
    );
  });
});
