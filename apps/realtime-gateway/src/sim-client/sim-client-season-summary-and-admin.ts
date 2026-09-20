import type { AdminPlayerRow, CurrentSeasonSummary } from "@border-empires/sim-protocol";

export type ProtoSeasonSummaryAck = { ok: boolean; summary_json?: string; summaryJson?: string };
export type ProtoAdminPlayersAck = { ok: boolean; players_json?: string; playersJson?: string };

type GetCurrentSeasonSummaryRpc = (
  request: Record<string, unknown>,
  callback: (error: Error | null, response: ProtoSeasonSummaryAck) => void
) => void;

type GetAdminPlayersRpc = (
  request: Record<string, unknown>,
  callback: (error: Error | null, response: ProtoAdminPlayersAck) => void
) => void;

// Extracted out of sim-client.ts (which is over the 500-line file budget and
// may not grow further -- see AGENTS.md's file-and-type-discipline rule),
// mirroring sim-client-season-archives.ts's extraction pattern.
export const getCurrentSeasonSummaryRpcCall = (rpc: GetCurrentSeasonSummaryRpc | undefined): Promise<CurrentSeasonSummary> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client GetCurrentSeasonSummary RPC is unavailable"));
      return;
    }
    rpc({}, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      const payload = response.summary_json ?? response.summaryJson;
      if (!payload) {
        reject(new Error("simulation current season summary payload missing"));
        return;
      }
      resolve(JSON.parse(payload) as CurrentSeasonSummary);
    });
  });

export const getAdminPlayersRpcCall = (rpc: GetAdminPlayersRpc | undefined): Promise<AdminPlayerRow[]> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client GetAdminPlayers RPC is unavailable"));
      return;
    }
    rpc({}, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      const payload = response.players_json ?? response.playersJson;
      if (!payload) {
        resolve([]);
        return;
      }
      resolve(JSON.parse(payload) as AdminPlayerRow[]);
    });
  });
