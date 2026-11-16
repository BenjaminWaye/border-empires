import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { toggleWeakDefensibility } from "./client-hud-weak-defensibility-toggle.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const setup = () => {
  const tiles = new Map<string, Tile>();
  // Compact 2x2 block (each tile 2 open sides) plus a lone tile with 4.
  const coords: Array<[number, number]> = [[10, 10], [11, 10], [10, 11], [11, 11], [40, 40]];
  for (const [x, y] of coords) tiles.set(keyFor(x, y), { x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
  const state = { tiles, me: "me", showWeakDefensibility: false, camX: 0, camY: 0, camSubX: 3, camSubY: 4, selected: undefined as { x: number; y: number } | undefined };
  const pushFeed = vi.fn();
  const deps = {
    keyFor,
    wrapX: (x: number) => x,
    wrapY: (y: number) => y,
    terrainAt: (x: number, y: number) => tiles.get(keyFor(x, y))?.terrain ?? "LAND",
    pushFeed,
    requestViewRefresh: vi.fn(),
    rerender: vi.fn()
  };
  return { state, deps, pushFeed };
};

// Regression (playtest): "Show weak tiles" only toggled the highlight -- the
// camera stayed put and nothing said why a tile was weak.
describe("toggleWeakDefensibility", () => {
  it("pans the camera to the weakest tile and says why it is weak", () => {
    const { state, deps, pushFeed } = setup();
    toggleWeakDefensibility(state, deps);
    expect(state.showWeakDefensibility).toBe(true);
    expect({ camX: state.camX, camY: state.camY, camSubX: state.camSubX, camSubY: state.camSubY }).toEqual({ camX: 40, camY: 40, camSubX: 0, camSubY: 0 });
    expect(state.selected).toEqual({ x: 40, y: 40 });
    expect(String(pushFeed.mock.calls[0]?.[0])).toContain("Weakest at (40, 40): 4 open sides");
  });

  it("leaves the camera alone when hiding the highlight", () => {
    const { state, deps } = setup();
    state.showWeakDefensibility = true;
    toggleWeakDefensibility(state, deps);
    expect(state.showWeakDefensibility).toBe(false);
    expect([state.camX, state.camY]).toEqual([0, 0]);
  });
});
