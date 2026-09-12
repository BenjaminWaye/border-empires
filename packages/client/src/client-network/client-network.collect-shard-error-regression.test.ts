import { describe, expect, it, vi } from "vitest";
import { explainActionFailureFromServer } from "../client-player-actions.js";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

// Regression for the phantom-shard bug report: Collect Shard used to fail
// silently on COLLECT_EMPTY/COLLECT_NOT_OWNED -- the alert popup was
// explicitly suppressed for every COLLECT_* code, leaving at most a muted
// feed-only line (COLLECT_EMPTY) or nothing at all (COLLECT_NOT_OWNED,
// COLLECT_COOLDOWN). A rejected collect now surfaces a real "Collect failed"
// alert like every other blocked action. Split into its own file rather than
// growing client-network.error-regression.test.ts, which is already over the
// repo's 500-line file cap and frozen.
describe("client network Collect Shard error regression", () => {
  it("shows a Collect failed alert on COLLECT_EMPTY instead of only a muted feed line", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    bindWithDeps(state, ws, { showCaptureAlert, explainActionFailure: explainActionFailureFromServer });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "no shard present" })
    });

    expect(showCaptureAlert).toHaveBeenCalledTimes(1);
    const [title, detail, tone] = showCaptureAlert.mock.calls[0]!;
    expect(title).toBe("Collect failed");
    expect(tone).toBe("warn");
    expect(String(detail)).toMatch(/nothing to collect/i);
  });

  it("shows a Collect failed alert on COLLECT_NOT_OWNED and restores the optimistically-cleared shard site", () => {
    const state = createState();
    state.pendingShardCollect = { tileKey: "74,414", shardSite: { kind: "FALL", amount: 1 } };
    state.tiles.set("74,414", { x: 74, y: 414, terrain: "LAND", shardSite: null });
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    bindWithDeps(state, ws, { showCaptureAlert });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "COLLECT_NOT_OWNED", message: "shard tile must be owned by you" })
    });

    expect(showCaptureAlert).toHaveBeenCalledTimes(1);
    expect(showCaptureAlert.mock.calls[0]![0]).toBe("Collect failed");
    expect(state.tiles.get("74,414")?.shardSite).toEqual({ kind: "FALL", amount: 1 });
    expect(state.pendingShardCollect).toBeUndefined();
  });

  it("does NOT restore the shard site on COLLECT_EMPTY -- the sim confirmed there was never one to collect", () => {
    const state = createState();
    state.pendingShardCollect = { tileKey: "74,414", shardSite: { kind: "FALL", amount: 1 } };
    state.tiles.set("74,414", { x: 74, y: 414, terrain: "LAND", shardSite: null });
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws, { showCaptureAlert: vi.fn() });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "no shard present" })
    });

    expect(state.tiles.get("74,414")?.shardSite).toBeNull();
    expect(state.pendingShardCollect).toBeUndefined();
  });
});
