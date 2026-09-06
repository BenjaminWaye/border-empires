import { describe, expect, it, vi } from "vitest";

import { createSimulationClientFromRpcClient } from "./sim-client.js";

// Extracted out of sim-client.test.ts (over the 500-line file budget) --
// this file's one test covers every RPC wrapper that must pass its raw
// grpc method bound as `this`, so new wrappers get added here going forward.
describe("simulation client RPC wrappers bind `this`", () => {
  it("calls GetActivityDashboard/GetPlayerCombatSummary/GetRecentCommands/ListSeasonArchives/GetSeasonParticipationForPlayer with the rpc client bound as `this`", async () => {
    // Real @grpc/grpc-js generated methods live on the client's prototype and
    // read internal state off `this` (e.g. `this.checkOptionalUnaryResponseArguments`
    // in client.js) -- calling one as a bare function reference with no
    // receiver throws "Cannot read properties of undefined" instead of
    // reaching the network. This class reproduces that requirement so a
    // regression that drops `.bind(client)` at a call site fails loudly here
    // instead of only in production (see PR fixing the daily activity digest,
    // and the later PR that caught the same bug in listSeasonArchives and
    // getSeasonParticipationForPlayer via a live /hq/archives 500).
    class FakeGrpcClient {
      serviceTag = "activity-dashboard-service";

      GetActivityDashboard(_request: unknown, callback: (error: Error | null, response: { ok: boolean; snapshot_json: string }) => void): void {
        if (this.serviceTag !== "activity-dashboard-service") throw new TypeError("Cannot read properties of undefined (reading 'checkOptionalUnaryResponseArguments')");
        callback(null, { ok: true, snapshot_json: "{}" });
      }

      GetPlayerCombatSummary(_request: unknown, callback: (error: Error | null, response: { ok: boolean; found: boolean }) => void): void {
        if (this.serviceTag !== "activity-dashboard-service") throw new TypeError("Cannot read properties of undefined (reading 'checkOptionalUnaryResponseArguments')");
        callback(null, { ok: true, found: false });
      }

      GetRecentCommands(_request: unknown, callback: (error: Error | null, response: { ok: boolean; commands_json: string }) => void): void {
        if (this.serviceTag !== "activity-dashboard-service") throw new TypeError("Cannot read properties of undefined (reading 'checkOptionalUnaryResponseArguments')");
        callback(null, { ok: true, commands_json: "[]" });
      }

      ListSeasonArchives(_request: unknown, callback: (error: Error | null, response: { ok: boolean; archives_json: string }) => void): void {
        if (this.serviceTag !== "activity-dashboard-service") throw new TypeError("Cannot read properties of undefined (reading 'checkOptionalUnaryResponseArguments')");
        callback(null, { ok: true, archives_json: "[]" });
      }

      GetSeasonParticipationForPlayer(_request: unknown, callback: (error: Error | null, response: { ok: boolean; participation_json: string }) => void): void {
        if (this.serviceTag !== "activity-dashboard-service") throw new TypeError("Cannot read properties of undefined (reading 'checkOptionalUnaryResponseArguments')");
        callback(null, { ok: true, participation_json: "[]" });
      }

      SubmitCommand = vi.fn();
      PreparePlayer = vi.fn();
      SubscribePlayer = vi.fn();
      UnsubscribePlayer = vi.fn();
      Ping = vi.fn();
      StreamEvents = vi.fn();
    }

    const client = createSimulationClientFromRpcClient(new FakeGrpcClient() as never);

    await expect(client.getActivityDashboard()).resolves.toEqual({});
    await expect(client.getPlayerCombatSummary("player-1")).resolves.toBeUndefined();
    await expect(client.getRecentCommands()).resolves.toEqual({ ok: true, commands: [] });
    await expect(client.listSeasonArchives()).resolves.toEqual([]);
    await expect(client.getSeasonParticipationForPlayer("player-1")).resolves.toEqual([]);
  });
});
