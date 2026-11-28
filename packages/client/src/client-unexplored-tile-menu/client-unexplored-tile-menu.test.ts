import { describe, expect, it, vi } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { openUnexploredTileActionMenu } from "./client-unexplored-tile-menu.js";
import type { ScoutDroneFlight } from "@border-empires/shared";
import type { Tile, TileMenuView } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const baseDeps = () => ({
  keyFor,
  pickOriginForTarget: vi.fn((): Tile | undefined => ({ x: 5, y: 6, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" })),
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

  const flight = (landsAt: number): ScoutDroneFlight => ({
    launchedAt: 0,
    landsAt,
    targetX: 9,
    targetY: 9,
    steps: [{ x: 0, y: 0, at: 0 }, { x: 1, y: 1, at: 1 }],
    turnIndex: 1,
    endReason: "TARGET"
  });
  const openAt = (state: ReturnType<typeof createInitialState>, x: number, y: number): TileMenuView => {
    const deps = baseDeps();
    openUnexploredTileActionMenu(state, x, y, 0, 0, deps);
    return (deps.renderTileActionMenu.mock.calls[0] as [TileMenuView, number, number])[0];
  };

  // docs/explore-scout-plan.md: pressing unexplored ground means "look that
  // way", so the only action is Explore -- never Expand To or March To, even
  // with a reachable path or a muster flag nearby.
  it("offers a single Explore action, even next to the player's land and with a muster flag raised", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: 0 } });
    state.tiles.set(keyFor(5, 6), { x: 5, y: 6, terrain: "LAND" });
    const view = openAt(state, 5, 7);
    expect(view.actions.map((action) => [action.id, action.label, action.disabled ?? false])).toEqual([["explore_scout", "Explore", false]]);
    expect(view.actions[0]?.detail).toMatch(/claims nothing/);
    expect(view.tabs).toEqual(["actions", "overview"]);
    expect(state.tileActionMenu.activeTab).toBe("actions");
    expect(view.overviewLines[0]?.html).toMatch(/not been explored yet/i);
  });

  it("offers Explore for far-off ground with no path from the player's land", () => {
    const state = createInitialState();
    state.me = "me";
    const view = openAt(state, 200, 200);
    expect(view.actions.map((action) => action.id)).toEqual(["explore_scout"]);
  });

  // A House that lost its last AFC has no drone, so Expand To comes back and Explore says why it can't fly.
  it("falls back to Expand To, with Explore disabled, when the player has no AFC", () => {
    const state = createInitialState();
    state.me = "me";
    state.afcRecovery = { globalLosses: 1, requiredSince: 1 };
    state.tiles.set(keyFor(5, 6), { x: 5, y: 6, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    const view = openAt(state, 5, 7);
    expect(view.actions.map((action) => action.label)).toEqual(["Expand To", "Explore"]);
    expect(view.actions[1]).toMatchObject({ disabled: true, disabledReason: "Scout drones launch from an AFC, and you have none right now" });
  });

  it("keeps Explore enabled while the scout drone is out, with no Recall (more stops join its route)", () => {
    const state = createInitialState();
    state.me = "me";
    state.scoutDroneFlight = flight(Date.now() + 80_000);
    const view = openAt(state, 3, 3);
    expect(view.actions.map((action) => [action.id, action.disabled ?? false])).toEqual([["explore_scout", false]]);
  });

  // Review of the 2026-11-26 fix: the fog tile's Explore stayed enabled at 0 charges, so a tap still got "No scout drone charges left".
  it("greys out Explore with no charges left and says when the next one is back", () => {
    const state = createInitialState();
    state.me = "me";
    const now = Date.now();
    state.scoutDroneFlight = flight(now + 80_000);
    state.scoutDroneCharges = { max: 8, refillMs: 14_400_000, usedAt: Array.from({ length: 8 }, () => now - 60 * 60_000) };
    expect(openAt(state, 3, 3).actions[0]).toMatchObject({ id: "explore_scout", disabled: true, disabledReason: expect.stringMatching(/^\+1 in /), cost: "0/8" });
  });

  // Owner, First-15 round 1: the Explore button shows its count ("Explore 3/8").
  it("shows the ready charges of the most on Explore", () => {
    const state = createInitialState();
    state.me = "me";
    const now = Date.now();
    state.scoutDroneCharges = { max: 8, refillMs: 14_400_000, usedAt: Array.from({ length: 5 }, () => now - 60 * 60_000) };
    expect(openAt(state, 3, 3).actions[0]).toMatchObject({ id: "explore_scout", cost: "3/8" });
    expect(openAt(state, 3, 3).actions[0]?.disabled).toBeFalsy();
  });

  it("enables Explore again once the drone has landed", () => {
    const state = createInitialState();
    state.me = "me";
    state.scoutDroneFlight = flight(Date.now() - 1);
    expect(openAt(state, 3, 3).actions[0]?.disabled).toBeFalsy();
  });
});
