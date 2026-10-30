import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { markMusterUnlocked } from "../client-muster-unlock/client-muster-unlock-storage.js";
import { openUnexploredTileActionMenu } from "./client-unexplored-tile-menu.js";
import type { Tile, TileMenuView } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const baseDeps = () => ({
  keyFor,
  pickOriginForTarget: () => undefined,
  renderTileActionMenu: vi.fn(),
  resetAttackPreviewState: vi.fn()
});

describe("openUnexploredTileActionMenu", () => {
  it("selects and opens the menu for any unexplored tile, showing only coordinates and unexplored status", () => {
    const state = createInitialState();
    state.me = "me";
    const deps = baseDeps();

    openUnexploredTileActionMenu(state, 12, 34, 100, 120, deps);

    expect(state.selected).toEqual({ x: 12, y: 34 });
    expect(state.tileActionMenu.mode).toBe("single");
    expect(state.tileActionMenu.currentTileKey).toBe(keyFor(12, 34));
    expect(deps.renderTileActionMenu).toHaveBeenCalledTimes(1);
    const [view] = deps.renderTileActionMenu.mock.calls[0] as [TileMenuView, number, number];
    expect(view.title).toBe("Unexplored");
    expect(view.subtitle).toBe("(12, 34)");
  });

  it("offers Expand To (until mustering unlocks) for a reachable unexplored target and makes actions the default tab — the client never guesses it might be a mountain or sea to refuse it", () => {
    const state = createInitialState();
    state.me = "me";
    // A settled town (TOWN_REACH_RADIUS = 3) so the (5,7) target below
    // falls inside the player's reach -- Add Waypoint is now reach-gated
    // the same way Build Relay Beacon already is.
    state.tiles.set(keyFor(5, 5), {
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
    } as never);
    state.tiles.set(keyFor(5, 6), { x: 5, y: 6, terrain: "LAND" });
    const deps = baseDeps();

    // (5, 7) is unexplored — not in state.tiles at all — yet reachable via the
    // known neutral stepping stone at (5, 6). It might turn out to be a
    // mountain in reality; that's only ever discovered once the player
    // actually gets there, never guessed upfront.
    openUnexploredTileActionMenu(state, 5, 7, 10, 20, deps);

    const [view] = deps.renderTileActionMenu.mock.calls[0] as [TileMenuView, number, number];
    // expand_here, not settle_land: an unexplored target has no entry in
    // state.tiles at all, and settle_land's click handler needs one (see
    // the sibling regression coverage in client-tile-action-fogged.test.ts).
    expect(view.actions[0]?.id).toBe("expand_here");
    expect(view.actions[0]?.label).toBe("Expand To");
    expect(view.tabs[0]).toBe("actions");
    // The "Unexplored (x, y)" info must still be reachable via the Overview tab.
    expect(view.tabs).toContain("overview");
    expect(state.tileActionMenu.activeTab).toBe("actions");
  });

  it("shows the Overview tab (not a dead empty-actions tab) for an unexplored target with no path from owned territory", () => {
    const state = createInitialState();
    state.me = "me";
    const deps = baseDeps();

    openUnexploredTileActionMenu(state, 200, 200, 10, 20, deps);

    const [view] = deps.renderTileActionMenu.mock.calls[0] as [TileMenuView, number, number];
    expect(view.actions).toHaveLength(0);
    // Regression guard: previously tabs was hardcoded to ["actions"], so an
    // unreachable target could only ever land on a permanently-empty
    // Actions tab and show the generic "No actions available on this tile
    // right now." fallback instead of "This tile has not been explored yet."
    expect(view.tabs).toEqual(["overview"]);
    expect(state.tileActionMenu.activeTab).toBe("overview");
    expect(view.overviewLines[0]?.html).toMatch(/not been explored yet/i);
  });

  describe("March To", () => {
    const own = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...overrides });
    const flag = (x: number, y: number, overrides: Partial<NonNullable<Tile["muster"]>> = {}): Tile =>
      own(x, y, { muster: { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: 0, ...overrides } });
    const unlocked = { authEmail: "a@example.com", bridgeDebugSeasonId: "season-1" };
    const stateWith = (tiles: Tile[]) => {
      const state = createInitialState();
      state.me = "me";
      state.musterFlagLimit = 2;
      for (const tile of tiles) state.tiles.set(keyFor(tile.x, tile.y), tile);
      return state;
    };
    const openAt = (state: ReturnType<typeof createInitialState>, x: number, y: number): TileMenuView => {
      const deps = baseDeps();
      openUnexploredTileActionMenu(state, x, y, 0, 0, deps);
      return (deps.renderTileActionMenu.mock.calls[0] as [TileMenuView, number, number])[0];
    };
    const unlock = (): void => {
      const storage = new Map<string, string>();
      vi.stubGlobal("window", { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) } });
      markMusterUnlocked(unlocked.authEmail, unlocked.bridgeDebugSeasonId);
    };
    afterEach(() => vi.unstubAllGlobals());

    it("offers one March To button -- not Expand To or a row per origin -- since the player wants to explore that way, not claim that exact tile", () => {
      // Same reachable setup the Expand To case above uses, plus a muster flag.
      const state = stateWith([flag(5, 5), own(6, 5), { x: 5, y: 6, terrain: "LAND" }]);
      state.musterFlagLimit = 3;
      const view = openAt(state, 5, 9);
      expect(view.actions.map((action) => [action.id, action.label, action.disabled])).toEqual([["march_to_pick_origin", "March To", false]]);
      expect(view.actions[0]?.detail).toMatch(/nearby muster flags/);
      expect(view.tabs[0]).toBe("actions");
    });

    it("once mustering is unlocked, offers March To even with no flag raised yet", () => {
      unlock();
      const state = Object.assign(stateWith([own(5, 5)]), unlocked);
      const view = openAt(state, 5, 9);
      expect(view.actions.map((action) => [action.id, action.disabled])).toEqual([["march_to_pick_origin", false]]);
      expect(view.actions[0]?.detail).toMatch(/raise a muster flag/);
    });

    it("explains a disabled March To instead of falling back to Expand To when mustering is unlocked but nothing can march there", () => {
      unlock();
      const state = Object.assign(stateWith([own(5, 5)]), unlocked);
      const view = openAt(state, 200, 200);
      expect(view.actions).toHaveLength(1);
      expect(view.actions[0]).toMatchObject({ id: "march_to_pick_origin", label: "March To", disabled: true });
      expect(view.actions[0]?.disabledReason).toMatch(/within march range/);
    });

    // Regression: a Cancel March row here was dead -- its handler needs the
    // tile in state.tiles, which an unexplored tile never is.
    it("doesn't offer a Cancel March it can't carry out on an unexplored tile a flag is marching to", () => {
      const state = stateWith([flag(5, 5, { mode: "MARCH", targetX: 5, targetY: 9 })]);
      const view = openAt(state, 5, 9);
      expect(view.actions.map((action) => action.id)).not.toContain("muster_march_cancel");
    });
  });
});
