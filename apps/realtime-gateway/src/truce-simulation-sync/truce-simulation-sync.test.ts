import { describe, expect, it, vi } from "vitest";
import { createTruceSimulationSync, type TruceSimulationSyncDeps } from "./truce-simulation-sync.js";

const fixture = (initialTrucePairs: Array<[string, string]> = []) => {
  let pairs: Array<[string, string]> = [["a", "b"]];
  const submitCommand = vi.fn(async (_command: import("@border-empires/sim-protocol").CommandEnvelope) => ({ ok: true }));
  const deps: TruceSimulationSyncDeps = {
    simulationClient: { submitCommand }, simulationHealth: { connected: true },
    socialState: { activeTrucePairs: () => pairs }, initialTrucePairs,
    simulationSubmitTimeoutMs: 1000, withTimeout: task => task,
    markSimulationReady: vi.fn(), handleSubmitError: vi.fn(), recordGatewayEvent: vi.fn()
  };
  return { deps, submitCommand, setPairs: (next: Array<[string, string]>) => { pairs = next; } };
};

describe("truce simulation reconciliation", () => {
  it("restores persisted active truces once on startup, then syncs their expiry", async () => {
    const { deps, submitCommand, setPairs } = fixture([["a", "b"]]);
    const sync = createTruceSimulationSync(deps);
    await sync.syncExpiredTruces();
    expect(submitCommand).toHaveBeenCalledTimes(1);
    expect(JSON.parse(submitCommand.mock.calls[0]![0].payloadJson)).toEqual({ targetPlayerId: "b", truced: true });
    await sync.syncExpiredTruces();
    expect(submitCommand).toHaveBeenCalledTimes(1);
    setPairs([]);
    await sync.syncExpiredTruces();
    expect(submitCommand).toHaveBeenCalledTimes(2);
    expect(JSON.parse(submitCommand.mock.calls[1]![0].payloadJson)).toEqual({ targetPlayerId: "b", truced: false });
  });

  it("clears persisted truces that expired while offline and retries unsuccessful submissions", async () => {
    const { deps, submitCommand } = fixture([["c", "d"]]);
    deps.simulationHealth.connected = false;
    const sync = createTruceSimulationSync(deps);
    await sync.syncExpiredTruces();
    expect(submitCommand).not.toHaveBeenCalled();
    deps.simulationHealth.connected = true;
    submitCommand.mockRejectedValueOnce(new Error("temporary failure"));
    await sync.syncExpiredTruces();
    await sync.syncExpiredTruces();
    const payloads = submitCommand.mock.calls.map(([cmd]) => ({ playerId: cmd.playerId, ...JSON.parse(cmd.payloadJson) }));
    expect(payloads).toContainEqual({ playerId: "a", targetPlayerId: "b", truced: true });
    expect(payloads).toContainEqual({ playerId: "c", targetPlayerId: "d", truced: false });
    const count = submitCommand.mock.calls.length;
    await sync.syncExpiredTruces();
    expect(submitCommand).toHaveBeenCalledTimes(count);
  });
});
