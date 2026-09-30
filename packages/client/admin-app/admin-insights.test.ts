// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { renderPlayerInsights, type PlayerInsightsResponse } from "./admin-insights.js";

const MIN = 60_000;
const start = Date.UTC(2026, 8, 29, 12, 0);
const distribution = { count: 1, medianMs: 12 * MIN, atLeastMinutes: { "10": 1, "30": 0, "60": 0 } };

const data: PlayerInsightsResponse = {
  insights: {
    generatedAt: start + 60 * MIN,
    acquisition: { visitors: 10, fromLanding: 6, formShown: 8, methodClicked: 4, signUps: 2, methods: { "google.com": 4 } },
    cohort: {
      newAccounts: 2, spawned: 2, firstMove: 1, tenTiles: 1, firstContact: 1, firstContactWithHuman: 0, firstInteraction: 0,
      interactionTypes: {}, medianMsToSpawn: MIN, medianMsToFirstMove: 2 * MIN, medianMsToTenTiles: 9 * MIN, medianMsToFirstContact: 30 * MIN, medianMsToFirstInteraction: null,
      firstSession: distribution
    },
    allSessions: distribution,
    players: [
      {
        playerId: "p1", name: "<script>alert(1)</script>", accountNew: true, firstSeenAt: start, lastSeenAt: start + 12 * MIN,
        spawnedAt: start + MIN, firstContactAt: start + 30 * MIN, firstContactWith: "ai-2", firstContactIsAi: true,
        sessionCount: 1, totalSessionMs: 12 * MIN, longestSessionMs: 12 * MIN, firstSessionMs: 12 * MIN,
        recentSessions: [{ startedAt: start, endedAt: start + 12 * MIN }]
      },
      { playerId: "p2", accountNew: false, firstSeenAt: start, lastSeenAt: start, sessionCount: 0, totalSessionMs: 0, longestSessionMs: 0, recentSessions: [] }
    ]
  },
  counters: { beaconRecorded: 3 }
};

describe("renderPlayerInsights", () => {
  it("renders funnels and a player table with names as inert text", () => {
    const view = renderPlayerInsights(data);
    expect(view.querySelector("script")).toBeNull();
    expect(view.textContent).toContain("<script>alert(1)</script>");
    expect(view.textContent).toContain("6 came from borderempires.com");
    expect(view.querySelectorAll("tr.player")).toHaveLength(2);
  });

  it("filters to new accounts and expands a player's timeline on click", () => {
    const view = renderPlayerInsights(data);
    const newOnly = view.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    newOnly.checked = true;
    newOnly.dispatchEvent(new Event("change"));
    expect(view.querySelectorAll("tr.player")).toHaveLength(1);
    const detail = view.querySelector<HTMLTableRowElement>("tr.detail")!;
    expect(detail.hidden).toBe(true);
    view.querySelector<HTMLTableRowElement>("tr.player")!.click();
    expect(detail.hidden).toBe(false);
    expect(detail.textContent).toContain("first contact with ai-2 (AI)");
  });
});
