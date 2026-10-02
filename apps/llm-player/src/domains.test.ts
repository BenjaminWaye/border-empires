import { describe, expect, it } from "vitest";
import { availableDomainChoices } from "./domains.js";
import type { DomainOption, DomainState } from "./game-types.js";

const option = (overrides: Partial<DomainOption> = {}): DomainOption => ({
  id: "frontier-doctrine",
  tier: 1,
  name: "Frontier Doctrine",
  description: "faster settling",
  requiresTechId: "organized-supply",
  goldCost: 40,
  resourceCost: {},
  needsResourceChoice: false,
  ...overrides
});

const stateWith = (catalog: DomainOption[], overrides: Partial<DomainState> = {}): DomainState => ({
  domainIds: [],
  openChoiceIds: catalog.map((entry) => entry.id),
  catalog,
  strategicResources: {},
  ...overrides
});

const TECH = ["organized-supply"];

describe("availableDomainChoices", () => {
  it("offers an open domain with its tech and enough gold", () => {
    expect(availableDomainChoices(stateWith([option()]), TECH, 40)).toEqual([
      { id: "frontier-doctrine", name: "Frontier Doctrine", tier: 1, description: "faster settling", goldCost: 40 }
    ]);
  });

  it("withholds a domain whose tech isn't researched", () => {
    expect(availableDomainChoices(stateWith([option()]), [], 1_000)).toEqual([]);
  });

  it("withholds a domain the player can't afford in gold, using live gold not the INIT snapshot", () => {
    const state = stateWith([option()]);
    expect(availableDomainChoices(state, TECH, 39)).toEqual([]);
    expect(availableDomainChoices(state, TECH, 40)).toHaveLength(1);
  });

  it("withholds a domain that isn't currently open (wrong tier / not in the server's open list)", () => {
    expect(availableDomainChoices(stateWith([option()], { openChoiceIds: [] }), TECH, 1_000)).toEqual([]);
  });

  it("never re-offers an owned domain", () => {
    expect(availableDomainChoices(stateWith([option()], { domainIds: ["frontier-doctrine"] }), TECH, 1_000)).toEqual([]);
  });

  it("withholds a domain that needs a resource sub-choice the bot doesn't send", () => {
    expect(availableDomainChoices(stateWith([option({ needsResourceChoice: true })]), TECH, 1_000)).toEqual([]);
  });

  it("withholds tier 2+ domains while the shard stockpile can't cover them, and offers them once it can", () => {
    const tierTwo = option({ id: "stone-curtain", tier: 2, goldCost: 200, resourceCost: { SHARD: 1 } });
    expect(availableDomainChoices(stateWith([tierTwo]), TECH.concat([tierTwo.requiresTechId]), 1_000)).toEqual([]);
    expect(
      availableDomainChoices(stateWith([tierTwo], { strategicResources: { SHARD: 1 } }), TECH.concat([tierTwo.requiresTechId]), 1_000)
    ).toHaveLength(1);
  });
});
