import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { drawFortificationOverlay2D } from "./client-fortification-overlay-2d-draw.js";

const image = { complete: true, naturalWidth: 64 } as unknown as HTMLImageElement;
const HOUR = 3_600_000;
const deps = { tiles: new Map<string, Tile>(), keyFor: (x: number, y: number) => `${x},${y}`, wrapX: (x: number) => x, wrapY: (y: number) => y };

const fakeCtx = () => {
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn()
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx };
};

const beacon = (extra: Record<string, unknown>): Tile =>
  ({ x: 1, y: 1, terrain: "LAND", economicStructure: { ownerId: "me", type: "RELAY_BEACON", ...extra } }) as unknown as Tile;

describe("drawFortificationOverlay2D relay beacon construction", () => {
  it("draws a beacon being built through the construction renderer (clipped phase fill, crew)", () => {
    const { ctx, raw } = fakeCtx();
    const tile = beacon({ status: "under_construction", startedAt: Date.now() - HOUR, completesAt: Date.now() + 7 * HOUR });
    drawFortificationOverlay2D(ctx, tile, "RELAY_BEACON", image, 0, 0, 40, deps, 0);
    expect(raw.clip).toHaveBeenCalledTimes(1);
    expect(raw.fillRect).toHaveBeenCalled(); // crates + crew
  });

  it("also covers a beacon being removed", () => {
    const { ctx, raw } = fakeCtx();
    const tile = beacon({ status: "removing", startedAt: Date.now() - HOUR, completesAt: Date.now() + 7 * HOUR });
    drawFortificationOverlay2D(ctx, tile, "RELAY_BEACON", image, 0, 0, 40, deps, 0);
    expect(raw.clip).toHaveBeenCalledTimes(1);
  });

  it("keeps the flat translucent draw for an active beacon", () => {
    const { ctx, raw } = fakeCtx();
    drawFortificationOverlay2D(ctx, beacon({ status: "active" }), "RELAY_BEACON", image, 0, 0, 40, deps, 0);
    expect(raw.clip).not.toHaveBeenCalled();
    expect(raw.drawImage).toHaveBeenCalledTimes(1);
  });

  it("does not animate an instantly placed beacon (zero-length window)", () => {
    const { ctx, raw } = fakeCtx();
    const now = Date.now();
    drawFortificationOverlay2D(ctx, beacon({ status: "under_construction", startedAt: now, completesAt: now }), "RELAY_BEACON", image, 0, 0, 40, deps, 0);
    expect(raw.clip).not.toHaveBeenCalled();
    expect(raw.drawImage).toHaveBeenCalledTimes(1);
  });

  it("leaves siege camps under construction flat until their own follow-up", () => {
    const { ctx, raw } = fakeCtx();
    const tile = { x: 1, y: 1, terrain: "LAND", siegeOutpost: { ownerId: "me", status: "under_construction", variant: "SIEGE_OUTPOST", startedAt: Date.now() - HOUR, completesAt: Date.now() + HOUR } } as unknown as Tile;
    drawFortificationOverlay2D(ctx, tile, "SIEGE_OUTPOST", image, 0, 0, 40, deps, 0);
    expect(raw.clip).not.toHaveBeenCalled();
    expect(raw.drawImage).toHaveBeenCalledTimes(1);
  });
});

describe("drawFortificationOverlay2D fort construction", () => {
  const fort = (extra: Record<string, unknown>): Tile =>
    ({ x: 1, y: 1, terrain: "LAND", fort: { ownerId: "me", variant: "FORT", ...extra } }) as unknown as Tile;
  const window = () => ({ startedAt: Date.now() - HOUR, completesAt: Date.now() + 7 * HOUR });

  it("draws a fort being built through the phased renderer", () => {
    const { ctx, raw } = fakeCtx();
    drawFortificationOverlay2D(ctx, fort({ status: "under_construction", ...window() }), "FORT", image, 0, 0, 40, deps, 0);
    expect(raw.clip).toHaveBeenCalledTimes(1);
    expect(raw.fillRect).toHaveBeenCalled(); // crates + crew
  });

  it("draws a fort being removed through the phased renderer", () => {
    const { ctx, raw } = fakeCtx();
    drawFortificationOverlay2D(ctx, fort({ status: "removing", ...window() }), "FORT", image, 0, 0, 40, deps, 0);
    expect(raw.clip).toHaveBeenCalledTimes(1);
  });

  it("covers every fort tier", () => {
    for (const kind of ["WOODEN_FORT", "TITANIUM_BASTION", "THUNDER_BASTION"] as const) {
      const { ctx, raw } = fakeCtx();
      drawFortificationOverlay2D(ctx, fort({ status: "under_construction", variant: kind, ...window() }), kind, image, 0, 0, 40, deps, 0);
      expect(raw.clip).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps an upgrading fort fully drawn (it is still defending) and only adds the crates and crew", () => {
    const { ctx, raw } = fakeCtx();
    drawFortificationOverlay2D(ctx, fort({ status: "under_construction", upgradingFrom: "WOODEN_FORT", ...window() }), "WOODEN_FORT", image, 0, 0, 40, deps, 0);
    expect(raw.clip).not.toHaveBeenCalled(); // no phase clipping of the standing fort
    expect(raw.drawImage).toHaveBeenCalledTimes(1); // the standing sprite, once
    expect(raw.fillRect).toHaveBeenCalled(); // crates + crew on top
  });

  it("does not animate an active fort", () => {
    const { ctx, raw } = fakeCtx();
    drawFortificationOverlay2D(ctx, fort({ status: "active" }), "FORT", image, 0, 0, 40, deps, 0);
    expect(raw.clip).not.toHaveBeenCalled();
    expect(raw.fillRect).not.toHaveBeenCalled();
  });
});
