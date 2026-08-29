// GetActivityDashboard gRPC handler, extracted out of simulation-service.ts
// (already well over the file-line gate's 500-line budget and may not grow —
// see AGENTS.md's file-and-type-discipline rule), mirroring how
// admin-players-snapshot.ts keeps GetAdminPlayers's handler a one-line call.
import type { SimulationRuntime } from "../runtime/runtime.js";

export type ProtoActivityDashboardRequest = Record<string, never>;
export type ProtoActivityDashboardResponse = {
  ok: boolean;
  snapshot_json?: string;
};

export const handleGetActivityDashboard = (
  runtime: SimulationRuntime,
  _call: { request: ProtoActivityDashboardRequest },
  callback: (error: Error | null, response: ProtoActivityDashboardResponse) => void
): void => {
  callback(null, { ok: true, snapshot_json: JSON.stringify(runtime.exportActivityDashboardSnapshot()) });
};
