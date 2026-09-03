import type { GetRecentCommandsResponse } from "@border-empires/sim-protocol";
import type { ActivityDashboardSnapshot } from "@border-empires/game-domain";

export type ProtoActivityDashboardAck = { ok: boolean; snapshot_json?: string; snapshotJson?: string };
export type ProtoGetRecentCommandsRequest = { limit?: number };
export type ProtoGetRecentCommandsAck = { ok: boolean; commands_json?: string; commandsJson?: string };

type GetActivityDashboardRpc = (
  request: Record<string, unknown>,
  callback: (error: Error | null, response: ProtoActivityDashboardAck) => void
) => void;

type GetRecentCommandsRpc = (
  request: ProtoGetRecentCommandsRequest,
  callback: (error: Error | null, response: ProtoGetRecentCommandsAck) => void
) => void;

// Extracted out of sim-client.ts (which is over the 500-line file budget and
// may not grow further -- see AGENTS.md's file-and-type-discipline rule),
// mirroring sim-client-prepare-player.ts's extraction pattern.
export const getActivityDashboardRpcCall = (rpc: GetActivityDashboardRpc | undefined): Promise<ActivityDashboardSnapshot> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client GetActivityDashboard RPC is unavailable"));
      return;
    }
    rpc({}, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      const payload = response.snapshot_json ?? response.snapshotJson;
      if (!payload) {
        reject(new Error("GetActivityDashboard returned no snapshot"));
        return;
      }
      resolve(JSON.parse(payload) as ActivityDashboardSnapshot);
    });
  });

export const getRecentCommandsRpcCall = (
  rpc: GetRecentCommandsRpc | undefined,
  limit: number
): Promise<GetRecentCommandsResponse> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client GetRecentCommands RPC is unavailable"));
      return;
    }
    rpc({ limit }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      const payload = response.commands_json ?? response.commandsJson;
      if (!payload) {
        resolve({ ok: true, commands: [] });
        return;
      }
      resolve({ ok: true, commands: JSON.parse(payload) });
    });
  });
