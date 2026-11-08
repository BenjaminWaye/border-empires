import type { SimulationRuntime } from "../runtime/runtime.js";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { enrichSnapshotTilesForGlobalVisibility } from "../live-snapshot-view/live-snapshot-view.js";
import { buildMapOverviewTiles } from "./map-overview-tiles.js";
import { buildWorldStatusSnapshot } from "../world-status-snapshot/world-status-snapshot.js";
import { mergeSelfProgress } from "../season-victory-objectives/season-victory-objectives.js";

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;
type WorldStatus = ReturnType<typeof buildWorldStatusSnapshot>;
export interface FullVisibilitySource {
  runtimeState: RuntimeState;
  tiles: PlayerSubscriptionSnapshot["tiles"];
  worldStatusForPlayer(playerId: string): WorldStatus;
}
export interface FullVisibilitySourceDependencies {
  exportState: () => Promise<RuntimeState>;
  yieldToEventLoop: () => Promise<void>;
  nonCompetitivePlayerIds?: ReadonlySet<string> | undefined;
}

// Holds a single world, not a per-player cache. An ended world's detached
// export is immutable and reusable until invalidation/rollover. Live spectator
// requests retain their existing rich tile payload (combat previews depend on
// it), only coalesce while in flight, and always refresh afterwards.
export const createFullVisibilitySource = (deps: FullVisibilitySourceDependencies): {
  get: (seasonEnded: boolean) => Promise<FullVisibilitySource>;
  invalidate: () => void;
} => {
  let current: Promise<FullVisibilitySource> | undefined;
  return {
    invalidate: () => { current = undefined; },
    get: (seasonEnded) => {
      if (current) return current;
      const pending = (async (): Promise<FullVisibilitySource> => {
        const runtimeState = await deps.exportState();
        const tiles = seasonEnded
          ? buildMapOverviewTiles(runtimeState.tiles)
          : enrichSnapshotTilesForGlobalVisibility(runtimeState);
        await deps.yieldToEventLoop();
        const status = buildWorldStatusSnapshot("", runtimeState, {
          ...(deps.nonCompetitivePlayerIds ? { nonCompetitivePlayerIds: deps.nonCompetitivePlayerIds } : {})
        });
        return {
          runtimeState,
          tiles,
          worldStatusForPlayer: (playerId) => {
            const { overall, byTiles, byIncome, byTechs } = status.leaderboard;
            const selfOverall = overall.find((entry) => entry.id === playerId);
            const selfByTiles = byTiles.find((entry) => entry.id === playerId);
            const selfByIncome = byIncome.find((entry) => entry.id === playerId);
            const selfByTechs = byTechs.find((entry) => entry.id === playerId);
            return {
              ...status,
              leaderboard: {
                overall, byTiles, byIncome, byTechs,
                ...(selfOverall ? { selfOverall } : {}),
                ...(selfByTiles ? { selfByTiles } : {}),
                ...(selfByIncome ? { selfByIncome } : {}),
                ...(selfByTechs ? { selfByTechs } : {})
              },
              seasonVictory: mergeSelfProgress(status.seasonVictory,
                status.allPlayerSelfProgressLabels.get(playerId), status.allPlayerSelfProgress.get(playerId))
            };
          }
        };
      })();
      current = pending;
      // A failed/cancelled older build must not clear a newer season's source.
      void pending.then(() => {
        if (!seasonEnded && current === pending) current = undefined;
      }, () => {
        if (current === pending) current = undefined;
      });
      return pending;
    }
  };
};
