import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { beginCrystalTargeting } from "./client-crystal-targeting.js";
import type { CrystalTargetingAbility, Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const depsWithFeed = (feed: string[], selected?: Tile) =>
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
    selectedTile: () => selected,
    renderHud: () => undefined
  }) as never;

const armWith = (
  ability: CrystalTargetingAbility,
  techIds: string[],
  selected?: Tile
): string[] => {
  const state = createInitialState();
  state.me = "me";
  state.techIds = techIds;
  state.strategicResources.CRYSTAL = 0;
  state.gold = 100_000;
  if (selected) state.tiles.set(keyFor(selected.x, selected.y), selected);
  const feed: string[] = [];
  beginCrystalTargeting(state, ability, depsWithFeed(feed, selected));
  return feed;
};

const ownedStructureTile = (type: string): Tile =>
  ({
    x: 4,
    y: 4,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    economicStructure: { ownerId: "me", type, status: "active" }
  }) as unknown as Tile;

/**
 * §5 (resource slots): FOOD/TITANIUM/CRYSTAL/UMBRITE stockpiles are never
 * credited any more (runtime-empire-storage.ts caps only GOLD/FOOD/SHARD), so
 * a client-side CRYSTAL balance gate permanently blocks these abilities and
 * spams the feed on every click. Each case below fails before the gates were
 * removed — the ability must get past its balance check, not bail earlier on
 * a missing tech or an unselected origin structure.
 */
describe("crystal targeting cost gates", () => {
  const cases: Array<{ ability: CrystalTargetingAbility; techIds: string[]; selected?: Tile; gate: string }> = [
    { ability: "aether_bridge", techIds: ["navigation"], gate: "needs 30 CRYSTAL" },
    { ability: "siphon", techIds: ["logistics"], gate: "needs 15 CRYSTAL" },
    { ability: "aether_wall", techIds: ["harborcraft"], gate: "needs 25 CRYSTAL" },
    {
      ability: "world_engine_strike",
      techIds: [],
      selected: ownedStructureTile("WORLD_ENGINE"),
      gate: "needs 500 CRYSTAL"
    },
    {
      ability: "airport_bombard",
      techIds: [],
      selected: ownedStructureTile("AIRPORT"),
      gate: "needs 1 CRYSTAL"
    }
  ];

  for (const { ability, techIds, selected, gate } of cases) {
    it(`arms ${ability} with a zero CRYSTAL stockpile`, () => {
      const feed = armWith(ability, techIds, selected);

      expect(feed.filter((line) => line.includes("CRYSTAL"))).toEqual([]);
      expect(feed.some((line) => line.includes(gate))).toBe(false);
    });
  }

  it("still enforces the gold cost on Worldbreaker Shot", () => {
    const state = createInitialState();
    state.me = "me";
    state.strategicResources.CRYSTAL = 0;
    state.gold = 10;
    const selected = ownedStructureTile("WORLD_ENGINE");
    state.tiles.set(keyFor(selected.x, selected.y), selected);
    const feed: string[] = [];

    beginCrystalTargeting(state, "world_engine_strike", depsWithFeed(feed, selected));

    expect(feed).toContain("Worldbreaker Shot needs 1,000 gold.");
  });
});
