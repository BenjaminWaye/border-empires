import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TRICKLE_RESOURCE_KEYS, isChosenTrickleResource, type ChosenTrickleResource } from "@border-empires/shared";

import {
  DOMAIN_TREE_PATH,
  DOMAIN_TREE_RELATIVE_CANDIDATES,
  TECH_TREE_PATH,
  TECH_TREE_RELATIVE_CANDIDATES,
  additiveEffectForPlayer,
  buildDomainUpdatePayload,
  buildModBreakdownForPlayer,
  chooseAiDomainChoiceForPlayer,
  chooseAiTechChoiceForPlayer,
  chooseDomainForPlayer,
  domainGrantedResourceSlots,
  domainHasResourceSubChoice,
  effectiveVisionRadiusForPlayer,
  multiplicativeEffectForPlayer,
  recomputeMods,
  resolveDataPath
} from "./tech-domain-bridge.js";
import { maxEffectForPlayer, slotWaiversForPlayer } from "./slot-waivers.js";

const MODULE_URL = new URL("./tech-domain-bridge.js", import.meta.url).href;
const EXPECTED_TECH_TREE_PATH = fileURLToPath(new URL("../../../../packages/game-domain/data/tech-tree.json", import.meta.url));
const EXPECTED_DOMAIN_TREE_PATH = fileURLToPath(new URL("../../../../packages/game-domain/data/domain-tree.json", import.meta.url));

