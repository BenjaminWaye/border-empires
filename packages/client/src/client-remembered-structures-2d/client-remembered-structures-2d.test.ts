import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { createAfcJoinDropState } from "../client-afc-join-drop/client-afc-join-drop-state.js";
import { REMEMBERED_STRUCTURE_ALPHA_2D, drawRememberedStructures2D, type RememberedStructures2DDeps } from "./client-remembered-structures-2d.js";

// Records every canvas call with the alpha it ran at, so two draws can be compared.
const recordingContext = (): { ctx: CanvasRenderingContext2D; calls: string[] } => {
  const calls: string[] = [];
  const stack: number[] = [];
  const target: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(target, {
    get: (obj, key: string) => {
      if (key in obj) return obj[key];
      return (...args: unknown[]) => {
        if (key === "save") stack.push(obj.globalAlpha as number);
        if (key === "restore") obj.globalAlpha = stack.pop() ?? 1;
        calls.push(`${key}(${args.map((a) => (typeof a === "number" ? a.toFixed(3) : typeof a)).join(",")})@${(obj.globalAlpha as number).toFixed(2)}`);
        return { addColorStop: () => undefined };
      };
    },
    set: (obj, key: string, value) => { obj[key] = value; calls.push(`${key}=${String(value)}`); return true; }
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
};

const deps = (drawTownOverlay = vi.fn()): RememberedStructures2DDeps => ({
  drawTownOverlay,
  fortificationOverlayImageFor: () => undefined,
  fortificationDeps: { tiles: new Map(), keyFor: (x, y) => `${x},${y}`, wrapX: (x) => x, wrapY: (y) => y },
  aetherTowerSprite: { ctx: recordingContext().ctx, sprite: undefined, structureAccentColor: (_id, fallback) => fallback },
  afcJoinDrop: createAfcJoinDropState()
});

describe("remembered buildings on fogged 2D tiles", () => {
  it("draws the last-seen town faded", () => {
    const { ctx } = recordingContext();
    let alphaAtDraw = 0;
    const drawTown = vi.fn(() => { alphaAtDraw = ctx.globalAlpha; });
    const tile: Tile = { x: 1, y: 1, terrain: "LAND", town: { type: "MARKET", populationTier: "TOWN" } as NonNullable<Tile["town"]> };
    drawRememberedStructures2D(ctx, deps(drawTown), tile, 0, 0, 32);
    expect(drawTown).toHaveBeenCalledWith(tile, 0, 0, 32);
    expect(alphaAtDraw).toBeCloseTo(REMEMBERED_STRUCTURE_ALPHA_2D);
    expect(ctx.globalAlpha).toBe(1);
  });

  it("draws watchtowers, waystations and AFCs standing still, whatever the time", () => {
    const tile: Tile = {
      x: 3, y: 4, terrain: "LAND", watchtower: { activated: false }, waystation: { activated: false } as NonNullable<Tile["waystation"]>,
      afc: { ownerId: "p2", status: "active", modules: ["trade"] }
    };
    const now = vi.spyOn(performance, "now");
    const draw = (ms: number): string[] => {
      now.mockReturnValue(ms);
      const { ctx, calls } = recordingContext();
      drawRememberedStructures2D(ctx, deps(), tile, 0, 0, 32);
      return calls;
    };
    try {
      const first = draw(1000);
      expect(first.length).toBeGreaterThan(0);
      expect(draw(9000)).toEqual(first);
    } finally { now.mockRestore(); }
  });
});
