import type { SimulationRuntime } from "../runtime/runtime.js";

export type ProtoPersonalActivityTimelineRequest = { player_id: string; from_ms: number; to_ms: number };
export type ProtoPersonalActivityTimelineResponse = { ok: boolean; timeline_json?: string };

// GetPersonalActivityTimeline gRPC handler, mirroring
// activity-dashboard-rpc-handler.ts's extraction pattern (simulation-
// service.ts is already well over the file-line gate's 500-line budget and
// may not grow -- see AGENTS.md's file-and-type-discipline rule).
export const handleGetPersonalActivityTimeline = (
  runtime: SimulationRuntime,
  call: { request: ProtoPersonalActivityTimelineRequest },
  callback: (error: Error | null, response: ProtoPersonalActivityTimelineResponse) => void
): void => {
  const playerId = call.request.player_id;
  if (!playerId) {
    callback(null, { ok: false });
    return;
  }
  const timeline = runtime.getPersonalActivityTimeline(playerId, call.request.from_ms, call.request.to_ms);
  callback(null, { ok: true, timeline_json: JSON.stringify(timeline) });
};
