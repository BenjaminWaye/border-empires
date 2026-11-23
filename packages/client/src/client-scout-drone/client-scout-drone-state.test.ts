import { describe, expect, it, vi } from "vitest";
import { createInitialScoutDroneState, handleScoutDroneMessage, parseScoutDroneFlight, scoutReportFeedText } from "./client-scout-drone-state.js";
import { buildExploreAction, dispatchExploreAction } from "./client-scout-drone-explore-action.js";
import { pushFeedEntry, type FeedMutableState } from "../client-alerts/client-alerts.js";
import { selectBarButtons } from "../client-hud-v2/client-hud-v2-action-bar.js";
import type { FeedEntry } from "../client-types.js";

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
    const report = { targetX: 12, targetY: 4, towns: 1, docks: 0, waystations: 2, watchtowers: 0, resourceTiles: 4, resourcesSighted: [{ resource: "TITANIUM", count: 4 }], planetaryDefenseTiles: 6, empiresSighted: ["rival"] };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: null, report }, state, pushFeed, vi.fn(), shiftBack);
    expect(state.scoutDroneFlight).toBeUndefined();
    expect(pushFeed).toHaveBeenCalledWith(expect.objectContaining({
      title: "Scout report",
      text: "Scout drone returned from (12, 4): 1 town, 2 waystations, TITANIUM (4 tiles), Planetary Defense (6 tiles), the borders of House Vey. It was turned back at House Vey's border.",
      severity: "success",
      focusX: 12,
      focusY: 4
    }));
    expect(state.scoutDroneReport).toMatchObject({ towns: 1, waystations: 2, blockedBy: "rival", at: expect.any(Number) });
  });

  it("points Show at the find the server named, not where the drone was sent", () => {
    const pushFeed = vi.fn();
    const report = { targetX: 12, targetY: 4, focusX: 15, focusY: 7, towns: 1, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [] };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: null, report }, stateWith(), pushFeed, vi.fn(), shiftBack);
    expect(pushFeed).toHaveBeenCalledWith(expect.objectContaining({ title: "Scout report", focusX: 15, focusY: 7 }));
  });

  // The "Scout drone launched" popup only repeated the tap; the drone and its "Back in …" pill on the
  // map confirm the launch. A recall the player asked for needs no popup either.
  it("shows no popup for a launch or a recall", () => {
    const state = stateWith();
    const pushFeed = vi.fn();
    const open = { ...wireFlight, endReason: "TARGET", blockedByPlayerId: undefined };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: open }, state, pushFeed, vi.fn(), shiftBack, 600);
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: { ...open, endReason: "RECALLED" } }, state, pushFeed, vi.fn(), shiftBack, 700);
    expect(pushFeed).not.toHaveBeenCalled();
    expect(state.scoutDroneFlight?.endReason).toBe("RECALLED");
  });

  it("says when a border on its path turns the drone back mid-flight", () => {
    const state = stateWith();
    const pushFeed = vi.fn();
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: { ...wireFlight, endReason: "TARGET", blockedByPlayerId: undefined } }, state, pushFeed, vi.fn(), shiftBack, 60_000);
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: wireFlight }, state, pushFeed, vi.fn(), shiftBack, 60_000);
    expect(pushFeed).toHaveBeenCalledWith(expect.objectContaining({ title: "Scout drone turned back", text: "Turned back at House Vey's border.", severity: "warn" }));
  });

  it("names the border that turned the drone back from the report, even after a reload", () => {
    const pushFeed = vi.fn();
    const report = { targetX: 12, targetY: 4, towns: 0, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [], blockedByPlayerId: "rival" };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: null, report }, stateWith(), pushFeed, vi.fn(), shiftBack, 60_000);
    expect(pushFeed).toHaveBeenCalledWith(expect.objectContaining({ text: "Scout drone returned from (12, 4): found nothing new. It was turned back at House Vey's border.", severity: "success" }));
  });

  it("alerts the player when a rival's scouts reach their border", () => {
    const pushFeed = vi.fn();
    expect(handleScoutDroneMessage({ type: "SCOUT_SIGHTED", scoutPlayerId: "rival", x: 3, y: 8 }, stateWith(), pushFeed, vi.fn())).toBe(true);
    expect(pushFeed).toHaveBeenCalledWith(expect.objectContaining({ text: "Foreign scouts sighted near (3, 8): House Vey.", type: "combat", severity: "warn" }));
  });

  // 2026-11-14 playtest: the report went only to the admin-only Alerts feed, so a player who pressed
  // Explore saw no message at all. 2026-11-21 player review: on the shared alert card it was buried
  // under the guide and House popups. It now gets its own card (client-scout-drone-hud.ts).
  it("keeps the report for its own card instead of the shared alert card", () => {
    const state: ReturnType<typeof stateWith> & FeedMutableState = { ...stateWith(), feed: [], captureAlert: undefined };
    const push = (entry: FeedEntry): void => pushFeedEntry(state, entry);
    const open = { ...wireFlight, endReason: "TARGET", blockedByPlayerId: undefined };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: open }, state, push, vi.fn(), shiftBack, 600);
    const report = { targetX: 12, targetY: 4, towns: 1, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [] };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: null, report }, state, push, vi.fn(), shiftBack, 9_000);
    expect(state.scoutDroneReport).toMatchObject({ targetX: 12, targetY: 4, towns: 1, at: 9_000 });
    expect(state.captureAlert).toBeUndefined();
  });

  // 2026-11-21 player review: a flight over open sea reported "Nothing new"; it now counts the tiles it uncovered.
  it("counts the tiles explored since the flight launched", () => {
    const discoveredTiles = new Set(["1,1", "2,2"]);
    const state = { ...stateWith(), discoveredTiles };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: wireFlight }, state, vi.fn(), vi.fn(), shiftBack);
    for (let i = 0; i < 40; i += 1) discoveredTiles.add(`9,${i}`);
    const report = { targetX: 12, targetY: 4, towns: 0, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [] };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: null, report }, state, vi.fn(), vi.fn(), shiftBack);
    expect(state.scoutDroneReport?.explored).toBe(40);
  });

  it("prefers the server's count of tiles the drone saw", () => {
    const state = { ...stateWith(), discoveredTiles: new Set(["1,1"]) };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: wireFlight }, state, vi.fn(), vi.fn(), shiftBack);
    const report = { targetX: 12, targetY: 4, towns: 0, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [], tilesSeen: 311 };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: null, report }, state, vi.fn(), vi.fn(), shiftBack);
    expect(state.scoutDroneReport?.explored).toBe(311);
  });

  // Review 2026-11-21: the launch tick's SCOUT_FINDS arrive before the launch SCOUT_DRONE, and a mid-flight
  // SCOUT_DRONE parsed with a moved clock offset looked like a new flight; both wiped the flight's finds.
  it("keeps a flight's finds across its launch message and later messages with a different clock offset", () => {
    const state = { ...stateWith(), discoveredTiles: new Set<string>() };
    handleScoutDroneMessage({ type: "SCOUT_FINDS", launchedAt: wireFlight.launchedAt, finds: [{ kind: "dock", x: 2, y: 2 }] }, state, vi.fn(), vi.fn(), shiftBack);
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: wireFlight }, state, vi.fn(), vi.fn(), shiftBack);
    expect(state.scoutDroneFinds?.all).toHaveLength(1);
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: wireFlight }, state, vi.fn(), vi.fn(), (t) => t - 900);
    expect(state.scoutDroneFinds?.all).toHaveLength(1);
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: { ...wireFlight, launchedAt: wireFlight.launchedAt + 60_000 } }, state, vi.fn(), vi.fn(), shiftBack);
    expect(state.scoutDroneFinds).toBeUndefined();
  });

  it("ignores other messages", () => {
    expect(handleScoutDroneMessage({ type: "ISLAND_NAMES" }, stateWith(), vi.fn(), vi.fn())).toBe(false);
  });
});

describe("Explore while the drone is out", () => {
  // Owner 2026-11-20: no more waiting for the drone; Explore adds the tile to its route.
  it("stays enabled as the main bar action", () => {
    const [main] = selectBarButtons({ actions: [buildExploreAction()], buildings: [], crystal: [], tabs: ["actions"] });
    expect(main).toMatchObject({ kind: "action", primary: true, action: { id: "explore_scout" } });
    expect(buildExploreAction().disabled).toBeUndefined();
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
    expect(dispatchExploreAction("explore_scout", { x: 4, y: 5 }, { sendGameMessage, pushFeed })).toBe(true);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "EXPLORE", x: 4, y: 5 });
  });

  it("leaves other actions alone", () => {
    expect(dispatchExploreAction("expand_here", { x: 4, y: 5 }, { sendGameMessage: vi.fn(), pushFeed: vi.fn() })).toBe(false);
  });
});
