// COLLECT_TILE: credit one settled owned tile's accumulated yield to its owner.
// Extracted from runtime.ts (500-line cap); behavior unchanged.
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { parseTilePayload } from "./runtime-command-parsers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { RuntimePlayer, SimulationTileWireDelta } from "./runtime-types.js";

type CommandRef = Pick<CommandEnvelope, "commandId" | "playerId">;

export type RuntimeCollectTileCommandContext = {
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  now: () => number;
  rejectCommand: (command: CommandRef, code: string, message: string) => void;
  applyManpowerRegen: (player: RuntimePlayer) => void;
  collectTileYield: (
    tile: DomainTileState,
    now: number,
    command: CommandRef
  ) => { gold: number; strategic: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>> };
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitPlayerStateUpdate: (command: CommandRef) => void;
};

export function handleCollectTileCommand(context: RuntimeCollectTileCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  context.applyManpowerRegen(actor);
  const target = context.tiles.get(simulationTileKey(payload.x, payload.y));
  if (!target || target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
    context.rejectCommand(command, "COLLECT_EMPTY", "tile is not a settled owned tile"); return;
  }

  const collected = context.collectTileYield(target, context.now(), command);
  const gold = collected.gold;
  const strategic = collected.strategic;
  const touched = gold > 0 || Object.values(strategic).some((value) => Number(value) > 0);
  if (!touched) { context.rejectCommand(command, "COLLECT_EMPTY", "yield is empty"); return; }
  actor.points += gold;
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(target)]
  });
  context.emitEvent({
    eventType: "COLLECT_RESULT",
    commandId: command.commandId,
    playerId: command.playerId,
    mode: "tile",
    x: payload.x,
    y: payload.y,
    tiles: 1,
    gold,
    strategic
  });
  context.emitPlayerStateUpdate(command);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}
