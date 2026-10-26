import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORTIFICATION_OPENINGS, fortificationOpeningSides } from "./client-fortification-overlays.js";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("fortification overlay asset wiring", () => {
  it("loads directional fortification ring overlays and uses them in the runtime loop", () => {
    const overlayImages = clientSource("../client-map-render/client-map-overlay-images.ts");
    const loop = clientSource("../client-runtime-loop.ts");
    const draw2D = clientSource("./client-fortification-overlay-2d-draw.ts");

    expect(overlayImages).toContain('const fortRingOverlaySet = createDirectionalOverlaySet("fort-ring-overlay")');
    expect(overlayImages).toContain("FORT: fortRingOverlaySet, TITANIUM_BASTION: fortRingOverlaySet, THUNDER_BASTION: fortRingOverlaySet");
    expect(overlayImages).toContain('PALISADE: createDirectionalOverlaySet("palisade-ring-overlay")');
    expect(overlayImages).toContain('SIEGE_BATTERY: createDirectionalOverlaySet("siege-battery-overlay", "static")');
    expect(overlayImages).toContain('RELAY_BEACON: createDirectionalOverlaySet("relay-beacon-overlay", "static")');
    expect(loop).toContain("drawTileFortificationOverlays2D(deps.ctx, t, px, py, size,");
    expect(loop).toContain("deps.fortificationOverlayImageFor);");
    expect(draw2D).toContain("const kind = fortificationOverlayKindForTile(tile);");
    expect(draw2D).toContain("overlayImageFor(kind, fortificationOpeningForTile(tile, deps))");
    expect(draw2D).toContain('overlayImageFor("RELAY_BEACON", "CLOSED")');
  });

  it("ships a ring sprite for every combination of open sides", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const overlaysDir = resolve(here, "../../public/overlays");
    for (const prefix of ["fort-ring-overlay", "palisade-ring-overlay"]) {
      for (const opening of FORTIFICATION_OPENINGS) {
        const sides = fortificationOpeningSides(opening).map((side) => side.toLowerCase()).join("-");
        const filename = opening === "CLOSED" ? `${prefix}-closed.svg` : `${prefix}-open-${sides}.svg`;
        expect(existsSync(resolve(overlaysDir, filename)), filename).toBe(true);
      }
    }
  });
});
