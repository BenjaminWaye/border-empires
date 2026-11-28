import { describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { createInitialSeasonState } from "../season-lifecycle.js";
import { landWaitingHouses } from "./land-waiting-houses.js";

// Owner decision 2026-11-27 left a knocked-out human House landless while no
// viable site exists, and it was tried again only at its next login. An online
// waiting House now lands within a minute of a site freeing up.
const crowdedWorld = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 7; y <= 13; y += 1) {
    for (let x = 8; x <= 16; x += 1) {
      const isTown = y === 10 && (x === 10 || x === 14);
      tiles.push(isTown
        ? { x, y, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", town: { name: `Rival ${x}`, type: "FARMING", populationTier: "TOWN" } }
        : { x, y, terrain: "LAND" });
    }
  }
  return tiles;
};
const openWorld = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 0; y < 40; y += 1) for (let x = 0; x < 40; x += 1) tiles.push({ x, y, terrain: "LAND" });
  return tiles;
};

const setup = (tiles: DomainTileState[]) => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["rival", buildPlayer("rival")], ["fallen", buildPlayer("fallen")]]),
    seedTiles: new Map(),
    initialState: { tiles, activeLocks: [] }
  });
  const seasonState = createInitialSeasonState({ seasonSequence: 1, rulesetId: "standard", worldSeed: 1, startedAt: 500 });
  const deps = { runtime, log: { info: vi.fn(), error: vi.fn() }, deleteCachedSnapshot: vi.fn(), getSeasonState: () => seasonState };
  const owned = () => runtime.exportState().tiles.filter((tile) => tile.ownerId === "fallen").length;
  return { runtime, deps, owned };
};

describe("landWaitingHouses", () => {
  it("lands an online House that is waiting, once a viable site exists", () => {
    const { deps, owned } = setup(openWorld());
    expect(owned()).toBe(0);
    expect(landWaitingHouses(deps, ["fallen"])).toBe(1);
    expect(owned()).toBeGreaterThan(0);
    expect(deps.deleteCachedSnapshot).toHaveBeenCalledWith("fallen");
  });

  it("leaves it waiting on a map with no viable site, and never lands it inside a rival's reach", () => {
    const { deps, owned } = setup(crowdedWorld());
    expect(landWaitingHouses(deps, ["fallen"])).toBe(0);
    expect(owned()).toBe(0);
  });

  it("does nothing for players who are offline, unknown, or already hold land", () => {
    const { deps, owned, runtime } = setup(openWorld());
    expect(landWaitingHouses(deps, [])).toBe(0);
    expect(landWaitingHouses(deps, ["stranger"])).toBe(0);
    expect(runtime.hasPlayer("stranger")).toBe(false);
    expect(owned()).toBe(0);
    landWaitingHouses(deps, ["fallen"]);
    const landedTiles = owned();
    expect(landWaitingHouses(deps, ["fallen"])).toBe(0);
    expect(owned()).toBe(landedTiles);
  });

  it("does nothing outside an active season", () => {
    const { deps, owned } = setup(openWorld());
    const ended = { ...deps, getSeasonState: () => ({ ...deps.getSeasonState(), status: "ended" as const }) };
    expect(landWaitingHouses(ended, ["fallen"])).toBe(0);
    expect(owned()).toBe(0);
  });
});
