import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainStrategicResourceKey } from "@border-empires/game-domain";
import type { Terrain } from "@border-empires/shared";

import { createAutomationCommand } from "./automation-command-factory.js";
import type {
  AutomationPlannerDiagnostic,
  AutomationPreplanProgressState,
  AutomationPreplanReason,
  AutomationSessionPrefix
} from "./automation-command-planner.js";
import { economyWeak, foodCoverageLow, hasCollectibleVisibleYieldSource } from "./ai-economic-heuristics.js";
import { chooseAiDomainChoiceForPlayer, chooseAiTechChoiceForPlayer } from "./tech-domain-bridge.js";

type StrategicResourceKey = DomainStrategicResourceKey;
type AutomationPreplanTile = {
  ownershipState?: string | undefined;
  terrain: Terrain;
  town?: unknown;
  dockId?: string | undefined;
  resource?: string | undefined;
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
  settlementEligible: false,
  settlementCandidateFound: false,
  frontierEnemyTargetCount: 0,
  frontierNeutralTargetCount: 0,
  canAttack: false,
  canExpand: false,
  ...overrides
});

const summarizeDeferReason = (options: {
  techChoiceAffordable: boolean;
  domainChoiceAffordable: boolean;
  hasCollectibleVisibleYieldSource: boolean;
  hasAnyProgressionChoice: boolean;
}): AutomationPreplanReason => {
  if (!options.hasAnyProgressionChoice) return "defer_no_reachable_progression";
  if (
    !options.techChoiceAffordable &&
    !options.domainChoiceAffordable &&
    !options.hasCollectibleVisibleYieldSource
  ) {
    return "defer_unaffordable_progression_without_collect";
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
  const hasCollectibleSource = hasCollectibleVisibleYieldSource(input.ownedTiles);
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
    preplanHasCollectibleVisibleYieldSource: hasCollectibleSource,
    preplanNeedsEconomy: needsEconomy,
    preplanNeedsFood: needsFood,
    preplanTechChoiceAffordable: techChoiceAffordable,
    preplanDomainChoiceAffordable: domainChoiceAffordable,
    preplanProgressState: progressState
  } satisfies Partial<AutomationPlannerDiagnostic>;

  if (
    hasCollectibleSource &&
    (
      input.hasActiveLock ||
      (
        !hasAffordableProgression &&
        (
          (techChoice !== undefined && !techChoice.affordable) ||
          (domainChoice !== undefined && !domainChoice.affordable) ||
          ((needsEconomy || needsFood) && input.points < 2_000)
        )
      )
    )
  ) {
    return {
      command: createAutomationCommand(
        input.sessionPrefix,
        input.playerId,
        input.clientSeq,
        input.issuedAt,
        "COLLECT_VISIBLE",
        {}
      ),
      diagnostic: createDiagnostic(input.playerId, input.sessionPrefix, {
        ...diagnosticBase,
        preplanReason: input.hasActiveLock
          ? "collect_for_active_lock"
          : (techChoice !== undefined || domainChoice !== undefined)
            ? "collect_for_unaffordable_progression"
            : "collect_for_economic_recovery"
      })
    };
  }

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
    return {
      command: createAutomationCommand(
        input.sessionPrefix,
        input.playerId,
        input.clientSeq,
        input.issuedAt,
        "CHOOSE_DOMAIN",
        { domainId: progressionChoice.id }
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
        hasCollectibleVisibleYieldSource: hasCollectibleSource,
        hasAnyProgressionChoice
      })
    })
  };
};
