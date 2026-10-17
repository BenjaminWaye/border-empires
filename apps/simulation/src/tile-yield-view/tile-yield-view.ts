import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { DOCK_INCOME_PER_MIN, PASSIVE_INCOME_MULT, SETTLEMENT_BASE_GOLD_PER_MIN } from "@border-empires/game-domain";
import { dockBaseGoldPerMinuteForPlayer, type DockEconomyContext, type EconomyPlayer } from "../economy-network/economy-network.js";
import { supportedConverterGoldPerMinuteForTown } from "../economy-network/economy-network-converter-support.js";
import { townGoldPerMinuteForPlayer } from "../player-update-economy/player-update-economy.js";

export type TileYieldRateView = {
  goldPerMinute: number;
};

export type TileYieldView = {
  yieldRate: TileYieldRateView;
};

/**
 * Predicate: does this tile need server-authoritative `yieldRate` emission
 * because the client cannot re-derive its gold rate locally? Only docks
 * qualify — their income depends on dock-link topology and dock tech
 * multipliers the client doesn't have. Town gold is re-derived client-side
 * from townJson (packages/client/src/yield-derivation), so bare town and
 * structure tiles stay off the wire to preserve the bootstrap
 * payload-shrink savings (docs/plans/2026-05-30-bootstrap-payload-shrink.md).
 */
export const tileYieldNeedsServerAuthority = (tile: Pick<DomainTileState, "dockId">): boolean => Boolean(tile.dockId);

/**
 * Scans a player's settled tiles once and returns the "x,y" tile keys of
 * their active HYDROWORKS and ORE_REFINERY structures — the radius-source
 * lookups the Hydrogarden/Mine slot boosts need (resource-slot-view.ts).
 * Shared by the live runtime and the snapshot economy builders so every
 * path computes the exact same sets from the exact same predicate.
 */
export const radiusStructureKeysForSettledTiles = (
  settledTiles: Iterable<Pick<DomainTileState, "x" | "y" | "economicStructure">>
): { hydroworksKeys: Set<string>; oreRefineryKeys: Set<string> } => {
  const hydroworksKeys = new Set<string>();
  const oreRefineryKeys = new Set<string>();
  for (const tile of settledTiles) {
    if (tile.economicStructure?.status !== "active") continue;
    if (tile.economicStructure.type === "HYDROWORKS") {
      hydroworksKeys.add(`${tile.x},${tile.y}`);
    } else if (tile.economicStructure.type === "ORE_REFINERY") {
      oreRefineryKeys.add(`${tile.x},${tile.y}`);
    }
  }
  return { hydroworksKeys, oreRefineryKeys };
};

const roundPositive = (value: number, digits: number): number => {
  if (!(value > 0.0001)) return 0;
  return Number(value.toFixed(digits));
};

/** True when (x,y) is within `radius` (Chebyshev) of any "x,y" key in `candidateKeys`. */
// World-wrapping Chebyshev distance — matches coordsInChebyshevRadius
// (territory-automation.ts) so a source near one map edge still boosts a
// beneficiary near the opposite edge instead of appearing out of range.
const wrappedAxisDistance = (a: number, b: number, span: number): number => {
  const raw = Math.abs(a - b);
  return Math.min(raw, span - raw);
};

// Exported for reuse by resource-slot-view.ts (§5.3's Hydroworks->Hydrogarden
// FOOD-slot bonus).
export const withinRadiusOfAnyKey = (x: number, y: number, candidateKeys: ReadonlySet<string>, radius: number): boolean => {
  for (const candidateKey of candidateKeys) {
    const comma = candidateKey.indexOf(",");
    if (comma < 0) continue;
    const cx = Number(candidateKey.slice(0, comma));
    const cy = Number(candidateKey.slice(comma + 1));
    if (Math.max(wrappedAxisDistance(x, cx, WORLD_WIDTH), wrappedAxisDistance(y, cy, WORLD_HEIGHT)) <= radius) return true;
  }
  return false;
};

/**
 * A settled land tile's passive gold rate (town + dock income, after
 * sabotage). Tiles don't store or buffer yield — passive income is credited
 * straight to the treasury (runtime-passive-income.ts) — so this is purely
 * the per-tile rate shown in the tile menu.
 */
export const buildTileYieldView = (
  tile: DomainTileState,
  now: number,
  economyContext?: Partial<DockEconomyContext> & {
    player?: EconomyPlayer | undefined;
    fedTownKeys?: ReadonlySet<string> | undefined;
    firstThreeTownKeys?: ReadonlySet<string> | undefined;
  }
): TileYieldView | undefined => {
  if (tile.ownerId === undefined || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") return undefined;
  const economyPlayer = economyContext?.player;
  const incomeMultiplier = economyPlayer?.id === tile.ownerId ? economyPlayer.mods?.income ?? 1 : 1;

  const townGoldPerMinute = (() => {
    if (!tile.town) return 0;
    if (typeof tile.town.goldPerMinute === "number" && tile.town.goldPerMinute > 0.0001) return tile.town.goldPerMinute;
    if (tile.town.populationTier === "SETTLEMENT" || !tile.town.populationTier) {
      return SETTLEMENT_BASE_GOLD_PER_MIN * incomeMultiplier * PASSIVE_INCOME_MULT;
    }
    if (economyPlayer?.id !== tile.ownerId || !economyContext?.tiles || !economyContext.fedTownKeys) return 0;
    return townGoldPerMinuteForPlayer(
      economyPlayer,
      tile,
      tile.town,
      economyContext.tiles,
      economyContext.fedTownKeys,
      economyContext.firstThreeTownKeys,
      undefined,
      new Set(),
      supportedConverterGoldPerMinuteForTown(economyPlayer.id, tile, economyContext.tiles).total
    );
  })();
  const dockContext =
    economyContext?.tiles && economyContext.dockLinksByDockTileKey
      ? { tiles: economyContext.tiles, dockLinksByDockTileKey: economyContext.dockLinksByDockTileKey }
      : undefined;
  const dockGoldPerMinute =
    tile.dockId && economyPlayer?.id === tile.ownerId
      ? dockBaseGoldPerMinuteForPlayer(tile, economyPlayer, dockContext) * incomeMultiplier * PASSIVE_INCOME_MULT
      : tile.dockId ? DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT : 0;
  const outputMultiplier = tile.sabotage && tile.sabotage.endsAt > now ? Math.max(0, Math.min(1, tile.sabotage.outputMultiplier)) : 1;
  const goldPerMinute = (townGoldPerMinute + dockGoldPerMinute) * outputMultiplier;
  return { yieldRate: { goldPerMinute: roundPositive(goldPerMinute, 4) } };
};
