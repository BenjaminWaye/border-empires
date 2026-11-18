import { describe, expect, it, vi } from "vitest";
import type { ScoutDroneFlight } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { createInitialState } from "../client-state/client-state.js";
import { afcScoutDroneActions, cancelScoutDronePicking, dispatchAfcScoutAction, handleScoutDronePickClick } from "./client-scout-drone-picking.js";
import { SCOUT_DRONE_PICKING_CARD_HTML } from "../client-hud/client-hud-targeting-overlay.js";

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
  scoutDronePicking: { active: false },
  tiles: new Map<string, Tile>([
    ["1,1", tile(1, 1, "me")],
    ["2,1", tile(2, 1, "friend")],
    ["3,1", tile(3, 1, "rival")],
    ["4,1", tile(4, 1)]
  ])
});

const deps = () => ({ pushFeed: vi.fn(), sendGameMessage: vi.fn(() => true), renderHud: vi.fn() });

describe("afcScoutDroneActions", () => {
  const afc = (ownerId: string, status: "active" | "inactive"): Tile => ({ ...tile(1, 1, ownerId), afc: { ownerId, status } }) as Tile;

  it("is offered only on your own active AFC", () => {
    expect(afcScoutDroneActions({ me: "me", scoutDroneFlight: undefined }, afc("me", "active"), 0)).toEqual([expect.objectContaining({ id: "afc_scout_drone", label: "Send scout drone" })]);
    expect(afcScoutDroneActions({ me: "me", scoutDroneFlight: undefined }, afc("me", "inactive"), 0)).toEqual([]);
    expect(afcScoutDroneActions({ me: "me", scoutDroneFlight: undefined }, afc("rival", "active"), 0)).toEqual([]);
    expect(afcScoutDroneActions({ me: "me", scoutDroneFlight: undefined }, tile(1, 1, "me"), 0)).toEqual([]);
  });

  it("is disabled with the time left while the drone is out", () => {
    const [send] = afcScoutDroneActions({ me: "me", scoutDroneFlight: flight(31_000) }, afc("me", "active"), 1_000);
    expect(send).toMatchObject({ id: "afc_scout_drone", disabled: true, disabledReason: "Scout drone is out, back in 30s" });
  });

  it("offers Recall drone first while the drone is still flying out, and not once it is heading home", () => {
    const outbound: ScoutDroneFlight = { ...flight(40_000), steps: [{ x: 1, y: 1, at: 0 }, { x: 2, y: 1, at: 10_000 }, { x: 1, y: 1, at: 20_000 }], turnIndex: 1 };
    expect(afcScoutDroneActions({ me: "me", scoutDroneFlight: outbound }, afc("me", "active"), 5_000).map((a) => a.id)).toEqual(["recall_scout", "afc_scout_drone"]);
    expect(afcScoutDroneActions({ me: "me", scoutDroneFlight: outbound }, afc("me", "active"), 15_000).map((a) => a.id)).toEqual(["afc_scout_drone"]);
    // Already called home but still finishing its last outbound leg: no second Recall to tap.
    expect(afcScoutDroneActions({ me: "me", scoutDroneFlight: { ...outbound, endReason: "RECALLED" } }, afc("me", "active"), 5_000).map((a) => a.id)).toEqual(["afc_scout_drone"]);
  });
});

describe("Send scout drone picking", () => {
  it("arms picking, then sends EXPLORE to the next tap beyond your land", () => {
    const state = pickingState();
    const d = deps();
    expect(dispatchAfcScoutAction("afc_scout_drone", state, d, 0)).toBe(true);
    expect(state.scoutDronePicking.active).toBe(true);

    expect(handleScoutDronePickClick(state, 3, 1, d, 0)).toBe(true);
    expect(d.sendGameMessage).toHaveBeenCalledWith({ type: "EXPLORE", x: 3, y: 1 });
    expect(state.scoutDronePicking.active).toBe(false);
  });

  it("sends EXPLORE to an unexplored tile the client has no data for", () => {
    const state = { ...pickingState(), scoutDronePicking: { active: true } };
    const d = deps();
    handleScoutDronePickClick(state, 40, 40, d, 0);
    expect(d.sendGameMessage).toHaveBeenCalledWith({ type: "EXPLORE", x: 40, y: 40 });
  });

  it("refuses own and allied land and keeps picking", () => {
    const state = { ...pickingState(), scoutDronePicking: { active: true } };
    const d = deps();
    expect(handleScoutDronePickClick(state, 1, 1, d, 0)).toBe(true);
    expect(handleScoutDronePickClick(state, 2, 1, d, 0)).toBe(true);
    expect(d.sendGameMessage).not.toHaveBeenCalled();
    expect(d.pushFeed).toHaveBeenCalledTimes(2);
    expect(state.scoutDronePicking.active).toBe(true);
  });

  it("leaves map taps alone when not picking, and Cancel disarms", () => {
    const state = pickingState();
    const d = deps();
    expect(handleScoutDronePickClick(state, 4, 1, d, 0)).toBe(false);
    state.scoutDronePicking.active = true;
    cancelScoutDronePicking(state);
    expect(handleScoutDronePickClick(state, 4, 1, d, 0)).toBe(false);
    expect(d.sendGameMessage).not.toHaveBeenCalled();
  });

  it("does not arm while the drone is out", () => {
    const state = pickingState(flight(10_000));
    const d = deps();
    expect(dispatchAfcScoutAction("afc_scout_drone", state, d, 0)).toBe(true);
    expect(state.scoutDronePicking.active).toBe(false);
    expect(d.pushFeed).toHaveBeenCalledWith("Scout drone is out, back in 10s.", "info", "warn");
  });

  it("ignores other action ids", () => {
    expect(dispatchAfcScoutAction("explore_scout", pickingState(), deps(), 0)).toBe(false);
  });

  it("shows an armed card with a Cancel button", () => {
    expect(SCOUT_DRONE_PICKING_CARD_HTML).toContain("Send scout drone");
    expect(SCOUT_DRONE_PICKING_CARD_HTML).toContain('id="targeting-cancel"');
  });
});
