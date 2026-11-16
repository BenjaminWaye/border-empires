import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { drawDockEndpoint2D, type DockEndpoint2DDeps } from "./client-dock-endpoint-2d.js";

const sprite = (name: string): HTMLImageElement => ({ name, complete: true, naturalWidth: 128 }) as unknown as HTMLImageElement;

const drawnSpriteFor = (water: { x: number; y: number }): string => {
  const tiles = new Map<string, Tile>();
  for (let y = 8; y <= 12; y += 1) for (let x = 8; x <= 12; x += 1) tiles.set(`${x},${y}`, { x, y, terrain: "LAND" });
  tiles.set(`${water.x},${water.y}`, { x: water.x, y: water.y, terrain: "SEA" });
  const drawCenteredOverlay = vi.fn();
  const deps: DockEndpoint2DDeps = {
    ctx: {} as CanvasRenderingContext2D,
    dockOverlayVariants: ["south", "east", "north", "west"].map(sprite),
    drawDockMarker: () => undefined,
    drawCenteredOverlay
  };
  drawDockEndpoint2D(deps, 10, 10, 0, 0, 32, tiles);
  return (drawCenteredOverlay.mock.calls[0]![0] as { name: string }).name;
};

describe("2D dock endpoint", () => {
  it("draws the sprite turned toward the dock's water, as the 3D quay is", () => {
    // Regression: the sprite was picked by a tile hash, so a dock with water to
    // the north could show its pier and carrier pointing inland.
    expect(drawnSpriteFor({ x: 10, y: 11 })).toBe("south");
    expect(drawnSpriteFor({ x: 11, y: 10 })).toBe("east");
    expect(drawnSpriteFor({ x: 10, y: 9 })).toBe("north");
    expect(drawnSpriteFor({ x: 9, y: 10 })).toBe("west");
  });
});
