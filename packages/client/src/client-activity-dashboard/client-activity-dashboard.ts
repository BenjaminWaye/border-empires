import type { ClientState } from "../client-state/client-state.js";
import { changelogBodyHtml, latestClientChangelogTimestamp, markClientChangelogSeen, sortedClientChangelogEntries, unseenClientChangelogEntries } from "../client-changelog/client-changelog.js";
import { escapeActivityDashboardHtml } from "./client-activity-dashboard-escape.js";
import { acknowledgeActivitySeen, requestPersonalActivity, requestWorldPulse } from "./client-activity-dashboard-network.js";
import { wireActivityDashboardCenterButtons } from "./client-activity-dashboard-center.js";
import { activityCardCoordinates, activityCardText, activityCardTimeLabel, summaryCountsLine, truncationLabel } from "./client-activity-dashboard-format.js";
import { worldPulseAtGlanceHtml, worldPulseBodyHtml } from "./client-activity-dashboard-world-pulse.js";

type ActivityDashboardDeps = {
  state: Pick<
    ClientState,
    "activityDashboard" | "activitySeen" | "camX" | "camY" | "camSubX" | "camSubY" | "selected" | "me" | "manpowerCap" | "bridgeDebugSeasonId" | "playerNames" | "changelog" | "authSessionReady" | "profileSetupRequired"
  >;
  overlayEl: HTMLDivElement;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  renderHud: () => void;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  requestViewRefresh: () => void;
  persistSeenAt: (key: string, value: string) => void;
};

/** Unread badge count for the HUD nav button -- newest-card-vs-watermark, computed client-side (plan §0). */
export const activityDashboardUnreadCount = (state: Pick<ClientState, "activityDashboard" | "activitySeen">): number => {
  const timeline = state.activityDashboard.timeline;
  if (!timeline) return 0;
  return timeline.cards.filter((card) => card.occurredAt > state.activitySeen.lastActivitySeenAt).length;
};

/**
 * Wired to the HUD's persistent Activity button (both desktop and mobile).
 * Refetches on every open (plan §4.3: "fetches... when the player opens or
 * refreshes the dashboard"; §2.1: reopening shows the full trailing 24h
 * window) rather than only the first time -- requestPersonalActivity's own
 * `loading` guard already prevents an overlapping duplicate request.
 */
export const toggleActivityDashboard = (deps: ActivityDashboardDeps): void => {
  const { state } = deps;
  state.activityDashboard.open = !state.activityDashboard.open;
  if (state.activityDashboard.open) {
    requestPersonalActivity(state, deps);
    requestWorldPulse(state, deps);
  }
  deps.renderHud();
};

const cardRowHtml = (card: Parameters<typeof activityCardText>[0], playerId: string, playerNames: (id: string) => string | undefined): string => {
  const coords = activityCardCoordinates(card);
  const centerBtn = coords
    ? `<button class="activity-dashboard-center-btn" type="button" data-activity-focus-x="${coords.x}" data-activity-focus-y="${coords.y}">Center</button>`
    : "";
  return `
    <div class="activity-dashboard-card">
      <span class="activity-dashboard-card-text">${activityCardTimeLabel(card)} · ${escapeActivityDashboardHtml(activityCardText(card, playerId, playerNames))}</span>
      ${centerBtn}
    </div>
  `;
};

