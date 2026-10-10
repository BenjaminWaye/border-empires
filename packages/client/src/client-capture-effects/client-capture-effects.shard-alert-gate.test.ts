// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderShardAlert } from "./client-capture-effects.js";

type ShardAlertState = Parameters<typeof renderShardAlert>[0];

// A returning player whose What's New dashboard is open when a shard rain
// "started" notice arrives.
const stateWithWhatsNewOpen = (): ShardAlertState =>
  ({
    authSessionReady: true,
    profileSetupRequired: false,
    changelog: { open: false },
    needsSeasonJoin: false,
    joinSeasonOverlayOpen: false,
    respawnOverlayOpen: false,
    seasonWinner: undefined,
    seasonEndDismissed: false,
    activityDashboard: { open: true, loading: false },
    shardRainFxUntil: 0,
    homeTile: undefined,
    shardAlert: { key: "started:1", phase: "started", startsAt: Date.now() - 1_000, expiresAt: Date.now() + 600_000, siteCount: 3 }
  }) as unknown as ShardAlertState;

const makeDeps = () => ({
  shardAlertOverlayEl: document.createElement("div"),
  shardAlertTitleEl: document.createElement("div"),
  shardAlertDetailEl: document.createElement("div")
});

describe("renderShardAlert vs What's New", () => {
  it("holds the shard rain alert while What's New is open, then shows it once closed", () => {
    const state = stateWithWhatsNewOpen();
    const deps = makeDeps();
    renderShardAlert(state, deps);
    expect(deps.shardAlertOverlayEl.style.display).toBe("none");
    expect(state.shardAlert).toBeDefined(); // held, not dropped

    state.activityDashboard.open = false;
    renderShardAlert(state, deps);
    expect(deps.shardAlertOverlayEl.style.display).toBe("block");
    expect(deps.shardAlertTitleEl.textContent).toBe("Shard Rain Begun");
  });

  it("holds the alert while the dashboard is still loading for a returning player", () => {
    const state = stateWithWhatsNewOpen();
    state.activityDashboard.open = false;
    state.activityDashboard.loading = true;
    const deps = makeDeps();
    renderShardAlert(state, deps);
    expect(deps.shardAlertOverlayEl.style.display).toBe("none");
  });
});
