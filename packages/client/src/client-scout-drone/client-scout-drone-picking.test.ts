import { describe, expect, it, vi } from "vitest";
import type { ScoutDroneFlight } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { createInitialState } from "../client-state/client-state.js";
import { afcScoutDroneActions, cancelScoutDronePicking, dispatchAfcScoutAction, handleScoutDronePickClick } from "./client-scout-drone-picking.js";
import { launchScoutPlan } from "./client-scout-drone-plan.js";

const flight = (landsAt: number): ScoutDroneFlight => ({
  launchedAt: 0,
  landsAt,
  targetX: 9,
  targetY: 9,
  steps: [{ x: 1, y: 1, at: 0 }],
  turnIndex: 0,
  endReason: "TARGET"
});

const tile = (x: number, y: number, ownerId?: string): Tile => ({ x, y, terrain: "LAND", ...(ownerId ? { ownerId } : {}) }) as Tile;

const pickingState = (scoutDroneFlight?: ScoutDroneFlight) => ({
  ...createInitialState(),
  me: "me",
  allies: ["friend"],
  scoutDroneFlight,
  scoutDronePicking: { active: false, stops: [] as Array<{ x: number; y: number }>, bumpAt: 0, shakeAt: 0, launches: 0 },
  discoveredTiles: new Set(["1,1", "2,1", "3,1", "4,1"]),
  tiles: new Map<string, Tile>([
    ["1,1", { ...tile(1, 1, "me"), afc: { ownerId: "me", status: "active" } } as Tile],
    ["2,1", tile(2, 1, "friend")],
    ["3,1", tile(3, 1, "rival")],
    ["4,1", tile(4, 1)]
  ])
});

const deps = () => ({ pushFeed: vi.fn(), sendGameMessage: vi.fn(() => true), renderHud: vi.fn() });

describe("afcScoutDroneActions", () => {
  const afc = (ownerId: string, status: "active" | "inactive"): Tile => ({ ...tile(1, 1, ownerId), afc: { ownerId, status } }) as Tile;

  it("is offered only on your own active AFC, and never disabled (a drone out takes more stops)", () => {
    expect(afcScoutDroneActions({ me: "me" }, afc("me", "active"))).toEqual([{ id: "afc_scout_drone", label: "Send scout drone", detail: expect.any(String) }]);
    expect(afcScoutDroneActions({ me: "me" }, afc("me", "inactive"))).toEqual([]);
    expect(afcScoutDroneActions({ me: "me" }, afc("rival", "active"))).toEqual([]);
    expect(afcScoutDroneActions({ me: "me" }, tile(1, 1, "me"))).toEqual([]);
  });
});

describe("planning a scout flight", () => {
  it("Send scout drone opens an empty plan; taps add stops and Go sends them as waypoints", () => {
    const state = pickingState();
    const d = deps();
    expect(dispatchAfcScoutAction("afc_scout_drone", state)).toBe(true);
    expect(state.scoutDronePicking).toMatchObject({ active: true, stops: [] });
    // Straight down from the AFC at (1,1), clear of the rival at (3,1).
    expect(handleScoutDronePickClick(state, 1, 5, d, 0)).toBe(true);
    expect(handleScoutDronePickClick(state, 6, 5, d, 0)).toBe(true);
    expect(state.scoutDronePicking.stops).toEqual([{ x: 1, y: 5 }, { x: 6, y: 5 }]);
    expect(d.sendGameMessage).not.toHaveBeenCalled();
    expect(launchScoutPlan(state, d, 0)).toBe(true);
    expect(d.sendGameMessage).toHaveBeenCalledWith({ type: "EXPLORE", x: 1, y: 5, waypoints: [{ x: 1, y: 5 }, { x: 6, y: 5 }] });
    expect(state.scoutDronePicking.active).toBe(false);
  });

  it("a tap on fog starts a plan with that tile as the first stop", () => {
    const state = pickingState();
    expect(handleScoutDronePickClick(state, 40, 40, deps(), 0)).toBe(true);
    expect(state.scoutDronePicking).toMatchObject({ active: true, stops: [{ x: 40, y: 40 }] });
  });

  it("pulls a stop that is too far back to the leg's range when sent", () => {
    const state = pickingState();
    const d = deps();
    handleScoutDronePickClick(state, 1, 60, d, 0);
    launchScoutPlan(state, d, 0);
    // AFC at (1,1), own land only there: 20 open tiles straight down reach y=21.
    expect(d.sendGameMessage).toHaveBeenCalledWith({ type: "EXPLORE", x: 1, y: 21, waypoints: [{ x: 1, y: 21 }] });
  });

  it("tapping a stop takes it and the ones after it off", () => {
    const state = pickingState();
    const d = deps();
    handleScoutDronePickClick(state, 40, 40, d, 0);
    handleScoutDronePickClick(state, 4, 1, d, 0);
    handleScoutDronePickClick(state, 4, 6, d, 0);
    handleScoutDronePickClick(state, 4, 1, d, 0);
    expect(state.scoutDronePicking.stops).toEqual([{ x: 40, y: 40 }]);
  });

  it("adds no stop beyond the charges left, and shakes the dock instead", () => {
    const state = { ...pickingState(), scoutDroneCharges: { max: 8, refillMs: 1000, usedAt: [0, 0, 0, 0, 0, 0, 0] } };
    const d = deps();
    handleScoutDronePickClick(state, 40, 40, d, 0);
    handleScoutDronePickClick(state, 42, 40, d, 5);
    expect(state.scoutDronePicking.stops).toHaveLength(1);
    expect(state.scoutDronePicking.shakeAt).toBe(5);
  });

  it("ignores taps on own and allied land while planning", () => {
    const state = pickingState();
    const d = deps();
    dispatchAfcScoutAction("afc_scout_drone", state);
    expect(handleScoutDronePickClick(state, 1, 1, d, 0)).toBe(true);
    expect(handleScoutDronePickClick(state, 2, 1, d, 0)).toBe(true);
    expect(state.scoutDronePicking.stops).toEqual([]);
  });

  it("leaves taps on explored ground alone when not planning, and Cancel clears the plan", () => {
    const state = pickingState();
    const d = deps();
    expect(handleScoutDronePickClick(state, 4, 1, d, 0)).toBe(false);
    handleScoutDronePickClick(state, 40, 40, d, 0);
    cancelScoutDronePicking(state);
    expect(state.scoutDronePicking).toMatchObject({ active: false, stops: [] });
  });

  it("doesn't start a plan while a march pick is waiting for the tap", () => {
    const state = pickingState();
    state.musterMarchTargeting.active = true;
    expect(handleScoutDronePickClick(state, 40, 40, deps(), 0)).toBe(false);
  });

  it("with the drone out, plans more stops and Go adds them to its route", () => {
    const state = pickingState(flight(60_000));
    const d = deps();
    expect(dispatchAfcScoutAction("afc_scout_drone", state)).toBe(true);
    expect(state.scoutDronePicking.active).toBe(true);
    handleScoutDronePickClick(state, 1, 5, d, 0);
    expect(launchScoutPlan(state, d, 0)).toBe(true);
    expect(d.sendGameMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "EXPLORE", waypoints: [expect.any(Object)] }));
  });

  it("ignores other action ids", () => {
    expect(dispatchAfcScoutAction("explore_scout", pickingState())).toBe(false);
  });
});
