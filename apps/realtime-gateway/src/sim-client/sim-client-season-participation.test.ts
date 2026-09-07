import { describe, expect, it } from "vitest";
import { getSeasonParticipationRpcCall } from "./sim-client-season-participation.js";

describe("getSeasonParticipationRpcCall", () => {
  it("rejects when the RPC is unavailable", async () => {
    await expect(getSeasonParticipationRpcCall(undefined, "player-1")).rejects.toThrow("unavailable");
  });

  it("resolves with the parsed rows and passes the playerId through", async () => {
    let receivedRequest: unknown;
    const rpc = (request: Record<string, unknown>, callback: (error: Error | null, response: { ok: boolean; participation_json?: string }) => void) => {
      receivedRequest = request;
      callback(null, { ok: true, participation_json: JSON.stringify([{ seasonId: "season-1", playerId: "player-1", rank: 1 }]) });
    };

    const result = await getSeasonParticipationRpcCall(rpc, "player-1");
    expect(receivedRequest).toEqual({ player_id: "player-1" });
    expect(result).toEqual([{ seasonId: "season-1", playerId: "player-1", rank: 1 }]);
  });

  it("resolves to an empty array when the payload is missing", async () => {
    const rpc = (_request: Record<string, unknown>, callback: (error: Error | null, response: { ok: boolean }) => void) => callback(null, { ok: true });
    const result = await getSeasonParticipationRpcCall(rpc, "player-1");
    expect(result).toEqual([]);
  });

  it("rejects on an RPC error", async () => {
    const rpc = (_request: Record<string, unknown>, callback: (error: Error | null, response: never) => void) => callback(new Error("boom"), undefined as never);
    await expect(getSeasonParticipationRpcCall(rpc, "player-1")).rejects.toThrow("boom");
  });
});
