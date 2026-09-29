import { chebyshevWithWrap, SHIELD_RADIUS_TILES, type KnownShieldFlag } from "@border-empires/shared";
import type { Tile } from "./client-types.js";

// Workstream F3 (docs/replenishment-update-plan.md): the shield-area overlay
// and the shield-aware win-chance paint both need "which muster flags does
// this client currently know about, and what would they shield" -- kept in
// one place so both call sites agree on what's knowable.
//
// A tile only ever carries `tile.muster` in state.tiles when the server has
// actually sent it: the player's own tiles (always), an enemy tile currently
// in fog-of-war vision, or a tile forced visible one-shot by the shield-reveal
// feature (runtime-lock-resolution-shield-reveal.ts, CombatBroadcastPayload's
// `shield` field). This deliberately does NOT reconstruct a hidden enemy
// flag's coverage from anything the server didn't send -- there is no
// omniscient prediction here, only "what's currently on the client's own
// tile map".

/** Scans state.tiles for every currently-known muster flag (see module doc for what "known" means here). */
export const collectKnownShieldFlags = (tiles: Iterable<Tile>): KnownShieldFlag[] => {
  const flags: KnownShieldFlag[] = [];
  for (const tile of tiles) {
    if (!tile.muster) continue;
    flags.push({ x: tile.x, y: tile.y, ownerId: tile.muster.ownerId, mode: tile.muster.mode, amount: tile.muster.amount });
  }
  return flags;
};

/**
 * The known flag (if any) that would shield world tile (x, y), for the
 * shield-area overlay -- same matching rule as findKnownShieldAmount
 * (frontier-combat-win-chance-paint.ts), but returns the covering flag
 * itself (for its owner color) rather than just the amount, and isn't
 * restricted to a single target owner since the overlay draws coverage
 * around a flag regardless of what (if anything) currently occupies each
 * covered tile.
 */
export const tileShieldCoverage = (x: number, y: number, knownFlags: readonly KnownShieldFlag[]): KnownShieldFlag | undefined => {
  let best: KnownShieldFlag | undefined;
  for (const flag of knownFlags) {
    if (flag.amount <= 0) continue;
    const isSelfShield = flag.x === x && flag.y === y;
    const isAreaShield = flag.mode === "HOLD" && chebyshevWithWrap(flag.x, flag.y, x, y) <= SHIELD_RADIUS_TILES;
    if (!isSelfShield && !isAreaShield) continue;
    if (!best || flag.amount > best.amount) best = flag;
  }
  return best;
};
