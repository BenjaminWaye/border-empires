import { describe, expect, it } from "vitest";

import { shouldHideCaptureOverlayAfterTimer, shouldHideQueuedFrontierBadge, shouldPreserveOptimisticExpand } from "./client-frontier-overlay.js";
import type { Tile } from "./client-types.js";

const baseTile = (overrides: Partial<Tile> = {}): Tile => ({
  x: 40,
  y: 239,
  terrain: "LAND",
  ...overrides
});

describe("frontier overlay helpers", () => {
  it("preserves optimistic neutral expands owned by the local player", () => {
    const tile = baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "expand" });

    expect(shouldPreserveOptimisticExpand(tile, "me")).toBe(true);
    expect(shouldHideCaptureOverlayAfterTimer(tile, "me", true)).toBe(true);
  });

  it("does not preserve enemy combat tiles after the timer", () => {
    const tile = baseTile({ ownerId: "enemy", ownershipState: "FRONTIER" });

    expect(shouldPreserveOptimisticExpand(tile, "me")).toBe(false);
    expect(shouldHideCaptureOverlayAfterTimer(tile, "me", true)).toBe(false);
  });

  it("does not preserve other optimistic states", () => {
    const tile = baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "settle" });

    expect(shouldPreserveOptimisticExpand(tile, "me")).toBe(false);
    expect(shouldHideCaptureOverlayAfterTimer(tile, "me", true)).toBe(false);
  });

  it("keeps the overlay visible before the timer finishes", () => {
    const tile = baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "expand" });

    expect(shouldHideCaptureOverlayAfterTimer(tile, "me", false)).toBe(false);
  });

  it("hides the queued badge for the current frontier action once the timer has elapsed", () => {
    const tile = baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "expand" });

    expect(shouldHideQueuedFrontierBadge(tile, "me", true, true)).toBe(true);
  });

  it("keeps queued badges for non-current or non-frontier pending tiles", () => {
    const tile = baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "expand" });
    const settling = baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "settle" });

    expect(shouldHideQueuedFrontierBadge(tile, "me", true, false)).toBe(false);
    expect(shouldHideQueuedFrontierBadge(settling, "me", true, true)).toBe(false);
  });
});
