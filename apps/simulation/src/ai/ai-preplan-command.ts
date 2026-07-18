import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainStrategicResourceKey } from "@border-empires/game-domain";
import { nextTownGrowthUpgrade, type ChosenTrickleResource, type PopulationTier, type Terrain } from "@border-empires/shared";

import { createAutomationCommand } from "./automation-command-factory.js";
import type {
  AutomationPlannerDiagnostic,
  AutomationPreplanProgressState,
  AutomationPreplanReason,
  AutomationSessionPrefix
} from "./automation-command-planner.js";
import { economyWeak, foodCoverageLow } from "./ai-economic-heuristics.js";
import { chooseAiDomainChoiceForPlayer, chooseAiTechChoiceForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";

type StrategicResourceKey = DomainStrategicResourceKey;
type AutomationPreplanTile = {
  x: number;
  y: number;
  ownershipState?: string | undefined;
  terrain: Terrain;
  town?: { populationTier?: PopulationTier | undefined; population?: number | undefined } | null | undefined;
  dockId?: string | undefined;
  resource?: string | undefined;
};

// Mirrors the manual "Upgrade Town to City / Great City / Monumental City"
// action a human player can click (client-tile-action-logic.ts's
// townGrowthActionForUpgrade) — without this, AI towns keep growing
// population forever but never actually reach the CITY/GREAT_CITY/METROPOLIS
// tier, missing out on the population income multiplier (townPopulationMultiplier
// in player-update-economy.ts) that tier unlocks.
const chooseAiTownTierUpgrade = (
  ownedTiles: readonly AutomationPreplanTile[],
  strategicResources: Partial<Record<StrategicResourceKey, number>> | undefined
): { x: number; y: number } | undefined => {
  const availableFood = strategicResources?.FOOD ?? 0;
  for (const tile of ownedTiles) {
    if (tile.ownershipState !== "SETTLED") continue;
    const town = tile.town;
    if (!town?.populationTier || typeof town.population !== "number") continue;
    const upgrade = nextTownGrowthUpgrade(town.populationTier, town.population);
    if (!upgrade?.available) continue;
    if (availableFood < upgrade.foodCost) continue;
    return { x: tile.x, y: tile.y };
  }
  return undefined;
};

export type AutomationPreplanInput<TTile extends AutomationPreplanTile> = {
  playerId: string;
  points: number;
  techIds?: readonly string[];
  domainIds?: readonly string[];
  strategicResources?: Partial<Record<StrategicResourceKey, number>>;
  settledTileCount?: number;
  townCount?: number;
  incomePerMinute?: number;
  hasActiveLock: boolean;
  ownedTiles: readonly TTile[];
  // Pre-filtered SETTLED-with-town subset of ownedTiles (typically tens of
  // tiles vs. thousands for a large empire), sourced from the incrementally
  // maintained PlayerRuntimeSummary.ownedTownTierByTile map. Callers that
  // can't cheaply provide this fall back to scanning ownedTiles below.
  townTiles?: readonly TTile[];
  clientSeq: number;
  issuedAt: number;
  sessionPrefix: AutomationSessionPrefix;
};

const createDiagnostic = (
  playerId: string,
  sessionPrefix: AutomationSessionPrefix,
  overrides: Partial<AutomationPlannerDiagnostic> = {}
): AutomationPlannerDiagnostic => ({
  playerId,
  sessionPrefix,
  frontierEnemyTargetCount: 0,
  frontierNeutralTargetCount: 0,
  canAttack: false,
  canExpand: false,
  ...overrides
});

const summarizeDeferReason = (options: {
  techChoiceAffordable: boolean;
  domainChoiceAffordable: boolean;
  hasAnyProgressionChoice: boolean;
}): AutomationPreplanReason => {
  if (!options.hasAnyProgressionChoice) return "defer_no_reachable_progression";
  if (!options.techChoiceAffordable && !options.domainChoiceAffordable) {
    return "defer_unaffordable_progression";
  }
  return "defer_to_main_planner";
};

const summarizeProgressState = (options: {
  hasAnyProgressionChoice: boolean;
  techChoiceAffordable: boolean;
  domainChoiceAffordable: boolean;
  hasTechChoice: boolean;
  hasDomainChoice: boolean;
}): AutomationPreplanProgressState => {
  if (!options.hasAnyProgressionChoice) return "no_reachable_progression";
  if (options.techChoiceAffordable && options.domainChoiceAffordable) return "tech_and_domain_affordable";
  if (options.techChoiceAffordable) return "tech_affordable";
  if (options.domainChoiceAffordable) return "domain_affordable";
  if (options.hasTechChoice && options.hasDomainChoice) return "tech_and_domain_unaffordable";
  if (options.hasTechChoice) return "tech_unaffordable";
  return "domain_unaffordable";
};

export const chooseAutomationPreplanCommand = <TTile extends AutomationPreplanTile>(
  input: AutomationPreplanInput<TTile>
): { command?: CommandEnvelope; diagnostic: AutomationPlannerDiagnostic } => {
  if (input.sessionPrefix !== "ai-runtime") {
    return { diagnostic: createDiagnostic(input.playerId, input.sessionPrefix) };
  }

  const settledTileCount = input.settledTileCount ?? 0;
  const townCount = input.townCount ?? 0;
  const incomePerMinute = input.incomePerMinute ?? 0;
  const needsFood = foodCoverageLow(input.strategicResources, townCount);
  const needsEconomy = economyWeak(incomePerMinute, settledTileCount);

  if (!needsFood && townCount > 0) {
    const townTierUpgrade = chooseAiTownTierUpgrade(input.townTiles ?? input.ownedTiles, input.strategicResources);
    if (townTierUpgrade) {
      return {
        command: createAutomationCommand(
          input.sessionPrefix,
          input.playerId,
          input.clientSeq,
          input.issuedAt,
          "UPGRADE_TOWN_TIER",
          { x: townTierUpgrade.x, y: townTierUpgrade.y }
        ),
        diagnostic: createDiagnostic(input.playerId, input.sessionPrefix, {
          preplanNeedsEconomy: needsEconomy,
          preplanNeedsFood: needsFood,
          preplanReason: "upgrade_town_tier"
        })
      };
    }
  }

  const techChoice = chooseAiTechChoiceForPlayer(
    {
      id: input.playerId,
      points: input.points,
      techIds: input.techIds ?? [],
      domainIds: input.domainIds ?? [],
      strategicResources: input.strategicResources ?? {}
    },
    input.ownedTiles
  );
  const domainChoice = chooseAiDomainChoiceForPlayer(
    {
      id: input.playerId,
      points: input.points,
      techIds: input.techIds ?? [],
      domainIds: input.domainIds ?? [],
      strategicResources: input.strategicResources ?? {},
      settledTileCount
    },
    input.ownedTiles
  );
  const hasAffordableProgression = Boolean(techChoice?.affordable || domainChoice?.affordable);
  const techChoiceAffordable = techChoice?.affordable === true;
  const domainChoiceAffordable = domainChoice?.affordable === true;
  const hasAnyProgressionChoice = techChoice !== undefined || domainChoice !== undefined;
  const progressState = summarizeProgressState({
    hasAnyProgressionChoice,
    techChoiceAffordable,
    domainChoiceAffordable,
    hasTechChoice: techChoice !== undefined,
    hasDomainChoice: domainChoice !== undefined
  });
  const diagnosticBase = {
    preplanNeedsEconomy: needsEconomy,
    preplanNeedsFood: needsFood,
    preplanTechChoiceAffordable: techChoiceAffordable,
    preplanDomainChoiceAffordable: domainChoiceAffordable,
    preplanProgressState: progressState
  } satisfies Partial<AutomationPlannerDiagnostic>;

  const progressionChoice =
    techChoice?.affordable && domainChoice?.affordable
      ? (domainChoice.score > techChoice.score ? { type: "CHOOSE_DOMAIN" as const, id: domainChoice.id } : { type: "CHOOSE_TECH" as const, id: techChoice.id })
      : techChoice?.affordable
        ? { type: "CHOOSE_TECH" as const, id: techChoice.id }
        : domainChoice?.affordable
          ? { type: "CHOOSE_DOMAIN" as const, id: domainChoice.id }
          : undefined;

  if (progressionChoice?.type === "CHOOSE_TECH") {
    return {
      command: createAutomationCommand(
        input.sessionPrefix,
        input.playerId,
        input.clientSeq,
        input.issuedAt,
        "CHOOSE_TECH",
        { techId: progressionChoice.id }
      ),
      diagnostic: createDiagnostic(input.playerId, input.sessionPrefix, {
        ...diagnosticBase,
        preplanReason: "choose_tech"
      })
    };
  }

  if (progressionChoice?.type === "CHOOSE_DOMAIN") {
    // Clockwork Stipend asks for a per-resource sub-choice. The AI picks
    // whichever offered resource it is currently most stockpile-starved on,
    // weighted by trickle rate so CRYSTAL's lower 0.1/min rate doesn't pull
    // it away from a more impactful 0.2/min on IRON/SUPPLY. Effective need =
    // stockpile / ratePerMinute (lower → starved relative to what this trickle
    // can repair). Ties break IRON > SUPPLY > CRYSTAL (most universally useful
    // for fort/outpost upkeep).
    const aiDomainPayload: { domainId: string; chosenTrickleResource?: ChosenTrickleResource } = {
      domainId: progressionChoice.id
    };
    if (progressionChoice.id === "clockwork-stipend") {
      const stockpile = input.strategicResources ?? {};
      const candidates: Array<{ resource: ChosenTrickleResource; rate: number; stock: number }> = [
        { resource: "IRON", rate: 0.2, stock: stockpile.IRON ?? 0 },
        { resource: "SUPPLY", rate: 0.2, stock: stockpile.SUPPLY ?? 0 },
        { resource: "CRYSTAL", rate: 0.1, stock: stockpile.CRYSTAL ?? 0 }
      ];
      let best = candidates[0]!;
      for (const candidate of candidates) {
        if (candidate.stock / candidate.rate < best.stock / best.rate) best = candidate;
      }
      aiDomainPayload.chosenTrickleResource = best.resource;
    }
    return {
      command: createAutomationCommand(
        input.sessionPrefix,
        input.playerId,
        input.clientSeq,
        input.issuedAt,
        "CHOOSE_DOMAIN",
        aiDomainPayload
      ),
      diagnostic: createDiagnostic(input.playerId, input.sessionPrefix, {
        ...diagnosticBase,
        preplanReason: "choose_domain"
      })
    };
  }

  return {
    diagnostic: createDiagnostic(input.playerId, input.sessionPrefix, {
      ...diagnosticBase,
      preplanReason: summarizeDeferReason({
        techChoiceAffordable,
        domainChoiceAffordable,
        hasAnyProgressionChoice
      })
    })
  };
};
