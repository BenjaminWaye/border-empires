import type { ReachAuthoritativeState } from "./client-reach-authoritative.js";

/** The reach fields the diagnostics bundle's `state` section reports. */
export type ReachDiagnosticsFields = {
  hasServerReach: boolean;
  serverReachRevision: number;
  serverReachSize: number | null;
};

/**
 * Answers "did this client ever apply a REACH_UPDATE?" for a diagnostics
 * bundle (client-diagnostics.ts).
 *
 * When `hasServerReach` is false, every reach consumer -- the border overlay
 * and the waypoint planner -- is running on the local approximation
 * (`computeLocalReachSet`), which can plan EXPANDs the server rejects as
 * OUT_OF_REACH. `serverReachRevision: 0` together with `hasServerReach: false`
 * means no REACH_UPDATE was applied at all this session; a non-zero revision
 * says which server push the client is currently rendering.
 */
export const reachDiagnosticsFields = (
  state: Pick<ReachAuthoritativeState, "serverReach" | "serverReachRevision">
): ReachDiagnosticsFields => ({
  hasServerReach: state.serverReach !== undefined,
  serverReachRevision: state.serverReachRevision,
  serverReachSize: state.serverReach?.size ?? null
});