describe("tech-domain bridge progression sources", () => {
  it("loads the packaged game-domain tech tree file", () => {
    expect(realpathSync(TECH_TREE_PATH)).toBe(realpathSync(EXPECTED_TECH_TREE_PATH));
    expect(readFileSync(TECH_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_TECH_TREE_PATH, "utf8"));
  });

  it("uses the current Aether Moorings ability unlocks", () => {
    const techTree = JSON.parse(readFileSync(TECH_TREE_PATH, "utf8")) as { techs: Array<{ id: string; effects?: Record<string, unknown> }> };
    const harborcraft = techTree.techs.find((tech) => tech.id === "harborcraft");

    expect(harborcraft?.effects).toMatchObject({
      unlockCustomsHouse: true,
      unlockAetherWall: true
    });
  });

  it("loads the packaged game-domain domain tree file", () => {
    expect(realpathSync(DOMAIN_TREE_PATH)).toBe(realpathSync(EXPECTED_DOMAIN_TREE_PATH));
    expect(readFileSync(DOMAIN_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_DOMAIN_TREE_PATH, "utf8"));
  });

  it("only considers game-domain tech tree paths", () => {
    expect(TECH_TREE_RELATIVE_CANDIDATES.every((candidate) => candidate.includes("packages/game-domain/data"))).toBe(true);
    expect(TECH_TREE_RELATIVE_CANDIDATES.some((candidate) => candidate.includes("packages/server"))).toBe(false);
  });

  it("only considers game-domain domain tree paths", () => {
    expect(DOMAIN_TREE_RELATIVE_CANDIDATES.every((candidate) => candidate.includes("packages/game-domain/data"))).toBe(true);
    expect(DOMAIN_TREE_RELATIVE_CANDIDATES.some((candidate) => candidate.includes("packages/server"))).toBe(false);
  });

  it("falls through candidates until one exists on disk", () => {
    const resolved = resolveDataPath(TECH_TREE_RELATIVE_CANDIDATES, {
      from: MODULE_URL,
      exists: (path) => path === EXPECTED_TECH_TREE_PATH
    });

    expect(resolved).toBe(EXPECTED_TECH_TREE_PATH);
  });

  it("recomputes active stat mods and source labels from unlocked domains (tribal-warfare tech was cut in the tech-tree redesign)", () => {
    const player = {
      techIds: new Set<string>(),
      domainIds: new Set<string>(["war-foundries"])
    };

    expect(recomputeMods(player)).toEqual({ attack: 1.08, defense: 1, income: 1, vision: 1 });
    expect(buildModBreakdownForPlayer(player).attack).toEqual([
      { label: "Base", mult: 1 },
      { label: "War Foundries", mult: 1.08 }
    ]);
  });

  it("no catalog tech grants a generic visionRadiusBonus any more (retired in favor of town/outpost-specific bonuses)", () => {
    const techTree = JSON.parse(readFileSync(TECH_TREE_PATH, "utf8")) as { techs: Array<{ id: string; effects?: Record<string, unknown> }> };
    expect(techTree.techs.some((tech) => typeof tech.effects?.visionRadiusBonus === "number")).toBe(false);
  });

  it("uses authoritative income when building domain update payloads", () => {
    const player = {
      id: "player-1",
      isAi: false,
      points: 0,
      manpower: 0,
      techIds: new Set<string>(["trade"]),
      domainIds: new Set<string>(["mercantile-charter"]),
      allies: new Set<string>(),
      strategicResources: {}
    };

    expect(buildDomainUpdatePayload(player, [], { incomePerMinute: 15.4 }).incomePerMinute).toBe(15.4);
  });

  it("keeps tier 2 open after a tier 1 domain is chosen even before tier 2 tech requirements are met", () => {
    const player = {
      id: "player-1",
      isAi: false,
      points: 100_000,
      manpower: 0,
      techIds: new Set<string>(["toolmaking"]),
      domainIds: new Set<string>(["frontier-doctrine"]),
      allies: new Set<string>(),
      strategicResources: { FOOD: 10_000, TITANIUM: 10_000, CRYSTAL: 10_000, UMBRITE: 10_000, SHARD: 10_000 }
    };

    const payload = buildDomainUpdatePayload(player, []);

    expect(payload.domainChoices).toEqual(expect.arrayContaining(["cogwork-foundries", "stone-curtain"]));
    expect(payload.domainChoices).not.toContain("frontier-doctrine");
    expect(payload.domainCatalog.find((domain) => domain.id === "cogwork-foundries")?.requirements.canResearch).toBe(false);
  });

  it("still rejects choosing a domain whose tier is open but required tech is missing", () => {
    const player = {
      id: "player-1",
      isAi: false,
      points: 100_000,
      manpower: 0,
      techIds: new Set<string>(["toolmaking"]),
      domainIds: new Set<string>(["frontier-doctrine"]),
      allies: new Set<string>(),
      strategicResources: { FOOD: 10_000, TITANIUM: 10_000, CRYSTAL: 10_000, UMBRITE: 10_000, SHARD: 10_000 }
    };

    const outcome = chooseDomainForPlayer(player, "cogwork-foundries", []);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("requirements not met");
    expect(player.domainIds.has("cogwork-foundries")).toBe(false);
  });
});

describe("tier-1 domain effects are wired", () => {
  it("Iron Bastions (Dwarf Kingdom) exposes fortBuildSpeedMult and the §23.2 fortTitaniumSlotWaiverCount waiver", () => {
    const player = {
      techIds: new Set<string>(["masonry"]),
      domainIds: new Set<string>(["titanium-bastions"])
    };
    expect(multiplicativeEffectForPlayer(player, "fortBuildSpeedMult")).toBeCloseTo(1.5, 6);
    expect(maxEffectForPlayer(player, "fortTitaniumSlotWaiverCount")).toBe(3);
    expect(slotWaiversForPlayer(player).fortTitaniumSlotWaiverCount).toBe(3);
  });

  it("Supply Raiding exposes attackVsBarbariansMult at 1.5", () => {
    const player = {
      techIds: new Set<string>(["leatherworking"]),
      domainIds: new Set<string>(["supply-raiding"])
    };
    expect(multiplicativeEffectForPlayer(player, "attackVsBarbariansMult")).toBeCloseTo(1.5, 6);
  });

  it("Mercantile Charter exposes firstThreeTownsPopulationGrowthMult at 1.25", () => {
    const player = {
      techIds: new Set<string>(["trade"]),
      domainIds: new Set<string>(["mercantile-charter"])
    };
    expect(multiplicativeEffectForPlayer(player, "firstThreeTownsPopulationGrowthMult")).toBeCloseTo(1.25, 6);
  });

  it("Frontier Doctrine exposes developmentProcessCapacityAdd +1 to the additive resolver", () => {
    const withDoctrine = {
      techIds: new Set<string>(),
      domainIds: new Set<string>(["frontier-doctrine"])
    };
    const without = {
      techIds: new Set<string>(),
      domainIds: new Set<string>()
    };
    expect(additiveEffectForPlayer(withDoctrine, "developmentProcessCapacityAdd")).toBe(1);
    expect(additiveEffectForPlayer(without, "developmentProcessCapacityAdd")).toBe(0);
  });
});

