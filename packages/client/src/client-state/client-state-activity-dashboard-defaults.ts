import type { PersonalActivityTimeline, WorldPulse } from "@border-empires/game-domain";
import type { ActivityDashboardView } from "../client-activity-dashboard/client-activity-dashboard-scroll.js";

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
    activeView: "YOURS" as ActivityDashboardView,
    worldPulse: undefined as WorldPulse | undefined,
    worldPulseLoading: false,
    worldPulseError: undefined as string | undefined,
    updatesAutoOpenedThisSession: false,
    // INIT.player.dashboardQuietedSeasonId: the season whose first login already got the quiet pass (no dashboard auto-open). "" until a first login is recorded.
    quietedSeasonId: "",
    acknowledgedFor: 0,
    autoOpenedThisSession: false,
    // Scroll offset per tab, kept so rebuilds/tab switches do not snap to the top; cleared on close.
    scrollTopByView: {} as Partial<Record<ActivityDashboardView, number>>,
    // changelog.seenAt as of when the Updates tab opened. Reading marks entries seen, so
    // without this the list would swap from "new" to "recent 10" right after the first paint.
    updatesBaselineSeenAt: undefined as number | undefined
  },
  activitySeen: {
    lastActivitySeenAt: 0,
    lastActivitySeenSeasonId: ""
  }
});
