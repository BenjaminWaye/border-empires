import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { beginCrystalTargeting } from "./client-crystal-targeting.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const depsWithFeed = (feed: string[]) =>
  ({
    keyFor,
    parseKey: (k: string) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y };
    },
    wrapX: (x: number) => x,
    wrapY: (y: number) => y,
    terrainAt: () => "LAND" as const,
    isTileOwnedByAlly: () => false,
    hostileObservatoryProtectingTile: () => undefined,
    abilityCooldownRemainingMs: () => 0,
    formatCooldownShort: () => "",
    pushFeed: (message: string) => {
      feed.push(message);
    },
    hideTileActionMenu: () => undefined,
    selectedTile: () => undefined,
    renderHud: () => undefined
  }) as never;

/**
 * §5 (resource slots): FOOD/TITANIUM/CRYSTAL/UMBRITE stockpiles are never
 * credited any more, so a client-side CRYSTAL balance gate permanently blocks
 * the crystal abilities and spams the feed on every click.
 */
describe("crystal targeting cost gates", () => {
  it("arms Aether Bridge with a zero CRYSTAL stockpile", () => {
    const state = createInitialState();
    state.me = "me";
    state.techIds = ["navigation"];
    state.strategicResources.CRYSTAL = 0;
    const coastal: Tile = { x: 4, y: 4, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    state.tiles.set(keyFor(4, 4), coastal);
    state.tiles.set(keyFor(5, 4), { x: 5, y: 4, terrain: "SEA" } as Tile);
    state.tiles.set(keyFor(9, 9), { x: 9, y: 9, terrain: "LAND" } as Tile);
    state.tiles.set(keyFor(10, 9), { x: 10, y: 9, terrain: "SEA" } as Tile);

    const feed: string[] = [];
    beginCrystalTargeting(state, "aether_bridge", depsWithFeed(feed));

    expect(feed.some((line) => line.includes("needs 30 CRYSTAL"))).toBe(false);
  });

  it("does not reject Siphon, Worldbreaker Shot, Sky Dock Bombard or Aether Wall on CRYSTAL balance", () => {
    const state = createInitialState();
    state.me = "me";
    state.techIds = ["logistics", "harborcraft"];
    state.strategicResources.CRYSTAL = 0;
    state.gold = 100_000;

    const feed: string[] = [];
    for (const ability of ["siphon", "world_engine_strike", "airport_bombard", "aether_wall"] as const) {
      beginCrystalTargeting(state, ability, depsWithFeed(feed));
    }

    expect(feed.filter((line) => line.includes("CRYSTAL"))).toEqual([]);
  });
});
