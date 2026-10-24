import { handleForcedAncillarification } from "../forced-ancillarification/forced-ancillarification-command.js";
import { afcPlayerStatePayload } from "./afc-player-state.js";
import type { DomainPlayer } from "@border-empires/game-domain";
import { AETHER_LANCE_COOLDOWN_MS } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { isObservatoryInSiphonMode } from "@border-empires/shared";
import type { RuntimeAbilityCommandContext } from "../runtime-ability-command-handlers.js";
import { observatoryCooldownMsForActor } from "../runtime-ability-command-handlers.js";
import { additiveEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import { parseTilePayload } from "../runtime-command-parsers.js";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import { grantOverflowManpower } from "../runtime-manpower-ceiling.js";

export interface AfcActiveCommandContext {
  abilities: RuntimeAbilityCommandContext;
  playerManpowerCap: (player: DomainPlayer) => number;
  settleEconomy?: (player: DomainPlayer) => void;
  refreshManpower: (player: DomainPlayer) => void;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
}
export function handleAfcActiveCommand(context: AfcActiveCommandContext, command: CommandEnvelope): void {
  if (command.type === "FORCED_ANCILLARIFICATION") return handleForcedAncillarification(context, command);
  const { abilities } = context;
  const reject = (message: string): void => abilities.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code: "AFC_UPGRADE_INVALID", message });
  const actor = abilities.players.get(command.playerId);
  if (!actor) return reject("unknown player");
  if (command.type === "RECRUIT_ANCILLARIES") {
    const rate = additiveEffectForPlayer(actor, "orbitalRecruitmentMpPerCoin");
    if (rate <= 0) return reject("requires Orbital Recruitment Contract");
    let coin: unknown;
    try { coin = (JSON.parse(command.payloadJson) as { coin?: unknown }).coin; } catch { return reject("invalid Coin amount"); }
    if (typeof coin !== "number" || !Number.isSafeInteger(coin) || coin <= 0 || !Number.isSafeInteger(coin * rate)) return reject("enter a positive whole Coin amount");
    context.settleEconomy?.(actor);
    context.refreshManpower(actor);
    if (coin > actor.points) return reject("not enough Coin");
    actor.points -= coin;
    grantOverflowManpower(actor, coin * rate, context.playerManpowerCap(actor));
    abilities.emitEvent({ eventType: "DOMAIN_UPDATE", commandId: command.commandId, playerId: actor.id, payloadJson: JSON.stringify({ ...afcPlayerStatePayload(actor), gold: actor.points }) });
    context.emitPlayerStateUpdate(command);
    abilities.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    return;
  }
  if (command.type !== "SUPPRESS_AETHER_TOWER") return reject("unknown AFC action");
  const duration = additiveEffectForPlayer(actor, "towerSuppressionDurationMs");
  if (duration <= 0) return reject("requires Counterphase Emitter");
  const payload = parseTilePayload(command.payloadJson);
  if (!payload) return reject("invalid tower coordinates");
  const key = `${payload.x},${payload.y}`;
  const target = abilities.tiles.get(key);
  if (!target?.observatory || target.terrain !== "LAND" || !target.ownerId || target.ownerId === actor.id ||
      target.observatory.ownerId !== target.ownerId || target.observatory.status !== "active" || isAlliedOrTruced(actor, target.ownerId)) return reject("select a hostile active Aether Tower");
  if (abilities.isTileShieldedByEnemyAegisDome(actor.id, target.x, target.y)) return reject("blocked by an Aegis Dome");
  const now = abilities.now();
  const caster = abilities.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, now);
  if (!caster) return reject("no ready Aether Tower in range");
  if (isObservatoryInSiphonMode(target.observatory) && target.observatory.siphon) {
    abilities.siphonModeLifecycle.endSiphon({ observatoryKey: key, casterId: target.ownerId, tileKeys: target.observatory.siphon.tileKeys, reason: "caster_observatory_lost" }, command.commandId);
  }
  const latest = abilities.tiles.get(key)!;
  if (!latest.observatory) return reject("the target tower is no longer available");
  const suppressed = { ...latest, observatory: { ...latest.observatory, suppressedUntil: Math.max(latest.observatory.suppressedUntil ?? 0, now + duration) } };
  abilities.replaceTileState(key, suppressed, command.commandId);
  abilities.stampObservatoryCooldown(caster, observatoryCooldownMsForActor(actor, AETHER_LANCE_COOLDOWN_MS), now, command.commandId, actor.id);
  abilities.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: actor.id, tileDeltas: [abilities.tileDeltaFromState(suppressed)] });
  abilities.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}
