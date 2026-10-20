import { MUSTER_ADVANCE_RANGE_STEPS, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { keyForTile } from "../client-app-runtime-utils.js";
import { hostileMusterNearBorder, isFriendlyOwner, type HostileMusterAlertState } from "../client-hostile-muster-alerts/client-hostile-muster-alerts.js";
import type { ActiveBattleOverlay } from "../client-battle-overlay/client-battle-overlay.js";
import type { Tile } from "../client-types.js";

// Diplomacy filters for the war-music signals (client-war-music-signal.ts).
// War music is about *your* wars: a fight between two other empires, a truce
// partner's flag, or your own flag parked on a border shared only with allies
// and truce partners is not war, so none of them may start the war tracks.

type MusterOnTile = NonNullable<Tile["muster"]>;

// Land owned by someone who isn't us, an ally, or a truce partner -- a
// barbarian or a rival empire. Neutral (unowned) land is not hostile.
const isHostileTileAt = (state: HostileMusterAlertState, x: number, y: number, nowMs: number): boolean => {
  const tile = state.tiles.get(keyForTile(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)));
  if (!tile?.ownerId || !tile.ownershipState) return false;
  return !isFriendlyOwner(state, tile.ownerId, nowMs);
};

// Whether any hostile tile sits within MUSTER_ADVANCE_RANGE_STEPS (toroidal
// Chebyshev distance) of (x, y) -- the reach of an ADVANCE flag, and so the
// area a flag of ours could actually be fighting over. At most (2r+1)^2 map
// lookups per own flag, and this only runs on the 500ms music tick.
const hostileTileWithinFlagRange = (state: HostileMusterAlertState, x: number, y: number, nowMs: number): boolean => {
  const radius = MUSTER_ADVANCE_RANGE_STEPS;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (isHostileTileAt(state, x + dx, y + dy, nowMs)) return true;
    }
  }
  return false;
};

/**
 * Whether the muster flag on `tile` belongs to a war of ours:
 *   - our own flag, when hostile land is within its reach (or, for a March,
 *     its target is hostile land). The sim's target scans already skip
 *     allied/truced tiles, but a flag can still report a busy-looking status
 *     with nothing hostile around (e.g. no manpower staged yet), so the music
 *     checks the neighbourhood itself.
 *   - someone else's flag, only when its owner is hostile and it is staged
 *     near our border (the same test the hostile-muster alert uses).
 */
export const isWarRelevantMuster = (state: HostileMusterAlertState, tile: Tile, muster: MusterOnTile, nowMs: number): boolean => {
  if (muster.ownerId !== state.me) return hostileMusterNearBorder(state, tile, nowMs) !== undefined;
  if (muster.mode === "MARCH" && muster.targetX !== undefined && muster.targetY !== undefined && isHostileTileAt(state, muster.targetX, muster.targetY, nowMs)) {
    return true;
  }
  return hostileTileWithinFlagRange(state, tile.x, tile.y, nowMs);
};

/** Whether a visible battle is one we're fighting, against someone who isn't an ally or truce partner. */
export const isOwnHostileBattle = (
  state: HostileMusterAlertState,
  battle: Pick<ActiveBattleOverlay, "attackerOwnerId" | "defenderOwnerId">,
  nowMs: number
): boolean => {
  if (!state.me) return false;
  if (battle.attackerOwnerId === state.me) return !isFriendlyOwner(state, battle.defenderOwnerId, nowMs);
  if (battle.defenderOwnerId === state.me) return !isFriendlyOwner(state, battle.attackerOwnerId, nowMs);
  return false;
};
