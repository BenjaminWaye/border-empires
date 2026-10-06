import { describe, expect, it } from "vitest";

import { bind, createState, FakeWebSocket } from "./client-network-test-harness.js";

// Regression: a tab that stayed open through a season rollover kept showing the
// previous season's leaderboard and tiles. The simulation's rollover notice never
// reaches a connected client, so the only signal is the season id on the next INIT
// (after the gateway closes the socket and the client reconnects in place).
const sendInit = (ws: FakeWebSocket, seasonId: string): void => {
  ws.emit("message", {
    data: JSON.stringify({
      type: "INIT",
      player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 40, y: 40 } },
      config: { season: { seasonId, worldSeed: 12345 } },
      recovery: { nextClientSeq: 1, pendingCommands: [] }
    })
  });
};

const staleSeasonState = (state: any): void => {
  state.leaderboard.overall = [{ id: "ai-1", name: "Linnea", score: 426.7, tiles: 259, incomePerMinute: 120, techs: 8 }];
  state.seasonVictory = [{ id: "town-control", name: "Town Control" }];
  state.seasonStats = { stale: true };
  state.seasonScoreHistory = [{ playerId: "ai-1" }];
  state.tiles.set("9,9", { x: 9, y: 9, terrain: "LAND", ownerId: "ai-1" });
  state.actionQueue = [{ x: 9, y: 9 }];
  state.queuedTargetKeys.add("9,9");
  state.waypoint = [{ x: 9, y: 9 }];
  state.tileActionMenu.visible = true;
  state.tileActionMenu.currentTileKey = "9,9";
  state.eventLog = [{ id: "old-1" }];
  state.eventLogFeedSeenIds = new Set(["old-1"]);
  state.activityDashboard.timeline = { cards: [{ id: "old-card" }] };
  state.activityDashboard.worldPulse = { seasonLabel: "Season 33" };
  state.camX = 900;
  state.camY = -200;
};

describe("INIT after a season rollover", () => {
  it("drops the previous season's leaderboard, standings and tiles and re-centres on the new home tile", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);
    sendInit(ws, "season-33");
    staleSeasonState(state);

    sendInit(ws, "season-34");

    expect(state.leaderboard.overall).toEqual([]);
    expect(state.seasonVictory).toEqual([]);
    expect(state.seasonStats).toBeUndefined();
    expect(state.seasonScoreHistory).toEqual([]);
    expect(state.tiles.has("9,9")).toBe(false);
    expect(state.actionQueue).toEqual([]);
    expect(state.queuedTargetKeys.size).toBe(0);
    expect(state.waypoint).toEqual([]);
    expect(state.tileActionMenu.visible).toBe(false);
    expect(state.eventLog).toEqual([]);
    expect(state.eventLogFeedSeenIds?.has("old-1")).not.toBe(true); // the new INIT reseeds this set from the new season's log
    expect(state.activityDashboard.timeline).toBeUndefined();
    expect(state.activityDashboard.worldPulse).toBeUndefined();
    expect(state.bridgeDebugSeasonId).toBe("season-34");
    expect(state.camX).toBe(40);
    expect(state.camY).toBe(40);
  });

  it("keeps the leaderboard, tiles and camera on a reconnect within the same season", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);
    sendInit(ws, "season-34");
    staleSeasonState(state);

    sendInit(ws, "season-34");

    expect(state.leaderboard.overall).toHaveLength(1);
    expect(state.seasonVictory).toHaveLength(1);
    expect(state.seasonStats).toEqual({ stale: true });
    expect(state.tiles.has("9,9")).toBe(true);
    expect(state.actionQueue).toHaveLength(1);
    expect(state.activityDashboard.timeline).toBeDefined();
    expect(state.camX).toBe(900);
    expect(state.camY).toBe(-200);
  });

  it("does not touch a fresh page load's state when the first INIT arrives", () => {
    const state = createState();
    state.leaderboard.overall = [{ id: "ai-1", name: "Linnea", score: 1, tiles: 1, incomePerMinute: 1, techs: 1 }];
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInit(ws, "season-34");

    expect(state.leaderboard.overall).toHaveLength(1);
  });
});

describe("socket closed for a season rollover", () => {
  it("tells the player a new season is loading instead of reporting a lost connection", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const mocks = bind(state, ws);

    ws.emit("close", { code: 4009, reason: "season_rollover", wasClean: true });

    expect(mocks.pushFeed).toHaveBeenCalledWith("A new season has started. Loading it...", "error", "warn");
    expect(mocks.pushFeed).not.toHaveBeenCalledWith("Connection lost. Retrying...", "error", "warn");
  });
});
