import { describe, expect, it } from "vitest";
import { buildCommandTimings } from "./client-command-timings.js";
import type { DebugEvent } from "../client-debug/client-debug-incidents.js";

const entry = (event: string, type: string, mono: number, wall: number): DebugEvent => ({
  at: wall, level: "info", scope: "sync-wire", event,
  payload: { type, commandId: "c1", monotonicAtMs: mono }
});
describe("command timing export", () => {
  it("uses monotonic client timings despite a wall-clock jump and keeps server timing separate", () => {
    const sent = entry("wire-sent", "ATTACK", 100, 1000);
    const accepted = entry("wire-received", "ACTION_ACCEPTED", 3800, 500);
    const events = [sent, sent, entry("wire-received", "COMMAND_QUEUED", 250, 1100), accepted];
    expect(buildCommandTimings(events, [
      { at: 80_000, event: "gateway_frontier_stage", payload: { commandId: "c1", stage: "received", elapsedMs: 0 } },
      { at: 83_000, event: "gateway_command_payload_sent", payload: { commandId: "c1", payloadType: "ACTION_ACCEPTED" } }
    ])).toEqual([expect.objectContaining({ commandId: "c1", clientSendToQueuedMs: 150, clientSendToAcceptedMs: 3700, serverReceivedToAcceptedSendMs: 3000 })]);
  });

  it("leaves missing evidence unset rather than treating it as zero latency", () => {
    expect(buildCommandTimings([entry("wire-sent", "EXPAND", 1, 1)], [])[0]).toMatchObject({ clientSendToAcceptedMs: undefined, serverReceivedToAcceptedSendMs: undefined });
  });
});
