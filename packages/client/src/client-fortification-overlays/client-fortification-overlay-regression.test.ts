import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("fortification overlay asset wiring", () => {
  it("loads directional fortification ring overlays and uses them in the runtime loop", () => {
    const overlayImages = clientSource("../client-map-render/client-map-overlay-images.ts");
    const loop = clientSource("../client-runtime-loop.ts");

    expect(overlayImages).toContain('const fortRingOverlaySet = createDirectionalOverlaySet("fort-ring-overlay")');
    expect(overlayImages).toContain("FORT: fortRingOverlaySet, TITANIUM_BASTION: fortRingOverlaySet, THUNDER_BASTION: fortRingOverlaySet");
    expect(overlayImages).toContain('WOODEN_FORT: createDirectionalOverlaySet("wooden-fort-ring-overlay")');
    expect(overlayImages).toContain('SIEGE_OUTPOST: createDirectionalOverlaySet("siege-outpost-overlay", "static")');
    expect(overlayImages).toContain('RELAY_BEACON: createDirectionalOverlaySet("relay-beacon-overlay", "static")');
    expect(loop).toContain("const fortificationKind = fortificationOverlayKindForTile(t);");
    expect(loop).toContain("const opening = fortificationOpeningForTile(t, {");
    expect(loop).toContain("deps.fortificationOverlayImageFor(fortificationKind, opening)");
  });
});
