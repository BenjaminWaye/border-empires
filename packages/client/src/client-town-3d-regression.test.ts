import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d town rendering regression guard", () => {
  it("keeps svg town overlays active in true 3d mode", () => {
    const map3dSource = clientSource("./client-map-3d.ts");
    expect(map3dSource).not.toContain("createClientThreeTownLayer");
    const source = clientSource("./client-runtime-loop.ts");
    expect(source).toContain(
      'overlayTile && overlayVisible && overlayTile.town && overlayTile.terrain === "LAND") deps.drawTownOverlay(overlayTile, px, py, size);'
    );
  });
});
