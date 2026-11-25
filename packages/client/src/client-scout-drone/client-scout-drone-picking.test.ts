import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoutDroneFlight } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { createInitialState } from "../client-state/client-state.js";
import { afcScoutDroneActions, cancelScoutDronePicking, dispatchAfcScoutAction, handleScoutDronePickClick } from "./client-scout-drone-picking.js";
import { launchScoutPlan } from "./client-scout-drone-plan.js";
import { noteMapPress, takeMenuClosingPress } from "./client-scout-drone-closing-press.js";
import { setTrue3DRendererActive } from "../client-renderer-mode.js";

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
    const me = { me: "me", scoutDroneCharges: undefined };
    expect(afcScoutDroneActions(me, afc("me", "active"))).toEqual([{ id: "afc_scout_drone", label: "Send scout drone", cost: "8/8", detail: expect.any(String) }]);
    expect(afcScoutDroneActions(me, afc("me", "inactive"))).toEqual([]);
    expect(afcScoutDroneActions(me, afc("rival", "active"))).toEqual([]);
    expect(afcScoutDroneActions(me, tile(1, 1, "me"))).toEqual([]);
  });

  // Player reviews 2026-11-21: nothing said charges come back, or when; the owner asked for it in the AFC menu.
  it("shows charges left and when the next one comes back", () => {
    const me = { me: "me", scoutDroneCharges: { max: 8, refillMs: 14_400_000, usedAt: [1_000, 2_000, 3_000] } };
    const [row] = afcScoutDroneActions(me, afc("me", "active"), 1_000 + 2 * 60 * 60_000);
    expect(row?.cost).toBe("5/8"); // the bar button has room for the count only
    expect(row?.detail).toContain("Charges: 5/8 · +1 in 2h 00m.");
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

  // Playtest 2026-11-25 18:40: Go pressed during a server restart closed the plan as if it had
  // launched while the send was refused. A refused send keeps the plan for another Go.
  it("keeps the plan open when Go cannot be sent", () => {
    const state = pickingState();
    const d = { ...deps(), sendGameMessage: vi.fn(() => false) };
    dispatchAfcScoutAction("afc_scout_drone", state);
    handleScoutDronePickClick(state, 1, 5, d, 0);
    expect(launchScoutPlan(state, d, 0)).toBe(false);
    expect(d.sendGameMessage).toHaveBeenCalledTimes(1);
    expect(state.scoutDronePicking).toMatchObject({ active: true, stops: [{ x: 1, y: 5 }], launches: 0 });
  });

  it("a tap on fog starts a plan with that tile as the first stop", () => {
    const state = pickingState();
    expect(handleScoutDronePickClick(state, 40, 40, deps(), 0)).toBe(true);
    expect(state.scoutDronePicking).toMatchObject({ active: true, stops: [{ x: 40, y: 40 }] });
  });

  // Playtest Run 4: mid-flight, stray map taps kept opening plans and adding stops.
  it("a tap on fog while the drone flies opens no plan, but Send scout drone still does", () => {
    const state = pickingState(flight(10_000));
    expect(handleScoutDronePickClick(state, 40, 40, deps(), 0, false)).toBe(false);
    expect(state.scoutDronePicking.active).toBe(false);
    expect(dispatchAfcScoutAction("afc_scout_drone", state)).toBe(true);
    expect(handleScoutDronePickClick(state, 40, 40, deps(), 0, false)).toBe(true);
    expect(state.scoutDronePicking.stops).toEqual([{ x: 40, y: 40 }]);
    // Once it has landed, fog taps plan again.
    const landed = pickingState(flight(10_000));
    expect(handleScoutDronePickClick(landed, 40, 40, deps(), 10_000, false)).toBe(true);
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

  // Player report 2026-11-21: a tap on a flying drone's numbered stop added a stop beside it, numbered after the
  // whole route ("5" never placed); trying to take that one off added a "7".
  describe("taps on the flying drone's stops", () => {
    // Out from the AFC at (1,1) down to (1,5), then across to (6,5).
    const outbound = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5]] as const;
    const routeFlight = (): ScoutDroneFlight => ({
      ...flight(60_000),
      targetX: 6,
      targetY: 5,
      steps: outbound.map(([x, y], i) => ({ x, y, at: i * 1_000 })),
      turnIndex: outbound.length - 1,
      waypoints: [{ x: 1, y: 5 }, { x: 6, y: 5 }]
    });

    // The true-3D map numbers these stops; the 2D map draws none.
    beforeEach(() => setTrue3DRendererActive(true));
    afterEach(() => setTrue3DRendererActive(false));

    it("never start a plan on a stop, or on a tile beside one", () => {
      const state = pickingState(routeFlight());
      expect(handleScoutDronePickClick(state, 6, 5, deps(), 0)).toBe(true);
      expect(handleScoutDronePickClick(state, 7, 6, deps(), 0)).toBe(true);
      expect(state.scoutDronePicking).toMatchObject({ active: false, stops: [] });
    });

    it("are taps like any other with a plan open, which draws its own route instead", () => {
      const state = pickingState(routeFlight());
      state.scoutDronePicking = { ...state.scoutDronePicking, active: true, stops: [{ x: 20, y: 20 }] };
      expect(handleScoutDronePickClick(state, 7, 5, deps(), 0)).toBe(true);
      expect(state.scoutDronePicking.stops).toEqual([{ x: 20, y: 20 }, { x: 7, y: 5 }]);
    });

    // Owner, Playtest Run 4: mid-flight no fog tap starts a plan, on either map, near the route or away from it;
    // Send scout drone on the AFC adds stops instead, and fog taps plan again once the drone lands.
    it("start no plan on the 2D map either, nor on fog away from the route, until the drone lands", () => {
      setTrue3DRendererActive(false);
      const state = pickingState(routeFlight());
      expect(handleScoutDronePickClick(state, 7, 6, deps(), 0, false)).toBe(false);
      setTrue3DRendererActive(true);
      expect(handleScoutDronePickClick(state, 30, 30, deps(), 0, false)).toBe(false);
      expect(state.scoutDronePicking).toMatchObject({ active: false, stops: [] });
      expect(handleScoutDronePickClick(state, 30, 30, deps(), 60_000, false)).toBe(true);
      expect(state.scoutDronePicking.stops).toEqual([{ x: 30, y: 30 }]);
    });
  });

  // Review 2026-11-22: a near miss that removed a stop also dropped every stop after it, with no way back.
  it("a tap beside a planned stop adds a stop rather than taking that one off", () => {
    const state = pickingState();
    const d = deps();
    // In range of the AFC at (1,1), so each stop is reached where it was tapped.
    handleScoutDronePickClick(state, 1, 5, d, 0);
    handleScoutDronePickClick(state, 1, 9, d, 0);
    handleScoutDronePickClick(state, 2, 6, d, 0);
    expect(state.scoutDronePicking.stops).toEqual([{ x: 1, y: 5 }, { x: 1, y: 9 }, { x: 2, y: 6 }]);
  });

  it("ignores other action ids", () => {
    expect(dispatchAfcScoutAction("explore_scout", pickingState())).toBe(false);
  });
});

