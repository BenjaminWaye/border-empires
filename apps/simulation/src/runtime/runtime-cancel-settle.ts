import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { PendingSettlementRecord } from "../player-runtime-summary.js";
import type { RuntimePlayer } from "../runtime-types.js";
import { parseSettlePayload } from "../runtime-command-parsers.js";
import { refundSettleCost } from "../runtime-settlement-rules.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { dropTileClaimContinuation } from "../runtime-claim-continuation-command-handlers.js";
import { tryDrainDevQueue, type RuntimeDevQueueCommandContext } from "../runtime-dev-queue-command-handlers.js";

type CommandRef = Pick<CommandEnvelope, "commandId" | "playerId">;

/** Dependencies {@link handleCancelSettleCommand} reads from the runtime. */
export type RuntimeCancelSettleContext = {
  players: ReadonlyMap<string, RuntimePlayer>;
  pendingSettlementsByTile: ReadonlyMap<string, PendingSettlementRecord>;
  removePendingSettlement: (tileKey: string) => void;
  playerManpowerCap: (player: RuntimePlayer) => number;
  rejectCommand: (command: CommandRef, code: string, message: string) => void;
  emitPlayerStateUpdate: (command: CommandRef) => void;
  emitEvent: (event: { eventType: "COMMAND_RESOLVED"; commandId: string; playerId: string }) => void;
  /** The player's dev queue: the tile's queued build is dropped, then the queue drains into the freed slot (see tryDrainDevQueue). */
  devQueue: RuntimeDevQueueCommandContext;
};

/** CANCEL_SETTLE: stops the player's own in-progress garrison on a tile, refunds its gold and manpower, and cancels any build queued to follow it. */
export const handleCancelSettleCommand = (ctx: RuntimeCancelSettleContext, command: CommandEnvelope): void => {
  const actor = ctx.players.get(command.playerId);
  const payload = parseSettlePayload(command.payloadJson);
  if (!actor || !payload) { ctx.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const pendingSettlement = ctx.pendingSettlementsByTile.get(targetKey);
  if (!pendingSettlement || pendingSettlement.ownerId !== command.playerId) {
    ctx.rejectCommand(command, "SETTLE_CANCEL_INVALID", "no garrisoning in progress on tile");
    return;
  }
  ctx.removePendingSettlement(targetKey);
  dropTileClaimContinuation(ctx.devQueue, command.playerId, targetKey);
  refundSettleCost(actor, pendingSettlement.goldCost, ctx.playerManpowerCap(actor));
  ctx.emitPlayerStateUpdate(command);
  ctx.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  tryDrainDevQueue(ctx.devQueue, command.playerId); // slot freed -- see tryDrainDevQueue doc comment
};
