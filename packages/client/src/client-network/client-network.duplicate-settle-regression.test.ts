import { describe, expect, it, vi } from "vitest";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

// Regression: building a structure like RELAY_BEACON on a not-yet-settled
// frontier tile makes the client send SETTLE directly while the server's
// claim-continuation handler also auto-enqueues its own SETTLE step, so
// whichever arrives second is rejected with SETTLE_INVALID: "tile is
// already settling". The recovery check previously compared against the
// typo'd "tile already settling" (missing "is"), so it never matched and
// fell through to the generic handler that wipes local settlement
// progress with no view refresh -- leaving the client stuck showing
// nothing while the server kept building the structure.
//
// A second regression (seen live on a Relay Beacon chain, 2026-08-26): once
// the one-shot recovery above landed, a settlement that was genuinely still
// pending server-side (not a one-tick race) kept rejecting the requeued
// SETTLE with the exact same "tile is already settling" error every time,
// and the recovery kept requeuing it -- spamming SETTLE_INVALID and
// COMMAND_RATE_LIMITED forever with no backoff. Recovery must fire once per
// tile, then fall through to the plain drop-and-alert handling.
describe("client network duplicate-settle regression", () => {
  it("requeues a settlement when the server rejects a duplicate settle as already settling (relay beacon build chain race)", () => {
    const state = createState();
    state.actionInFlight = true;
    state.actionTargetKey = "12,18";
    state.lastDevelopmentAttempt = { kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" };
    state.tiles.set("12,18", {
      x: 12,
      y: 18,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER",
      optimisticPending: "settle"
    });
    state.settleProgressByTile.set("12,18", {
      startAt: Date.now() - 1000,
      resolvesAt: Date.now() + 10_000,
      target: { x: 12, y: 18 },
      awaitingServerConfirm: false
    });
    const ws = new FakeWebSocket();
    const pushFeed = vi.fn();
    const showCaptureAlert = vi.fn();
    bindWithDeps(state, ws, { pushFeed, showCaptureAlert, clearSettlementProgressByKey: undefined });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: "tile is already settling", x: 12, y: 18 })
    });

    expect(state.settleProgressByTile.has("12,18")).toBe(false);
    expect(state.developmentQueue).toEqual([{ kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" }]);
    expect(showCaptureAlert).not.toHaveBeenCalled();
  });

  it("does not requeue a settlement forever when the tile is genuinely still settling server-side", () => {
    const state = createState();
    state.actionInFlight = true;
    state.actionTargetKey = "12,18";
    state.lastDevelopmentAttempt = { kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" };
    state.tiles.set("12,18", { x: 12, y: 18, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "settle" });
    state.settleProgressByTile.set("12,18", { startAt: Date.now() - 1000, resolvesAt: Date.now() + 10_000, target: { x: 12, y: 18 }, awaitingServerConfirm: false });
    const ws = new FakeWebSocket();
    const pushFeed = vi.fn();
    const showCaptureAlert = vi.fn();
    bindWithDeps(state, ws, { pushFeed, showCaptureAlert, clearSettlementProgressByKey: undefined });
    const emitAlreadySettling = (): void =>
      ws.emit("message", { data: JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: "tile is already settling", x: 12, y: 18 }) });

    emitAlreadySettling();
    expect(state.developmentQueue).toHaveLength(1);
    // Simulate the requeued entry being re-dispatched from the queue (mirroring
    // requestSettlement setting lastDevelopmentAttempt again) and rejected the
    // same way a second time -- this used to requeue indefinitely.
    state.developmentQueue.length = 0;
    state.lastDevelopmentAttempt = { kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" };
    emitAlreadySettling();

    expect(state.developmentQueue).toHaveLength(0);
    // The tile really is still settling server-side (the server's own auto-enqueued
    // SETTLE is still in flight), so nothing has actually failed -- no alert here.
    expect(showCaptureAlert).not.toHaveBeenCalled();
  });
});
