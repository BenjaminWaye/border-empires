// AETHER_EMP (Manifest plan §7 item 6 -- docs/manifest-aether-fixes-plan.md).
// The caster targets a hostile owned tile within observatory range; every
// Ambaric Transformer (AETHER_TOWER) that tile's owner controls within
// AETHER_EMP_RADIUS of it goes dark for AETHER_EMP_DURATION_MS. This stamps
// disabledUntil on the Tower's own economicStructure record and leaves
// status alone, the same lazy-expiry pattern fort.disabledUntil already
// uses elsewhere -- no separate reactivation tick needed. Every structure
// that depends on that Tower's power (Sky Docks, Resonance Grids,
// monuments) loses it for the same window automatically via
// isStructurePowered, which now also checks disabledUntil.
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { AETHER_EMP_COOLDOWN_MS, AETHER_EMP_DURATION_MS, AETHER_EMP_RADIUS, playerHasAbilityTech } from "@border-empires/game-domain";
import { parseTilePayload } from "./runtime-command-parsers.js";
import { isAlliedOrTruced } from "./runtime-player-factory.js";
import { wrappedChebyshev } from "./runtime-ability-helpers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { RuntimeAbilityCommandContext } from "./runtime-ability-command-handlers.js";

export function handleAetherEmpCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  const reject = (code: string, message: string): void =>
    context.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });

  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    reject("BAD_COMMAND", "invalid command payload");
    return;
  }
  if (!playerHasAbilityTech(actor.techIds, "aether_emp")) {
    reject("AETHER_EMP_INVALID", "requires Counterphase Core Module");
    return;
  }
  const target = context.tiles.get(simulationTileKey(payload.x, payload.y));
  if (!target || target.terrain !== "LAND" || !target.ownerId || target.ownerId === actor.id || isAlliedOrTruced(actor, target.ownerId)) {
    reject("AETHER_EMP_INVALID", "target hostile owned land");
    return;
  }
  if (context.isTileShieldedByEnemyObservatory(actor.id, target.x, target.y)) {
    reject("AETHER_EMP_INVALID", "blocked by observatory field");
    return;
  }
  const now = context.now();
  const observatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, now);
  if (!observatoryKey) {
    reject("AETHER_EMP_INVALID", "no ready observatory in range");
    return;
  }
  context.stampObservatoryCooldown(observatoryKey, AETHER_EMP_COOLDOWN_MS, now, command.commandId, command.playerId);

  const disabledUntil = now + AETHER_EMP_DURATION_MS;
  const struck: DomainTileState[] = [];
  for (const candidate of context.tiles.values()) {
    const tower = candidate.economicStructure;
    if (!tower || tower.type !== "AETHER_TOWER" || tower.ownerId !== target.ownerId || tower.status !== "active") continue;
    if (wrappedChebyshev(candidate.x, candidate.y, target.x, target.y) > AETHER_EMP_RADIUS) continue;
    struck.push({ ...candidate, economicStructure: { ...tower, disabledUntil } });
  }
  for (const tile of struck) context.replaceTileState(simulationTileKey(tile.x, tile.y), tile, command.commandId);
  if (struck.length > 0) {
    context.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: struck.map((tile) => context.tileDeltaFromState(tile))
    });
  }
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}
