import { CAPTURE_HOLD_MS } from "@border-empires/shared";
import { describe, expect, it, vi } from "vitest";
import { captureHoldRemainingFraction, drawCaptureHoldGarrison2D } from "./client-map-2d-capture-hold-overlay.js";
import type { Tile } from "./client-types.js";

const NOW = 1_000_000;
const tile = (overrides: Partial<Tile> = {}): Tile => ({ x: 1, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER", ...overrides });

const fakeCtx = () => {
  const calls = { fillRect: vi.fn(), arc: vi.fn() };
  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    arc: calls.arc, fillRect: calls.fillRect, lineWidth: 0, strokeStyle: "", fillStyle: ""
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
};

describe("2D capture-hold garrison", () => {
  it("reports how much of the hold is left", () => {
    expect(captureHoldRemainingFraction(tile({ captureHoldUntil: NOW + CAPTURE_HOLD_MS / 2 }), NOW)).toBeCloseTo(0.5, 5);
    expect(captureHoldRemainingFraction(tile({ captureHoldUntil: NOW - 1 }), NOW)).toBeUndefined();
    expect(captureHoldRemainingFraction(tile(), NOW)).toBeUndefined();
  });

  it("draws the soldier rank only while the tile is holding ground", () => {
    const held = fakeCtx();
    drawCaptureHoldGarrison2D(held.ctx, tile({ captureHoldUntil: NOW + 10_000 }), "#f00", 0, 0, 40, NOW);
    expect(held.calls.arc).toHaveBeenCalledTimes(3);
    const plain = fakeCtx();
    drawCaptureHoldGarrison2D(plain.ctx, tile(), "#f00", 0, 0, 40, NOW);
    expect(plain.calls.arc).not.toHaveBeenCalled();
  });
});
