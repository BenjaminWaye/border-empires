import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { setTrue3DRendererActive } from "../client-renderer-mode.js";
import { drawVisibleTerrain2D } from "./client-map-render-visible-terrain.js";

vi.mock("./client-map-render.js", () => ({ useTerrainReliefRenderer: false, terrainReliefPx: () => 0 }));
vi.mock("./client-map-render-terrain-relief.js", () => ({ useTerrainReliefRenderer: false }));
vi.mock("./client-map-render-river-edges.js", () => ({ drawRiverEdges: () => undefined }));

const render = (ownerId?: string, resource?: Tile["resource"]): string[] => {
  const calls: string[] = [];
  const ctx = {
    save: () => undefined, restore: () => undefined,
    beginPath: () => undefined, arc: () => undefined,
    fill: () => calls.push("fleck"), fillRect: () => calls.push("ownership")
  } as unknown as CanvasRenderingContext2D;
  setTrue3DRendererActive(false);
  drawVisibleTerrain2D({
    ctx, effectiveOverlayColor: () => "#ff0000",
    drawForestOverlay: () => { calls.push("forest"); },
    drawHillsOverlay: () => { calls.push("hills"); }
  }, { techIds: [], techCatalog: [] }, {
    x: 5, y: 9, terrain: "LAND", ownershipState: "SETTLED", ...(ownerId ? { ownerId } : {}),
    prospectSignature: "FERROUS_DUST", ...(resource ? { resource } : {})
  }, 5, 9, 0, 0, 48);
  return calls;
};

describe("2D visible terrain prospect layering", () => {
  it("paints ore flecks after hill details and the ownership fill", () => {
    const calls = render("owner");
    expect(calls.slice(0, 3)).toEqual(["forest", "hills", "ownership"]);
    expect(calls.slice(3).length).toBeGreaterThan(0);
    expect(calls.slice(3).every((call) => call === "fleck")).toBe(true);
  });

  it("also paints clues on unowned ground, but excludes resource tiles", () => {
    expect(render()).toContain("fleck");
    expect(render("owner", "IRON")).toEqual(["forest", "hills", "ownership"]);
  });
});
