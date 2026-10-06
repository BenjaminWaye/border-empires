import { afcBuildCost } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { prepareAfcLandingFootprint } from "./afc-landing-footprint/afc-landing-footprint.js";
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
  const ownedAfcCount = [...context.tiles.values()].filter((entry) => entry.ownerId === actor.id && entry.afc?.ownerId === actor.id).length;
  // A player who lost their last AFC rebuilds it for free, on any empty land
  // tile they own (FRONTIER included -- it is settled on landing).
  const isFreeRebuild = ownedAfcCount === 0;
  const ownershipOk = tile?.ownerId === actor.id && (tile.ownershipState === "SETTLED" || (isFreeRebuild && tile.ownershipState === "FRONTIER"));
  if (!tile || tile.terrain !== "LAND" || !ownershipOk || !isEmptyAfcSite(tile) || context.locksByTile.has(tileKey)) {
    return rejectCommand(context, command, "BUILD_INVALID", isFreeRebuild ? "Your new AFC needs an unlocked, empty land tile you control" : "AFCs need an unlocked, empty settled land tile you control");
  }
  const cost = isFreeRebuild ? 0 : afcBuildCost(ownedAfcCount);
  if (actor.points < cost) return rejectCommand(context, command, "INSUFFICIENT_GOLD", `AFC needs ${cost} coin`);
  actor.points -= cost;
  const footprint = prepareAfcLandingFootprint(context, tile.x, tile.y, command.commandId);
  const { frontierDecayAt: _decayAt, frontierDecayKind: _decayKind, ...siteTile } = tile;
  const afcTile: DomainTileState = { ...siteTile, ownershipState: "SETTLED", afc: { ownerId: actor.id, status: "active", activatedAt: context.now() } };
  context.replaceTileState(tileKey, afcTile, command.commandId);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: actor.id, tileDeltas: [afcTile, ...footprint].map((entry) => context.tileDeltaFromState(entry)) });
  context.emitPlayerStateUpdate(command);
  // A new AFC opens 8 slots: call down any module copies that were waiting for one.
  const delivery = afcModuleDeliveryContextFor(context);
  rebalanceOverfullAfcs(context, delivery, actor.id, command.commandId);
  backfillMissingHouseModules(context, delivery, actor.id, actor.techIds, command.commandId);
};
