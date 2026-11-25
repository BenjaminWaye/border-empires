// Playtest Run 5 (Henrik): grain outside his reach could be claimed with Expand To but never garrisoned, and
// the menu there had no beacon he could build toward it. "Relay Beacon toward here" opens placement on his
// own land, on the site whose reach covers that tile, else the one nearest it.
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { handleGenericBuildAction } from "../client-generic-build-action.js";
import { selectBarButtons } from "../client-hud-v2/client-hud-v2-action-bar.js";
import { NO_BEACON_SITE_REASON, RELAY_BEACON_TOWARD_ACTION_ID, relayBeaconTowardAction, startRelayBeaconTowardPlacement } from "./client-relay-beacon-toward.js";

const tile = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...extra }) as Tile;

const stateWith = (list: Tile[], reach: string[]) => {
  const state = createInitialState();
  state.me = "me";
  for (const t of list) state.tiles.set(`${t.x},${t.y}`, t);
  state.serverReach = new Set(reach);
  state.serverReachRevision = 1;
  return state;
};

const home = tile(10, 10, { ownerId: "me", ownershipState: "SETTLED" });
const grain = tile(20, 10, { resource: "FARM" });

describe("Relay Beacon toward here", () => {
  it("is offered on neutral grain outside reach and opens placement on your land nearest it", () => {
    const state = stateWith([home, grain], ["10,10"]);
    const action = relayBeaconTowardAction(state, grain);
    expect(action).toMatchObject({ id: RELAY_BEACON_TOWARD_ACTION_ID, disabled: false });
    expect(startRelayBeaconTowardPlacement(state, grain)).toEqual({ x: 10, y: 10 });
    expect(state.buildingPlacement).toMatchObject({ active: true, structureType: "RELAY_BEACON", x: 10, y: 10 });
  });

  it("is offered on your own frontier outside reach, where Garrison is refused", () => {
    const frontier = tile(20, 10, { resource: "FARM", ownerId: "me", ownershipState: "FRONTIER" });
    expect(relayBeaconTowardAction(stateWith([home, frontier], ["10,10"]), frontier)?.disabled).toBe(false);
  });

  it("is not offered inside reach, on towns (garrisoned out of reach anyway), on rival land or on water", () => {
    expect(relayBeaconTowardAction(stateWith([home, grain], ["10,10", "20,10"]), grain)).toBeUndefined();
    const town = tile(20, 10, { town: { populationTier: "TOWN" } as NonNullable<Tile["town"]> });
    expect(relayBeaconTowardAction(stateWith([home, town], ["10,10"]), town)).toBeUndefined();
    const rival = tile(20, 10, { ownerId: "rival", ownershipState: "SETTLED" });
    expect(relayBeaconTowardAction(stateWith([home, rival], ["10,10"]), rival)).toBeUndefined();
    const sea = tile(20, 10, { terrain: "SEA" });
    expect(relayBeaconTowardAction(stateWith([home, sea], ["10,10"]), sea)).toBeUndefined();
  });

  // Owner: a beacon goes on frontier land, which is then garrisoned; it needs no garrisoned tile to start from.
  it("starts placement on frontier land in reach, which the beacon chain garrisons first", () => {
    const frontier = tile(10, 10, { ownerId: "me", ownershipState: "FRONTIER" });
    const state = stateWith([frontier, grain], ["10,10"]);
    expect(relayBeaconTowardAction(state, grain)?.disabled).toBe(false);
    expect(startRelayBeaconTowardPlacement(state, grain)).toEqual({ x: 10, y: 10 });
  });

  it("says why it is greyed when nothing in reach can take a beacon", () => {
    const frontier = tile(10, 10, { ownerId: "me", ownershipState: "FRONTIER" });
    expect(relayBeaconTowardAction(stateWith([frontier, grain], []), grain)).toMatchObject({ disabled: true, disabledReason: NO_BEACON_SITE_REASON });
  });

  it("shows as a button on the bar beside Expand To, not hidden in the minor row", () => {
    const view = { title: "Grain", subtitle: "Neutral", tabs: ["actions"], overviewLines: [], buildings: [], crystal: [], actions: [
      { id: "settle_land", label: "Expand To" },
      relayBeaconTowardAction(stateWith([home, grain], ["10,10"]), grain)!
    ] } as TileMenuView;
    expect(selectBarButtons(view).flatMap((b) => (b.kind === "action" ? [b.action.id] : []))).toEqual(["settle_land", RELAY_BEACON_TOWARD_ACTION_ID]);
  });

  it("opens placement from the menu's own dispatch when the HUD has not already", () => {
    const state = stateWith([home, grain], ["10,10"]);
    const hideMenu = vi.fn();
    const renderPlacementOverlay = vi.fn();
    const handled = handleGenericBuildAction({ actionId: RELAY_BEACON_TOWARD_ACTION_ID, selected: grain, state, handleBuildAction: vi.fn(), pushFeed: vi.fn(), hideMenu, renderPlacementOverlay });
    expect(handled).toBe(true);
    expect(hideMenu).toHaveBeenCalled();
    expect(renderPlacementOverlay).toHaveBeenCalledTimes(1);
    expect(state.buildingPlacement).toMatchObject({ active: true, x: 10, y: 10 });
    handleGenericBuildAction({ actionId: RELAY_BEACON_TOWARD_ACTION_ID, selected: grain, state, handleBuildAction: vi.fn(), pushFeed: vi.fn(), hideMenu, renderPlacementOverlay });
    expect(renderPlacementOverlay).toHaveBeenCalledTimes(1); // already open: left as the HUD placed it
  });
});
