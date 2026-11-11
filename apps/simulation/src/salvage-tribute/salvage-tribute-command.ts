import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { salvageLoadsRemaining, salvageTributeManpower } from "@border-empires/shared";
import type { AfcActiveCommandContext } from "../afc-specializations/afc-active-commands.js";
import { parseTilePayload } from "../runtime-command-parsers.js";
import { withResourceCleared } from "./salvage-field-clear.js";

/**
 * Ship one load of precursor salvage from a working Reclamation Works to the
 * Court. The Court sends an Imperial delivery of ancillaries worth a quarter of
 * the manpower cap (never above it). The last load empties the field: the
 * deposit and its Works are gone, so its arms bonus ends too.
 *
 * Court Strength in the space layer is not adjusted here: it lives in the
 * realtime gateway's galaxy service, which has no per-match hook yet.
 */
export function handleShipSalvageToCourt(context: AfcActiveCommandContext, command: CommandEnvelope): void {
  const { abilities } = context;
  const reject = (message: string): void => abilities.emitEvent({
    eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code: "SALVAGE_TRIBUTE_INVALID", message
  });
  const actor = abilities.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) return reject("invalid salvage coordinates");
  const key = `${payload.x},${payload.y}`;
  const tile = abilities.tiles.get(key);
  const works = tile?.economicStructure;
  if (!tile || tile.ownerId !== actor.id || tile.ownershipState !== "SETTLED" || tile.resource !== "PRECURSOR_SALVAGE" ||
      works?.ownerId !== actor.id || works.type !== "RECLAMATION_WORKS" || works.status !== "active") {
    return reject("select an active Reclamation Works you own");
  }
  const remaining = salvageLoadsRemaining(works);
  if (remaining <= 0) return reject("this salvage field is empty");
  // Settle at the old rates before the arms bonus or manpower changes.
  context.settleEconomy?.(actor);
  context.refreshManpower(actor);
  const cap = context.playerManpowerCap(actor);
  const delivered = salvageTributeManpower(actor.manpower, cap);
  if (delivered <= 0) return reject("your manpower is already full");
  actor.manpower += delivered;
  const shipped = (works.salvageLoadsShipped ?? 0) + 1;
  const updated = remaining - 1 > 0
    ? { ...tile, economicStructure: { ...works, salvageLoadsShipped: shipped } }
    : { ...tile, resource: undefined, economicStructure: undefined };
  abilities.replaceTileState(key, updated, command.commandId);
  const delta = abilities.tileDeltaFromState(updated);
  abilities.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: actor.id,
    tileDeltas: [updated.resource ? delta : withResourceCleared(delta)] });
  abilities.emitEvent({ eventType: "DOMAIN_UPDATE", commandId: command.commandId, playerId: actor.id,
    payloadJson: JSON.stringify({ manpower: actor.manpower, manpowerUpdatedAt: actor.manpowerUpdatedAt,
      manpowerBanked: actor.manpowerBanked ?? 0, waystationManpowerOverflow: actor.waystationManpowerOverflow ?? 0,
      salvageTribute: { x: tile.x, y: tile.y, delivered: Math.round(delivered), loadsLeft: remaining - 1 } }) });
  context.emitPlayerStateUpdate(command);
  abilities.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: actor.id });
}
