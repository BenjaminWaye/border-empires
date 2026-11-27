// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { latestClientChangelogTimestamp } from "../client-changelog/client-changelog.js";
import { createInitialState } from "../client-state/client-state.js";
import { screen, type HudV2Deps } from "./client-hud-v2-context.js";
import { chronicleBadgeCount, chronicleTabClick, renderChronicle, resetChronicleBadgeSeenForTests, takeOverLegacyDashboard } from "./client-hud-v2-chronicle-runtime.js";
import { chronicleTabForDashboardView, worldTabHtml } from "./client-hud-v2-chronicle-tabs.js";

const depsFor = (state: ReturnType<typeof createInitialState>): HudV2Deps =>
  ({ state, ownerColor: () => "#888", sendGameMessage: () => true, renderHud: () => undefined }) as unknown as HudV2Deps;

describe("merged Chronicle", () => {
  afterEach(() => {
    screen.chronicleTab = "yours";
    screen.chronicleUpdatesBaseline = undefined;
    screen.chronicleOpenUpdate = undefined;
    document.body.innerHTML = "";
    window.localStorage.clear();
    resetChronicleBadgeSeenForTests();
  });

  it("maps the old dashboard's views onto Chronicle tabs", () => {
    expect(chronicleTabForDashboardView("YOURS")).toBe("yours");
    expect(chronicleTabForDashboardView("WORLD_PULSE")).toBe("world");
    expect(chronicleTabForDashboardView("UPDATES")).toBe("updates");
  });

  // Regression: the old dashboard (What's new, World Pulse, activity) still opened alongside the Chronicle.
  it("takes over the legacy dashboard's auto-open, on the tab it would have shown", () => {
    const state = createInitialState();
    expect(takeOverLegacyDashboard(state, null)).toBeUndefined();
    state.activityDashboard.open = true;
    state.activityDashboard.activeView = "UPDATES";
    expect(takeOverLegacyDashboard(state, null)).toBe("updates");
    expect(state.activityDashboard.open).toBe(false);
  });

  // Review: a timeline refetch while Chronicle (or another screen) is open re-ran the auto-open and flipped to Updates.
  it("never interrupts a screen that is already open", () => {
    const state = createInitialState();
    state.activityDashboard.open = true;
    state.activityDashboard.activeView = "UPDATES";
    expect(takeOverLegacyDashboard(state, "chronicle")).toBeUndefined();
    expect(state.activityDashboard.open).toBe(false);
    state.activityDashboard.open = true;
    expect(takeOverLegacyDashboard(state, "manifest")).toBeUndefined();
  });

  it("shows unseen release notes, then marks them seen without collapsing the list", () => {
    const state = createInitialState();
    state.changelog.seenAt = 0;
    expect(chronicleBadgeCount(state)).toBeGreaterThan(0);
    document.body.innerHTML = `<aside id="v2c-drawer"></aside>`;
    screen.chronicleTab = "updates";
    renderChronicle(depsFor(state));
    expect(state.changelog.seenAt).toBe(latestClientChangelogTimestamp());
    expect(chronicleBadgeCount(state)).toBe(0);
    renderChronicle(depsFor(state));
    expect(document.getElementById("v2c-drawer")?.querySelectorAll(".v2u-new").length).toBeGreaterThan(0);
  });

  it("switches tabs from the tab row", () => {
    const state = createInitialState();
    document.body.innerHTML = `<aside id="v2c-drawer"><button data-v2-chronicle-tab="world">World</button></aside>`;
    const tab = document.querySelector("[data-v2-chronicle-tab]");
    expect(chronicleTabClick(depsFor(state), tab as Element)).toBe(true);
    expect(screen.chronicleTab).toBe("world");
    expect(document.getElementById("v2c-drawer")?.innerHTML).toContain('data-v2-chronicle-tab="world"');
  });

  it("draws the world pulse: your rank, the leading powers and the day's stories", () => {
    const html = worldTabHtml({
      pulse: { generatedAt: "", seasonId: "s", seasonLabel: "Season 4", rank: 3, rankChange: 2, leadingPowers: [{ playerId: "a", name: "Vasker", score: 912.4, rank: 1 }], stories: [{ type: "WAR_DECLARED" as never, headline: "Border war", text: "Two empires clashed.", participantIds: [] }] },
      loading: false,
      error: undefined
    });
    expect(html).toContain("You #3");
    expect(html).toContain("▲2");
    expect(html).toContain("Vasker");
    expect(html).toContain("Border war");
    expect(worldTabHtml({ pulse: undefined, loading: true, error: undefined })).toContain("Loading");
  });

  // Playtest 2026-11-26: the profile said #23 while World said #24. The pulse is fetched once (and cached by
  // the gateway); the profile reads the live leaderboard. World now reads the same live leaderboard.
  it("ranks you and the leading powers from the live leaderboard the profile reads", () => {
    const pulse = { generatedAt: "", seasonId: "s", rank: 24, leadingPowers: [{ playerId: "old", name: "Stale", score: 1, rank: 1 }], stories: [] };
    const overall = [{ id: "lead", name: "Vasker", score: 900, rank: 1 }, { id: "me", name: "Me", score: 40, rank: 23 }];
    const html = worldTabHtml({ pulse, loading: false, error: undefined, standings: { overall, me: "me" } });
    expect(html).toContain("You #23");
    expect(html).not.toContain("#24");
    expect(html).toContain("Vasker");
    expect(html).not.toContain("Stale");
    expect(worldTabHtml({ pulse, loading: false, error: undefined, standings: { overall, me: "nobody" } })).toContain("Unranked");
  });

  // Playtest 2026-11 (staging): the rank went live in #2999 but its ▲/▼ still came from the fetched rank.
  it("measures the rank arrow against the live rank", () => {
    // Last visit #25, fetched #24 (rankChange 1), live #23: up 2 since the last visit.
    const pulse = { generatedAt: "", seasonId: "s", rank: 24, rankChange: 1, leadingPowers: [], stories: [] };
    const live = (rank: number) => ({ overall: [{ id: "me", name: "Me", score: 40, rank }], me: "me" });
    expect(worldTabHtml({ pulse, loading: false, error: undefined, standings: live(23) })).toContain("You #23<span class=\"v2c-rank-change v2c-up\">▲2</span>");
    // Fell back to where the last visit left it: no arrow.
    expect(worldTabHtml({ pulse, loading: false, error: undefined, standings: live(25) })).not.toContain("v2c-rank-change");
    // No change at fetch time, then slipped one place live.
    expect(worldTabHtml({ pulse: { generatedAt: "", seasonId: "s", rank: 24, leadingPowers: [], stories: [] }, loading: false, error: undefined, standings: live(25) })).toContain("▼1");
  });

  // Playtest 2026-11-18: the button's badge stayed at 117 after reading Yours (unseen release notes only cleared on Updates).
  it("clears the button badge when the Chronicle is read on Yours, and keeps the Updates tab's own count", () => {
    const state = createInitialState();
    state.changelog.seenAt = 1;
    expect(chronicleBadgeCount(state)).toBeGreaterThan(0);
    document.body.innerHTML = `<aside id="v2c-drawer"></aside>`;
    screen.chronicleTab = "yours";
    renderChronicle(depsFor(state));
    expect(chronicleBadgeCount(state)).toBe(0);
    expect(document.querySelector('[data-v2-chronicle-tab="updates"] .v2c-tab-badge')).not.toBeNull();
    resetChronicleBadgeSeenForTests();
    expect(chronicleBadgeCount(state)).toBe(0);
  });
});
