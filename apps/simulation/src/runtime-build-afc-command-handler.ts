import { afcBuildCost } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { prepareAfcLandingFootprint } from "./afc-landing-footprint/afc-landing-footprint.js";
import { isEmptyAfcSite } from "./afc-owned-site/afc-owned-site.js";
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
  if (!tile || tile.terrain !== "LAND" || tile.ownerId !== actor.id || tile.ownershipState !== "SETTLED" || !isEmptyAfcSite(tile) || context.locksByTile.has(tileKey)) {
    return rejectCommand(context, command, "BUILD_INVALID", "AFCs need an unlocked, empty settled land tile you control");
  }
  const ownedAfcCount = [...context.tiles.values()].filter((entry) => entry.ownerId === actor.id && entry.afc).length;
  const cost = afcBuildCost(ownedAfcCount);
  if (actor.points < cost) return rejectCommand(context, command, "INSUFFICIENT_GOLD", `AFC needs ${cost} coin`);
  actor.points -= cost;
  const footprint = prepareAfcLandingFootprint(context, tile.x, tile.y, command.commandId);
  const afcTile: DomainTileState = { ...tile, afc: { ownerId: actor.id, status: "active", activatedAt: context.now() } };
  context.replaceTileState(tileKey, afcTile, command.commandId);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: actor.id, tileDeltas: [afcTile, ...footprint].map((entry) => context.tileDeltaFromState(entry)) });
  context.emitPlayerStateUpdate(command);
};
