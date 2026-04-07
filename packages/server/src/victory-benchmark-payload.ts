import type { ResourceType, SeasonVictoryPathId } from "@border-empires/shared";

export type VictoryBenchmarkMetric = {
  playerId: string;
  name: string;
  isAi: boolean;
  controlledTowns: number;
  settledTiles: number;
  incomePerMinute: number;
  controlledResources: Partial<Record<ResourceType, number>>;
  continentQualifiedCount: number;
};

export type VictoryBenchmarkProgressEntry = {
  id: SeasonVictoryPathId;
  progressRatio: number;
  currentValue: number;
  requiredValue: number;
};

export type VictoryBenchmarkPlayerEntry = {
  playerId: string;
  name: string;
  isAi: boolean;
  strongestPathId: SeasonVictoryPathId;
  strongestProgressRatio: number;
  quarterVictoryReached: boolean;
  progress: VictoryBenchmarkProgressEntry[];
};

export type VictoryBenchmarkPayload = {
  ok: true;
  at: number;
  thresholds: {
    townsTarget: number;
    settledTilesTarget: number;
    economicIncomeTarget: number;
    economyLeadMult: number;
    totalIslands: number;
    quarterProgressRatio: number;
  };
  players: VictoryBenchmarkPlayerEntry[];
};

type BuildVictoryBenchmarkPayloadInput = {
  at: number;
  metrics: VictoryBenchmarkMetric[];
  townsTarget: number;
  settledTilesTarget: number;
  economicIncomeTarget: number;
  economyLeadMult: number;
  totalResourceCounts: Partial<Record<ResourceType, number>>;
  totalIslands: number;
};

const QUARTER_PROGRESS_RATIO = 0.25;
const clampRatio = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0);

const strongestResourceRatio = (
  controlledResources: Partial<Record<ResourceType, number>>,
  totalResourceCounts: Partial<Record<ResourceType, number>>
): { currentValue: number; requiredValue: number; progressRatio: number } => {
  let bestOwned = 0;
  let bestTotal = 1;
  for (const [resource, total] of Object.entries(totalResourceCounts) as Array<[ResourceType, number | undefined]>) {
    if ((total ?? 0) <= 0) continue;
    const owned = controlledResources[resource] ?? 0;
    if (owned > bestOwned || (owned === bestOwned && (total ?? 0) < bestTotal)) {
      bestOwned = owned;
      bestTotal = total ?? 1;
    }
  }
  return {
    currentValue: bestOwned,
    requiredValue: bestTotal,
    progressRatio: clampRatio(bestOwned / Math.max(1, bestTotal))
  };
};

const strongestProgressEntry = (progress: VictoryBenchmarkProgressEntry[]): VictoryBenchmarkProgressEntry => {
  const first = progress[0];
  if (!first) {
    throw new Error("victory benchmark progress requires at least one entry");
  }
  let best = first;
  for (const entry of progress.slice(1)) {
    if (entry.progressRatio > best.progressRatio) best = entry;
  }
  return best;
};

export const buildVictoryBenchmarkPayload = ({
  at,
  metrics,
  townsTarget,
  settledTilesTarget,
  economicIncomeTarget,
  economyLeadMult,
  totalResourceCounts,
  totalIslands
}: BuildVictoryBenchmarkPayloadInput): VictoryBenchmarkPayload => {
  const incomeByPlayerId = new Map(metrics.map((metric) => [metric.playerId, metric.incomePerMinute]));
  const players = metrics
    .map((metric): VictoryBenchmarkPlayerEntry => {
      let strongestOtherIncome = 0;
      for (const [playerId, income] of incomeByPlayerId) {
        if (playerId === metric.playerId) continue;
        if (income > strongestOtherIncome) strongestOtherIncome = income;
      }
      const economicRequiredValue = Math.max(economicIncomeTarget, strongestOtherIncome * economyLeadMult);
      const resourceProgress = strongestResourceRatio(metric.controlledResources, totalResourceCounts);
      const progress: VictoryBenchmarkProgressEntry[] = [
        {
          id: "TOWN_CONTROL",
          currentValue: metric.controlledTowns,
          requiredValue: townsTarget,
          progressRatio: clampRatio(metric.controlledTowns / Math.max(1, townsTarget))
        },
        {
          id: "SETTLED_TERRITORY",
          currentValue: metric.settledTiles,
          requiredValue: settledTilesTarget,
          progressRatio: clampRatio(metric.settledTiles / Math.max(1, settledTilesTarget))
        },
        {
          id: "ECONOMIC_HEGEMONY",
          currentValue: metric.incomePerMinute,
          requiredValue: economicRequiredValue,
          progressRatio: clampRatio(metric.incomePerMinute / Math.max(1, economicRequiredValue))
        },
        {
          id: "RESOURCE_MONOPOLY",
          currentValue: resourceProgress.currentValue,
          requiredValue: resourceProgress.requiredValue,
          progressRatio: resourceProgress.progressRatio
        },
        {
          id: "CONTINENT_FOOTPRINT",
          currentValue: metric.continentQualifiedCount,
          requiredValue: Math.max(1, totalIslands),
          progressRatio: clampRatio(metric.continentQualifiedCount / Math.max(1, totalIslands))
        }
      ];
      const strongest = strongestProgressEntry(progress);
      return {
        playerId: metric.playerId,
        name: metric.name,
        isAi: metric.isAi,
        strongestPathId: strongest.id,
        strongestProgressRatio: strongest.progressRatio,
        quarterVictoryReached: strongest.progressRatio >= QUARTER_PROGRESS_RATIO,
        progress
      };
    })
    .sort((a, b) => b.strongestProgressRatio - a.strongestProgressRatio || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));

  return {
    ok: true,
    at,
    thresholds: {
      townsTarget,
      settledTilesTarget,
      economicIncomeTarget,
      economyLeadMult,
      totalIslands,
      quarterProgressRatio: QUARTER_PROGRESS_RATIO
    },
    players
  };
};
