import type { SeasonArchiveRow } from "@border-empires/sim-protocol";

export type ProtoSeasonArchivesAck = { ok: boolean; archives_json?: string; archivesJson?: string };

type ListSeasonArchivesRpc = (
  request: Record<string, unknown>,
  callback: (error: Error | null, response: ProtoSeasonArchivesAck) => void
) => void;

// Extracted out of sim-client.ts (which is over the 500-line file budget and
// may not grow further -- see AGENTS.md's file-and-type-discipline rule),
// mirroring sim-client-prepare-player.ts's extraction pattern.
export const listSeasonArchivesRpcCall = (rpc: ListSeasonArchivesRpc | undefined): Promise<SeasonArchiveRow[]> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client ListSeasonArchives RPC is unavailable"));
      return;
    }
    rpc({}, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      const payload = response.archives_json ?? response.archivesJson;
      if (!payload) {
        resolve([]);
        return;
      }
      resolve(JSON.parse(payload) as SeasonArchiveRow[]);
    });
  });
