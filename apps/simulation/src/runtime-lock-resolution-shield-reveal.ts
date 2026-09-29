import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { LockedCombatResolution, LockRecord, SimulationTileWireDelta } from "./runtime-types.js";

/** The subset of {@link RuntimeLockResolutionContext} applyShieldConsumptionAndReveal needs. */
export type RuntimeLockResolutionShieldRevealContext = {
  tiles: Map<string, DomainTileState>;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  consumeOriginMuster: (originKey: string, playerId: string, amount: number) => void;
};

/**
 * Shield flags (docs/muster-fronts-proposal.md §4): spends the defender's
 * matching flag's manpower, win or lose, same as the attacker's own manpower
 * -- computed at lock-creation time (buildLockedCombatResolution) but only
 * spent here, at resolve time, so the deduction reads the shield tile's live
 * amount rather than a possibly-stale snapshot from when the attack was
 * launched.
 *
 * Also forces the shield tile itself into the attacker's view, one-shot,
 * even without live fog-of-war coverage of it -- otherwise the battle
 * overlay's "reinforcements marching in" FX (client-battle-overlay.ts) would
 * have no tile data to animate from, and a losing attacker would see a
 * worse-than-expected result with no visible explanation (the reactive
 * shield reveal from docs/replenishment-update-plan.md workstream E, in
 * place of a client-side win-chance preview correction).
 */
export function applyShieldConsumptionAndReveal(
  context: RuntimeLockResolutionShieldRevealContext,
  lock: LockRecord,
  combatResolution: LockedCombatResolution | undefined,
  previousOwnerId: string | undefined
): void {
  if (lock.actionType !== "ATTACK" || !combatResolution?.shield || !previousOwnerId) return;
  context.consumeOriginMuster(combatResolution.shield.tileKey, previousOwnerId, combatResolution.shield.matched);
  const shieldTile = context.tiles.get(combatResolution.shield.tileKey);
  if (!shieldTile) return;
  const shieldRevealDelta: SimulationTileWireDelta = {
    ...context.tileDeltaFromState(shieldTile),
    forceVisibleForPlayerId: lock.playerId
  };
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: `${lock.commandId}:shield-reveal`,
    playerId: lock.playerId,
    tileDeltas: [shieldRevealDelta]
  });
}
