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
  chosenTrickleOptionsForDomain,
  chosenTrickleRateForPlayer,
  multiplicativeEffectForPlayer,
  recomputeMods,
  resolveDataPath
} from "./tech-domain-bridge.js";

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

  it("recomputes active stat mods and source labels from unlocked techs", () => {
    const player = {
      techIds: new Set<string>(["tribal-warfare"]),
      domainIds: new Set<string>()
    };

    expect(recomputeMods(player)).toEqual({ attack: 1.05, defense: 1.05, income: 1, vision: 1 });
    expect(buildModBreakdownForPlayer(player).attack).toEqual([
      { label: "Base", mult: 1 },
      { label: "Warbands", mult: 1.05 }
    ]);
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
      strategicResources: { FOOD: 10_000, IRON: 10_000, CRYSTAL: 10_000, SUPPLY: 10_000, SHARD: 10_000 }
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
      strategicResources: { FOOD: 10_000, IRON: 10_000, CRYSTAL: 10_000, SUPPLY: 10_000, SHARD: 10_000 }
    };

    const outcome = chooseDomainForPlayer(player, "cogwork-foundries", []);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("requirements not met");
    expect(player.domainIds.has("cogwork-foundries")).toBe(false);
  });
});

describe("tier-1 domain effects are wired", () => {
  it("Iron Bastions exposes fortBuildSpeedMult / fortIronUpkeepMult / fortGoldUpkeepMult to the multiplicative resolver", () => {
    const player = {
      techIds: new Set<string>(["masonry"]),
      domainIds: new Set<string>(["iron-bastions"])
    };
    expect(multiplicativeEffectForPlayer(player, "fortBuildSpeedMult")).toBeCloseTo(1.5, 6);
    expect(multiplicativeEffectForPlayer(player, "fortIronUpkeepMult")).toBeCloseTo(0.6, 6);
    expect(multiplicativeEffectForPlayer(player, "fortGoldUpkeepMult")).toBeCloseTo(0.6, 6);
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

describe("Clockwork Stipend trickle resource choice", () => {
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

  it("publishes the offered per-resource trickle rates", () => {
    const options = chosenTrickleOptionsForDomain("clockwork-stipend");
    expect(options).toEqual({ IRON: 0.2, SUPPLY: 0.2, CRYSTAL: 0.1 });
  });

  it("data file's clockwork-stipend options match TRICKLE_RESOURCE_KEYS exactly", () => {
    // Parity guard, both directions:
    //
    //   1. If TRICKLE_RESOURCE_KEYS is widened without updating the data file,
    //      the raw-data subset check below fails because shared has extra keys
    //      the data doesn't carry (the validator would silently return undefined
    //      for those — a real correctness bug).
    //   2. If the data file grows an extra rate (e.g. SHARD: 0.5) without
    //      widening TRICKLE_RESOURCE_KEYS, the raw-data superset check below
    //      fails because data has a key shared doesn't honor (the sim and
    //      client would both silently ignore it — not a bug today but a
    //      maintenance trap).
    //
    // We read the JSON directly rather than going through the bridge so we're
    // checking the source data, not the already-filtered helper output.
    const rawTree = JSON.parse(readFileSync(DOMAIN_TREE_PATH, "utf8")) as {
      domains: Array<{ id: string; effects?: Record<string, unknown> }>;
    };
    const clockwork = rawTree.domains.find((domain) => domain.id === "clockwork-stipend");
    expect(clockwork).toBeDefined();
    const rawOptions = clockwork!.effects?.chosenResourceTrickleOptions as Record<string, unknown> | undefined;
    expect(rawOptions).toBeDefined();
    expect(Object.keys(rawOptions!).sort()).toEqual([...TRICKLE_RESOURCE_KEYS].sort());

    // Belt-and-braces: every data key passes the runtime guard.
    for (const key of Object.keys(rawOptions!)) {
      expect(isChosenTrickleResource(key)).toBe(true);
    }
  });

  it("isChosenTrickleResource rejects unrelated resource keys and non-strings", () => {
    expect(isChosenTrickleResource("IRON")).toBe(true);
    expect(isChosenTrickleResource("SUPPLY")).toBe(true);
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
    if (!outcome.ok) expect(outcome.reason).toMatch(/trickle resource choice required/);
    expect(player.domainIds.has("clockwork-stipend")).toBe(false);
  });

  it("rejects unsupported sub-choices (e.g. SHARD)", () => {
    const player = baseClockworkPlayer();
    // SHARD is a strategic resource but not in the offered table.
    const outcome = chooseDomainForPlayer(player, "clockwork-stipend", [], {
      chosenTrickleResource: "SHARD" as unknown as "IRON"
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

  it("chosenTrickleRateForPlayer returns the rate matching the locked pick", () => {
    const player = {
      domainIds: new Set<string>(["clockwork-stipend"]),
      chosenTrickleResource: "IRON" as const
    };
    expect(chosenTrickleRateForPlayer(player)).toEqual({ resource: "IRON", ratePerMinute: 0.2 });
  });

  it("chosenTrickleRateForPlayer returns undefined when no resource is locked", () => {
    const player = { domainIds: new Set<string>(["clockwork-stipend"]) };
    expect(chosenTrickleRateForPlayer(player)).toBeUndefined();
  });

  it("does not overwrite a previously-locked trickle resource even when a new pick is offered", () => {
    // Simulate a player who already locked IRON on a prior run (e.g. snapshot
    // recovery, or a future second-trickle domain). Calling chooseDomainForPlayer
    // with a different valid sub-choice MUST NOT reassign the locked value.
    const player = baseClockworkPlayer();
    player.chosenTrickleResource = "IRON";
    const outcome = chooseDomainForPlayer(player, "clockwork-stipend", [], { chosenTrickleResource: "SUPPLY" });
    expect(outcome.ok).toBe(true);
    expect(player.domainIds.has("clockwork-stipend")).toBe(true);
    // Locked forever — the SUPPLY pick we just passed in is ignored.
    expect(player.chosenTrickleResource).toBe("IRON");
  });
});

describe("AI progression choice prefers affordable options over higher-scored unaffordable ones", () => {
  // Reproduces the prod state where Freja Sund (ai-4) sat on 74k gold with
  // zero IRON/CRYSTAL/SUPPLY and the preplan reported tech_unaffordable every
  // tick: every higher-scored tier-1 tech (trade, cartography, tribal-warfare)
  // needs a strategic resource she lacks, while toolmaking (gold-only) is
  // strictly affordable but used to be hidden behind those higher scores.
  const ownedSettledTown = {
    x: 0,
    y: 0,
    ownerId: "ai-4",
    ownershipState: "SETTLED" as const,
    terrain: "LAND" as const,
    town: { name: "Core", populationTier: "TOWN" as const }
  };
  const ownedSettledDock = {
    x: 1,
    y: 0,
    ownerId: "ai-4",
    ownershipState: "SETTLED" as const,
    terrain: "LAND" as const,
    dockId: "dock-a"
  };

  it("returns the gold-only toolmaking tech when crystal/iron-gated higher-scored techs are unaffordable", () => {
    const choice = chooseAiTechChoiceForPlayer(
      {
        id: "ai-4",
        points: 74_000,
        techIds: [],
        domainIds: [],
        strategicResources: { FOOD: 5_000, IRON: 0, CRYSTAL: 0, SUPPLY: 0 }
      },
      [ownedSettledTown, ownedSettledDock]
    );

    expect(choice).toBeDefined();
    expect(choice!.affordable).toBe(true);
    // toolmaking is the highest-scored tech among gold-only-affordable
    // options when the player has a settled town + dock but no strategic
    // resources.
    expect(choice!.id).toBe("toolmaking");
  });

  it("still surfaces the highest-scored unaffordable tech when nothing is affordable", () => {
    const choice = chooseAiTechChoiceForPlayer(
      {
        id: "ai-broke",
        points: 100, // below every tier-1 tech's gold cost
        techIds: [],
        domainIds: [],
        strategicResources: {}
      },
      [ownedSettledTown, ownedSettledDock]
    );

    expect(choice).toBeDefined();
    expect(choice!.affordable).toBe(false);
    // Diagnostic still gets the most-wanted tech so preplan can report
    // tech_unaffordable accurately.
    expect(choice!.score).toBeGreaterThan(0);
  });

  it("prefers an affordable lower-scored domain when the top-scored domain needs a missing resource", () => {
    // mercantile-charter scores higher than clockwork-stipend when the player
    // owns a town + dock, but it costs crystal. Without any crystal, the AI
    // should pick clockwork-stipend (food-cost, +30 score) — the food-driven
    // trickle domain that can produce the missing strategic resources.
    // clockwork-stipend requires `agriculture` tech to unlock, so the
    // scenario seeds it; the agriculture-less variant in Freja's actual prod
    // state is fixed one step earlier by the tech-choice change above (the AI
    // will pick toolmaking → agriculture → then clockwork-stipend becomes
    // reachable on a later tick).
    const choice = chooseAiDomainChoiceForPlayer(
      {
        id: "ai-4",
        points: 74_000,
        techIds: ["toolmaking", "agriculture", "trade"],
        domainIds: [],
        strategicResources: { FOOD: 5_000, IRON: 0, CRYSTAL: 0, SUPPLY: 0 },
        settledTileCount: 315
      },
      [ownedSettledTown, ownedSettledDock]
    );

    expect(choice).toBeDefined();
    expect(choice!.affordable).toBe(true);
    expect(choice!.id).toBe("clockwork-stipend");
  });
});
