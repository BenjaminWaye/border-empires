import { describe, expect, it } from "vitest";
import { drawExpandCrews2D } from "./client-expand-crew-2d.js";
import type { ClientState } from "../client-state/client-state.js";

const keyFor = (x: number, y: number) => `${x},${y}`;
const worldToScreen = (x: number, y: number, size: number) => ({ sx: (x + 0.5) * size, sy: (y + 0.5) * size });

const createState = (overrides: Partial<ClientState>): ClientState =>
  ({
    me: "me",
    playerColors: new Map([["me", "#00ff00"]]),
    outgoingMusterAttacksByTile: new Map(),
    incomingAttacksByTile: new Map(),
    capture: undefined,
    tiles: new Map(),
    ...overrides
  }) as unknown as ClientState;

const fakeCtx = () => {
  const rects: Array<{ x: number; y: number; w: number; h: number; fill: string; alpha: number }> = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    save: () => {},
    restore: () => {},
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fill: String(this.fillStyle), alpha: this.globalAlpha });
    }
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
};

describe("drawExpandCrews2D", () => {
  it("draws the crew walking out of the origin tile at the start of a manual EXPAND", () => {
    const now = 1_000_000;
    const state = createState({
      capture: { startAt: now, resolvesAt: now + 7_500, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "EXPAND" }
    });
    const { ctx, rects } = fakeCtx();
    // Date.now()-based collection: pass a clock the claim is live at.
    drawExpandCrews2D(state, keyFor, worldToScreen, ctx, 32, 0, 0, now, true);

    const dots = rects.filter((r) => r.fill.startsWith("rgba(6, 8, 12"));
    expect(dots).toHaveLength(4);
    // On the origin tile (x 4 → screen 128..160), not yet on the target.
    for (const d of dots) expect(d.x).toBeLessThan(5 * 32);
    // No fill until they've staked the tile.
    expect(rects.filter((r) => r.fill === "#00ff00")).toHaveLength(0);
  });

  it("fills the claim from the crew's stake once they've walked in", () => {
    const now = 1_000_000;
    const state = createState({
      capture: { startAt: now - 5_000, resolvesAt: now + 2_500, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "EXPAND" }
    });
    const { ctx, rects } = fakeCtx();
    drawExpandCrews2D(state, keyFor, worldToScreen, ctx, 32, 0, 0, now, true);

    const fills = rects.filter((r) => r.fill === "#00ff00");
    expect(fills).toHaveLength(1);
    expect(fills[0]!.x).toBeGreaterThanOrEqual(5 * 32);
    expect(fills[0]!.x + fills[0]!.w).toBeLessThanOrEqual(6 * 32);
  });

  it("draws nothing for an ATTACK on frontier ground", () => {
    const now = 1_000_000;
    const state = createState({
      capture: { startAt: now, resolvesAt: now + 5_000, target: { x: 5, y: 5 }, actionType: "ATTACK" },
      tiles: new Map([["5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "enemy", ownershipState: "FRONTIER" }]])
    });
    const { ctx, rects } = fakeCtx();
    drawExpandCrews2D(state, keyFor, worldToScreen, ctx, 32, 0, 0, now, true);
    expect(rects).toHaveLength(0);
  });
});
