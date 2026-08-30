// Split out of economy-network.ts (already over the repo's 500-line cap) —
// see AGENTS.md's file-size discipline: an oversized file must shrink, not
// grow, so new logic goes in its own module instead of piling on.
import { converterExchangeGoldPerMinute, type DomainTileState } from "@border-empires/game-domain";
import { converterModeOf } from "@border-empires/shared";
import { supportTileBelongsToTown } from "./economy-network.js";

/**
 * EXCHANGE-mode converters (Aether Condenser/Titanium Works/Umbrite Works,
 * Advanced tiers included) built in a town's support ring: like Mintworks,
 * their gold becomes part of THIS town's own production
 * (townGoldPerMinuteForPlayer's converterGoldPerMinute param,
 * player-update-economy.ts) instead of paying out as separate empire-wide
 * income. This is the DomainTileState-based scan feeding the actual live
 * gold-crediting math (runtime-passive-income.ts credits
 * PlayerUpdateEconomySnapshot.incomePerMinute every tick) — see
 * live-town-summary.ts's supportedConverterGoldPerMinute for the wire-shaped
 * counterpart that only affects display.
 *
 * Returns the tile keys of every structure counted here too, so the caller
 * can skip adding that same structure's gold a second time as standalone
 * empire income (player-update-economy.ts's main settled-tile loop).
 */
export const supportedConverterGoldPerMinuteForTown = (
  playerId: string,
  townTile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>,
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set(),
  now: number = Date.now()
): { total: number; claimedTileKeys: Set<string> } => {
  let total = 0;
  const claimedTileKeys = new Set<string>();
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighborKey = `${townTile.x + dx},${townTile.y + dy}`;
      const neighbor = tiles.get(neighborKey);
      if (!neighbor || neighbor.ownerId !== playerId || neighbor.ownershipState !== "SETTLED") continue;
      if (!supportTileBelongsToTown(playerId, neighbor, townTile, tiles)) continue;
      const structure = neighbor.economicStructure;
      if (!structure || structure.ownerId !== playerId || structure.status !== "active") continue;
      if (dormantEconomicStructureKeys.has(neighborKey)) continue;
      if (typeof structure.modeLockedUntil === "number" && structure.modeLockedUntil > now) continue;
      const amountPerMinute = converterExchangeGoldPerMinute(structure.type, converterModeOf(structure));
      if (amountPerMinute <= 0) continue;
      total += amountPerMinute;
      claimedTileKeys.add(neighborKey);
    }
  }
  return { total, claimedTileKeys };
};