// Player report 2026-11-21: taps meant to close a card landed on the fog and started a plan, and each further
// "closing" tap added a stop. A tap that closes something now only closes it.
describe("a closing tap never starts a scout plan", () => {
  it("only closes an open tile menu", () => {
    const state = pickingState();
    expect(handleScoutDronePickClick(state, 20, 20, deps(), 1_000, true)).toBe(true);
    expect(state.scoutDronePicking.active).toBe(false);
    expect(handleScoutDronePickClick(state, 20, 20, deps(), 1_100)).toBe(true);
    expect(state.scoutDronePicking).toMatchObject({ active: true, stops: [{ x: 20, y: 20 }] });
  });

  it("only closes the landing report card", () => {
    const state = pickingState();
    state.scoutDroneReport = { targetX: 9, targetY: 9, towns: 1, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [], at: 1_000 };
    expect(handleScoutDronePickClick(state, 20, 20, deps(), 2_000)).toBe(true);
    expect(state.scoutDronePicking.active).toBe(false);
    expect(state.scoutDroneReport).toBeUndefined();
    expect(handleScoutDronePickClick(state, 20, 20, deps(), 2_100)).toBe(true);
    expect(state.scoutDronePicking.active).toBe(true);
  });

  it("knows a tap whose press closed the menu, once, and each new press starts over", () => {
    noteMapPress(true);
    expect(takeMenuClosingPress()).toBe(true);
    expect(takeMenuClosingPress()).toBe(false);
    noteMapPress(true); // a pan that never became a tap...
    noteMapPress(false); // ...and the next press finds no menu
    expect(takeMenuClosingPress()).toBe(false);
  });

  it("reads the press by default when the map handler passes nothing", () => {
    const state = pickingState();
    noteMapPress(true);
    expect(handleScoutDronePickClick(state, 20, 20, deps(), 1_000)).toBe(true);
    expect(state.scoutDronePicking.active).toBe(false);
  });

  it("still adds stops to an open plan, menu or not", () => {
    const state = pickingState();
    state.scoutDronePicking = { ...state.scoutDronePicking, active: true, stops: [{ x: 20, y: 20 }] };
    expect(handleScoutDronePickClick(state, 22, 20, deps(), 1_000, true)).toBe(true);
    expect(state.scoutDronePicking.stops).toHaveLength(2);
  });
});
