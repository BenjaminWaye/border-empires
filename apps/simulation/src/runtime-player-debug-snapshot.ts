import type { DomainPlayer } from "@border-empires/game-domain";
import { cloneStrategicProduction } from "./player-runtime-summary.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { LockRecord, StrategicResourceKey } from "./runtime-types.js";

export type RuntimePlayerDebugSnapshot = Array<{
  id: string;
  name?: string;
  isAi: boolean;
  points: number;
  manpower: number;
  manpowerCap: number;
  manpowerRegenPerMinute: number;
  techIds: string[];
  domainIds: string[];
  strategicResources: Partial<Record<StrategicResourceKey, number>>;
  settledTileCount: number;
  ownedTileCount: number;
  townCount: number;
  incomePerMinute: number;
  strategicProductionPerMinute: Record<StrategicResourceKey, number>;
  activeDevelopmentProcessCount: number;
  /** True iff a *player-issued* frontier lock would block the AI planner. */
  plannerBlocked: boolean;
  /** True iff any lock exists for this player (player-issued OR territory-automation). */
  hasAnyLock: boolean;
  allies: string[];
}>;

type PlayerDebugInput = {
  locksByTile: ReadonlyMap<string, LockRecord>;
  players: ReadonlyMap<string, DomainPlayer>;
  refreshManpowerOnly: (player: DomainPlayer) => void;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  playerManpowerCap: (player: DomainPlayer) => number;
  playerManpowerRegenPerMinute: (player: DomainPlayer) => number;
  estimatedIncomePerMinuteForPlayer: (playerId: string) => number;
};

export function buildRuntimePlayerDebugSnapshot(input: PlayerDebugInput): RuntimePlayerDebugSnapshot {
  const plannerBlockedIds = new Set<string>();
  const anyLockIds = new Set<string>();
  for (const lock of input.locksByTile.values()) {
    anyLockIds.add(lock.playerId);
    if (lock.source !== "automation") plannerBlockedIds.add(lock.playerId);
  }
  return [...input.players.values()]
    .map((player) => {
      input.refreshManpowerOnly(player);
      const summary = input.summaryForPlayer(player.id);
      return {
        id: player.id,
        ...(player.name ? { name: player.name } : {}),
        isAi: player.isAi === true,
        points: player.points,
        manpower: player.manpower,
        manpowerCap: input.playerManpowerCap(player),
        manpowerRegenPerMinute: input.playerManpowerRegenPerMinute(player),
        techIds: [...player.techIds].sort(),
        domainIds: [...(player.domainIds ?? [])].sort(),
        strategicResources: { ...(player.strategicResources ?? {}) },
        settledTileCount: summary.settledTileCount,
        ownedTileCount: summary.territoryTileKeys.size,
        townCount: summary.townCount,
        incomePerMinute: input.estimatedIncomePerMinuteForPlayer(player.id),
        strategicProductionPerMinute: cloneStrategicProduction(summary.strategicProductionPerMinute),
        activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount,
        plannerBlocked: plannerBlockedIds.has(player.id),
        hasAnyLock: anyLockIds.has(player.id),
        allies: [...player.allies].sort()
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
