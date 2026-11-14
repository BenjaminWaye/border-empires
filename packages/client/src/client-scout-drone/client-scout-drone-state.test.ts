import { describe, expect, it, vi } from "vitest";
import { createInitialScoutDroneState, handleScoutDroneMessage, parseScoutDroneFlight, scoutReportFeedText } from "./client-scout-drone-state.js";
import { dispatchExploreAction } from "./client-scout-drone-explore-action.js";

const wireFlight = {
  launchedAt: 1_000,
  landsAt: 9_000,
  targetX: 12,
  targetY: 4,
  steps: [
    { x: 10, y: 4, at: 1_000 },
    { x: 11, y: 4, at: 5_000 },
    { x: 10, y: 4, at: 9_000 }
  ],
  turnIndex: 1,
  endReason: "BLOCKED",
  blockedByPlayerId: "rival"
};

const stateWith = () => ({ ...createInitialScoutDroneState(), playerNames: new Map([["rival", "House Vey"]]) });
const shiftBack = (serverTime: number): number => serverTime - 500;

describe("parseScoutDroneFlight", () => {
  it("converts every server time to local time", () => {
    const flight = parseScoutDroneFlight(wireFlight, shiftBack)!;
    expect(flight.launchedAt).toBe(500);
    expect(flight.landsAt).toBe(8_500);
    expect(flight.steps.map((step) => step.at)).toEqual([500, 4_500, 8_500]);
    expect(flight).toMatchObject({ endReason: "BLOCKED", blockedByPlayerId: "rival", turnIndex: 1 });
  });

  it("rejects a malformed flight", () => {
    expect(parseScoutDroneFlight({ ...wireFlight, steps: [{ x: 1 }] }, shiftBack)).toBeUndefined();
    expect(parseScoutDroneFlight({ ...wireFlight, turnIndex: 7 }, shiftBack)).toBeUndefined();
    expect(parseScoutDroneFlight(null, shiftBack)).toBeUndefined();
  });
});

describe("handleScoutDroneMessage", () => {
  it("stores the launched flight", () => {
    const state = stateWith();
    const renderHud = vi.fn();
    expect(handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: wireFlight }, state, vi.fn(), renderHud, shiftBack)).toBe(true);
    expect(state.scoutDroneFlight?.targetX).toBe(12);
    expect(renderHud).toHaveBeenCalled();
  });

  it("clears the flight on landing and reports what it found, naming the border that turned it back", () => {
    const state = stateWith();
    const pushFeed = vi.fn();
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: wireFlight }, state, pushFeed, vi.fn(), shiftBack);
    const report = { targetX: 12, targetY: 4, towns: 1, docks: 0, waystations: 2, watchtowers: 0, resourceTiles: 4, planetaryDefenseTiles: 6, empiresSighted: ["rival"] };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: null, report }, state, pushFeed, vi.fn(), shiftBack);
    expect(state.scoutDroneFlight).toBeUndefined();
    expect(pushFeed).toHaveBeenCalledWith(
      "Scout drone returned from (12, 4): 1 town, 2 waystations, 4 resource tiles, Planetary Defense (6 tiles), the borders of House Vey. It was turned back at House Vey's border.",
      "info",
      "success"
    );
  });

  it("alerts the player when a rival's scouts reach their border", () => {
    const pushFeed = vi.fn();
    expect(handleScoutDroneMessage({ type: "SCOUT_SIGHTED", scoutPlayerId: "rival", x: 3, y: 8 }, stateWith(), pushFeed, vi.fn())).toBe(true);
    expect(pushFeed).toHaveBeenCalledWith("Foreign scouts sighted near (3, 8): House Vey.", "combat", "warn");
  });

  it("ignores other messages", () => {
    expect(handleScoutDroneMessage({ type: "ISLAND_NAMES" }, stateWith(), vi.fn(), vi.fn())).toBe(false);
  });
});

describe("scoutReportFeedText", () => {
  it("says when nothing new was found", () => {
    const empty = { targetX: 1, targetY: 2, towns: 0, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [] };
    expect(scoutReportFeedText(empty, (id) => id)).toBe("Scout drone returned from (1, 2): found nothing new.");
  });
});

describe("dispatchExploreAction", () => {
  it("sends EXPLORE for the selected tile", () => {
    const sendGameMessage = vi.fn(() => true);
    const pushFeed = vi.fn();
    expect(dispatchExploreAction("explore_scout", { x: 4, y: 5 }, undefined, { sendGameMessage, pushFeed })).toBe(true);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "EXPLORE", x: 4, y: 5 });
  });

  it("does not send while the drone is still out", () => {
    const sendGameMessage = vi.fn(() => true);
    const flight = parseScoutDroneFlight(wireFlight, (t) => t + 60_000)!;
    dispatchExploreAction("explore_scout", { x: 4, y: 5 }, flight, { sendGameMessage, pushFeed: vi.fn() }, 1_000);
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it("leaves other actions alone", () => {
    expect(dispatchExploreAction("expand_here", { x: 4, y: 5 }, undefined, { sendGameMessage: vi.fn(), pushFeed: vi.fn() })).toBe(false);
  });
});
