import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { drawResourceOverlay2D, type ResourceOverlayDrawDeps } from "./client-resource-overlay-2d.js";

const image = { complete: true, naturalWidth: 64 } as unknown as HTMLImageElement;
const HOUR = 3_600_000;

const makeDeps = (over: Partial<ResourceOverlayDrawDeps> = {}) => {
  const clip = vi.fn();
  const ctx = {
    globalAlpha: 1,
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip,
    setLineDash: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn()
  };
  const deps: ResourceOverlayDrawDeps = {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    builtResourceOverlayForTile: () => image,
    resourceOverlayForTile: () => image,
    economicStructureOverlayAlpha: () => 0.8,
    drawCenteredOverlayWithAlpha: vi.fn(),
    resourceOverlayScaleForTile: () => 1.08,
    drawResourceCornerMarker: vi.fn(),
    resourceColor: () => "#fff",
    ...over
  };
  return { deps, clip };
};

const tile = (extra: Record<string, unknown>): Tile => ({ x: 1, y: 1, terrain: "LAND", resource: "FARM", ...extra }) as unknown as Tile;
const inFlight = (field: string, status: string): Record<string, unknown> => ({
  [field]: { ownerId: "me", type: "MINE", status, startedAt: Date.now() - HOUR, completesAt: Date.now() + 7 * HOUR }
});

describe("drawResourceOverlay2D", () => {
  it("draws an economic structure under construction through the construction renderer", () => {
    const { deps, clip } = makeDeps();
    expect(drawResourceOverlay2D(deps, tile(inFlight("economicStructure", "under_construction")), 0, 0, 40, 0)).toBe(true);
    expect(clip).toHaveBeenCalled();
    expect(deps.drawCenteredOverlayWithAlpha).not.toHaveBeenCalled();
    expect(deps.drawResourceCornerMarker).toHaveBeenCalledTimes(1);
  });

  it("keeps the flat translucent sprite for an active structure", () => {
    const { deps, clip } = makeDeps();
    drawResourceOverlay2D(deps, tile({ economicStructure: { ownerId: "me", type: "MINE", status: "active" } }), 0, 0, 40, 0);
    expect(clip).not.toHaveBeenCalled();
    expect(deps.drawCenteredOverlayWithAlpha).toHaveBeenCalledWith(image, 0, 0, 40, 1.08, 0.8);
  });

  it("does not turn a fort under construction into a construction-styled resource sprite", () => {
    const { deps, clip } = makeDeps();
    drawResourceOverlay2D(deps, tile({ fort: { ownerId: "me", status: "under_construction", variant: "FORT", startedAt: 0, completesAt: HOUR } }), 0, 0, 40, 0);
    expect(clip).not.toHaveBeenCalled();
    expect(deps.drawCenteredOverlayWithAlpha).toHaveBeenCalled();
  });

  it("draws a plain resource overlay (no built structure) at full alpha", () => {
    const { deps } = makeDeps({ builtResourceOverlayForTile: () => undefined });
    drawResourceOverlay2D(deps, tile({}), 0, 0, 40, 0);
    expect(deps.drawCenteredOverlayWithAlpha).toHaveBeenCalledWith(image, 0, 0, 40, 1.08, 1);
  });

  it("falls back to a marker when the sprite is not loaded, and reports false when there is no colour", () => {
    const loading = { complete: false, naturalWidth: 0 } as unknown as HTMLImageElement;
    const withColour = makeDeps({ resourceOverlayForTile: () => loading, builtResourceOverlayForTile: () => undefined });
    expect(drawResourceOverlay2D(withColour.deps, tile({}), 0, 0, 40, 0)).toBe(true);
    expect((withColour.deps.ctx as unknown as { fillRect: ReturnType<typeof vi.fn> }).fillRect).toHaveBeenCalledTimes(2);
    expect(withColour.deps.drawResourceCornerMarker).toHaveBeenCalledTimes(1);

    const noColour = makeDeps({ resourceOverlayForTile: () => loading, builtResourceOverlayForTile: () => undefined, resourceColor: () => undefined });
    expect(drawResourceOverlay2D(noColour.deps, tile({}), 0, 0, 40, 0)).toBe(false);
    expect(noColour.deps.drawResourceCornerMarker).not.toHaveBeenCalled();
  });
});