describe("Clockwork Stipend resource slot grant", () => {
  const baseClockworkPlayer = (): {
    id: string;
    isAi: boolean;
    points: number;
    manpower: number;
    techIds: Set<string>;
    domainIds: Set<string>;
    allies: Set<string>;
    strategicResources: Record<string, number>;
    chosenTrickleResource?: ChosenTrickleResource;
  } => ({
    id: "player-1",
    isAi: false,
    points: 10_000,
    manpower: 0,
    techIds: new Set<string>(["agriculture"]),
    domainIds: new Set<string>(),
    allies: new Set<string>(),
    strategicResources: { FOOD: 500 } as Record<string, number>
  });

  it("publishes domainHasResourceSubChoice as true for clockwork-stipend", () => {
    expect(domainHasResourceSubChoice("clockwork-stipend")).toBe(true);
    // Sanity: a domain without the slot grant returns false.
    expect(domainHasResourceSubChoice("titanium-bastions")).toBe(false);
  });

  it("data file's clockwork-stipend carries chosenResourceSlotGrant: 1", () => {
    const rawTree = JSON.parse(readFileSync(DOMAIN_TREE_PATH, "utf8")) as {
      domains: Array<{ id: string; effects?: Record<string, unknown> }>;
    };
    const clockwork = rawTree.domains.find((domain) => domain.id === "clockwork-stipend");
    expect(clockwork).toBeDefined();
    expect(clockwork!.effects?.chosenResourceSlotGrant).toBe(1);
  });

  it("isChosenTrickleResource rejects unrelated resource keys and non-strings", () => {
    expect(isChosenTrickleResource("TITANIUM")).toBe(true);
    expect(isChosenTrickleResource("UMBRITE")).toBe(true);
    expect(isChosenTrickleResource("CRYSTAL")).toBe(true);
    expect(isChosenTrickleResource("FOOD")).toBe(false);
    expect(isChosenTrickleResource("SHARD")).toBe(false);
    expect(isChosenTrickleResource("OIL")).toBe(false);
    expect(isChosenTrickleResource("iron")).toBe(false); // case-sensitive
    expect(isChosenTrickleResource(undefined)).toBe(false);
    expect(isChosenTrickleResource(null)).toBe(false);
    expect(isChosenTrickleResource(42)).toBe(false);
  });

  it("rejects CHOOSE_DOMAIN for clockwork-stipend without a sub-choice", () => {
    const player = baseClockworkPlayer();
    const outcome = chooseDomainForPlayer(player, "clockwork-stipend", []);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/resource choice required/);
    expect(player.domainIds.has("clockwork-stipend")).toBe(false);
  });

  it("rejects unsupported sub-choices (e.g. SHARD)", () => {
    const player = baseClockworkPlayer();
    const outcome = chooseDomainForPlayer(player, "clockwork-stipend", [], {
      chosenTrickleResource: "SHARD" as unknown as "TITANIUM"
    });
    expect(outcome.ok).toBe(false);
  });

  it("accepts a valid sub-choice and locks the chosen resource on the player", () => {
    const player = baseClockworkPlayer();
    const outcome = chooseDomainForPlayer(player, "clockwork-stipend", [], { chosenTrickleResource: "CRYSTAL" });
    expect(outcome.ok).toBe(true);
    expect(player.domainIds.has("clockwork-stipend")).toBe(true);
    expect(player.chosenTrickleResource).toBe("CRYSTAL");
  });

  it("domainGrantedResourceSlots returns the slot grant for the locked pick", () => {
    const player = {
      domainIds: new Set<string>(["clockwork-stipend"]),
      chosenTrickleResource: "TITANIUM" as const
    };
    expect(domainGrantedResourceSlots(player)).toEqual({ TITANIUM: 1 });
  });

  it("domainGrantedResourceSlots returns undefined when no resource is locked", () => {
    const player = { domainIds: new Set<string>(["clockwork-stipend"]) };
    expect(domainGrantedResourceSlots(player)).toBeUndefined();
  });


  it("does not overwrite a previously-locked trickle resource even when a new pick is offered", () => {
    const player = baseClockworkPlayer();
    player.chosenTrickleResource = "TITANIUM";
    const outcome = chooseDomainForPlayer(player, "clockwork-stipend", [], { chosenTrickleResource: "UMBRITE" });
    expect(outcome.ok).toBe(true);
    expect(player.domainIds.has("clockwork-stipend")).toBe(true);
    expect(player.chosenTrickleResource).toBe("TITANIUM");
  });
});

