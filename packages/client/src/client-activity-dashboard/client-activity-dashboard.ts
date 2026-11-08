import type { ClientState } from "../client-state/client-state.js";

/** Unread badge count for the Chronicle button -- newest-card-vs-watermark, computed client-side (plan §0). */
export const activityDashboardUnreadCount = (state: Pick<ClientState, "activityDashboard" | "activitySeen">): number => {
  const timeline = state.activityDashboard.timeline;
  if (!timeline) return 0;
  return timeline.cards.filter((card) => card.occurredAt > state.activitySeen.lastActivitySeenAt).length;
};
