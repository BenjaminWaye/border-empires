import { describe, expect, it, vi } from "vitest";
import { getPersonalActivityTimelineRpcCall, PERSONAL_ACTIVITY_RPC_DEADLINE_MS, type GetPersonalActivityTimelineRpc } from "./sim-client-personal-activity-timeline.js";

// Regression: the call had no gRPC deadline, so once the gateway gave up on a
// stalled simulation the call stayed open, and every Chronicle retry queued another.
describe("getPersonalActivityTimelineRpcCall", () => {
  it("sends the call with a gRPC deadline so an abandoned request is cancelled", async () => {
    const rpc = vi.fn<GetPersonalActivityTimelineRpc>((_request, _options, callback) => callback(null, { ok: true, timeline_json: JSON.stringify({ cards: [] }) }));
    await getPersonalActivityTimelineRpcCall(rpc, "player-1", 0, 1_000, () => 5_000);
    expect(rpc).toHaveBeenCalledWith(
      { player_id: "player-1", from_ms: 0, to_ms: 1_000 },
      { deadline: 5_000 + PERSONAL_ACTIVITY_RPC_DEADLINE_MS },
      expect.any(Function)
    );
  });

  it("rejects with the gRPC error when the deadline passes", async () => {
    const rpc: GetPersonalActivityTimelineRpc = (_request, _options, callback) => callback(new Error("4 DEADLINE_EXCEEDED"), { ok: false });
    await expect(getPersonalActivityTimelineRpcCall(rpc, "player-1", 0, 1_000)).rejects.toThrow("DEADLINE_EXCEEDED");
  });
});
