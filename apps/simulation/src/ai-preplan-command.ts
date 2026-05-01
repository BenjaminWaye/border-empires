import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainStrategicResourceKey } from "@border-empires/game-domain";

import { createAutomationCommand } from "./automation-command-factory.js";
import type { AutomationPlannerDiagnostic, AutomationSessionPrefix } from "./automation-command-planner.js";
import { economyWeak, foodCoverageLow, hasCollectibleVisibleYieldSource } from "./ai-economic-heuristics.js";
import { chooseAiDomainChoiceForPlayer, chooseAiTechChoiceForPlayer } from "./tech-domain-bridge.js";

type StrategicResourceKey = DomainStrategicResourceKey;
type AutomationPreplanTile = {
  ownershipState?: string | undefined;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
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
  sessionPrefix: AutomationSessionPrefix
): AutomationPlannerDiagnostic => ({
  playerId,
  sessionPrefix,
  settlementEligible: false,
  settlementCandidateFound: false,
  frontierEnemyTargetCount: 0,
  frontierNeutralTargetCount: 0,
  canAttack: false,
  canExpand: false
});

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

  if (
    hasCollectibleVisibleYieldSource(input.ownedTiles) &&
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
      diagnostic: createDiagnostic(input.playerId, input.sessionPrefix)
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
      diagnostic: createDiagnostic(input.playerId, input.sessionPrefix)
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
      diagnostic: createDiagnostic(input.playerId, input.sessionPrefix)
    };
  }

  return { diagnostic: createDiagnostic(input.playerId, input.sessionPrefix) };
};
