import type { SeasonParticipationRow } from "@border-empires/sim-protocol";

export type ProtoSeasonParticipationAck = { ok: boolean; participation_json?: string; participationJson?: string };

type GetSeasonParticipationRpc = (
  request: Record<string, unknown>,
  callback: (error: Error | null, response: ProtoSeasonParticipationAck) => void
) => void;

// Mirrors sim-client-season-archives.ts's extraction pattern -- sim-client.ts
// is already over the repo's 500-line file-size gate and may not grow further.
export const getSeasonParticipationRpcCall = (
  rpc: GetSeasonParticipationRpc | undefined,
  playerId: string
): Promise<SeasonParticipationRow[]> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client GetSeasonParticipationForPlayer RPC is unavailable"));
      return;
    }
    rpc({ player_id: playerId }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      const payload = response.participation_json ?? response.participationJson;
      if (!payload) {
        resolve([]);
        return;
      }
      resolve(JSON.parse(payload) as SeasonParticipationRow[]);
    });
  });
