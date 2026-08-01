import type { DomainTileState } from "@border-empires/game-domain";
import type { RuntimePlayer } from "./runtime-types.js";
import type { ResourceSlotTotals } from "./resource-slot-view/resource-slot-view.js";

export type WonderCacheByPlayer = Map<string, Set<string>>;

const applyWonderBonusFields = (player: RuntimePlayer, set: ReadonlySet<string>): void => {
  player.wonderObservatoryRangeBonus = set.has("WATCHTOWER_ENGINE") ? 10 : 0;
  player.wonderVisionRadiusBonus = set.has("CARTOGRAPHERS_LENS") ? 1 : 0;
  player.wonderDockGoldMultiplier = set.has("DEEPWATER_ENGINE") ? 2 : 1;
  player.wonderDockAttackMultiplier = set.has("DEEPWATER_ENGINE") ? 1.15 : 1;
  player.wonderMusterRateMultiplier = set.has("WARPRESS") ? 2 : 1;
  player.wonderMusterExtraFlag = set.has("WARPRESS") ? 1 : 0;
  player.wonderFortDefenseBonus = set.has("BASTION_FRAME") ? 0.5 : 0;
  player.wonderTechGoldDiscount = set.has("CALCULATING_ENGINE") ? 0.1 : 0;
};

// Rebuilds one player's owned-wonder-type set from their settled tiles and
// writes the derived per-wonder bonus fields onto the player object, so the
// shared formula functions (tech-domain-bridge, economy-network, ...) read
// them without needing runtime access themselves.
export const refreshPlayerWonders = (
  playerId: string,
  settledTiles: Iterable<DomainTileState>,
  wonderCacheByPlayer: WonderCacheByPlayer,
  players: Map<string, RuntimePlayer>
): void => {
  const set = new Set<string>();
  for (const tile of settledTiles) if (tile.naturalWonder) set.add(tile.naturalWonder.type);
  wonderCacheByPlayer.set(playerId, set);
  const player = players.get(playerId);
  if (player) applyWonderBonusFields(player, set);
};

export const playerHasWonderType = (wonderCacheByPlayer: WonderCacheByPlayer, playerId: string, type: string): boolean =>
  wonderCacheByPlayer.get(playerId)?.has(type) ?? false;

// Conscription Engine: on the tile's first-ever claim (any owner), grant an
// instant +2000 manpower to whoever just took it. `claimedAt` is the
// once-only latch; later ownership changes on the same tile no-op here.
export const applyConscriptionEngineFirstClaim = (tile: DomainTileState, players: Map<string, RuntimePlayer>, nowMs: number): void => {
  if (tile.naturalWonder?.type !== "CONSCRIPTION_ENGINE" || tile.naturalWonder.claimedAt || !tile.ownerId) return;
  tile.naturalWonder.claimedAt = nowMs;
  const player = players.get(tile.ownerId);
  if (player) player.manpower += 2000;
};

// Foundry Heart: +1 of every strategic resource slot for the controller.
export const applyFoundryHeartSlotBonus = (hasFoundryHeart: boolean, totals: ResourceSlotTotals): void => {
  if (!hasFoundryHeart) return;
  totals.FOOD += 1;
  totals.IRON += 1;
  totals.CRYSTAL += 1;
  totals.SUPPLY += 1;
};

// Quickforge: waive one rush-buy's gold cost per UTC day for the player. The
// "used today" marker lives on the player object as wonderLastFreeRushBuyAt
// so rush-buy pricing stays O(1).
export const quickforgeAdjustedRushPrice = (player: RuntimePlayer | undefined, hasQuickforge: boolean, price: number, nowMs: number): number => {
  if (price === 0 || !hasQuickforge) return price;
  const lastUse = player?.wonderLastFreeRushBuyAt ?? 0;
  const utcDayStart = Math.floor(nowMs / 86_400_000) * 86_400_000;
  return lastUse < utcDayStart ? 0 : price;
};

export const stampQuickforgeRushUse = (player: RuntimePlayer | undefined, nowMs: number): void => {
  if (!player) return;
  player.wonderLastFreeRushBuyAt = Math.floor(nowMs / 86_400_000) * 86_400_000;
};

// Deepwater Engine: attacks originating from a dock tile the attacker owns
// get the wonder's attack multiplier; everything else is unaffected.
export const dockAttackMultiplierForOrigin = (
  attacker: RuntimePlayer | undefined,
  originTile: DomainTileState | undefined,
  playerId: string
): number | undefined =>
  attacker?.wonderDockAttackMultiplier && originTile?.dockId && originTile.ownerId === playerId
    ? attacker.wonderDockAttackMultiplier
    : undefined;
