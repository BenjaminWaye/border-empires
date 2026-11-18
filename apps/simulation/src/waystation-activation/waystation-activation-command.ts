import { WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { VisibilityCoverageTracker } from "../visibility-coverage-cache.js";
import { parseTilePayload } from "../runtime-command-parsers.js";

type Context = {
  tiles: ReadonlyMap<string, DomainTileState>;
  visibilityCoverage: Pick<VisibilityCoverageTracker, "isVisible">;
  emitEvent: (event: SimulationEvent) => void;
};
type Activate = (key: string, x: number, y: number, playerId: string, commandId: string) => void;

/** Collection never claims land, bypasses combat, or rolls the same reward twice. */
export function handleActivateWaystationCommand(context: Context, command: CommandEnvelope, activate: Activate): void {
  const reject = (message: string): void => context.emitEvent({
    eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId,
    code: "WAYSTATION_UNAVAILABLE", message
  });
  const at = parseTilePayload(command.payloadJson);
  if (!at || !Number.isInteger(at.x) || !Number.isInteger(at.y) || at.x < 0 || at.y < 0 || at.x >= WORLD_WIDTH || at.y >= WORLD_HEIGHT) return reject("Invalid waystation location");
  const key = `${at.x},${at.y}`;
  const tile = context.tiles.get(key);
  if (!tile?.waystation || tile.waystation.activated) return reject("This waystation has already been taken or is unavailable");
  if (tile.ownerId !== command.playerId) return reject("Claim this tile before activating its waystation");
  if (!context.visibilityCoverage.isVisible(command.playerId, key)) return reject("The waystation must be visible");
  activate(key, at.x, at.y, command.playerId, command.commandId);
  if (!context.tiles.get(key)?.waystation?.activated) return reject("The waystation could not be activated");
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}
