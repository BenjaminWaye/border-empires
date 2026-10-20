import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import { settleEnvoyDependents, type RuntimeManpowerEconomyContext } from "../runtime/runtime-manpower-economy.js";
import { describe, expect, it } from "vitest";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";
import { afcEnvoyBenefits } from "./afc-coalition.js";

const player = (id: string, upgrade = true) => ({ ...createHumanRuntimePlayer(id), afcUpgradeRuleset: "afc-v1" as const,
  domainIds: new Set(upgrade ? ["afc-chancery-1"] : []) });

describe("Envoy Accreditation shares domestic allied prosperity", () => {
  it("grants 10% of every mutual ally's income, capacity and refill rate without an ally cap", () => {
    const actor = player("p");
    const allies = Array.from({ length: 12 }, (_, i) => player(`a${i}`));
    const peers = new Map([actor, ...allies].map(p => [p.id, p]));
    for (const ally of allies) { actor.allies.add(ally.id); ally.allies.add(actor.id); }
    let reads = 0;
    const domestic = { goldPerMinute: 100 / 1440, manpowerCap: 1000, manpowerRegenPerMinute: 1 };
    const benefits = afcEnvoyBenefits(actor, peers, () => { reads++; return domestic; });
    expect(benefits.allies).toBe(12);
    expect(benefits.goldPerMinute).toBeCloseTo(120 / 1440);
    expect(benefits.manpowerCap).toBeCloseTo(1200);
    expect(benefits.manpowerRegenPerMinute).toBeCloseTo(1.2);
    expect(reads).toBe(12);
    expect(domestic).toEqual({ goldPerMinute: 100 / 1440, manpowerCap: 1000, manpowerRegenPerMinute: 1 });
    allies[0]!.allies.clear();
    expect(afcEnvoyBenefits(actor, peers, () => domestic).allies).toBe(11);
  });

  it("does no ally-economy work without the upgrade or for one-sided relations", () => {
    const actor = player("p", false), ally = player("a");
    actor.allies.add(ally.id); ally.allies.add(actor.id);
    let reads = 0;
    const read = () => { reads++; return { goldPerMinute: 1, manpowerCap: 1000, manpowerRegenPerMinute: 1 }; };
    expect(afcEnvoyBenefits(actor, new Map([[ally.id, ally]]), read).goldPerMinute).toBe(0);
    actor.domainIds.add("afc-chancery-1"); ally.allies.clear();
    expect(afcEnvoyBenefits(actor, new Map([[ally.id, ally]]), read).manpowerCap).toBe(0);
    expect(reads).toBe(0);
  });

  it("settles a dense alliance at most once per player per timestamp", () => {
    const roster = Array.from({ length: 12 }, (_, i) => ({ ...player(`p${i}`), manpower: 0,
      manpowerUpdatedAt: 0, landingReserveGranted: true }));
    for (const member of roster) member.allies = new Set(roster.filter(p => p !== member).map(p => p.id));
    const summary = createEmptyPlayerRuntimeSummary();
    let summaryReads = 0;
    const ctx: RuntimeManpowerEconomyContext = {
      players: new Map(roster.map(p => [p.id, p])), now: () => 1000,
      summaryForPlayer: () => { summaryReads++; return summary; },
      cachedManpowerStructureBonusForPlayer: () => ({ ancillaryDepotCount: 0, reserveLatticeNetworkAncillaryDepotCount: 0,
        neuralWorksNetworkAncillaryFactoryCount: 0, ancillaryFactoryCount: 0, censusDirectorateManpowerBuildingCount: 0 }),
      wonderCacheByPlayer: new Map(), getAbilityCooldownUntil: () => 0,
      applyEconomyAccrual: () => { throw new Error("dependent settlement must not scan upkeep"); }
    };
    for (const member of roster) settleEnvoyDependents(ctx, [member.id], 1000);
    expect(summaryReads).toBeLessThanOrEqual(4 * roster.length ** 2);
    expect(roster.every(p => p.manpowerUpdatedAt === 1000)).toBe(true);
  });

});
