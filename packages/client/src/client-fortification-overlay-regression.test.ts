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
    const render = clientSource("./client-map-render.ts");
    const loop = clientSource("./client-runtime-tile-render.ts");

    expect(render).toContain('FORT: createDirectionalOverlaySet("fort-ring-overlay")');
    expect(render).toContain('WOODEN_FORT: createDirectionalOverlaySet("wooden-fort-ring-overlay")');
    expect(render).toContain('SIEGE_OUTPOST: createDirectionalOverlaySet("siege-outpost-overlay", "static")');
    expect(render).toContain('LIGHT_OUTPOST: createDirectionalOverlaySet("light-outpost-overlay", "static")');
    expect(loop).toContain("const fortificationKind = fortificationOverlayKindForTile(t);");
    expect(loop).toContain("const opening = fortificationOpeningForTile(t, {");
    expect(loop).toContain("deps.fortificationOverlayImageFor(fortificationKind, opening)");
  });
});
