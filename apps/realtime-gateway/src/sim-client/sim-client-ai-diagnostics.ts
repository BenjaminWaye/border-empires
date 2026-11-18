import type { GetAiDecisionDiagnosticsResponse } from "@border-empires/sim-protocol";

// Moved out of sim-client.ts, which is over the 500-line file budget.
export type ProtoGetAiDecisionDiagnosticsRequest = { player_id?: string; playerId?: string };
export type ProtoGetAiDecisionDiagnosticsAck = { ok: boolean; diagnostics_json?: string; diagnosticsJson?: string };
export type GetAiDecisionDiagnosticsRpc = (
  request: ProtoGetAiDecisionDiagnosticsRequest,
  callback: (error: Error | null, response: ProtoGetAiDecisionDiagnosticsAck) => void
) => void;

export const getAiDecisionDiagnosticsRpcCall = (rpc: GetAiDecisionDiagnosticsRpc | undefined, playerId?: string): Promise<GetAiDecisionDiagnosticsResponse> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client GetAiDecisionDiagnostics RPC is unavailable"));
      return;
    }
    const request: ProtoGetAiDecisionDiagnosticsRequest = {};
    if (playerId !== undefined) {
      request.player_id = playerId;
    }
    rpc(request, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      const payload = response.diagnostics_json ?? response.diagnosticsJson;
      if (!payload) {
        resolve({ ok: true, diagnostics: [] });
        return;
      }
      resolve({ ok: true, diagnostics: JSON.parse(payload) });
    });
  });