export const renderClientActivityDashboardOverlay = (deps: ActivityDashboardDeps): void => {
  const { state, overlayEl } = deps;
  const canShow = state.activityDashboard.open;
  overlayEl.style.display = canShow ? "grid" : "none";
  if (!canShow) {
    if (overlayEl.innerHTML) overlayEl.innerHTML = "";
    return;
  }

  const timeline = state.activityDashboard.timeline;
  const yoursBodyHtml = state.activityDashboard.loading && !timeline
    ? `<div class="activity-dashboard-empty-state">Loading your activity…</div>`
    : state.activityDashboard.error && !timeline
      ? `<div class="activity-dashboard-empty-state">${escapeActivityDashboardHtml(state.activityDashboard.error)}</div>`
      : !timeline || timeline.cards.length === 0
        ? `<div class="activity-dashboard-empty-state">No activity in the last 24 hours.</div>`
        : `
          <div class="activity-dashboard-summary-line">${summaryCountsLine(timeline.summary, timeline, state.manpowerCap)}</div>
          ${truncationLabel(timeline) ? `<div class="activity-dashboard-truncation-note">${truncationLabel(timeline)}</div>` : ""}
          ${timeline.cards.map((card) => cardRowHtml(card, state.me, (id) => state.playerNames.get(id))).join("")}
        `;
  const updates = unseenClientChangelogEntries(state.changelog.seenAt);
  const updateEntries = updates.length > 0 ? updates : sortedClientChangelogEntries().slice(0, 10);
  const updatesBodyHtml = updateEntries.length > 0
    ? `<p class="activity-dashboard-updates-summary">${updates.length > 0 ? `${updates.length} new update${updates.length === 1 ? "" : "s"}.` : "Recent updates."}</p><div class="changelog-entry-list">${changelogBodyHtml(updateEntries)}</div>`
    : '<div class="activity-dashboard-empty-state">No release notes yet.</div>';
  const activeView = state.activityDashboard.activeView;
  const bodyHtml = activeView === "YOURS"
    ? yoursBodyHtml
    : activeView === "WORLD_PULSE"
      ? worldPulseBodyHtml({
          loading: state.activityDashboard.worldPulseLoading,
          ...(state.activityDashboard.worldPulse ? { pulse: state.activityDashboard.worldPulse } : {}),
          ...(state.activityDashboard.worldPulseError ? { error: state.activityDashboard.worldPulseError } : {})
        })
      : updatesBodyHtml;

  overlayEl.innerHTML = `
    <div class="activity-dashboard-backdrop" id="activity-dashboard-backdrop"></div>
    <div class="activity-dashboard-modal card" role="dialog" aria-modal="true" aria-labelledby="activity-dashboard-title">
      <button id="activity-dashboard-close" class="activity-dashboard-close-btn" type="button" aria-label="Close activity">×</button>
      <div class="activity-dashboard-modal-scroll">
        ${worldPulseAtGlanceHtml(state.activityDashboard.worldPulse)}
        <div class="activity-dashboard-tabs" role="tablist" aria-label="Activity dashboard">
          <button class="activity-dashboard-tab${activeView === "YOURS" ? " is-active" : ""}" type="button" role="tab" data-activity-dashboard-view="YOURS" aria-controls="activity-dashboard-view" aria-selected="${activeView === "YOURS"}">Yours</button>
          <button class="activity-dashboard-tab${activeView === "WORLD_PULSE" ? " is-active" : ""}" type="button" role="tab" data-activity-dashboard-view="WORLD_PULSE" aria-controls="activity-dashboard-view" aria-selected="${activeView === "WORLD_PULSE"}">World Pulse</button>
          <button class="activity-dashboard-tab${activeView === "UPDATES" ? " is-active" : ""}" type="button" role="tab" data-activity-dashboard-view="UPDATES" aria-controls="activity-dashboard-view" aria-selected="${activeView === "UPDATES"}">Updates${updates.length > 0 ? ` <span class="activity-dashboard-tab-badge">${Math.min(9, updates.length)}</span>` : ""}</button>
        </div>
        <h2 id="activity-dashboard-title" class="guide-title">${activeView === "YOURS" ? "Yours" : activeView === "WORLD_PULSE" ? "World Pulse" : "What's New"}</h2>
        <div id="activity-dashboard-view" role="tabpanel">${bodyHtml}</div>
      </div>
    </div>
  `;

  const closeBtn = overlayEl.querySelector("#activity-dashboard-close") as HTMLButtonElement | null;
  const backdropBtn = overlayEl.querySelector("#activity-dashboard-backdrop") as HTMLDivElement | null;
  const close = (): void => {
    state.activityDashboard.open = false;
    deps.renderHud();
  };
  if (closeBtn) closeBtn.onclick = close;
  if (backdropBtn) backdropBtn.onclick = close;

  overlayEl.querySelectorAll<HTMLButtonElement>("[data-activity-dashboard-view]").forEach((tab) => {
    tab.onclick = () => {
      const view = tab.dataset.activityDashboardView;
      if (view !== "YOURS" && view !== "WORLD_PULSE" && view !== "UPDATES") return;
      state.activityDashboard.activeView = view;
      if (view === "WORLD_PULSE") requestWorldPulse(state, deps);
      if (view === "UPDATES") markClientChangelogSeen(state, latestClientChangelogTimestamp(), deps.persistSeenAt);
      deps.renderHud();
    };
  });

  wireActivityDashboardCenterButtons(overlayEl, state, {
    wrapX: deps.wrapX,
    wrapY: deps.wrapY,
    requestViewRefresh: deps.requestViewRefresh,
    rerender: deps.renderHud
  });

  if (timeline && activeView === "YOURS") acknowledgeActivitySeen(state, state.bridgeDebugSeasonId, deps);
};
