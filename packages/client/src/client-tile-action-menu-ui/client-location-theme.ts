import { WORLD_WIDTH, WORLD_HEIGHT, supportRingRadiusForTier } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import type { LocationTheme } from "../client-audio/client-audio.js";

/**
 * A support tile is a plain owned tile within one of the player's own
 * (non-settlement) towns' support rings — there's no dedicated field for it.
 * Radius is tier-aware (supportRingRadiusForTier: 1 for most tiers, 2 for
 * GREAT_CITY/METROPOLIS) — a flat `dx <= 1 && dy <= 1` here used to silently
 * exclude a wide-ring town's distance-2 tiles, so this only ever played the
 * town location theme on the base 8, not the full ring.
 */
const isOwnedTownSupportTile = (state: ClientState, tile: Tile): boolean => {
  for (const candidate of state.tiles.values()) {
    if (!candidate.town || candidate.ownerId !== state.me || candidate.ownershipState !== "SETTLED") continue;
    if (candidate.town.populationTier === "SETTLEMENT") continue;
    const dx = Math.min(Math.abs(candidate.x - tile.x), WORLD_WIDTH - Math.abs(candidate.x - tile.x));
    const dy = Math.min(Math.abs(candidate.y - tile.y), WORLD_HEIGHT - Math.abs(candidate.y - tile.y));
    if (dx === 0 && dy === 0) continue;
    if (Math.max(dx, dy) <= supportRingRadiusForTier(candidate.town.populationTier)) return true;
  }
  return false;
};

type BattleState = Pick<ClientState, "activeBattles" | "capture" | "incomingAttacksByTile" | "outgoingMusterAttacksByTile">;

/**
 * Whether a fight is underway on this tile right now — the same sources the
 * tile menu's "Battle in progress" / "Under attack" / "Being captured" /
 * "Battle resolved" cards read: the viewer's own manual attack
 * (state.capture), a muster attack they launched, an attack on a tile they
 * own that has arrived ("Attack incoming" while still marching doesn't
 * count), or a resolved battle whose combat animation is still playing
 * (attacker, defender or bystander).
 * Frontier expansions are claims, not battles, so they don't count.
 */
export const isTileInOngoingBattle = (state: BattleState, tile: Tile, nowMs: number = Date.now()): boolean => {
  if (tile.fogged) return false;
  const key = `${tile.x},${tile.y}`;
  const battle = state.activeBattles.get(key);
  if (battle && battle.endAt > nowMs) return true;
  const capture = state.capture;
  if (capture && capture.actionType === "ATTACK" && capture.target.x === tile.x && capture.target.y === tile.y && capture.resolvesAt > nowMs) return true;
  const outgoing = state.outgoingMusterAttacksByTile.get(key);
  if (outgoing && !outgoing.isExpand && outgoing.resolvesAt > nowMs) return true;
  const incoming = state.incomingAttacksByTile.get(key);
  return Boolean(incoming && incoming.resolvesAt > nowMs && (incoming.transitEndsAt ?? 0) <= nowMs);
};

/** An ongoing battle outranks the tile's own location theme — a town under siege plays the battle cue, not the town one. */
export const locationThemeForTile = (state: ClientState, tile: Tile, nowMs: number = Date.now()): LocationTheme | undefined => {
  if (isTileInOngoingBattle(state, tile, nowMs)) return "battle";
  if (tile.town) return "town";
  if (tile.dockId) return "dock";
  if (tile.naturalWonder) return "wonder";
  if (isOwnedTownSupportTile(state, tile)) return "town";
  return undefined;
};
