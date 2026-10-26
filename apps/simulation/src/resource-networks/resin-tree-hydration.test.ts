import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, isResinTreeSiteAt, setWorldSeed } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { createTilesFromInitialState } from "../runtime-hydration.js";

describe("campaign recovery converts old decorative trees", () => {
  it("adds a usable resin tile on hydration and preserves it across a recovered snapshot", () => {
    setWorldSeed(1037, "islands", 11);
    let site: { x: number; y: number } | undefined;
    for (let y = 40; y < WORLD_HEIGHT - 40 && !site; y += 1)
      for (let x = 0; x < WORLD_WIDTH && !site; x += 1) if (isResinTreeSiteAt(x, y)) site = { x, y };
    expect(site).toBeDefined();
    const key = `${site!.x},${site!.y}`;
    const legacy = new Map<string, DomainTileState>();
    for (let y = 0; y < WORLD_HEIGHT; y += 1) for (let x = 0; x < WORLD_WIDTH; x += 1)
      legacy.set(`${x},${y}`, { x, y, terrain: "SEA" });
    legacy.set(key, { ...site!, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED" });
    const hydrated = createTilesFromInitialState(undefined, legacy, false);
    expect(hydrated.get(key)).toMatchObject({ resource: "NEURAL_RESIN", ownerId: "p", ownershipState: "SETTLED" });
    const tiles: DomainTileState[] = JSON.parse(JSON.stringify([...hydrated.values()]));
    const restored = createTilesFromInitialState({ tiles, activeLocks: [] }, new Map(), false);
    expect(restored.get(key)?.resource).toBe("NEURAL_RESIN");
    expect([...restored.values()].filter(tile => tile.resource === "NEURAL_RESIN")).toHaveLength(1);
  }, 60_000);
});
