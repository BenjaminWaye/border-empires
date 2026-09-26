import type { PersonalActivityTimeline, WorldPulse } from "@border-empires/game-domain";

// Extracted into its own factory (matching every sibling *-defaults.ts file
// here) rather than inlined into client-state.ts's createInitialState, which
// is over the repo's 500-line file-size limit and may not grow further.
//
// activityDashboard is this client's local view of the "Yours" Activity
// dashboard (Phase 1, docs/activity-dashboard-plan.md): open/loading/error
// state plus the last fetched PersonalActivityTimeline. activitySeen mirrors
// the server-side watermark (seeded from INIT.activitySeen, see
// client-network-init-message.ts) that the dashboard acknowledges on open.
export const createInitialActivityDashboardState = () => ({
  activityDashboard: {
    open: false,
    loading: false,
    timeline: undefined as PersonalActivityTimeline | undefined,
    error: undefined as string | undefined,
    activeView: "YOURS" as "YOURS" | "WORLD_PULSE" | "UPDATES",
    worldPulse: undefined as WorldPulse | undefined,
    worldPulseLoading: false,
    worldPulseError: undefined as string | undefined,
    updatesAutoOpenedThisSession: false,
    acknowledgedFor: 0,
    autoOpenedThisSession: false
  },
  activitySeen: {
    lastActivitySeenAt: 0,
    lastActivitySeenSeasonId: ""
  }
});
