// Stage 5 export-surface extraction out of runtime.ts (see AGENTS.md /
// docs/agents/topic-runbooks.md for the god-class breakup plan). These are
// pure relocations of existing runtime.ts method bodies into free functions
// that take their dependencies explicitly via RuntimeExportContext,
// mirroring the build*Context pattern used in Stages 1-4
// (runtime-town-network.ts / runtime-economy.ts). No behavior was changed —
// only moved. This file covers the "world/player export" side (exportState,
// snapshot sections, planner views, debug/AI-metrics snapshots); the
// visibility-classification / per-player-visible-state side lives in the
// sibling runtime-visibility.ts, since that half owns different caches
// (visibilityCoverage, barbActivationVisibilityCache) and is the
// higher-risk, per-player wire surface.
//
// The context type is derived via `Parameters<typeof impl>[0]` from the
// already-typed impl functions in ../runtime-state-export.ts and
// ../runtime-snapshot-sections.ts rather than re-declared by hand, so this
// file cannot silently drift out of sync with those input contracts.
import type { SimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";
import type { PlannerPlayerView, PlannerTileView, PlannerWorldView } from "../ai/planner-world-view.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import {
  buildRuntimeExportPlayers,
  buildRuntimeExportState,
  buildRuntimeExportStateAsync,
  buildRuntimePlannerPlayerViews,
  buildRuntimePlannerWorldView,
  buildRuntimePlayerDebugSnapshot,
  exportPlannerTilesForKeys,
  type RuntimeAiPlayerMetricsRow,
  type RuntimeExportState,
  type RuntimePlayerDebugSnapshot
} from "../runtime-state-export.js";
import {
  buildRuntimeSnapshotSections,
  buildRuntimeSnapshotSectionsAsync
} from "../runtime-snapshot-sections.js";

// `playerManpowerCap` / `playerManpowerRegenPerMinute` are excluded here:
// RuntimeExportInput (feeding exportState) needs a (player: DomainPlayer) =>
// number form, while PlannerExportInput's optional fields of the same name
// need a (playerId: string) => number form — the two signatures are not
// compatible on one shared property, so the planner-view functions below
// derive their playerId-keyed variants from this context's player-keyed
// ones at the call site instead of the context carrying both.
export type RuntimeExportContext = Parameters<typeof buildRuntimeExportState>[0] &
  Pick<Parameters<typeof buildRuntimeSnapshotSections>[0], "recordedEventsByCommandId"> &
  Pick<Parameters<typeof buildRuntimeSnapshotSectionsAsync>[0], "prebuiltTiles"> &
  Omit<Parameters<typeof buildRuntimePlannerWorldView>[0], "playerIds" | "playerManpowerCap" | "playerManpowerRegenPerMinute"> &
  Parameters<typeof buildRuntimePlayerDebugSnapshot>[0] & {
    playerSummaries: ReadonlyMap<string, PlayerRuntimeSummary>;
  };

function plannerManpowerFields(ctx: RuntimeExportContext) {
  return {
    playerManpowerCap: (playerId: string): number => {
      const player = ctx.players.get(playerId);
      return player ? ctx.playerManpowerCap(player) : 0;
    },
    playerManpowerRegenPerMinute: (playerId: string): number => {
      const player = ctx.players.get(playerId);
      return player ? ctx.playerManpowerRegenPerMinute(player) : 0;
    }
  };
}

export function exportStateForRuntime(ctx: RuntimeExportContext): RuntimeExportState {
  return buildRuntimeExportState(ctx);
}

export async function exportStateAsyncForRuntime(
  ctx: RuntimeExportContext,
  yieldToEventLoop: () => Promise<void>
): Promise<RuntimeExportState> {
  return buildRuntimeExportStateAsync(ctx, yieldToEventLoop);
}

export function leaderboardPlayersForRuntime(ctx: RuntimeExportContext): RuntimeExportState["players"] {
  return buildRuntimeExportPlayers(ctx);
}

