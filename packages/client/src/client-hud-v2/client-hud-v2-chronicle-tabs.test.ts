// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { latestClientChangelogTimestamp } from "../client-changelog/client-changelog.js";
import { createInitialState } from "../client-state/client-state.js";
import { screen, type HudV2Deps } from "./client-hud-v2-context.js";
import { chronicleBadgeCount, chronicleTabClick, renderChronicle, takeOverLegacyDashboard } from "./client-hud-v2-chronicle-runtime.js";
import { chronicleTabForDashboardView, updatesTabHtml, worldTabHtml } from "./client-hud-v2-chronicle-tabs.js";

const depsFor = (state: ReturnType<typeof createInitialState>): HudV2Deps =>
  ({ state, ownerColor: () => "#888", sendGameMessage: () => true, renderHud: () => undefined }) as unknown as HudV2Deps;

describe("merged Chronicle", () => {
  afterEach(() => {
    screen.chronicleTab = "yours";
    screen.chronicleUpdatesBaseline = undefined;
    document.body.innerHTML = "";
  });

  it("maps the old dashboard's views onto Chronicle tabs", () => {
    expect(chronicleTabForDashboardView("YOURS")).toBe("yours");
    expect(chronicleTabForDashboardView("WORLD_PULSE")).toBe("world");
    expect(chronicleTabForDashboardView("UPDATES")).toBe("updates");
  });

  // Regression: the old dashboard (What's new, World Pulse, activity) still opened alongside the Chronicle.
  it("takes over the legacy dashboard's auto-open, on the tab it would have shown", () => {
    const state = createInitialState();
    expect(takeOverLegacyDashboard(state)).toBeUndefined();
    state.activityDashboard.open = true;
    state.activityDashboard.activeView = "UPDATES";
    expect(takeOverLegacyDashboard(state)).toBe("updates");
    expect(state.activityDashboard.open).toBe(false);
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
    expect(document.getElementById("v2c-drawer")?.innerHTML).toMatch(/\d+ new/);
    expect(updatesTabHtml(latestClientChangelogTimestamp())).toContain("Recent");
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
});
