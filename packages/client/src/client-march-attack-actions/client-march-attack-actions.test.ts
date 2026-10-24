import { describe, expect, it, vi } from "vitest";

vi.mock("../client-arrow-gesture-confirm.js", () => ({ handleArrowGestureConfirm: vi.fn() }));

import { handleArrowGestureConfirm } from "../client-arrow-gesture-confirm.js";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";
import { buildMarchAttackActions, dispatchMarchAttackAction, injectMarchAttackActions, marchAttackOptions } from "./client-march-attack-actions.js";

const own = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: "me", ...overrides });
const flag = (x: number, y: number, mode: "HOLD" | "ADVANCE" | "MARCH" = "HOLD"): Tile =>
  own(x, y, { muster: { ownerId: "me", amount: 0, mode, updatedAt: 0 } });
const enemy = (x: number, y: number): Tile => ({ x, y, terrain: "LAND", ownerId: "rival" });

const stateWith = (tiles: Tile[], overrides: Partial<ClientState> = {}): ClientState => {
  const state = createInitialState();
  state.me = "me";
  state.musterFlagLimit = 2;
  state.tiles = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  return Object.assign(state, overrides);
};

const target = enemy(20, 10);

describe("marchAttackOptions", () => {
  it("lists in-range flags nearest first and the owned tile nearest the target for a new flag", () => {
    const state = stateWith([flag(10, 10), flag(14, 10), own(17, 10), own(16, 10), flag(40, 10), target]);
    const options = marchAttackOptions(state, target);
    expect(options.flags).toEqual([
      { x: 14, y: 10, distance: 6 },
      { x: 10, y: 10, distance: 10 }
    ]);
    // Three flags already, over the cap of 2: no new flag offered.
    expect(options.newFlag).toBeUndefined();
    state.musterFlagLimit = 4;
    expect(marchAttackOptions(state, target).newFlag).toEqual({ x: 17, y: 10, distance: 3 });
  });

  it("leaves out flags and tiles beyond march range or under siege", () => {
    const state = stateWith([flag(2, 10), own(18, 10), own(19, 11), target]);
    state.incomingAttacksByTile.set("19,11", { attackerName: "Rival", resolvesAt: Date.now() + 60_000 } as never);
    const options = marchAttackOptions(state, target);
    expect(options.flags).toEqual([]);
    expect(options.newFlag).toEqual({ x: 18, y: 10, distance: 2 });
  });
});

describe("injectMarchAttackActions", () => {
  const menu = (launch: Partial<TileActionDef>): TileMenuView => ({
    title: "",
    subtitle: "",
    tabs: ["overview", "actions"],
    overviewLines: [],
    actions: [
      { id: "expand_here", label: "Expand To & Attack" },
      { id: "launch_attack", label: "Launch Attack", ...launch },
      { id: "reveal_empire", label: "Reveal Empire" }
    ],
    buildings: [],
    crystal: []
  });

  it("replaces the unreachable Launch Attack with march rows, keeping Expand To & Attack below them", () => {
    const state = stateWith([flag(14, 10), own(17, 10), target]);
    const view = menu({ disabled: true, disabledReason: "No bordering origin tile or linked dock" });
    injectMarchAttackActions(view, target, state);
    injectMarchAttackActions(view, target, state);
    expect(view.actions.map((action) => action.id)).toEqual(["march_attack_flag", "march_attack_new_flag", "expand_here", "reveal_empire"]);
    expect(view.actions[0]?.label).toBe("March Attack from Flag (14, 10)");
    expect(view.actions.map((action) => action.originKey)).toEqual(["14,10", "17,10", undefined, undefined]);
    expect(view.tabs[0]).toBe("actions");
  });

  it("leaves a directly attackable or spawn-shielded target alone", () => {
    const state = stateWith([flag(14, 10), target]);
    const attackable = menu({ disabled: false });
    injectMarchAttackActions(attackable, target, state);
    expect(attackable.actions.map((action) => action.id)).toEqual(["expand_here", "launch_attack", "reveal_empire"]);
    const shielded = menu({ disabled: true, disabledReason: "Empire is under spawn protection" });
    injectMarchAttackActions(shielded, target, state);
    expect(shielded.actions.map((action) => action.id)).toEqual(["expand_here", "launch_attack", "reveal_empire"]);
  });

  it("offers nothing against an empire you have a truce with", () => {
    const state = stateWith([flag(14, 10), own(17, 10), target]);
    state.activeTruces = [{ otherPlayerId: "rival", otherPlayerName: "Rival", startedAt: 0, endsAt: Date.now() + 60_000, createdByPlayerId: "me" } as never];
    expect(buildMarchAttackActions(target, state)).toEqual([]);
    state.activeTruces = [{ otherPlayerId: "rival", otherPlayerName: "Rival", startedAt: 0, endsAt: Date.now() - 1, createdByPlayerId: "me" } as never];
    expect(buildMarchAttackActions(target, state).length).toBeGreaterThan(0);
  });

  it("offers nothing when no flag or owned tile is within march range", () => {
    expect(buildMarchAttackActions(target, stateWith([flag(1, 1), own(2, 1), target]))).toEqual([]);
  });
});

describe("dispatchMarchAttackAction", () => {
  const deps = { pushFeed: vi.fn(), sendGameMessage: vi.fn(() => true), renderHud: vi.fn(), keyFor: (x: number, y: number) => `${x},${y}` };

  it("opens the March-To commit sheet from the chosen flag or the new-flag tile", () => {
    const state = stateWith([flag(14, 10), own(17, 10), target]);
    expect(dispatchMarchAttackAction("march_attack_flag", target, "14,10", state, deps)).toBe(true);
    expect(handleArrowGestureConfirm).toHaveBeenLastCalledWith(state, { x: 14, y: 10 }, { x: 20, y: 10 }, deps, { newFlag: false });
    expect(dispatchMarchAttackAction("march_attack_new_flag", target, "17,10", state, deps)).toBe(true);
    expect(handleArrowGestureConfirm).toHaveBeenLastCalledWith(state, { x: 17, y: 10 }, { x: 20, y: 10 }, deps, { newFlag: true });
  });

  it("refuses a row whose flag is no longer valid instead of marching the flag now in its slot", () => {
    const state = stateWith([flag(14, 10), flag(10, 10), target]);
    // The row was rendered for (14, 10); that flag is now under siege, so
    // slot 0 of a fresh list is (10, 10) -- which must not be redirected.
    state.incomingAttacksByTile.set("14,10", { attackerName: "Rival", resolvesAt: Date.now() + 60_000 } as never);
    vi.mocked(handleArrowGestureConfirm).mockClear();
    expect(dispatchMarchAttackAction("march_attack_flag", target, "14,10", state, deps)).toBe(true);
    expect(handleArrowGestureConfirm).not.toHaveBeenCalled();
    expect(deps.pushFeed).toHaveBeenLastCalledWith("That flag can no longer march on this tile.", "combat", "warn");
  });

  it("ignores other action ids", () => {
    expect(dispatchMarchAttackAction("launch_attack", target, undefined, stateWith([target]), deps)).toBe(false);
  });
});