export function snapshotSectionsForRuntime(ctx: RuntimeExportContext): SimulationSnapshotSections {
  return buildRuntimeSnapshotSections(ctx);
}

export async function snapshotSectionsAsyncForRuntime(
  ctx: RuntimeExportContext,
  yieldToEventLoop: () => Promise<void>
): Promise<SimulationSnapshotSections> {
  return buildRuntimeSnapshotSectionsAsync(ctx, yieldToEventLoop);
}

// NOTE: intentionally does NOT thread plannerManpowerFields — the original
// exportPlannerWorldView delegator never passed playerManpowerCap /
// playerManpowerRegenPerMinute either, so the needVector diagnostic fields
// they feed (see PlannerExportInput's doc comment) are omitted here exactly
// as before. Only exportPlannerPlayerViews wired them.
export function plannerWorldViewForRuntime(ctx: RuntimeExportContext, playerIds: string[]): PlannerWorldView {
  const { playerManpowerCap: _playerManpowerCap, playerManpowerRegenPerMinute: _playerManpowerRegenPerMinute, ...rest } = ctx;
  return buildRuntimePlannerWorldView({ ...rest, playerIds });
}

export function plannerPlayerViewsForRuntime(ctx: RuntimeExportContext, playerIds: string[]): PlannerPlayerView[] {
  // Destructure the player-keyed playerManpowerCap/RegenPerMinute out before
  // spreading, then re-add the playerId-keyed variants — a plain double
  // spread leaves both property types intersected under
  // exactOptionalPropertyTypes, which the planner input's playerId-keyed
  // signature can't satisfy.
  const { playerManpowerCap: _playerManpowerCap, playerManpowerRegenPerMinute: _playerManpowerRegenPerMinute, ...rest } = ctx;
  return buildRuntimePlannerPlayerViews({ ...rest, playerIds, ...plannerManpowerFields(ctx) });
}

export function playerDebugSnapshotForRuntime(ctx: RuntimeExportContext): RuntimePlayerDebugSnapshot {
  return buildRuntimePlayerDebugSnapshot(ctx);
}

// Lean per-second metrics row (skips exportPlayerDebugSnapshot's sort/clone/lock-scan work; see RuntimeAiPlayerMetricsRow doc comment).
export function aiPlayerMetricsSnapshotForRuntime(ctx: RuntimeExportContext): RuntimeAiPlayerMetricsRow[] {
  return [...ctx.players.values()]
    .filter((p) => p.isAi === true)
    .map((p) => {
      const summary = ctx.summaryForPlayer(p.id);
      return {
        id: p.id,
        isAi: true,
        points: p.points,
        incomePerMinute: ctx.estimatedIncomePerMinuteForPlayer(p.id),
        settledTileCount: summary.settledTileCount,
        ownedTileCount: summary.territoryTileKeys.size
      };
    });
}

export function tilesForKeysForRuntime(ctx: RuntimeExportContext, tileKeys: Iterable<string>): PlannerTileView[] {
  return exportPlannerTilesForKeys(ctx.tiles, tileKeys);
}

// Cheap O(players) aggregate of empire sizes for the scale metric. Uses the
// incrementally-maintained per-player territory Sets (Set.size is O(1)); does
// NOT iterate the 202,500-tile world. Excludes barbarians (not real empires).
export function empireTileCountsForRuntime(
  playerSummaries: ReadonlyMap<string, PlayerRuntimeSummary>
): { totalOwnedTiles: number; maxEmpireTiles: number } {
  let totalOwnedTiles = 0;
  let maxEmpireTiles = 0;
  for (const [playerId, summary] of playerSummaries) {
    if (playerId.startsWith("barbarian")) continue;
    const size = summary.territoryTileKeys.size;
    totalOwnedTiles += size;
    if (size > maxEmpireTiles) maxEmpireTiles = size;
  }
  return { totalOwnedTiles, maxEmpireTiles };
}
