import { describe, expect, it, vi } from "vitest";
import { drawEconomicStructureOverlay2D, type EconomicOverlay2DDeps } from "./client-economic-overlay-2d.js";
import { DISTRICT_BUILDING_KINDS } from "../client-town-district/district-catalog.js";
import type { Tile } from "../client-types.js";

vi.mock("../client-renderer-mode.js", () => ({ isTrue3DRendererActive: () => true }));

const image = { complete: true, naturalWidth: 128 } as HTMLImageElement;

// Regression: town refineries (and Aegis Dome / Titanium Levy parts) are drawn
// by the true-3D district kit, but the 2D canvas pass still stamped their flat
// building art over the 3D model because isStructureHandledBy3D missed them.
describe("2D economic structure art in true-3D", () => {
  it.each(DISTRICT_BUILDING_KINDS.filter(kind => kind !== "OBSERVATORY"))("leaves %s to the 3D district model", kind => {
    const drawCenteredOverlay = vi.fn();
    const deps: EconomicOverlay2DDeps = {
      ctx: { strokeRect: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D,
      builtResourceOverlayForTile: () => undefined,
      structureOverlayImages: { [kind]: image },
      structureAccentColor: (_owner, fallback) => fallback,
      drawCenteredOverlay
    };
    const tile: Tile = { x: 4, y: 4, terrain: "LAND", ownerId: "p", economicStructure: { ownerId: "p", type: kind, status: "active" } } as Tile;
    drawEconomicStructureOverlay2D(deps, tile, 0, 0, 32, true);
    expect(drawCenteredOverlay).not.toHaveBeenCalled();
    expect(deps.ctx.strokeRect).not.toHaveBeenCalled();
  });
});
