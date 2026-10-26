// Chronicle screen runtime: draws the open tab, switches tabs, marks what was
// read as seen (activity watermark, release notes) and takes over the legacy
// activity dashboard, which never opens while the new HUD is on.

import { acknowledgeActivitySeen, requestPersonalActivity, requestWorldPulse } from "../client-activity-dashboard/client-activity-dashboard-network.js";
import { activityDashboardUnreadCount } from "../client-activity-dashboard/client-activity-dashboard.js";
import { latestClientChangelogTimestamp, markClientChangelogSeen, unseenClientChangelogEntries } from "../client-changelog/client-changelog.js";
import { storageSet } from "../client-state/client-storage.js";
import { screen, writeHtml, type HudV2Deps } from "./client-hud-v2-context.js";
import { chronicleHeadHtml, chronicleHtml } from "./client-hud-v2-chronicle.js";
import { chronicleTabForDashboardView, chronicleTabsHtml, updatesTabHtml, worldTabHtml, type ChronicleTab } from "./client-hud-v2-chronicle-tabs.js";

/** What the Chronicle button's badge counts: unread activity plus unseen release notes. */
export const chronicleBadgeCount = (state: HudV2Deps["state"]): number =>
  activityDashboardUnreadCount(state) + unseenClientChangelogEntries(state.changelog.seenAt).length;

export const renderChronicle = (deps: HudV2Deps): void => {
  const { state } = deps;
  const dash = state.activityDashboard;
  const tab = screen.chronicleTab;
  if (tab !== "updates") screen.chronicleUpdatesBaseline = undefined;
  else screen.chronicleUpdatesBaseline ??= state.changelog.seenAt;
  const tabs = chronicleTabsHtml({
    tab,
    unreadActivity: activityDashboardUnreadCount(state),
    // While Updates is open its own badge would drop to 0 as soon as it is marked seen; keep the pinned count.
    unseenUpdates: unseenClientChangelogEntries(screen.chronicleUpdatesBaseline ?? state.changelog.seenAt).length
  });
  if (tab === "yours") {
    writeHtml("v2c-drawer", chronicleHtml({
      me: state.me,
      timeline: dash.timeline,
      loading: dash.loading,
      error: dash.error,
      rivalFilter: screen.chronicleRival,
      selectedId: screen.chronicleSelectedId,
      nameOf: (id) => state.playerNames.get(id),
      colorOf: (id) => deps.ownerColor(id),
      techName: (id) => state.techCatalog.find((t) => t.id === id)?.name,
      nowMs: Date.now()
    }, tabs));
    if (dash.timeline) acknowledgeActivitySeen(state, state.bridgeDebugSeasonId, deps);
    return;
  }
  const body = tab === "world"
    ? worldTabHtml({ pulse: dash.worldPulse, loading: dash.worldPulseLoading, error: dash.worldPulseError })
    : updatesTabHtml(screen.chronicleUpdatesBaseline ?? state.changelog.seenAt);
  writeHtml("v2c-drawer", `${chronicleHeadHtml(tabs)}${body}`);
  if (tab === "updates" && unseenClientChangelogEntries(state.changelog.seenAt).length > 0) {
    markClientChangelogSeen(state, latestClientChangelogTimestamp(), storageSet);
  }
};

/** Fetches what a tab shows the first time it is opened (the activity timeline refetches on every open). */
export const loadChronicleTab = (deps: HudV2Deps, tab: ChronicleTab): void => {
  if (tab === "yours") requestPersonalActivity(deps.state, deps);
  else if (tab === "world" && !deps.state.activityDashboard.worldPulse) requestWorldPulse(deps.state, deps);
};

/** Tab clicks inside the Chronicle; true when handled. */
export const chronicleTabClick = (deps: HudV2Deps, target: Element): boolean => {
  const tab = target.closest<HTMLElement>("[data-v2-chronicle-tab]")?.dataset.v2ChronicleTab;
  if (tab !== "yours" && tab !== "world" && tab !== "updates") return false;
  screen.chronicleTab = tab;
  loadChronicleTab(deps, tab);
  renderChronicle(deps);
  return true;
};

/**
 * The legacy dashboard opens itself on login (new activity, else unseen release notes) and from its old
 * buttons. Under the new HUD that becomes the Chronicle on the same tab; returns the tab to open, or undefined.
 */
export const takeOverLegacyDashboard = (state: HudV2Deps["state"]): ChronicleTab | undefined => {
  if (!state.activityDashboard.open) return undefined;
  state.activityDashboard.open = false;
  return chronicleTabForDashboardView(state.activityDashboard.activeView);
};
