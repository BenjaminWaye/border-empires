import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { INCUBATION_ENGINE_INSTANT_POPULATION_BURST } from "@border-empires/shared";
import { grantIncubationEnginePopulationBurst } from "./runtime-structure-build-completion.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";

// Regression: demolishing and rebuilding an Incubation Engine used to re-pay
// the population burst every cycle (removal never takes it back), which at
// +50,000 per cycle let one cheap engine skip whole town tiers.
const contextFor = (tiles: Map<string, DomainTileState>) => ({
  tiles,
  assignedTownKeyForSupportTile: () => "10,10",
  replaceTileState: (key: string, tile: DomainTileState) => { tiles.set(key, tile); },
  emitEvent: () => {},
  tileDeltaFromState: (tile: DomainTileState) => ({ x: tile.x, y: tile.y })
}) as unknown as RuntimeStructureCommandContext;

const townTile = (ownerId: string, extra: Partial<NonNullable<DomainTileState["town"]>> = {}): DomainTileState => ({
  x: 10, y: 10, terrain: "LAND", ownerId, ownershipState: "SETTLED",
  town: { type: "MARKET", populationTier: "TOWN", population: 20_000, maxPopulation: 100_000, ...extra }
});

describe("Incubation Engine population burst", () => {
  it("pays once per owner per town, so remove-and-rebuild earns nothing more", () => {
    const tiles = new Map([["10,10", townTile("p")]]);
    const context = contextFor(tiles);
    expect(grantIncubationEnginePopulationBurst(context, "p", 11, 10, "c1")).toBe(INCUBATION_ENGINE_INSTANT_POPULATION_BURST);
    expect(tiles.get("10,10")?.town).toMatchObject({ population: 20_000 + INCUBATION_ENGINE_INSTANT_POPULATION_BURST, incubationBurstGrantedTo: "p" });
    expect(grantIncubationEnginePopulationBurst(context, "p", 11, 10, "c2")).toBeUndefined();
    expect(tiles.get("10,10")?.town?.population).toBe(20_000 + INCUBATION_ENGINE_INSTANT_POPULATION_BURST);
  });

  it("does not pay again after a Colonial Charter grant, but a new owner of the town earns its own", () => {
    const tiles = new Map([["10,10", townTile("p", { colonialIncubationGrantedTo: "p" })]]);
    expect(grantIncubationEnginePopulationBurst(contextFor(tiles), "p", 11, 10, "c1")).toBeUndefined();
    tiles.set("10,10", townTile("q", { incubationBurstGrantedTo: "p" }));
    expect(grantIncubationEnginePopulationBurst(contextFor(tiles), "q", 11, 10, "c2")).toBe(INCUBATION_ENGINE_INSTANT_POPULATION_BURST);
  });
});
