// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { WorldPulse } from "@border-empires/game-domain";
import { latestClientChangelogTimestamp } from "../client-changelog/client-changelog.js";
import { activityDashboardUnreadCount, renderClientActivityDashboardOverlay, toggleActivityDashboard } from "./client-activity-dashboard.js";

const makeState = () => ({
  activityDashboard: {
    open: false,
    loading: false,
    timeline: undefined as any,
    error: undefined as string | undefined,
    activeView: "YOURS" as "YOURS" | "WORLD_PULSE" | "UPDATES",
    worldPulse: undefined as WorldPulse | undefined,
    worldPulseLoading: false,
    worldPulseError: undefined as string | undefined,
    updatesAutoOpenedThisSession: false,
    acknowledgedFor: 0,
    autoOpenedThisSession: false
  },
  activitySeen: { lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" },
  camX: 0,
  camY: 0,
  camSubX: 0,
  camSubY: 0,
  selected: undefined as { x: number; y: number } | undefined,
  me: "player-1",
  manpowerCap: 1000,
  bridgeDebugSeasonId: "season-1",
  changelog: { open: false, seenAt: 0, scrollTop: 0 },
  authSessionReady: true,
  profileSetupRequired: false,
  playerNames: new Map<string, string>([["player-2", "Rival Name"]])
});

const makeDeps = (state: ReturnType<typeof makeState>) => ({
  state,
  overlayEl: document.createElement("div"),
  sendGameMessage: vi.fn(() => true),
  renderHud: vi.fn(),
  wrapX: (x: number) => x,
  wrapY: (y: number) => y,
  requestViewRefresh: vi.fn(),
  persistSeenAt: vi.fn()
});

describe("activityDashboardUnreadCount", () => {
  it("is 0 with no timeline yet", () => {
    expect(activityDashboardUnreadCount(makeState())).toBe(0);
  });

  it("counts only cards newer than the acknowledged watermark", () => {
    const state = makeState();
    state.activitySeen.lastActivitySeenAt = 500;
    state.activityDashboard.timeline = {
      cards: [{ occurredAt: 100 }, { occurredAt: 600 }, { occurredAt: 900 }]
    };
    expect(activityDashboardUnreadCount(state)).toBe(2);
  });
});

describe("toggleActivityDashboard", () => {
  it("opens the dashboard and fetches a timeline when none is cached yet", () => {
    const state = makeState();
    const deps = makeDeps(state);
    toggleActivityDashboard(deps);
    expect(state.activityDashboard.open).toBe(true);
    expect(deps.sendGameMessage).toHaveBeenCalledWith({ type: "REQUEST_PERSONAL_ACTIVITY" }, expect.any(String));
  });

  it("refetches on every reopen, even with a timeline already cached (plan §4.3/§2.1: fresh data per open)", () => {
    const state = makeState();
    state.activityDashboard.timeline = { cards: [] };
    const deps = makeDeps(state);
    toggleActivityDashboard(deps); // open
    state.activityDashboard.loading = false; // the first request's response arrived
    toggleActivityDashboard(deps); // close
    deps.sendGameMessage.mockClear();
    toggleActivityDashboard(deps); // open again
    expect(deps.sendGameMessage).toHaveBeenCalledWith({ type: "REQUEST_PERSONAL_ACTIVITY" }, expect.any(String));
  });

  it("does not fire a second request while one is already in flight", () => {
    const state = makeState();
    state.activityDashboard.loading = true;
    state.activityDashboard.worldPulseLoading = true;
    const deps = makeDeps(state);
    toggleActivityDashboard(deps); // open while a request is already loading
    expect(deps.sendGameMessage).not.toHaveBeenCalled();
  });

  it("closes on a second call", () => {
    const state = makeState();
    const deps = makeDeps(state);
    toggleActivityDashboard(deps);
    toggleActivityDashboard(deps);
    expect(state.activityDashboard.open).toBe(false);
  });
});

describe("renderClientActivityDashboardOverlay", () => {
  it("hides and clears the overlay when closed", () => {
    const state = makeState();
    const deps = makeDeps(state);
    deps.overlayEl.innerHTML = "<div>stale</div>";
    renderClientActivityDashboardOverlay(deps);
    expect(deps.overlayEl.style.display).toBe("none");
    expect(deps.overlayEl.innerHTML).toBe("");
  });

  it("owns the changelog as an Updates tab instead of yielding to a second modal", () => {
    const state = makeState();
    state.activityDashboard.open = true;
    state.changelog.open = true;
    const deps = makeDeps(state);
    renderClientActivityDashboardOverlay(deps);
    expect(deps.overlayEl.style.display).toBe("grid");
  });

  it("renders an empty state with no acknowledgement call when there's a timeline but no cards", () => {
    const state = makeState();
    state.activityDashboard.open = true;
    state.activityDashboard.timeline = {
      to: 5000,
      summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 },
      goldPlundered: 0,
      goldRaidedFromYou: 0,
      manpowerSpentAttacking: 0,
      cards: [],
      truncated: false
    };
    const deps = makeDeps(state);
    renderClientActivityDashboardOverlay(deps);
    expect(deps.overlayEl.style.display).toBe("grid");
    expect(deps.overlayEl.textContent).toContain("No activity in the last 24 hours.");
    // Acknowledgement still fires even for an empty timeline -- it's the fetch that's meaningful, not the card count.
    expect(deps.sendGameMessage).toHaveBeenCalledWith({ type: "ACKNOWLEDGE_ACTIVITY_SEEN", seenAt: 5000, seasonId: "season-1" });
  });

  it("renders a Center button for a card with coordinates and wires it to move the camera", () => {
    const state = makeState();
    state.activityDashboard.open = true;
    state.activityDashboard.timeline = {
      to: 5000,
      summary: { tilesClaimed: 1, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 },
      goldPlundered: 0,
      goldRaidedFromYou: 0,
      manpowerSpentAttacking: 0,
      cards: [{ kind: "TERRITORY_FLIP_GROUP", id: "a", occurredAt: 1000, direction: "GAINED", counterpartyPlayerId: undefined, tileCount: 1, x: 3, y: 4 }],
      truncated: false
    };
    const deps = makeDeps(state);
    renderClientActivityDashboardOverlay(deps);

    const centerBtn = deps.overlayEl.querySelector("[data-activity-focus-x]") as HTMLButtonElement | null;
    expect(centerBtn).not.toBeNull();
    centerBtn!.click();
    expect(state.camX).toBe(3);
    expect(state.camY).toBe(4);
  });

  it("renders World Pulse without a map action or a personal acknowledgement", () => {
    const state = makeState();
    state.activityDashboard.open = true;
    state.activityDashboard.activeView = "WORLD_PULSE";
    state.activityDashboard.worldPulse = {
      generatedAt: "2026-09-26T12:00:00.000Z", seasonId: "season-1", rank: 4,
      leadingPowers: [{ playerId: "p2", name: "Rival Name", score: 42, rank: 1 }],
      stories: [{ type: "OPEN_WAR", headline: "Open War", text: "Two empires are at war.", participantIds: ["p2", "p3"] }]
    };
    const deps = makeDeps(state);
    renderClientActivityDashboardOverlay(deps);
    expect(deps.overlayEl.textContent).toContain("Two empires are at war.");
    expect(deps.overlayEl.querySelector("[data-activity-focus-x]")).toBeNull();
    expect(deps.sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ACKNOWLEDGE_ACTIVITY_SEEN" }), expect.anything());
  });

  it("marks Updates read without acknowledging the personal timeline", () => {
    const state = makeState();
    state.activityDashboard.open = true;
    state.activityDashboard.activeView = "UPDATES";
    const deps = makeDeps(state);
    renderClientActivityDashboardOverlay(deps);
    expect(state.changelog.seenAt).toBe(latestClientChangelogTimestamp());
    expect(deps.persistSeenAt).toHaveBeenCalled();
    expect(deps.sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ACKNOWLEDGE_ACTIVITY_SEEN" }), expect.anything());
  });
});
