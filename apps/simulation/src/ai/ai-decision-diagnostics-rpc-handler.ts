// GetAiDecisionDiagnostics gRPC handler (admin AI decision diagnostics), moved
// out of simulation-service.ts, which is over the 500-line file budget.
import { getAiDecisionDiagnostics } from "./ai-decision-diagnostics.js";

export type ProtoGetAiDecisionDiagnosticsRequest = {
  player_id?: string;
};
export type ProtoGetAiDecisionDiagnosticsResponse = {
  ok: boolean;
  diagnostics_json?: string;
};

export const handleGetAiDecisionDiagnostics = (
  call: { request: ProtoGetAiDecisionDiagnosticsRequest },
  callback: (error: Error | null, response: ProtoGetAiDecisionDiagnosticsResponse) => void
): void => {
  try {
    const playerId = call.request.player_id || undefined;
    const diagnostics = getAiDecisionDiagnostics(playerId);
    callback(null, { ok: true, diagnostics_json: JSON.stringify(diagnostics) });
  } catch (error) {
    callback(error instanceof Error ? error : new Error("failed to load diagnostics"), {
      ok: false,
      diagnostics_json: ""
    });
  }
};
