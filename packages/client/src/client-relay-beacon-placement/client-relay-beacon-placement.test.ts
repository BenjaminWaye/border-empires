import { describe, expect, it, vi } from "vitest";
import { tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { isRelayBeaconPlacementRetap, isRelayBeaconPlacementTarget, relayBeaconPlacementCostLabel, startRelayBeaconChain } from "./client-relay-beacon-placement.js";

const setup = (tiles: Tile[], reach: string[]) => {
  const state = createInitialState();
  state.me = "me";
  state.manpower = 10_000;
  state.gold = 10_000;
  for (const tile of tiles) state.tiles.set(tileKey(tile.x, tile.y), tile);
  state.serverReach = new Set(reach);
  state.serverReachRevision += 1;
  const deps = { keyFor: tileKey, sendGameMessage: vi.fn(() => true), processActionQueue: vi.fn(() => true), garrisonThenBuild: vi.fn(), warn: vi.fn() };
  return { state, deps };
};

describe("Relay Beacon placement targets", () => {
  it("accepts settled land, owned FRONTIER in reach and neutral land in reach; refuses outside reach", () => {
    const { state } = setup(
      [
        { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
        { x: 2, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" },
        { x: 3, y: 1, terrain: "LAND" },
        { x: 9, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" },
        { x: 3, y: 2, terrain: "SEA" }
      ],
      ["1,1", "2,1", "3,1", "3,2"]
    );
    expect(isRelayBeaconPlacementTarget(state, state.tiles.get("1,1"))).toBe(true);
    expect(isRelayBeaconPlacementTarget(state, state.tiles.get("2,1"))).toBe(true);
    expect(isRelayBeaconPlacementTarget(state, state.tiles.get("3,1"))).toBe(true);
    expect(isRelayBeaconPlacementTarget(state, state.tiles.get("9,9"))).toBe(false);
    expect(isRelayBeaconPlacementTarget(state, state.tiles.get("3,2"))).toBe(false);
  });

  // Review of PR #2848: the menu offers the beacon on an owned FRONTIER dock/town outside reach (shared
  // frontierBuildBlockedByReach exemption); placement must agree or the offered beacon dead-ends at Confirm.
  it("accepts an owned FRONTIER dock outside reach, exactly as the menu does", () => {
    const { state } = setup([{ x: 8, y: 8, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", dockId: "dock-1" }], []);
    expect(isRelayBeaconPlacementTarget(state, state.tiles.get("8,8"))).toBe(true);
  });

  it("a re-tap of the previewed tile is a confirm; a tap elsewhere is a move", () => {
    const { state } = setup([], []);
    state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: 3, y: 1 };
    expect(isRelayBeaconPlacementRetap(state, 3, 1)).toBe(true);
    expect(isRelayBeaconPlacementRetap(state, 4, 1)).toBe(false);
    state.buildingPlacement = { active: true, structureType: "HYDROWORKS", x: 3, y: 1 };
    expect(isRelayBeaconPlacementRetap(state, 3, 1)).toBe(false);
  });
});

describe("startRelayBeaconChain (runs only after Confirm)", () => {
  it("expands, garrisons and builds on neutral land", () => {
    const { state, deps } = setup([{ x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }, { x: 2, y: 1, terrain: "LAND" }], ["1,1", "2,1"]);
    startRelayBeaconChain(state, state.tiles.get("2,1")!, deps);
    expect(deps.warn).not.toHaveBeenCalled();
    expect(deps.sendGameMessage).toHaveBeenCalledWith({ type: "CLAIM_CONTINUATION_SET", x: 2, y: 1, structureType: "RELAY_BEACON" });
    expect(state.autoBuildTargets.get("2,1")).toBe("RELAY_BEACON");
  });

  it("garrisons then builds on owned FRONTIER land", () => {
    const { state, deps } = setup([{ x: 2, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" }], ["2,1"]);
    startRelayBeaconChain(state, state.tiles.get("2,1")!, deps);
    expect(deps.garrisonThenBuild).toHaveBeenCalledWith(state.tiles.get("2,1"));
  });

  it("spends nothing and says why when the chain is unaffordable", () => {
    const { state, deps } = setup([{ x: 2, y: 1, terrain: "LAND" }], ["2,1"]);
    state.manpower = 0;
    startRelayBeaconChain(state, state.tiles.get("2,1")!, deps);
    expect(deps.warn).toHaveBeenCalledWith("Relay Beacon unaffordable", expect.stringMatching(/^Need \d+ manpower$/));
    expect(deps.sendGameMessage).not.toHaveBeenCalled();
  });
});

// Playtest 2026-11-27 (strategist): the quote said 70 manpower but Confirm took 20. On frontier land the 70 is
// garrison (20) + beacon (50); Confirm pays the garrison and the beacon is charged once the garrison lands.
describe("relayBeaconPlacementCostLabel", () => {
  const priced = (tiles: Tile[], reach: string[]) => {
    const { state } = setup(tiles, reach);
    state.settleManpowerCost = 20;
    state.expandManpowerCost = 10;
    return state;
  };

  it("says what Confirm spends now on owned frontier land", () => {
    const state = priced([{ x: 2, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" }], ["2,1"]);
    expect(relayBeaconPlacementCostLabel(state, state.tiles.get("2,1"))).toMatch(/^70 m\.p\. \(20 now\)(, \d+ coin)?$/);
  });

  it("says what Confirm spends now on neutral land", () => {
    const state = priced([{ x: 3, y: 1, terrain: "LAND" }], ["3,1"]);
    expect(relayBeaconPlacementCostLabel(state, state.tiles.get("3,1"))).toMatch(/^80 m\.p\. \(10 now\)(, \d+ coin)?$/);
  });

  it("keeps a single number on garrisoned land, where Confirm pays it all", () => {
    const state = priced([{ x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }], ["1,1"]);
    expect(relayBeaconPlacementCostLabel(state, state.tiles.get("1,1"))).toMatch(/^\d+ m\.p\.$/);
  });
});
