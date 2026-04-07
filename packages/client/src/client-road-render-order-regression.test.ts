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
    const source = clientSource("./client-runtime-loop.ts");
    expect(source).toContain("const overlayTiles: VisibleRenderTile[] = [];");
    expect(source).toContain("for (const { wk, px, py, vis, t } of overlayTiles)");
    expect(source).toContain("for (const overlayTile of overlayTiles) renderOverlayTile(overlayTile);");
    expect(source.indexOf("for (const { wk, px, py, vis, t } of overlayTiles)")).toBeLessThan(
      source.indexOf("for (const overlayTile of overlayTiles) renderOverlayTile(overlayTile);")
    );
  });
});
