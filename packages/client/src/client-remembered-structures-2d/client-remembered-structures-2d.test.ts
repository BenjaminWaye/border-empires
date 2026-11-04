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

const noInstallations: RememberedStructures2DDeps["resourceInstallations"] = {
  builtResourceOverlayForTile: () => undefined, drawCenteredOverlayWithAlpha: () => undefined,
  resourceOverlayScaleForTile: () => 1, economicStructureOverlayAlpha: () => 1
};

const deps = (drawTownOverlay = vi.fn(), resourceInstallations = noInstallations): RememberedStructures2DDeps => ({
  drawTownOverlay,
  fortificationOverlayImageFor: () => undefined,
  fortificationDeps: { tiles: new Map(), keyFor: (x, y) => `${x},${y}`, wrapX: (x) => x, wrapY: (y) => y },
  aetherTowerSprite: { ctx: recordingContext().ctx, sprite: undefined, structureAccentColor: (_id, fallback) => fallback },
  afcJoinDrop: createAfcJoinDropState(),
  resourceInstallations
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
    const wallClock = vi.spyOn(Date, "now");
    const draw = (ms: number): string[] => {
      now.mockReturnValue(ms);
      wallClock.mockReturnValue(ms);
      const { ctx, calls } = recordingContext();
      drawRememberedStructures2D(ctx, deps(), tile, 0, 0, 32);
      return calls;
    };
    try {
      const first = draw(1000);
      expect(first.length).toBeGreaterThan(0);
      expect(draw(9000)).toEqual(first);
    } finally { now.mockRestore(); wallClock.mockRestore(); }
  });

  it("draws no reveal ring on a remembered watchtower, even inside its frozen reveal window", () => {
    // Regression: the 2D watchtower timed its reveal ring off Date.now(), so a tower fogged mid-reveal kept pulsing.
    const draw = (tile: Tile): string[] => {
      const { ctx, calls } = recordingContext();
      drawRememberedStructures2D(ctx, deps(), tile, 0, 0, 32);
      return calls;
    };
    const quiet = draw({ x: 3, y: 4, terrain: "LAND", watchtower: { activated: true } });
    expect(draw({ x: 3, y: 4, terrain: "LAND", watchtower: { activated: true, revealUntil: Number.MAX_SAFE_INTEGER } })).toEqual(quiet);
  });

  it("draws a remembered resource installation (the live resource pass only runs in sight)", () => {
    // Regression: a mine/hydrogarden/rig on its resource vanished under fog in 2D while 3D kept it.
    const { ctx } = recordingContext();
    const image = { complete: true, naturalWidth: 64 } as HTMLImageElement;
    const drawCenteredOverlayWithAlpha = vi.fn();
    const installations = { ...noInstallations, builtResourceOverlayForTile: () => image, drawCenteredOverlayWithAlpha, economicStructureOverlayAlpha: () => 0.9 };
    const tile: Tile = { x: 1, y: 1, terrain: "LAND", resource: "IRON", economicStructure: { type: "MINE", status: "active", ownerId: "p2" } as NonNullable<Tile["economicStructure"]> };
    drawRememberedStructures2D(ctx, deps(vi.fn(), installations), tile, 0, 0, 32);
    expect(drawCenteredOverlayWithAlpha).toHaveBeenCalledWith(image, 0, 0, 32, 1, 0.9);
  });
});
