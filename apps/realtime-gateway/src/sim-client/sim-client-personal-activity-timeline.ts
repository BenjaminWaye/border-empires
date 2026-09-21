import type { PersonalActivityTimeline } from "@border-empires/game-domain";

export type ProtoPersonalActivityTimelineAck = { ok: boolean; timeline_json?: string; timelineJson?: string };

type GetPersonalActivityTimelineRpc = (
  request: { player_id: string; from_ms: number; to_ms: number },
  callback: (error: Error | null, response: ProtoPersonalActivityTimelineAck) => void
) => void;

// Extracted out of sim-client.ts (which is over the 500-line file budget and
// may not grow further -- see AGENTS.md's file-and-type-discipline rule),
// mirroring sim-client-activity-and-commands.ts's extraction pattern. The
// payload-byte gauge from docs/activity-dashboard-plan.md 4.1 is recorded at
// the WS response boundary in handle-activity-timeline-messages.ts, not
// here -- this wrapper stays a plain RPC call like its siblings.
export const getPersonalActivityTimelineRpcCall = (
  rpc: GetPersonalActivityTimelineRpc | undefined,
  playerId: string,
  from: number,
  to: number
): Promise<PersonalActivityTimeline> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client GetPersonalActivityTimeline RPC is unavailable"));
      return;
    }
    rpc({ player_id: playerId, from_ms: from, to_ms: to }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      const payload = response.timeline_json ?? response.timelineJson;
      if (!payload) {
        reject(new Error("GetPersonalActivityTimeline returned no timeline"));
        return;
      }
      resolve(JSON.parse(payload) as PersonalActivityTimeline);
    });
  });
