import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainStrategicResourceKey } from "@border-empires/game-domain";
import { FRONTIER_CLAIM_COST, SETTLE_COST, type Terrain } from "@border-empires/shared";

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
  // True when the producer has gated COLLECT_VISIBLE for this AI (per-player
  // 20s cooldown — see ai-command-producer*.ts COLLECT_VISIBLE_COOLDOWN_MS).
  // When set, the preplan must not emit a COLLECT_VISIBLE preempt; otherwise
  // the producer would gate it after the fact and the AI would loop through
  // both planner passes without dispatching anything useful — exactly the
  // failure mode we saw on staging (58 dispatched + many silent ticks).
  collectVisibleOnCooldown?: boolean;
  // Last time the producer issued a COLLECT_VISIBLE for this player (epoch ms).
  // When the gap to `issuedAt` exceeds COLLECT_HEARTBEAT_INTERVAL_MS the
  // preplan emits a heartbeat collect before the main planner runs — without
  // this, upkeep accrual drains the treasury below SETTLE_COST/FRONTIER_CLAIM_COST
  // and the main planner sits in `insufficient_points` for thousands of ticks.
  lastCollectVisibleAtMs?: number;
};

export const COLLECT_HEARTBEAT_INTERVAL_MS = 60_000;

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

  const canAffordExpansion = input.points >= FRONTIER_CLAIM_COST + SETTLE_COST;
  // TEMP DIAGNOSTIC (remove after staging shows `collect_heartbeat` firing):
  // 1% sample of heartbeat-gate inputs so we can see in flyctl logs which
  // gate is rejecting. Staging metric `collect_heartbeat = 0` since deploy
  // means SOMETHING is wrong; the suspects are hasCollectibleSource (tile
  // view excludes towns?), lastCollectVisibleAtMs (lazy-init not reaching
  // worker?), or the gap (organic collects refreshing the stamp too often).
  if (input.sessionPrefix === "ai-runtime" && Math.random() < 0.01) {
    const gapMs =
      input.lastCollectVisibleAtMs !== undefined
        ? input.issuedAt - input.lastCollectVisibleAtMs
        : null;
    // eslint-disable-next-line no-console
    console.log("[heartbeat-gate]", {
      playerId: input.playerId,
      hasCollectibleSource,
      onCooldown: input.collectVisibleOnCooldown ?? false,
      lastCollectVisibleAtMs: input.lastCollectVisibleAtMs ?? null,
      gapMs,
      settledTileCount: input.settledTileCount ?? null,
      townCount: input.townCount ?? null,
      ownedTileCount: input.ownedTiles.length,
      ownedSettledLandWithTownOrDock: input.ownedTiles.filter(
        (t) =>
          t.ownershipState === "SETTLED" &&
          t.terrain === "LAND" &&
          (Boolean(t.town) || Boolean(t.dockId))
      ).length
    });
  }
  // Heartbeat: force a COLLECT_VISIBLE before any other planning if the
  // producer last collected for this player over a minute ago. Tile yield
  // is netted against upkeep inside applyEconomyAccrual before it ever
  // reaches player.points, so without a periodic collect the treasury bleeds
  // below FRONTIER_CLAIM_COST and the main planner gets stuck noop'ing
  // `insufficient_points`. Gated on `hasCollectibleSource` so we never spam
  // empties at AI players that genuinely have no settled town/dock yet, and
  // on `!collectVisibleOnCooldown` so the producer's 20s gate still wins
  // when it's active (60s > 20s so they shouldn't collide).
  if (
    hasCollectibleSource &&
    !input.collectVisibleOnCooldown &&
    input.lastCollectVisibleAtMs !== undefined &&
    input.issuedAt - input.lastCollectVisibleAtMs >= COLLECT_HEARTBEAT_INTERVAL_MS
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
        preplanReason: "collect_heartbeat"
      })
    };
  }
  // Suppress the COLLECT_VISIBLE preempt while it's on cooldown — otherwise we
  // emit COLLECT, the producer gates the dispatch, the same AI loops back into
  // preplan, and we get a silent tick. With cooldown respected here we fall
  // through to CHOOSE_TECH / CHOOSE_DOMAIN / main-planner instead.
  if (
    hasCollectibleSource &&
    !input.collectVisibleOnCooldown &&
    (
      input.hasActiveLock ||
      (
        !canAffordExpansion &&
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
