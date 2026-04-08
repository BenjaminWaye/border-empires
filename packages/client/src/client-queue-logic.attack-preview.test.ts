import { describe, expect, it, vi, afterEach } from "vitest";
import { createInitialState } from "./client-state.js";
import { attackPreviewDetailForTarget, attackPreviewPendingForTarget, requestAttackPreviewForHover, requestAttackPreviewForTarget } from "./client-queue-logic.js";
import type { Tile } from "./client-types.js";

const makeTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  ...overrides
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attack preview prefetch and cache", () => {
  it("prefetches hovered hostile tiles before the action menu opens", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.hover = { x: 12, y: 8 };
    const origin = makeTile({ x: 11, y: 8, ownerId: "me" });
    const target = makeTile({ x: 12, y: 8, ownerId: "enemy" });
    state.tiles.set("11,8", origin);
    state.tiles.set("12,8", target);
    const send = vi.fn();

    requestAttackPreviewForHover(state, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as WebSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      pickOriginForTarget: () => origin
    });

    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: "ATTACK_PREVIEW", fromX: 11, fromY: 8, toX: 12, toY: 8 }));
  });

  it("reuses a fresh cached preview for the menu without waiting for another round-trip", () => {
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    const origin = makeTile({ x: 4, y: 7, ownerId: "me" });
    const target = makeTile({ x: 5, y: 7, ownerId: "enemy" });
    const preview = {
      fromKey: "4,7",
      toKey: "5,7",
      valid: true,
      winChance: 0.63,
      receivedAt: 4_500
    };
    state.attackPreviewCacheByKey.set("4,7->5,7", preview);
    const send = vi.fn();

    requestAttackPreviewForTarget(state, target, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as WebSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      pickOriginForTarget: () => origin
    });

    expect(send).not.toHaveBeenCalled();
    expect(state.attackPreview).toEqual(preview);
    expect(
      attackPreviewDetailForTarget(state, target, {
        keyFor: (x, y) => `${x},${y}`,
        pickOriginForTarget: () => origin
      })
    ).toBe("63% win chance");
  });

  it("marks a target as pending while the menu waits for preview data", () => {
    const state = createInitialState();
    const origin = makeTile({ x: 2, y: 3, ownerId: "me" });
    const target = makeTile({ x: 3, y: 3, ownerId: "enemy" });
    state.attackPreviewPendingKey = "2,3->3,3";

    expect(
      attackPreviewPendingForTarget(state, target, {
        keyFor: (x, y) => `${x},${y}`,
        pickOriginForTarget: () => origin
      })
    ).toBe(true);
  });
});
