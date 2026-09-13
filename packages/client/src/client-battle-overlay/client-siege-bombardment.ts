import type { ActiveBattleOverlay } from "./client-battle-overlay.js";
import type { ClientState } from "../client-state/client-state.js";
import { nearestSiegeOutpostTileForBattle, type FortificationOverlayDeps } from "../client-fortification-overlays/client-fortification-overlays.js";

// How long a battery's cosmetic aim override sticks before it falls back to
// its normal nearest-rival-tile idle facing (client-fortification-overlays.ts).
// Long enough to read as "aim, then fire" alongside the purple bombard FX
// (client-map-3d-bombard-fx.ts), short enough that a battery isn't stuck
// aiming at a long-finished battle.
export const SIEGE_AIM_DURATION_MS = 1800;

/**
 * Client-visual only: when a new battle starts (see
 * registerActiveBattleFromTileDelta in client-battle-overlay.ts), finds the
 * attacker's nearest in-range Siege Battery/Tower/Dread Tower and makes it
 * turn to aim at the battle tile and fire a purple ("Umbrite") bombardment
 * effect there. Only the attacker's own structures react -- siege is
 * offense-only for this feature. No-ops silently when no attacker-owned
 * siege structure is in range; never affects combat resolution.
 *
 * Call once per newly-registered battle (i.e. only when
 * `!state.activeBattles.has(key)` was true immediately before this battle's
 * registerActiveBattleFromTileDelta call). Deliberately does not attempt to
 * reserve a battery for a single battle: a siege structure already boosts
 * every ongoing battle in its range at once (attackerOutpostMult in
 * frontier-combat.ts), so when a battery is in range of two battles that
 * start close together it simply retargets to the most recent one --
 * last write wins on state.siegeAimOverrides.
 */
export const triggerSiegeBombardmentForNewBattle = (
  state: Pick<ClientState, "siegeAimOverrides" | "siegeBombardFxQueue">,
  fortDeps: FortificationOverlayDeps,
  battle: Pick<ActiveBattleOverlay, "attackerOwnerId" | "targetX" | "targetY">,
  nowMs: number
): void => {
  // Prune expired overrides here rather than adding a separate per-frame
  // pass: this map only ever grows on a new battle, so reclaiming space at
  // that same moment keeps it bounded by the count of siege structures that
  // have fired recently, never by total battles fought this session.
  for (const [key, override] of state.siegeAimOverrides) {
    if (override.expiresAt <= nowMs) state.siegeAimOverrides.delete(key);
  }
  const battery = nearestSiegeOutpostTileForBattle(fortDeps, battle.targetX, battle.targetY, battle.attackerOwnerId);
  if (!battery) return;
  state.siegeAimOverrides.set(fortDeps.keyFor(battery.x, battery.y), {
    targetX: battle.targetX,
    targetY: battle.targetY,
    expiresAt: nowMs + SIEGE_AIM_DURATION_MS
  });
  state.siegeBombardFxQueue.push({ x: battle.targetX, y: battle.targetY, queuedAt: Date.now() });
};
