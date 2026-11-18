import { describe, expect, it, vi } from "vitest";
import { drawSalvageDeliveries2D } from "./client-map-2d-salvage-delivery.js";
import {
  createInitialSalvageDeliveryFxState,
  recordSalvageDelivery,
  SALVAGE_DELIVERY_TOTAL_MS,
  SALVAGE_SHIP_DESCENT_MS,
  salvageDeliveryFinished,
  type SalvageDeliveryFxEntry
} from "./client-salvage-delivery-fx.js";

const delivery = (startedAt: number): SalvageDeliveryFxEntry => ({ x: 4, y: 7, startedAt, color: "#3366ff", marchers: [{ dx: 2, dy: 0 }] });

/** A 2D context that records which drawing calls were made. */
const recordingCtx = (): { ctx: CanvasRenderingContext2D; calls: string[] } => {
  const calls: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      return (...args: unknown[]) => { calls.push(`${prop}:${args.join(",")}`); };
    },
    set: (target, prop: string, value) => { target[prop] = value; return true; }
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
};

describe("one salvage delivery per Works at a time", () => {
  it("keeps the ship in flight when a second load ships before it has left, and starts a new one after", () => {
    const state = createInitialSalvageDeliveryFxState();
    expect(recordSalvageDelivery(state, "4,7", delivery(1_000))).toBe(true);
    expect(recordSalvageDelivery(state, "4,7", delivery(2_000))).toBe(false);
    expect(state.salvageDeliveryFxQueue).toHaveLength(1);
    expect(state.salvageDeliveryFxByKey.get("4,7")?.startedAt).toBe(1_000);
    expect(recordSalvageDelivery(state, "4,7", delivery(1_000 + SALVAGE_DELIVERY_TOTAL_MS))).toBe(true);
    expect(state.salvageDeliveryFxQueue).toHaveLength(2);
  });

  it("tells the 3D drain which queued deliveries are already over", () => {
    expect(salvageDeliveryFinished(1_000, 1_000 + SALVAGE_DELIVERY_TOTAL_MS - 1)).toBe(false);
    expect(salvageDeliveryFinished(1_000, 1_000 + SALVAGE_DELIVERY_TOTAL_MS)).toBe(true);
  });
});

describe("drawSalvageDeliveries2D", () => {
  it("draws each delivery round its Works' tile centre after the tile pass, then drops it once over", () => {
    const state = createInitialSalvageDeliveryFxState();
    recordSalvageDelivery(state, "4,7", delivery(0));
    const project = vi.fn((wx: number, wy: number) => ({ sx: wx * 100 + 50, sy: wy * 100 + 50 }));
    const live = recordingCtx();
    drawSalvageDeliveries2D(live.ctx, state, project, 40, SALVAGE_SHIP_DESCENT_MS * 0.5);
    expect(project).toHaveBeenCalledWith(4, 7);
    expect(live.calls.some((c) => c.startsWith("fill"))).toBe(true);
    // The ship's shadow sits on the Works' tile: its path starts near the tile centre (450, 750).
    const firstMove = live.calls.find((c) => c.startsWith("moveTo:"))!;
    const [mx] = firstMove.slice("moveTo:".length).split(",").map(Number);
    expect(Math.abs(mx! - 450)).toBeLessThan(40);

    const over = recordingCtx();
    drawSalvageDeliveries2D(over.ctx, state, project, 40, SALVAGE_DELIVERY_TOTAL_MS);
    expect(over.calls).toHaveLength(0);
    expect(state.salvageDeliveryFxByKey.size).toBe(0);
  });
});

describe("salvage delivery changelog", () => {
  it("ships in the player-facing changelog", async () => {
    const { CLIENT_CHANGELOG_ENTRIES } = await import("../client-changelog/client-changelog-data.js");
    expect(CLIENT_CHANGELOG_ENTRIES.some((entry) => entry.title === "Watch the Court's Ancillaries arrive")).toBe(true);
  });
});
