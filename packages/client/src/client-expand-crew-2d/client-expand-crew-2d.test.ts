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

// Records the claim fill (translucent rects) and each soldier glyph's helmet
// (the one arc a glyph draws), which marks where the soldier stands.
const fakeCtx = () => {
  const fills: Array<{ x: number; y: number; w: number; h: number; fill: string }> = [];
  const helmets: Array<{ x: number; y: number; fill: string }> = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect(x: number, y: number, w: number, h: number) {
      if (this.globalAlpha < 1) fills.push({ x, y, w, h, fill: String(this.fillStyle) });
    },
    arc(x: number, y: number) {
      helmets.push({ x, y, fill: String(this.fillStyle) });
    }
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, helmets };
};

const NOW = 1_000_000;
const SIZE = 32;

describe("drawExpandCrews2D", () => {
  it("draws two soldiers walking out of the origin tile at the start of a manual EXPAND", () => {
    const state = createState({
      capture: { startAt: NOW, resolvesAt: NOW + 7_500, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "EXPAND" }
    });
    const { ctx, fills, helmets } = fakeCtx();
    drawExpandCrews2D(state, keyFor, worldToScreen, ctx, "#00ff00", SIZE, 0, 0, NOW, true);

    expect(helmets).toHaveLength(2);
    // On the origin tile (x 4 → screen 128..160), in this player's colour.
    for (const h of helmets) {
      expect(h.x).toBeLessThan(5 * SIZE);
      expect(h.fill).toBe("#00ff00");
    }
    // No fill until they've walked in.
    expect(fills).toHaveLength(0);
  });

  it("patrols the target and fills the claim once they've walked in", () => {
    const state = createState({
      capture: { startAt: NOW - 5_000, resolvesAt: NOW + 2_500, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "EXPAND" }
    });
    const { ctx, fills, helmets } = fakeCtx();
    drawExpandCrews2D(state, keyFor, worldToScreen, ctx, "#00ff00", SIZE, 0, 0, NOW, true);

    expect(helmets).toHaveLength(2);
    for (const h of helmets) {
      expect(h.x).toBeGreaterThan(5 * SIZE);
      expect(h.x).toBeLessThan(6 * SIZE);
    }
    expect(fills).toHaveLength(1);
    expect(fills[0]!.x).toBeGreaterThanOrEqual(5 * SIZE);
    expect(fills[0]!.x + fills[0]!.w).toBeLessThanOrEqual(6 * SIZE);
  });

  // Regression: the fill used the raw playerColors entry, so with the
  // diplomacy lens on it didn't match the player's surrounding territory.
  it("fills with the colour the 2D map draws this player's territory in", () => {
    const state = createState({
      capture: { startAt: NOW - 5_000, resolvesAt: NOW + 2_500, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "EXPAND" }
    });
    const { ctx, fills } = fakeCtx();
    drawExpandCrews2D(state, keyFor, worldToScreen, ctx, "#abcdef", SIZE, 0, 0, NOW, true);
    expect(fills.map((r) => r.fill)).toEqual(["#abcdef"]);
  });

  it("skips the soldiers on tiles too small to read, like the Planetary Defense patrol", () => {
    const state = createState({
      capture: { startAt: NOW - 5_000, resolvesAt: NOW + 2_500, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "EXPAND" }
    });
    const { ctx, fills, helmets } = fakeCtx();
    drawExpandCrews2D(state, keyFor, worldToScreen, ctx, "#00ff00", 8, 0, 0, NOW, true);
    expect(helmets).toHaveLength(0);
    expect(fills).toHaveLength(1);
  });

  it("draws nothing for an ATTACK on frontier ground", () => {
    const state = createState({
      capture: { startAt: NOW, resolvesAt: NOW + 5_000, target: { x: 5, y: 5 }, actionType: "ATTACK" },
      tiles: new Map([["5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "enemy", ownershipState: "FRONTIER" }]])
    });
    const { ctx, fills, helmets } = fakeCtx();
    drawExpandCrews2D(state, keyFor, worldToScreen, ctx, "#00ff00", SIZE, 0, 0, NOW, true);
    expect(fills).toHaveLength(0);
    expect(helmets).toHaveLength(0);
  });
});
