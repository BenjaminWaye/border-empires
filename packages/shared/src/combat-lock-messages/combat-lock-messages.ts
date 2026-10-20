// Server rejection messages for combat locks, shared so the client can tell
// the cases apart without parsing free text. All three keep their existing
// error codes (LOCKED / MUSTER_UNDER_SIEGE); the message says which tile is
// the blocker.

/** LOCKED: the tile being attacked is already the target of another fight. */
export const COMBAT_LOCK_TARGET_MESSAGE = "tile locked in combat";

/**
 * LOCKED: the attacker's own launch tile is the target of an enemy fight, so
 * it can't send troops out until that fight resolves.
 */
export const COMBAT_LOCK_ORIGIN_UNDER_ATTACK_MESSAGE = "launch tile is under attack";

/**
 * MUSTER_UNDER_SIEGE: the muster flag's tile is the target of an enemy fight,
 * so the flag can't be cleared, set to Advance/March, or fund an attack until
 * that fight resolves.
 */
export const MUSTER_UNDER_SIEGE_MESSAGE = "muster flag is under siege";
