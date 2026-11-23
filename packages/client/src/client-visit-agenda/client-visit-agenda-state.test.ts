// The agenda reads towns with the same checks as the map badges and the Towns screen.
import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { agendaInputForState, agendaTown } from "./client-visit-agenda-state.js";

const townTile = (town: Partial<NonNullable<Tile["town"]>>, extra: Partial<Tile> = {}): Tile => ({
  x: 4, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  town: { name: "Rivergate", populationTier: "TOWN", population: 40_000, maxPopulation: 10_000_000, populationGrowthPerMinute: 100, goldPerMinute: 1, isFed: true, ...town },
  ...extra
} as Tile);

const ready = { targetTier: "CITY" as const, requiredPopulation: 100_000, goldCost: 500, available: true };

describe("agenda town facts", () => {
  it("is nothing for a healthy town still growing", () => {
    expect(agendaTown(townTile({}), "me")).toBeUndefined();
    expect(agendaTown(townTile({ nextPopulationTierUpgrade: { ...ready, available: false } }), "me")).toBeUndefined();
    expect(agendaTown(townTile({ nextPopulationTierUpgrade: ready }, { ownerId: "konrad" }), "me")).toBeUndefined();
  });

  it("reads an upgrade that is ready, an unfed town and an ungarrisoned one", () => {
    expect(agendaTown(townTile({ nextPopulationTierUpgrade: ready }), "me")).toEqual({ name: "Rivergate", x: 4, y: 9, ungarrisoned: false, unfed: false, upgrade: { tier: "City", goldCost: 500 } });
    expect(agendaTown(townTile({ isFed: false, goldPerMinute: 0, populationGrowthPerMinute: 0 }), "me")).toMatchObject({ unfed: true, ungarrisoned: false });
    const frontier = townTile({}, { ownershipState: "FRONTIER" });
    expect(agendaTown(frontier, "me")).toMatchObject({ ungarrisoned: true, unfed: false });
    // A garrison already on its way is not a decision any more.
    expect(agendaTown(frontier, "me", { has: (key) => key === "4,9" })).toBeUndefined();
  });
});

describe("agenda input from client state", () => {
  const state = (extra: Record<string, unknown> = {}): Parameters<typeof agendaInputForState>[0] => ({
    me: "me", tiles: new Map(), settleProgressByTile: new Map(), developmentQueue: [], activeDevelopmentProcessCount: 0, developmentProcessLimit: 3,
    manpower: 300, manpowerCap: 750, manpowerRegenPerMinute: 1, settleManpowerCost: 20, autoSettleTargets: new Set<string>(), pendingTechUnlockId: "",
    resourceSlots: { supply: { FOOD: 3 }, demand: { FOOD: 1 } }, nextManpowerBatchAmount: undefined, nextManpowerBatchAmountAt: undefined, gold: 412.9,
    techCatalog: [], techIds: [], techChoices: [], domainCatalog: [], domainChoices: [], domainIds: [], strategicResources: {}, pendingDomainUnlockId: "",
    ...extra
  } as unknown as Parameters<typeof agendaInputForState>[0]);

  it("counts whole Coin, idle slots and towns that need a decision", () => {
    const input = agendaInputForState(state(), [townTile({ nextPopulationTierUpgrade: ready }), townTile({})], 1_000_000);
    expect(input.gold).toBe(412);
    expect(input.slots).toEqual({ busy: 0, limit: 3, queued: 0, canStart: true });
    expect(input.manpower.fullBatch).toBe(240);
    expect(input.towns.map((town) => town.name)).toEqual(["Rivergate"]);
    expect(input.manifestCost).toBeUndefined();
    expect(input.afcUpgradesReady).toBe(0);
    expect(input.manpower).toMatchObject({ current: 300, cap: 750, nextBatchAmount: undefined });
  });

  it("leaves a town with a queued garrison out", () => {
    const frontier = townTile({}, { ownershipState: "FRONTIER" });
    expect(agendaInputForState(state(), [frontier], 1).towns).toHaveLength(1);
    expect(agendaInputForState(state({ developmentQueue: [{ kind: "SETTLE", tileKey: "4,9", label: "Garrison", x: 4, y: 9 }] }), [frontier], 1).towns).toEqual([]);
  });

  // Review of #2945: pending auto-garrisons are queued work, and no manpower means nothing can start.
  it("counts auto-garrison targets as queued and knows when nothing can be started", () => {
    const input = agendaInputForState(state({ autoSettleTargets: new Set(["1,1", "2,2"]), manpower: 5 }), [], 1);
    expect(input.slots).toEqual({ busy: 0, limit: 3, queued: 2, canStart: false });
  });

  // Review of #2945: gold alone is not the Manifest screen's test, and a commission in flight is not a decision.
  it("offers a Manifest only when the Manifest screen would, and not while one is being commissioned", () => {
    const tech = (extra: Record<string, unknown> = {}) => ({ id: "t1", name: "T", description: "", mods: {}, tier: 1, requirements: { gold: 300, resources: {}, ...extra } });
    expect(agendaInputForState(state({ techCatalog: [tech()] }), [], 1).manifestCost).toBe(300);
    expect(agendaInputForState(state({ techCatalog: [tech({ canResearch: false })] }), [], 1).manifestCost).toBeUndefined();
    expect(agendaInputForState(state({ techCatalog: [tech()], gold: 100 }), [], 1).manifestCost).toBeUndefined();
    expect(agendaInputForState(state({ techCatalog: [tech()], pendingTechUnlockId: "t1" }), [], 1).manifestCost).toBeUndefined();
  });
});
