import { describe, expect, it, vi } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { applyPendingSettlementsFromServer } from "./client-queue-logic.js";

describe("server-originated settle progress bumps tilesRevision", () => {
  // Regression: the settle animation only renders via rebuildVisibleTerrain,
  // which client-map-3d.ts's maybeRebuild only re-runs when tilesRevision
  // changes. applyOptimisticTileState only bumps that revision when a tile's
  // ownerId/ownershipState/optimisticPending field actually changes -- so a
  // settle that started on a tile already marked FRONTIER/optimisticPending
  // "settle" from an earlier update left tilesRevision untouched, and the
  // animation silently never appeared until an unrelated interaction (a
  // click, a camera pan) triggered a rebuild for its own reasons.
  const deps = () => ({
    keyFor: (x: number, y: number) => `${x},${y}`,
    syncOptimisticSettlementTile: vi.fn(),
    clearOptimisticTileState: vi.fn(),
    requestViewRefresh: vi.fn()
  });

  it("bumps tilesRevision when a brand-new server settle entry arrives", () => {
    const state = createInitialState();
    const revisionBefore = state.tilesRevision;

    applyPendingSettlementsFromServer(state, [{ x: 5, y: 5, startedAt: Date.now(), resolvesAt: Date.now() + 30000 }], deps());

    expect(state.tilesRevision).toBeGreaterThan(revisionBefore);
    expect(state.settleProgressByTile.get("5,5")).toBeDefined();
  });

  it("does not bump tilesRevision again when the same entry is re-applied unchanged", () => {
    const state = createInitialState();
    const entries = [{ x: 5, y: 5, startedAt: Date.now(), resolvesAt: Date.now() + 30000 }];
    applyPendingSettlementsFromServer(state, entries, deps());
    const revisionAfterFirst = state.tilesRevision;

    applyPendingSettlementsFromServer(state, entries, deps());

    expect(state.tilesRevision).toBe(revisionAfterFirst);
  });

  it("bumps tilesRevision when a tracked settle is cleared (entry list shrinks)", () => {
    const state = createInitialState();
    applyPendingSettlementsFromServer(state, [{ x: 5, y: 5, startedAt: Date.now(), resolvesAt: Date.now() + 30000 }], deps());
    const revisionAfterFirst = state.tilesRevision;

    applyPendingSettlementsFromServer(state, [], deps());

    expect(state.tilesRevision).toBeGreaterThan(revisionAfterFirst);
    expect(state.settleProgressByTile.size).toBe(0);
  });

  it("bumps tilesRevision when an existing entry's resolvesAt changes", () => {
    const state = createInitialState();
    applyPendingSettlementsFromServer(state, [{ x: 5, y: 5, startedAt: Date.now(), resolvesAt: Date.now() + 30000 }], deps());
    const revisionAfterFirst = state.tilesRevision;

    applyPendingSettlementsFromServer(state, [{ x: 5, y: 5, startedAt: Date.now(), resolvesAt: Date.now() + 60000 }], deps());

    expect(state.tilesRevision).toBeGreaterThan(revisionAfterFirst);
  });
});
