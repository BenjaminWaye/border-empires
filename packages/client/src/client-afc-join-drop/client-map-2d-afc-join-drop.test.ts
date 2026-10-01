import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { createAfcJoinDropState, type AfcJoinDropState } from "./client-afc-join-drop-state.js";
import { AFC_JOIN_DESCENT_MS, AFC_JOIN_TOTAL_MS } from "./client-afc-join-drop-timeline.js";
import { drawAfcTile2D } from "./client-map-2d-afc-join-drop.js";

// A recording 2D context: every method is a spy and every property assignment is accepted, so we can assert "drew something / drew nothing".
const recordingCtx = () => {
  const calls: string[] = [];
  const gradient = { addColorStop: vi.fn() };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get: (_t, prop: string) => {
      if (prop === "createRadialGradient" || prop === "createLinearGradient") return () => gradient;
      return (..._args: unknown[]) => { calls.push(prop); };
    },
    set: () => true
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
};

const tile = { x: 10, y: 10, afc: { ownerId: "p1", status: "active" } } as Pick<Tile, "x" | "y" | "afc">;
const dropIn = (patch: Partial<AfcJoinDropState>): AfcJoinDropState => ({ ...createAfcJoinDropState(), x: 10, y: 10, ...patch });

describe("drawAfcTile2D", () => {
  it("draws the plain AFC glyph when no drop targets the tile", () => {
    const { ctx, calls } = recordingCtx();
    drawAfcTile2D(ctx, tile, 0, 0, 40, 1000, undefined, createAfcJoinDropState());
    expect(calls).toContain("ellipse");
    expect(calls).toContain("fill");
  });

  it("draws the plain glyph for a different tile while a drop is waiting elsewhere", () => {
    const { ctx, calls } = recordingCtx();
    drawAfcTile2D(ctx, { ...tile, x: 11 }, 0, 0, 40, 1000, undefined, dropIn({ phase: "waiting" }));
    expect(calls.length).toBeGreaterThan(0);
  });

  it("draws nothing while the drop is waiting: the AFC has not landed yet", () => {
    const { ctx, calls } = recordingCtx();
    drawAfcTile2D(ctx, tile, 0, 0, 40, 1000, undefined, dropIn({ phase: "waiting" }));
    expect(calls).toEqual([]);
  });

  it("draws the descending hull, target ring and streak mid-drop", () => {
    const { ctx, calls } = recordingCtx();
    drawAfcTile2D(ctx, tile, 0, 0, 40, 1000 + 1500, undefined, dropIn({ phase: "playing", startedAt: 1000 }));
    expect(calls).toContain("setLineDash");
    expect(calls).toContain("fillRect");
  });

  it("draws the landed AFC plus touchdown effects after landing, and stops the effects when the drop ends", () => {
    const landed = recordingCtx();
    drawAfcTile2D(landed.ctx, tile, 0, 0, 40, 1000 + AFC_JOIN_DESCENT_MS + 500, undefined, dropIn({ phase: "playing", startedAt: 1000, revealed: true }));
    const done = recordingCtx();
    drawAfcTile2D(done.ctx, tile, 0, 0, 40, 1000 + AFC_JOIN_TOTAL_MS + 1, undefined, dropIn({ phase: "playing", startedAt: 1000, revealed: true }));
    expect(landed.calls.length).toBeGreaterThan(done.calls.length);
  });
});
