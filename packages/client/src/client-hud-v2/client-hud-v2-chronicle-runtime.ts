// Chronicle screen runtime: draws the open tab, switches tabs, marks what was
// read as seen (activity watermark, release notes) and takes over the legacy
// activity dashboard, which never opens while the new HUD is on.

import { crestFor } from "../client-house-crest/client-house-crest.js";
import { latestWelcomeBack } from "../client-welcome-back/client-welcome-back.js";
import { acknowledgeActivitySeen, requestPersonalActivity, requestWorldPulse } from "../client-activity-dashboard/client-activity-dashboard-network.js";
import { activityDashboardUnreadCount } from "../client-activity-dashboard/client-activity-dashboard.js";
import { latestClientChangelogTimestamp, markClientChangelogSeen, unseenClientChangelogEntries } from "../client-changelog/client-changelog.js";
import { storageGet, storageSet } from "../client-state/client-storage.js";
import { focusCamera, screen, screenCentre, writeHtml, type HudV2Deps } from "./client-hud-v2-context.js";
import { chronicleHeadHtml, chronicleHtml } from "./client-hud-v2-chronicle.js";
import { chronicleProgressForState } from "./client-hud-v2-chronicle-progress.js";
import { chronicleTabForDashboardView, chronicleTabsHtml, worldTabHtml, type ChronicleTab } from "./client-hud-v2-chronicle-tabs.js";
import { toggledUpdate, updateKey, updatesTabHtml } from "./client-hud-v2-chronicle-updates.js";
import { aheadTabHtml } from "./client-hud-v2-chronicle-ahead.js";
import { visitForecast, type VisitForecast } from "../client-visit-forecast/client-visit-forecast.js";
import { visitAgenda, type AgendaItem } from "../client-visit-agenda/client-visit-agenda.js";
import { agendaInputForState } from "../client-visit-agenda/client-visit-agenda-state.js";
import { forecastInputForState } from "../client-visit-forecast/client-visit-forecast-state.js";
import { myTowns } from "./client-hud-v2-town-runtime.js";
import { chronicleSurveyClick } from "./client-hud-v2-chronicle-surveys.js";
import { chronicleScoutFindClick } from "./client-hud-v2-chronicle-scout-chips.js";
import { occupationSurveyController } from "../client-occupation-survey.js";
import { fealtyLookupFor } from "../client-fealty/client-fealty.js";

// The newest release note the Chronicle has been opened past. Opening the Chronicle answers the button's badge:
// it read 117 after the player had read Yours, because unseen release notes only cleared on the Updates tab
// (playtest 2026-11-18). The Updates tab keeps its own count until it is opened.
const CHRONICLE_BADGE_SEEN_KEY = "border-empires-chronicle-badge-seen-v1";
let badgeSeenAt: number | undefined;
const chronicleBadgeSeenAt = (): number => (badgeSeenAt ??= Number(storageGet(CHRONICLE_BADGE_SEEN_KEY)) || 0);

/** Test-only: forget the remembered badge watermark. */
export const resetChronicleBadgeSeenForTests = (): void => { badgeSeenAt = undefined; };

/** What the Chronicle button's badge counts: unread activity plus release notes newer than the last Chronicle open. */
export const chronicleBadgeCount = (state: HudV2Deps["state"]): number =>
  activityDashboardUnreadCount(state) + unseenClientChangelogEntries(Math.max(state.changelog.seenAt, chronicleBadgeSeenAt())).length;

const markChronicleBadgeSeen = (): void => {
  const latest = latestClientChangelogTimestamp();
  if (chronicleBadgeSeenAt() >= latest) return;
  badgeSeenAt = latest;
  storageSet(CHRONICLE_BADGE_SEEN_KEY, String(latest));
};

export const renderChronicle = (deps: HudV2Deps): void => {
  const { state } = deps;
  const dash = state.activityDashboard;
  const tab = screen.chronicleTab;
  markChronicleBadgeSeen();
  if (tab !== "updates") {
    screen.chronicleUpdatesBaseline = undefined;
    screen.chronicleOpenUpdate = undefined;
  } else screen.chronicleUpdatesBaseline ??= state.changelog.seenAt;
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
      crestOf: (id) => crestFor(state, id),
      techName: (id) => state.techCatalog.find((t) => t.id === id)?.name,
      fealtyWith: fealtyLookupFor(state),
      nowMs: Date.now(),
      awaySince: screen.chronicleAwaySince,
      respawn: state.respawnNotice,
      welcomeBack: latestWelcomeBack(),
      progress: chronicleProgressForState(state),
      surveys: occupationSurveyController.currentReports(state.techIds ?? [])
    }, tabs));
    if (dash.timeline) acknowledgeActivitySeen(state, state.bridgeDebugSeasonId, deps);
    return;
  }
  if (tab === "ahead") {
    const ahead = aheadForecast(deps, Date.now());
    writeHtml("v2c-drawer", `${chronicleHeadHtml(tabs)}${aheadTabHtml(ahead.forecast, ahead.agenda)}`);
    return;
  }
  const body = tab === "world"
    ? worldTabHtml({ pulse: dash.worldPulse, loading: dash.worldPulseLoading, error: dash.worldPulseError, standings: { overall: state.leaderboard.overall, me: state.me } })
    : updatesTabHtml(screen.chronicleUpdatesBaseline ?? state.changelog.seenAt, screen.chronicleOpenUpdate);
  writeHtml("v2c-drawer", `${chronicleHeadHtml(tabs)}${body}`);
  if (tab === "updates" && unseenClientChangelogEntries(state.changelog.seenAt).length > 0) {
    markClientChangelogSeen(state, latestClientChangelogTimestamp(), storageSet);
  }
};

