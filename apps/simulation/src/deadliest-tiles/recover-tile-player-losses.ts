import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import { DEADLIEST_TILE_PERSIST_LIMIT } from "./deadliest-tiles.js";
import { recordSeasonTileLoss, restoreTilePlayerLosses, tilePlayerLosses, seasonTilePlayerLossGauge } from "./season-tile-player-losses.js";

/** Older deployments saved aggregate tile totals plus a bounded combat log.
 * Recover whatever attribution that log still contains. The stat reader only
 * publishes a player when attributed losses cover the entire saved total. */
export const recoverTilePlayerLosses = (
  totals: Map<string, number>,
  entries: readonly Pick<CombatManpowerLoss, "attackerId" | "x" | "y" | "manpowerLoss">[] | undefined
): void => {
  if (!entries) return;
  const recent = new Map<string, number>();
  let capHits = 0;
  for (const entry of entries) {
    const key = `${entry.x},${entry.y}`;
    if (!totals.has(key)) continue;
    if (!recent.has(key) && recent.size >= DEADLIEST_TILE_PERSIST_LIMIT) { capHits += 1; continue; }
    recordSeasonTileLoss(recent, key, entry.attackerId, entry.manpowerLoss);
  }
  for (const key of recent.keys()) restoreTilePlayerLosses(totals, key, tilePlayerLosses(recent, key));
  const gauge = seasonTilePlayerLossGauge(recent);
  if (capHits > 0 || gauge.capHits > 0) console.warn({ type: "season_tile_loss_recovery_cap", ...gauge, capHits: capHits + gauge.capHits });
};
