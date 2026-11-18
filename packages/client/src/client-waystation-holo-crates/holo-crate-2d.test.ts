import { describe, expect, it } from "vitest";
import { drawWaystation2D, drawWaystationOpening2D } from "../client-map-2d-waystation-overlay.js";
import { WAYSTATION_OPEN_TOTAL_MS } from "./holo-crate-open-fx.js";

// Counts canvas calls; gradients are stubbed.
const recorder = (): { ctx: CanvasRenderingContext2D; calls: string[] } => {
  const calls: string[] = [];
  const target: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(target, {
    get: (obj, key: string) => key in obj ? obj[key] : (...args: unknown[]) => { calls.push(`${key}:${args.map((a) => typeof a === "number" ? a.toFixed(1) : typeof a).join(",")}`); return { addColorStop: () => undefined }; },
    set: (obj, key: string, value) => { obj[key] = value; return true; }
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
};

describe("2D Holo-Locked Stack", () => {
  it("draws a dormant site and nothing for an activated one", () => {
    const dormant = recorder();
    drawWaystation2D(dormant.ctx, { x: 1, y: 1, waystation: { activated: false } }, 0, 0, 48, 0);
    expect(dormant.calls.length).toBeGreaterThan(40);
    const taken = recorder();
    drawWaystation2D(taken.ctx, { x: 1, y: 1, waystation: { activated: true } }, 0, 0, 48, 0);
    expect(taken.calls).toEqual([]);
  });

  it("keeps a remembered site identical frame to frame", () => {
    const a = recorder(), b = recorder();
    drawWaystation2D(a.ctx, { x: 1, y: 1, waystation: { activated: false } }, 0, 0, 48, 100, true);
    drawWaystation2D(b.ctx, { x: 1, y: 1, waystation: { activated: false } }, 0, 0, 48, 2100, true);
    expect(b.calls).toEqual(a.calls);
  });

  it("plays the opening for 10 s, then draws nothing", () => {
    const entry = { x: 1, y: 1, startedAt: 50_000 };
    const open = recorder();
    drawWaystationOpening2D(open.ctx, entry, 0, 0, 48, 0, 50_000 + 3000);
    expect(open.calls.some((c) => c.startsWith("createRadialGradient"))).toBe(true); // lit cavity and reward core
    const gone = recorder();
    drawWaystationOpening2D(gone.ctx, entry, 0, 0, 48, 0, 50_000 + WAYSTATION_OPEN_TOTAL_MS);
    expect(gone.calls).toEqual([]);
    const none = recorder();
    drawWaystationOpening2D(none.ctx, undefined, 0, 0, 48, 0, 0);
    expect(none.calls).toEqual([]);
  });
});
