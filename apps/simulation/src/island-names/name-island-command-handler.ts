import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { ISLAND_NAMES_MESSAGE_TYPE, isIslandFullyGarrisoned, validateIslandName } from "@border-empires/shared";
import { rejectCommand, type RuntimeMapCommandContext } from "../runtime-map-command-handlers.js";
import { buildIslandLabels, islandLabelsForViewer } from "./island-labels.js";
import { islandNamesWorldFor, islandStandingFor, releaseIslandClaims } from "./island-names-world.js";

// NAME_ISLAND: the player who garrisons every LAND tile of an island names
// it (shared island-names.ts). A rival's earlier name on the same island is
// replaced. The namer gets the updated label list straight away; everyone
// else gets it from the ISLAND_NAMES ticker within a couple of seconds.
export function handleNameIslandCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  if (!actor) {
    rejectCommand(context, command, "UNKNOWN_PLAYER", "player not found");
    return;
  }
  let payload: { x?: unknown; y?: unknown; name?: unknown } | undefined;
  try {
    payload = JSON.parse(command.payloadJson) as typeof payload;
  } catch {
    payload = undefined;
  }
  if (!payload || !Number.isInteger(payload.x) || !Number.isInteger(payload.y) || typeof payload.name !== "string") {
    rejectCommand(context, command, "BAD_COMMAND", "invalid landmass name request");
    return;
  }
  const world = islandNamesWorldFor(context.tiles);
  const island = world.registry.islandAt(payload.x as number, payload.y as number);
  if (!island) {
    rejectCommand(context, command, "ISLAND_NOT_FOUND", "only landmasses can be named");
    return;
  }
  if (!isIslandFullyGarrisoned(islandStandingFor(island, context.tiles, actor.id, world.registry.width))) {
    rejectCommand(context, command, "ISLAND_NOT_HELD", "garrison every tile of this landmass to name it");
    return;
  }
  const validated = validateIslandName(payload.name);
  if (!validated.ok) {
    rejectCommand(context, command, "ISLAND_NAME_INVALID", validated.reason);
    return;
  }
  const now = context.now();
  releaseIslandClaims(context.players, island.id);
  actor.islandNames = [...(actor.islandNames ?? []), { islandId: island.id, name: validated.name, namedAt: now }];
  context.emitPlayerMessage(command, {
    type: ISLAND_NAMES_MESSAGE_TYPE,
    islands: islandLabelsForViewer(buildIslandLabels(world, context.tiles, context.players, now), actor.id)
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}
