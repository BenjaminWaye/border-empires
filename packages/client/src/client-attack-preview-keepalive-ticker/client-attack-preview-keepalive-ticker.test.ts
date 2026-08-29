import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { attackPreviewIsStaleForTarget } from "../client-queue-logic/client-queue-logic.js";
import { startAttackPreviewKeepaliveTicker } from "./client-attack-preview-keepalive-ticker.js";
import type { Tile } from "../client-types.js";

const makeTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  ...overrides
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("attackPreviewIsStaleForTarget", () => {
  it("is stale once the cached preview has aged past the TTL", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    const state = createInitialState();
    state.me = "me";
    const origin = makeTile({ x: 1, y: 1, ownerId: "me" });
    const target = makeTile({ x: 2, y: 1, ownerId: "enemy" });
    state.attackPreview = { fromKey: "1,1", toKey: "2,1", valid: true, winChance: 0.5, receivedAt: 4_000 };

    expect(
      attackPreviewIsStaleForTarget(state, target, { keyFor: (x, y) => `${x},${y}`, pickOriginForTarget: () => origin })
    ).toBe(true);
  });

  it("is not stale while a fresh preview is still within the TTL", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    const state = createInitialState();
    state.me = "me";
    const origin = makeTile({ x: 1, y: 1, ownerId: "me" });
    const target = makeTile({ x: 2, y: 1, ownerId: "enemy" });
    state.attackPreview = { fromKey: "1,1", toKey: "2,1", valid: true, winChance: 0.5, receivedAt: 9_000 };

    expect(
      attackPreviewIsStaleForTarget(state, target, { keyFor: (x, y) => `${x},${y}`, pickOriginForTarget: () => origin })
    ).toBe(false);
  });

  it("is not stale while a request for the same target is already pending", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    const state = createInitialState();
    state.me = "me";
    const origin = makeTile({ x: 1, y: 1, ownerId: "me" });
    const target = makeTile({ x: 2, y: 1, ownerId: "enemy" });
    state.attackPreviewPendingKey = "1,1->2,1";

    expect(
      attackPreviewIsStaleForTarget(state, target, { keyFor: (x, y) => `${x},${y}`, pickOriginForTarget: () => origin })
    ).toBe(false);
  });
});

describe("startAttackPreviewKeepaliveTicker", () => {
  beforeEach(() => vi.useFakeTimers());

  it("silently re-requests the preview once a second while a stale enemy tile menu is open", () => {
    const state = createInitialState();
    state.me = "me";
    const target = makeTile({ x: 2, y: 1, ownerId: "enemy" });
    state.tiles.set("2,1", target);
    state.tileActionMenu.visible = true;
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "2,1";
    const requestAttackPreviewForTarget = vi.fn();

    startAttackPreviewKeepaliveTicker(state, {
      isTileOwnedByAlly: () => false,
      attackPreviewIsStaleForTarget: () => true,
      requestAttackPreviewForTarget
    });

    vi.advanceTimersByTime(1_000);
    expect(requestAttackPreviewForTarget).toHaveBeenCalledWith(target);
  });

  it("does not re-request when the preview is fresh", () => {
    const state = createInitialState();
    state.me = "me";
    const target = makeTile({ x: 2, y: 1, ownerId: "enemy" });
    state.tiles.set("2,1", target);
    state.tileActionMenu.visible = true;
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "2,1";
    const requestAttackPreviewForTarget = vi.fn();

    startAttackPreviewKeepaliveTicker(state, {
      isTileOwnedByAlly: () => false,
      attackPreviewIsStaleForTarget: () => false,
      requestAttackPreviewForTarget
    });

    vi.advanceTimersByTime(1_000);
    expect(requestAttackPreviewForTarget).not.toHaveBeenCalled();
  });

  it("does not re-request for an own or allied tile", () => {
    const state = createInitialState();
    state.me = "me";
    const ownTile = makeTile({ x: 2, y: 1, ownerId: "me" });
    state.tiles.set("2,1", ownTile);
    state.tileActionMenu.visible = true;
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "2,1";
    const requestAttackPreviewForTarget = vi.fn();

    startAttackPreviewKeepaliveTicker(state, {
      isTileOwnedByAlly: () => false,
      attackPreviewIsStaleForTarget: () => true,
      requestAttackPreviewForTarget
    });

    vi.advanceTimersByTime(1_000);
    expect(requestAttackPreviewForTarget).not.toHaveBeenCalled();
  });

  it("does not re-request when no single tile menu is open", () => {
    const state = createInitialState();
    state.me = "me";
    const requestAttackPreviewForTarget = vi.fn();

    startAttackPreviewKeepaliveTicker(state, {
      isTileOwnedByAlly: () => false,
      attackPreviewIsStaleForTarget: () => true,
      requestAttackPreviewForTarget
    });

    vi.advanceTimersByTime(2_000);
    expect(requestAttackPreviewForTarget).not.toHaveBeenCalled();
  });
});