/** The forecast scans every tile for work in progress, so it is rebuilt at most this often while the tab is open. */
const AHEAD_MAX_AGE_MS = 5_000;
let aheadCache: { at: number; forecast: VisitForecast; agenda: AgendaItem[] } | undefined;

const aheadForecast = (deps: HudV2Deps, nowMs: number): { forecast: VisitForecast; agenda: AgendaItem[] } => {
  if (!aheadCache || nowMs - aheadCache.at >= AHEAD_MAX_AGE_MS || nowMs < aheadCache.at) {
    const towns = myTowns(deps, nowMs);
    aheadCache = { at: nowMs, forecast: visitForecast(forecastInputForState(deps.state, towns, nowMs)), agenda: visitAgenda(agendaInputForState(deps.state, towns, nowMs)) };
  }
  return aheadCache;
};

/** Fetches what a tab shows the first time it is opened (the activity timeline refetches on every open). */
export const loadChronicleTab = (deps: HudV2Deps, tab: ChronicleTab): void => {
  // Opening the Chronicle or a tab rebuilds Ahead, so a decision just acted on is not still listed.
  aheadCache = undefined;
  if (tab === "yours") requestPersonalActivity(deps.state, deps);
  else if (tab === "world" && !deps.state.activityDashboard.worldPulse) requestWorldPulse(deps.state, deps);
};

/** Tab and release-note clicks inside the Chronicle; true when handled. */
export const chronicleTabClick = (deps: HudV2Deps, target: Element): boolean => {
  if (chronicleSurveyClick(deps, target)) return true;
  if (chronicleScoutFindClick(deps, target, () => renderChronicle(deps))) return true;
  const ahead = target.closest<HTMLElement>("[data-v2-ahead-focus]");
  if (ahead) {
    const x = Number(ahead.dataset.x);
    const y = Number(ahead.dataset.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      focusCamera(deps, x, y);
      // An agenda row is a decision: open the tile's own menu, where the action is (as the timeline's Show does).
      const tile = ahead.hasAttribute("data-v2-ahead-select") ? deps.state.tiles.get(`${deps.wrapX(x)},${deps.wrapY(y)}`) : undefined;
      if (tile) {
        const centre = screenCentre();
        deps.actionFlow.openSingleTileActionMenu(tile, centre.x, centre.y);
      }
      deps.renderHud();
    }
    return true;
  }
  const update = target.closest<HTMLElement>("[data-v2-update]")?.dataset.v2Update;
  if (update) {
    const baseline = screen.chronicleUpdatesBaseline ?? deps.state.changelog.seenAt;
    const newest = unseenClientChangelogEntries(baseline)[0];
    const newestUnread = newest ? updateKey(newest) : undefined;
    screen.chronicleOpenUpdate = toggledUpdate(screen.chronicleOpenUpdate, newestUnread, update);
    renderChronicle(deps);
    return true;
  }
  const tab = target.closest<HTMLElement>("[data-v2-chronicle-tab]")?.dataset.v2ChronicleTab;
  if (tab !== "yours" && tab !== "ahead" && tab !== "world" && tab !== "updates") return false;
  aheadCache = undefined;
  screen.chronicleTab = tab;
  loadChronicleTab(deps, tab);
  renderChronicle(deps);
  return true;
};

/**
 * The legacy dashboard opens itself on login (new activity, else unseen release notes) and from its old
 * buttons. Under the new HUD that becomes the Chronicle on the same tab; returns the tab to open, or undefined.
 * It never interrupts a screen that is already open: every timeline refetch (each Chronicle open, a reconnect)
 * re-runs that auto-open logic, which would otherwise flip an open Chronicle to Updates or replace the Manifest.
 */
export const takeOverLegacyDashboard = (state: HudV2Deps["state"], openScreenId: string | null): ChronicleTab | undefined => {
  if (!state.activityDashboard.open) return undefined;
  state.activityDashboard.open = false;
  return openScreenId ? undefined : chronicleTabForDashboardView(state.activityDashboard.activeView);
};
