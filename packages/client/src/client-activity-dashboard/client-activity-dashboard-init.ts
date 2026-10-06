import type { ClientState } from "../client-state/client-state.js";

// INIT.activitySeen was added server-side in Phase 0 (gateway-app.ts) but
// was silently dropped by the client until now -- see docs/activity-dashboard-plan.md
// §0. Called from client-network.ts's INIT branch (like backfillWorldEngineStrikeHistory)
// rather than folded into applyInitMessage, since that function's file is
// already at the repo's 500-line cap and may not grow.
export const applyInitActivitySeen = (state: Pick<ClientState, "activitySeen"> & { activityDashboard: Pick<ClientState["activityDashboard"], "quietedSeasonId"> }, msg: Record<string, unknown>): void => {
  const quieted = (msg.player as { dashboardQuietedSeasonId?: unknown } | undefined)?.dashboardQuietedSeasonId;
  if (typeof quieted === "string") state.activityDashboard.quietedSeasonId = quieted;
  const activitySeen = msg.activitySeen as { lastActivitySeenAt?: unknown; lastActivitySeenSeasonId?: unknown } | undefined;
  if (!activitySeen) return;
  if (typeof activitySeen.lastActivitySeenAt === "number") {
    state.activitySeen.lastActivitySeenAt = activitySeen.lastActivitySeenAt;
  }
  if (typeof activitySeen.lastActivitySeenSeasonId === "string") {
    state.activitySeen.lastActivitySeenSeasonId = activitySeen.lastActivitySeenSeasonId;
  }
};
