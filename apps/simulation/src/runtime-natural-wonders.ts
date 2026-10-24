import { appendPlayerEventLogEntry, type DomainTileState } from "@border-empires/game-domain";
import { RELIC_DEFINITIONS, isRedesignedRelic, quickforgeAdjustedRushPrice as sharedQuickforgeAdjustedRushPrice } from "@border-empires/shared";
import type { RuntimePlayer } from "./runtime-types.js";
import type { ResourceSlotTotals } from "./resource-slot-view/resource-slot-view.js";
import { naturalWonderClaimEventText } from "./natural-wonder-claim-text.js";

export type WonderCacheByPlayer = Map<string, Set<string>>;

const applyWonderBonusFields = (player: RuntimePlayer, set: ReadonlySet<string>): void => {
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
  const redesigned = new Set<string>();
  for (const tile of settledTiles) {
    if (!tile.naturalWonder) continue;
    (isRedesignedRelic(tile.naturalWonder) ? redesigned : set).add(tile.naturalWonder.type);
  }
  wonderCacheByPlayer.set(playerId, set);
  const player = players.get(playerId);
  if (player) {
    applyWonderBonusFields(player, set);
    player.relicDevelopmentBonus = redesigned.has("CALCULATING_ENGINE") ? 1 : 0;
    if (redesigned.has("DEEPWATER_ENGINE")) { player.wonderDockGoldMultiplier = 2; player.wonderDockAttackMultiplier = 1.15; }
  }
};

export const playerHasWonderType = (wonderCacheByPlayer: WonderCacheByPlayer, playerId: string, type: string): boolean =>
  wonderCacheByPlayer.get(playerId)?.has(type) ?? false;

// Conscription Engine: on the tile's first-ever claim (any owner), grant an
// instant +2000 manpower to whoever just took it. `claimedAt` is the
// once-only latch; later ownership changes on the same tile no-op here.
export const applyConscriptionEngineFirstClaim = (tile: DomainTileState, players: Map<string, RuntimePlayer>, nowMs: number): void => {
  if (isRedesignedRelic(tile.naturalWonder) || tile.naturalWonder?.type !== "CONSCRIPTION_ENGINE" || tile.naturalWonder.claimedAt || !tile.ownerId) return;
  tile.naturalWonder.claimedAt = nowMs;
  const player = players.get(tile.ownerId);
  if (player) player.manpower += 2000;
};

// Every claim (not just first-ever) drops a "Recent Events" entry for the
// new human owner — mirrors TOWN_LOST/MONUMENT_CLAIMED. AI/barbarian owners
// don't have anyone reading their event log, so skip them.
export const announceNaturalWonderClaim = (tile: DomainTileState, players: Map<string, RuntimePlayer>, nowMs: number): void => {
  if (!tile.naturalWonder || !tile.ownerId) return;
  const player = players.get(tile.ownerId);
  if (!player || player.id.startsWith("barbarian-") || player.isAi) return;
  appendPlayerEventLogEntry(player, {
    type: "NATURAL_WONDER_CLAIMED",
    text: isRedesignedRelic(tile.naturalWonder) ? `You secured ${RELIC_DEFINITIONS[tile.naturalWonder.type].name}. Garrison the installation to operate its surviving machinery and reserves.` : naturalWonderClaimEventText(tile.naturalWonder.type),
    occurredAt: nowMs,
    x: tile.x,
    y: tile.y
  });
};

// Foundry Heart: +1 of every strategic resource slot for the controller.
export const applyFoundryHeartSlotBonus = (hasFoundryHeart: boolean, totals: ResourceSlotTotals): void => {
  if (!hasFoundryHeart) return;
  totals.FOOD += 1;
  totals.TITANIUM += 1;
  totals.CRYSTAL += 1;
  totals.UMBRITE += 1;
};

// Quickforge: discount one rush-buy per UTC day for the player. The "used
// today" marker lives on the player object as wonderLastFreeRushBuyAt so
// rush-buy pricing stays O(1). The actual discount formula lives in
// @border-empires/shared (quickforgeAdjustedRushPrice) so the client's
// rush-buy price preview can compute the identical number.
export const quickforgeAdjustedRushPrice = (player: RuntimePlayer | undefined, hasQuickforge: boolean, price: number, nowMs: number): number =>
  sharedQuickforgeAdjustedRushPrice(hasQuickforge, price, player?.wonderLastFreeRushBuyAt ?? 0, nowMs);

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

// Watchtower Engine: the wonder tile itself IS an Observatory for its
// controller — full cast-ability eligibility (pickReadyOwnedObservatory*)
// and the same per-tile cooldownUntil, at the base OBSERVATORY_CAST_RADIUS
// (20, already well past "10+") since it stacks with a player's other
// tech/domain range bonuses like any real observatory. Kept exempt from
// CRYSTAL slot demand (buildDemandContributors) so it never goes dormant —
// "no upkeep" is the wonder's whole point. Synced on every ownership change
// so a captured wonder immediately grants/revokes casting for the new/old
// owner; cooldownUntil carries over across ownership changes on purpose
// (a freshly captured tower shouldn't reset someone else's cooldown clock).
export const syncWatchtowerObservatory = (tile: DomainTileState): void => {
  if (tile.naturalWonder?.type !== "WATCHTOWER_ENGINE") return;
  // A same-owner re-sync (e.g. the wonder tile settling) must not drop an
  // active Siphon lock; an owner change ends it (siphon-mode-lifecycle.ts).
  const sameOwner = tile.observatory?.ownerId === tile.ownerId;
  const { siphon, ...preserved } = tile.observatory ?? {};
  tile.observatory = tile.ownerId
    ? { ...preserved, ownerId: tile.ownerId, status: isRedesignedRelic(tile.naturalWonder) && tile.ownershipState !== "SETTLED" ? "inactive" : "active", ...(sameOwner && siphon ? { siphon } : {}) }
    : undefined;
};

/** Refresh owner-derived fields when control, garrison or installation kind changes. */
export function refreshWonderOwners(tile: DomainTileState, previous: DomainTileState | undefined, settledTiles: (id: string) => Iterable<DomainTileState>, cache: WonderCacheByPlayer, players: Map<string, RuntimePlayer>, now: number): void {
  if (!tile.naturalWonder && !previous?.naturalWonder) return;
  if (tile.ownerId === previous?.ownerId && tile.ownershipState === previous?.ownershipState && tile.naturalWonder?.type === previous?.naturalWonder?.type && tile.naturalWonder?.relicVersion === previous?.naturalWonder?.relicVersion) return;
  for (const id of new Set([previous?.ownerId, tile.ownerId])) if (id) refreshPlayerWonders(id, settledTiles(id), cache, players);
  if (tile.ownerId !== previous?.ownerId) announceNaturalWonderClaim(tile, players, now);
}

/** Run before snapshotting, only for ownership/garrison/installation transitions. */
export function prepareWonderTileWrite(tile: DomainTileState, previous: DomainTileState | undefined, players: Map<string, RuntimePlayer>, now: number): void {
  const changed = tile.ownerId !== previous?.ownerId || tile.ownershipState !== previous?.ownershipState || tile.naturalWonder?.type !== previous?.naturalWonder?.type || tile.naturalWonder?.relicVersion !== previous?.naturalWonder?.relicVersion;
  if (!changed) return;
  syncWatchtowerObservatory(tile);
  if (tile.ownerId !== previous?.ownerId) applyConscriptionEngineFirstClaim(tile, players, now);
}
