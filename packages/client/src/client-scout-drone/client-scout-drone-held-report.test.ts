// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { handleScoutDroneMessage } from "./client-scout-drone-state.js";
import { renderScoutDroneHud, scoutReportCardVisible } from "./client-scout-drone-hud.js";
import { resetScoutReportsShownHere } from "./client-scout-drone-seen-reports.js";

// Player report 2026-11-21: logging back in after a drone run showed no report. The server keeps the report on
// the player and resends it until some device says it was seen (SCOUT_REPORT_SEEN): players switch between
// desktop and phone (owner). A report that arrives while the page is hidden or loading waits to be seen.
const wireReport = { targetX: 12, targetY: 4, towns: 1, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [], id: "explore-7", landedAt: 50_000 };
const message = { type: "SCOUT_DRONE", flight: null, report: wireReport };

const mapState = () => {
  const state = createInitialState();
  state.me = "me";
  state.authSessionReady = true;
  state.mapPrep = null;
  state.changelog.open = false;
  state.connection = "initialized";
  state.tiles.set("1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active" } } as Tile);
  return state;
};

const setHidden = (hidden: boolean): void => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
};

const seenSends = (send: ReturnType<typeof vi.fn>): unknown[] => send.mock.calls.map((call) => call[0]).filter((msg) => (msg as { type: string }).type === "SCOUT_REPORT_SEEN");

describe("a scout report the player was away for", () => {
  beforeEach(() => {
    resetScoutReportsShownHere();
    setHidden(false);
  });

  it("shows, dated when it landed, and tells the server it was seen", () => {
    const state = mapState();
    const feed = vi.fn();
    const send = vi.fn(() => true);
    handleScoutDroneMessage(message, state, feed, vi.fn(), (t) => t, 900_000);
    expect(feed).toHaveBeenCalledTimes(1);
    expect(feed.mock.calls[0]![0]).toMatchObject({ title: "Scout report", at: 50_000 });
    renderScoutDroneHud(state, { send, rerender: vi.fn(), focus: vi.fn(), now: () => 900_000 });
    expect(scoutReportCardVisible(state, 900_000)).toBe(true);
    expect(seenSends(send)).toEqual([{ type: "SCOUT_REPORT_SEEN", id: "explore-7" }]);
    renderScoutDroneHud(state, { send, rerender: vi.fn(), focus: vi.fn(), now: () => 901_000 });
    expect(seenSends(send)).toHaveLength(1);
  });

  it("doesn't pop up again for a resend this page already showed, and tells the server again", () => {
    const state = mapState();
    const feed = vi.fn();
    const send = vi.fn(() => true);
    handleScoutDroneMessage(message, state, feed, vi.fn(), (t) => t, 1_000);
    renderScoutDroneHud(state, { send, rerender: vi.fn(), focus: vi.fn(), now: () => 1_000 });
    state.scoutDroneReport = undefined; // closed
    handleScoutDroneMessage(message, state, feed, vi.fn(), (t) => t, 5_000); // a reconnect before the server heard
    expect(feed).toHaveBeenCalledTimes(1);
    expect(state.scoutDroneReport).toBeUndefined();
    renderScoutDroneHud(state, { send, rerender: vi.fn(), focus: vi.fn(), now: () => 5_000 });
    expect(seenSends(send)).toHaveLength(2);
  });

  it("tells the server once the session is back, without trying while it is down", () => {
    const state = mapState();
    state.connection = "disconnected";
    const send = vi.fn(() => true);
    handleScoutDroneMessage(message, state, vi.fn(), vi.fn(), (t) => t, 1_000);
    renderScoutDroneHud(state, { send, rerender: vi.fn(), focus: vi.fn(), now: () => 1_000 });
    expect(state.scoutReportUnacked).toBe("explore-7");
    expect(send).not.toHaveBeenCalled(); // the send path would raise an auth error on every render
    state.connection = "initialized";
    renderScoutDroneHud(state, { send, rerender: vi.fn(), focus: vi.fn(), now: () => 2_000 });
    expect(state.scoutReportUnacked).toBeUndefined();
    expect(seenSends(send)).toHaveLength(1);
  });

  // Review 2026-11-21: a locked phone held the report while the desktop showed it; unlocking popped it again.
  it("drops a report it hasn't shown yet once another device has seen it", () => {
    const state = mapState();
    setHidden(true);
    handleScoutDroneMessage(message, state, vi.fn(), vi.fn(), (t) => t, 1_000);
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: null }, state, vi.fn(), vi.fn(), (t) => t, 2_000); // the server's resend after the desktop's SEEN
    expect(state.scoutDroneReport).toBeUndefined();
  });

  it("doesn't count as seen while its card can't show (planning the next flight)", () => {
    const state = mapState();
    const send = vi.fn(() => true);
    state.scoutDronePicking = { ...state.scoutDronePicking, active: true };
    handleScoutDroneMessage(message, state, vi.fn(), vi.fn(), (t) => t, 1_000);
    renderScoutDroneHud(state, { send, rerender: vi.fn(), focus: vi.fn(), now: () => 1_000 });
    expect(seenSends(send)).toHaveLength(0);
    state.scoutDronePicking = { ...state.scoutDronePicking, active: false };
    renderScoutDroneHud(state, { send, rerender: vi.fn(), focus: vi.fn(), now: () => 200_000 });
    expect(scoutReportCardVisible(state, 200_000)).toBe(true);
    expect(seenSends(send)).toHaveLength(1);
  });

  it("starts its card when a hidden tab comes back, and only then counts as seen", () => {
    const state = mapState();
    const send = vi.fn(() => true);
    setHidden(true);
    handleScoutDroneMessage(message, state, vi.fn(), vi.fn(), (t) => t, 1_000);
    renderScoutDroneHud(state, { send, rerender: vi.fn(), focus: vi.fn(), now: () => 1_000 });
    expect(seenSends(send)).toHaveLength(0);

    setHidden(false); // ten minutes later
    renderScoutDroneHud(state, { send, rerender: vi.fn(), focus: vi.fn(), now: () => 601_000 });
    expect(scoutReportCardVisible(state, 601_000)).toBe(true);
    expect(document.getElementById("scout-report-card")!.style.display).toBe("flex");
    expect(seenSends(send)).toEqual([{ type: "SCOUT_REPORT_SEEN", id: "explore-7" }]);
  });

  it("still shows a report without an id (an older server) and sends nothing", () => {
    const state = mapState();
    const { id: _id, landedAt: _landedAt, ...old } = wireReport;
    const feed = vi.fn();
    const send = vi.fn(() => true);
    handleScoutDroneMessage({ type: "SCOUT_DRONE", flight: null, report: old }, state, feed, vi.fn(), (t) => t, 1_000);
    renderScoutDroneHud(state, { send, rerender: vi.fn(), focus: vi.fn(), now: () => 1_000 });
    expect(feed.mock.calls[0]![0]).toMatchObject({ at: 1_000 });
    expect(seenSends(send)).toHaveLength(0);
  });
});
