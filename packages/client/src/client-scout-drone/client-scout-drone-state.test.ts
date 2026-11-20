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
      alert: true,
      focusX: 12,
      focusY: 4
    }));
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
  // Explore saw no message at all. It must reach the on-screen alert card.
  it("shows the report on the alert card, not only in the admin feed", () => {
    const state: ReturnType<typeof stateWith> & FeedMutableState = { ...stateWith(), feed: [], captureAlert: undefined };
    const push = (entry: FeedEntry): void => pushFeedEntry(state, entry);
    const open = { ...wireFlight, endReason: "TARGET", blockedByPlayerId: undefined };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: open }, state, push, vi.fn(), shiftBack, 600);
    expect(state.captureAlert).toBeUndefined();
    const report = { targetX: 12, targetY: 4, towns: 1, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [] };
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: null, report }, state, push, vi.fn(), shiftBack, 9_000);
    expect(state.captureAlert).toMatchObject({ title: "Scout report", detail: "Scout drone returned from (12, 4): 1 town." });
  });

  it("ignores other messages", () => {
    expect(handleScoutDroneMessage({ type: "ISLAND_NAMES" }, stateWith(), vi.fn(), vi.fn())).toBe(false);
  });
});

describe("Explore while the drone is out", () => {
  // 2026-11-14 playtest: a greyed Explore fell to the minor row, where its reason is only a tooltip.
  it("stays the main bar action with its reason, so a phone shows why it is greyed", () => {
    const flight = parseScoutDroneFlight({ ...wireFlight, landsAt: 70_000 }, (t) => t)!;
    const explore = buildExploreAction(flight, 10_000);
    const [main] = selectBarButtons({ actions: [explore], buildings: [], crystal: [], tabs: ["actions"] });
    expect(main).toMatchObject({ kind: "action", primary: true, action: { id: "explore_scout", disabled: true, disabledReason: "Scout drone is out, back in 1m" } });
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
