import type { DomainTileState } from "@border-empires/game-domain";

// Lean row shape for the per-second metrics ticker (metrics-ai-player-state.ts).
// Deliberately not RuntimePlayerDebugSnapshot: that type's builder sorts
// techIds/domainIds/allies, clones strategicResources, and walks locksByTile
// for every player on every call — wasted work when only a few numeric fields
// for AI players are needed once per second.
//
// The manpower/muster fields exist to answer "is an AI's manpower pool being
// held near zero by its muster flag(s), starving builds?" (staging, 2026-09-23:
// ai-2 sat at ~0.2 manpower for 20h with a flag on a hostile border while its
// beacon planner needed ~150). None of them were observable before: the admin
// endpoints expose neither regen rate nor flag state.
export type RuntimeAiPlayerMetricsRow = {
  id: string;
  isAi: boolean;
  points: number;
  incomePerMinute: number;
  settledTileCount: number;
  ownedTileCount: number;
  /** Pool manpower as last applied (fresh whenever the muster tick runs for the player). */
  manpower: number;
  manpowerCap: number;
  manpowerRegenPerMinute: number;
  musterFlagCount: number;
  /** Manpower currently staged inside this player's muster flags (already out of the pool). */
  musterStagedManpower: number;
};

export type MusterFlagTotals = Pick<RuntimeAiPlayerMetricsRow, "musterFlagCount" | "musterStagedManpower">;

/**
 * O(flags) — a player owns at most MUSTER_MAX_TILES (single digits) flags, and
 * `musterKeys` is the runtime's incrementally-maintained per-owner index, so
 * this never scans the world.
 *
 * D20 (docs/replenishment-update-plan.md): a flag no longer has an enforced
 * cap, so there's no more "capacity" total to report here -- removed
 * 2026-09-26 along with musterFlagCap itself.
 */
export const musterFlagTotalsForPlayer = (
  playerId: string,
  musterKeys: ReadonlySet<string> | undefined,
  tiles: ReadonlyMap<string, Pick<DomainTileState, "muster">>
): MusterFlagTotals => {
  let musterFlagCount = 0;
  let musterStagedManpower = 0;
  for (const key of musterKeys ?? []) {
    const muster = tiles.get(key)?.muster;
    if (!muster || muster.ownerId !== playerId) continue;
    musterFlagCount++;
    musterStagedManpower += muster.amount;
  }
  return { musterFlagCount, musterStagedManpower };
};