describe("AI progression choice prefers affordable options over higher-scored unaffordable ones", () => {
  // Originally reproduced a prod state (Freja Sund, ai-4) where an AI sitting
  // on gold but zero TITANIUM/CRYSTAL/UMBRITE got stuck wanting a higher-scored
  // tech it couldn't pay the strategic-resource cost for. Under the gold
  // rescope (docs/manpower-economy-rewrite-plan.md §6.2, §13) every tech
  // below tier 5 costs gold only now — that specific starvation scenario is
  // structurally impossible below tier 5 (and tier 5+ needs SHARD, a
  // separately event-gated resource, not a strategy-starvable one). The
  // surviving, still-real trigger for "prefers affordable over higher-scored
  // unaffordable" is now plain per-tier GOLD scarcity (tier 1 = 10 gold,
  // tier 2 = 50, ... — §13): a player who can afford tier 1 but not tier 2
  // must fall back to a lower-scored, actually-affordable tier-1 tech.
  const ownedSettledDock = {
    x: 1,
    y: 0,
    ownerId: "ai-4",
    ownershipState: "SETTLED" as const,
    terrain: "LAND" as const,
    dockId: "dock-a"
  };
  // Only used by the domain-choice test below (domains are untouched by the
  // gold rescope this round — §19/§23 territory, not this step).
  const ownedSettledTown = {
    x: 0,
    y: 0,
    ownerId: "ai-4",
    ownershipState: "SETTLED" as const,
    terrain: "LAND" as const,
    town: { name: "Core", populationTier: "TOWN" as const }
  };
  // trade already researched. tribal-warfare/toolmaking were cut in the
  // tech-tree redesign, and costs are now a uniform researched-count curve
  // (30 gold for the first research, then +10/+40/+50 in escalating tiers
  // per tech already researched — tech-economy.ts) rather than per-tech/
  // per-tier numbers, so the affordable/highest-scored candidates shifted
  // (verified directly against chooseAiTechChoiceForPlayer's actual output,
  // not hand-derived from the scoring heuristics). With trade researched,
  // every reachable tech costs 40 gold, so the affordability split is
  // purely points >= 40.
  const alreadyResearched = ["trade"];

  it("uses the flat researched-count gold cost and prefers an affordable tech", () => {
    const choice = chooseAiTechChoiceForPlayer(
      {
        id: "ai-4",
        points: 40, // exactly the flat cost with 1 tech already researched
        techIds: alreadyResearched,
        domainIds: [],
        strategicResources: {}
      },
      [ownedSettledDock]
    );

    expect(choice).toBeDefined();
    expect(choice!.goldCost).toBe(40);
    expect(choice!.affordable).toBe(true);
    // All reachable techs cost the same; the highest-scored one wins.
    expect(choice!.id).toBe("masonry");
  });

  it("still surfaces the highest-scored unaffordable tech when nothing is affordable", () => {
    const choice = chooseAiTechChoiceForPlayer(
      {
        id: "ai-4", // must match ownedSettledDock's ownerId for active_dock to apply
        points: 0, // below every tech's gold cost
        techIds: alreadyResearched,
        domainIds: [],
        strategicResources: {}
      },
      [ownedSettledDock]
    );

    expect(choice).toBeDefined();
    expect(choice!.affordable).toBe(false);
    // Diagnostic still gets the most-wanted tech so preplan can report
    // tech_unaffordable accurately.
    expect(choice!.id).toBe("masonry");
    expect(choice!.score).toBeGreaterThan(0);
  });

  it("picks the higher-scored tier-1 domain by gold alone now that domains no longer gate on FOOD/TITANIUM/CRYSTAL/UMBRITE quantities", () => {
    // Pre-§19, mercantile-charter's crystal cost made it unaffordable without
    // crystal, so the AI fell back to clockwork-stipend despite its lower
    // score. §19 dropped every domain's cost to gold + SHARD only — mercantile-charter
    // and clockwork-stipend are both tier 1 (40 gold, no shard), so neither
    // is gated by strategicResources anymore and the AI should just take the
    // higher-scored candidate.
    const choice = chooseAiDomainChoiceForPlayer(
      {
        id: "ai-4",
        points: 74_000,
        techIds: ["toolmaking", "agriculture", "trade"],
        domainIds: [],
        strategicResources: { FOOD: 5_000, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        settledTileCount: 315
      },
      [ownedSettledTown, ownedSettledDock]
    );

    expect(choice).toBeDefined();
    expect(choice!.affordable).toBe(true);
    expect(choice!.id).toBe("mercantile-charter");
  });
});

// Galactic meta-layer v0 Deep Sensor Array stand-in (docs/galactic-campaign-design.md
// §5, §12): galacticWonderVisionRadiusBonus is a one-time starting bonus for
// the most recent season's Planet winner, additive with the in-season
// CARTOGRAPHERS_LENS wonderVisionRadiusBonus and tech/domain bonuses.
describe("effectiveVisionRadiusForPlayer — galactic Wonder vision bonus (v0)", () => {
  const basePlayer = { mods: { attack: 1, defense: 1, income: 1, vision: 1 }, techIds: new Set<string>(), domainIds: new Set<string>() };

  it("adds galacticWonderVisionRadiusBonus on top of the base radius", () => {
    const withoutBonus = effectiveVisionRadiusForPlayer(basePlayer);
    const withBonus = effectiveVisionRadiusForPlayer({ ...basePlayer, galacticWonderVisionRadiusBonus: 2 });
    expect(withBonus).toBe(withoutBonus + 2);
  });

  it("stacks additively with the in-season natural-Wonder vision bonus", () => {
    const withoutEither = effectiveVisionRadiusForPlayer(basePlayer);
    const withBoth = effectiveVisionRadiusForPlayer({ ...basePlayer, wonderVisionRadiusBonus: 1, galacticWonderVisionRadiusBonus: 2 });
    expect(withBoth).toBe(withoutEither + 3);
  });

  it("is a no-op when absent (undefined treated as 0)", () => {
    expect(effectiveVisionRadiusForPlayer({ ...basePlayer, galacticWonderVisionRadiusBonus: undefined })).toBe(
      effectiveVisionRadiusForPlayer(basePlayer)
    );
  });
});
