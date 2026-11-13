import { orderAfcReplacement, isClearAfcFootprint } from "./afc-owned-site/afc-recovery.js";
import { afcBuildCost } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { prepareAfcLandingFootprint } from "./afc-landing-footprint/afc-landing-footprint.js";
import { footprintHeldByRival } from "./landmark-super-tile/landmark-super-tile.js";
import { isEmptyAfcSite } from "./afc-owned-site/afc-owned-site.js";
import { backfillMissingHouseModules, rebalanceOverfullAfcs } from "./afc-module-commissioning.js";
import { afcModuleDeliveryContextFor } from "./runtime-redeploy-afc-module-command-handler.js";
import { parseBuildAfcPayload } from "./runtime-command-parsers.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import { rejectCommand } from "./runtime-structure-command-handlers-reject.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

export const handleBuildAfcCommand = (context: RuntimeStructureCommandContext, command: CommandEnvelope): void => {
  const actor = context.players.get(command.playerId);
  const payload = parseBuildAfcPayload(command.payloadJson);
  if (!actor || !payload) return rejectCommand(context, command, "BAD_COMMAND", "invalid AFC build command");
  const tileKey = simulationTileKey(payload.x, payload.y);
  const tile = context.tiles.get(tileKey);
  const ownedAfcCount = context.summaryForPlayer?.(actor.id).controlledAfcCount ?? [...context.tiles.values()].filter((entry) => entry.ownerId === actor.id && entry.afc?.ownerId === actor.id).length;
  // Replacements use the same durable delivery path for humans and AI.
  if (ownedAfcCount === 0) {
    const error = orderAfcReplacement(context, actor, command, payload.x, payload.y);
    if (error) return rejectCommand(context, command, "BUILD_INVALID", error);
    return;
  }
  if (context.summaryForPlayer && context.summaryForPlayer(actor.id).ownedAfcTileKeys.size === 0) {
    return rejectCommand(context, command, "AFC_REQUIRED", "Garrison your captured AFC before commissioning additional complexes");
  }
  const ownershipOk = tile?.ownerId === actor.id && tile.ownershipState === "SETTLED";
  if (!tile || tile.terrain !== "LAND" || !ownershipOk || !isEmptyAfcSite(tile) || !isClearAfcFootprint(context.tiles, tile.x, tile.y) || footprintHeldByRival(context.tiles, tile.x, tile.y, actor.id) || context.locksByTile.has(tileKey)) {
    return rejectCommand(context, command, "BUILD_INVALID", "AFCs need an unlocked garrisoned land tile with a clear 3×3 footprint");
  }
  const cost = afcBuildCost(ownedAfcCount);
  if (actor.points < cost) return rejectCommand(context, command, "INSUFFICIENT_GOLD", `AFC needs ${cost} coin`);
  actor.points -= cost;
  landBuiltAfc(context, actor, tile, `system-runtime:afc-build:${command.commandId}`);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: actor.id });
};

export function landBuiltAfc(context: RuntimeStructureCommandContext, actor: DomainPlayer, tile: DomainTileState, commandId: string, replacement = false): void {
  const tileKey = simulationTileKey(tile.x, tile.y);
  const footprint = prepareAfcLandingFootprint(context, tile.x, tile.y, commandId);
  const { frontierDecayAt: _decayAt, frontierDecayKind: _decayKind, ...siteTile } = tile;
  const afcTile: DomainTileState = { ...siteTile, ownershipState: "SETTLED", afc: { ownerId: actor.id, status: "active", activatedAt: context.now() } };
  context.replaceTileState(tileKey, afcTile, commandId);
  if (replacement) {
    // Restoring the lost capacity must not refill it as a newly acquired source.
    actor.manpowerCapSnapshot = context.playerManpowerCap(actor);
    actor.landingReserveGranted = true;
  }
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId: actor.id, tileDeltas: [afcTile, ...footprint].map((entry) => context.tileDeltaFromState(entry)) });
  context.emitPlayerStateUpdate({ playerId: actor.id, commandId });
  // A new AFC opens 8 slots: call down any module copies that were waiting for one.
  const delivery = afcModuleDeliveryContextFor(context);
  rebalanceOverfullAfcs(context, delivery, actor.id, commandId);
  backfillMissingHouseModules(context, delivery, actor.id, actor.techIds, commandId);
};
