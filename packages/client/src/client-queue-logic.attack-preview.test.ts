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

const expectAttackPreviewRequest = (
  send: ReturnType<typeof vi.fn>,
  expected: { fromX: number; fromY: number; toX: number; toY: number; requestId?: string }
): string => {
  expect(send).toHaveBeenCalled();
  const raw = send.mock.calls.at(-1)?.[0];
  expect(typeof raw).toBe("string");
  const parsed = JSON.parse(raw as string) as {
    type?: string;
    fromX?: number;
    fromY?: number;
    toX?: number;
    toY?: number;
    requestId?: string;
  };
  expect(parsed).toMatchObject({
    type: "ATTACK_PREVIEW",
    fromX: expected.fromX,
    fromY: expected.fromY,
    toX: expected.toX,
    toY: expected.toY
  });
  expect(typeof parsed.requestId).toBe("string");
  expect(parsed.requestId).not.toBe("");
  if (expected.requestId) expect(parsed.requestId).toBe(expected.requestId);
  return parsed.requestId ?? "";
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
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

    expectAttackPreviewRequest(send, { fromX: 11, fromY: 8, toX: 12, toY: 8 });
  });

  it("ignores a fresh cached preview when the action menu requests current odds", () => {
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

    const requestId = expectAttackPreviewRequest(send, { fromX: 4, fromY: 7, toX: 5, toY: 7 });
    expect(state.attackPreviewPendingKey).toBe("4,7->5,7");
    expect(state.attackPreviewPendingRequestId).toBe(requestId);
    expect(state.attackPreview).toBeUndefined();
    expect(state.attackPreviewCacheByKey.has("4,7->5,7")).toBe(false);
    expect(
      attackPreviewDetailForTarget(state, target, {
        keyFor: (x, y) => `${x},${y}`,
        pickOriginForTarget: () => origin
      })
    ).toBeUndefined();
  });

  it("reuses a fresh cached preview for hover prefetch", () => {
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.hover = { x: 5, y: 7 };
    const origin = makeTile({ x: 4, y: 7, ownerId: "me" });
    const target = makeTile({ x: 5, y: 7, ownerId: "enemy" });
    const preview = {
      fromKey: "4,7",
      toKey: "5,7",
      valid: true,
      winChance: 0.63,
      receivedAt: 4_500
    };
    state.tiles.set("4,7", origin);
    state.tiles.set("5,7", target);
    state.attackPreviewCacheByKey.set("4,7->5,7", preview);
    const send = vi.fn();

    requestAttackPreviewForHover(state, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as WebSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      pickOriginForTarget: () => origin
    });

    expect(send).not.toHaveBeenCalled();
    expect(state.attackPreview).toEqual(preview);
  });

  it("menu requests supersede an in-flight hover preview for the same attack key", () => {
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    const origin = makeTile({ x: 4, y: 7, ownerId: "me" });
    const target = makeTile({ x: 5, y: 7, ownerId: "enemy" });
    state.attackPreviewPendingKey = "4,7->5,7";
    state.attackPreviewPendingRequestId = "attack-preview-hover";
    const send = vi.fn();

    requestAttackPreviewForTarget(state, target, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as WebSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      pickOriginForTarget: () => origin
    });

    const requestId = expectAttackPreviewRequest(send, { fromX: 4, fromY: 7, toX: 5, toY: 7 });
    expect(requestId).not.toBe("attack-preview-hover");
    expect(state.attackPreviewPendingKey).toBe("4,7->5,7");
    expect(state.attackPreviewPendingRequestId).toBe(requestId);
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

  it("keeps the menu pending instead of caching a local fallback before the server preview arrives", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    const origin = makeTile({ x: 8, y: 8, ownerId: "me" });
    const target = makeTile({ x: 9, y: 8, ownerId: "barbarian", ownershipState: "FRONTIER", terrain: "LAND" });
    state.tiles.set("8,8", origin);
    state.tiles.set("9,8", target);
    const send = vi.fn();

    requestAttackPreviewForTarget(state, target, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as WebSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      pickOriginForTarget: () => origin
    });

    expectAttackPreviewRequest(send, { fromX: 8, fromY: 8, toX: 9, toY: 8 });
    expect(state.attackPreviewPendingKey).toBe("8,8->9,8");
    expect(state.attackPreviewPendingRequestId).toBe("attack-preview-1");
    expect(state.attackPreview).toBeUndefined();
    expect(state.attackPreviewCacheByKey.has("8,8->9,8")).toBe(false);
    expect(
      attackPreviewPendingForTarget(state, target, {
        keyFor: (x, y) => `${x},${y}`,
        pickOriginForTarget: () => origin
      })
    ).toBe(true);
    expect(
      attackPreviewDetailForTarget(state, target, {
        keyFor: (x, y) => `${x},${y}`,
        pickOriginForTarget: () => origin
      })
    ).toBeUndefined();
  });

  it("does not show unboosted local odds for a pending outpost-backed attack preview", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    const origin = makeTile({ x: 13, y: 239, ownerId: "me" });
    const target = makeTile({ x: 14, y: 239, ownerId: "enemy", ownershipState: "FRONTIER", terrain: "LAND" });
    state.tiles.set("13,239", origin);
    state.tiles.set("14,239", target);
    state.tiles.set(
      "12,239",
      makeTile({
        x: 12,
        y: 239,
        ownerId: "me",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "me", type: "LIGHT_OUTPOST", status: "active" }
      })
    );
    const send = vi.fn();

    requestAttackPreviewForTarget(state, target, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as WebSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      pickOriginForTarget: () => origin
    });

    expectAttackPreviewRequest(send, { fromX: 13, fromY: 239, toX: 14, toY: 239 });
    expect(state.attackPreviewPendingKey).toBe("13,239->14,239");
    expect(state.attackPreviewPendingRequestId).toBe("attack-preview-1");
    expect(state.attackPreview).toBeUndefined();
    expect(
      attackPreviewDetailForTarget(state, target, {
        keyFor: (x, y) => `${x},${y}`,
        pickOriginForTarget: () => origin
      })
    ).toBeUndefined();
  });

  it("stops showing an infinite loading state when a fresh menu preview never returns", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    const origin = makeTile({ x: 4, y: 7, ownerId: "me" });
    const target = makeTile({ x: 5, y: 7, ownerId: "enemy" });
    const send = vi.fn();
    const onPreviewTimeout = vi.fn();

    requestAttackPreviewForTarget(state, target, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as WebSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      pickOriginForTarget: () => origin,
      onPreviewTimeout
    });

    const requestId = expectAttackPreviewRequest(send, { fromX: 4, fromY: 7, toX: 5, toY: 7 });
    expect(state.attackPreviewPendingKey).toBe("4,7->5,7");
    expect(state.attackPreviewPendingRequestId).toBe(requestId);

    vi.advanceTimersByTime(3_999);
    expect(attackPreviewPendingForTarget(state, target, { keyFor: (x, y) => `${x},${y}`, pickOriginForTarget: () => origin })).toBe(true);

    vi.advanceTimersByTime(1);
    expect(state.attackPreviewPendingKey).toBe("");
    expect(state.attackPreviewPendingRequestId).toBe(requestId);
    expect(attackPreviewPendingForTarget(state, target, { keyFor: (x, y) => `${x},${y}`, pickOriginForTarget: () => origin })).toBe(false);
    expect(attackPreviewDetailForTarget(state, target, { keyFor: (x, y) => `${x},${y}`, pickOriginForTarget: () => origin })).toBe(
      "Attack preview unavailable"
    );
    expect(onPreviewTimeout).toHaveBeenCalledTimes(1);
  });
});
