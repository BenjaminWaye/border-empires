import { describe, expect, it, vi } from "vitest";

vi.mock("../client-arrow-gesture-confirm.js", () => ({ handleArrowGestureConfirm: vi.fn() }));

import { handleArrowGestureConfirm } from "../client-arrow-gesture-confirm.js";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";
import { markMusterUnlocked } from "../client-muster-unlock/client-muster-unlock-storage.js";
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

describe("marchAttackOptions across water", () => {
  // A strait (x=18..19, known SEA) splits the owned tile (17,20), 3 tiles
  // from the target in a straight line, from the target's shore; the owned
  // tile (20,25) is 5 tiles away on the target's own shore. The strait runs
  // far enough that walking around it is past the route cap.
  const strait = (): Tile[] => {
    const sea: Tile[] = [];
    for (let y = 0; y <= 45; y += 1) for (const x of [18, 19]) sea.push({ x, y, terrain: "SEA" });
    return sea;
  };
  const shoreTarget = enemy(20, 20);

  it("raises the new flag on the connected shore, not the nearer tile across open water", () => {
    const state = stateWith([...strait(), own(17, 20), own(20, 25), shoreTarget], { musterFlagLimit: 3 });
    expect(marchAttackOptions(state, shoreTarget).newFlag).toEqual({ x: 20, y: 25, distance: 5 });
  });

  it("leaves out a flag across open water with no crossing", () => {
    const state = stateWith([...strait(), flag(17, 20), shoreTarget]);
    expect(marchAttackOptions(state, shoreTarget).flags).toEqual([]);
  });

  it("routes through a dock link or the player's own live aether bridge", () => {
    const docked = stateWith([...strait(), flag(17, 20), shoreTarget], { dockPairs: [{ ax: 17, ay: 21, bx: 20, by: 21 }] });
    expect(marchAttackOptions(docked, shoreTarget).flags).toEqual([{ x: 17, y: 20, distance: 3 }]);
    const bridge = { bridgeId: "b", ownerId: "me", from: { x: 17, y: 21 }, to: { x: 20, y: 21 }, startedAt: 0, endsAt: Date.now() + 60_000 };
    const bridged = stateWith([...strait(), flag(17, 20), shoreTarget], { activeAetherBridges: [bridge] });
    expect(marchAttackOptions(bridged, shoreTarget).flags).toEqual([{ x: 17, y: 20, distance: 3 }]);
    const rivalBridge = stateWith([...strait(), flag(17, 20), shoreTarget], { activeAetherBridges: [{ ...bridge, ownerId: "rival" }] });
    expect(marchAttackOptions(rivalBridge, shoreTarget).flags).toEqual([]);
  });
});

describe("injectMarchAttackActions", () => {
  const menu = (launch: Partial<TileActionDef>): TileMenuView => ({
    title: "",
    subtitle: "",
    tabs: ["overview", "actions"],
    overviewLines: [],
    actions: [
      { id: "launch_attack", label: "Launch Attack", ...launch },
      { id: "reveal_empire", label: "Reveal Empire" }
    ],
    buildings: [],
    crystal: []
  });

  it("replaces the unreachable Launch Attack with march rows", () => {
    const state = stateWith([flag(14, 10), own(17, 10), target]);
    const view = menu({ disabled: true, disabledReason: "No bordering origin tile or linked dock" });
    injectMarchAttackActions(view, target, state);
    injectMarchAttackActions(view, target, state);
    expect(view.actions.map((action) => action.id)).toEqual(["march_attack_flag", "march_attack_new_flag", "reveal_empire"]);
    expect(view.actions[0]?.label).toBe("March Attack from Flag (14, 10)");
    expect(view.actions.map((action) => action.originKey)).toEqual(["14,10", "17,10", undefined]);
    expect(view.tabs[0]).toBe("actions");
  });

  it("leaves a directly attackable or spawn-shielded target alone", () => {
    const state = stateWith([flag(14, 10), target]);
    const attackable = menu({ disabled: false });
    injectMarchAttackActions(attackable, target, state);
    expect(attackable.actions.map((action) => action.id)).toEqual(["launch_attack", "reveal_empire"]);
    const shielded = menu({ disabled: true, disabledReason: "Empire is under spawn protection" });
    injectMarchAttackActions(shielded, target, state);
    expect(shielded.actions.map((action) => action.id)).toEqual(["launch_attack", "reveal_empire"]);
  });

  it("offers nothing against an empire you have a truce with", () => {
    const state = stateWith([flag(14, 10), own(17, 10), target]);
    state.activeTruces = [{ otherPlayerId: "rival", otherPlayerName: "Rival", startedAt: 0, endsAt: Date.now() + 60_000, createdByPlayerId: "me" } as never];
    expect(buildMarchAttackActions(target, state)).toEqual({ rows: [] });
    state.activeTruces = [{ otherPlayerId: "rival", otherPlayerName: "Rival", startedAt: 0, endsAt: Date.now() - 1, createdByPlayerId: "me" } as never];
    expect(buildMarchAttackActions(target, state).rows.length).toBeGreaterThan(0);
  });

  it("explains on the disabled Launch Attack why no march is possible", () => {
    const unlocked = { authEmail: "a@example.com", bridgeDebugSeasonId: "season-1" };
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) } });
    markMusterUnlocked(unlocked.authEmail, unlocked.bridgeDebugSeasonId);
    const reasonFor = (state: ClientState): string | undefined => {
      const view = menu({ disabled: true, disabledReason: "No bordering origin tile or linked dock" });
      injectMarchAttackActions(view, target, state);
      expect(view.actions.map((action) => action.id)).toEqual(["launch_attack", "reveal_empire"]);
      return view.actions[0]?.disabledReason;
    };
    expect(reasonFor(stateWith([own(2, 1), target], unlocked))).toBe("No muster flag or owned tile within march range (15 tiles)");
    expect(reasonFor(stateWith([flag(1, 1), flag(2, 1), target], unlocked))).toBe("Muster flags full (2/2) and none can march here");
    vi.unstubAllGlobals();
  });

  it("offers march rows on a fogged enemy tile, whose menu has no attack row at all", () => {
    const fogged: Tile = { ...target, fogged: true };
    const state = stateWith([flag(14, 10), own(17, 10), fogged]);
    const view: TileMenuView = { title: "", subtitle: "", tabs: ["overview"], overviewLines: [], actions: [], buildings: [], crystal: [] };
    injectMarchAttackActions(view, fogged, state);
    expect(view.actions.map((action) => action.id)).toEqual(["march_attack_flag", "march_attack_new_flag"]);
    expect(view.tabs[0]).toBe("actions");
    const allied = stateWith([flag(14, 10), own(17, 10), fogged], { allies: ["rival"] });
    const alliedView: TileMenuView = { ...view, actions: [], tabs: ["overview"] };
    injectMarchAttackActions(alliedView, fogged, allied);
    expect(alliedView.actions).toEqual([]);
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
