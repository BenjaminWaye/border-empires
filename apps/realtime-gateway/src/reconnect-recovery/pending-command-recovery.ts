import type { StoredGatewayCommand } from "../command-store/command-store.js";
import type { PendingGatewayCommand } from "./reconnect-recovery.js";

// Reconnecting mid-action (e.g. a real page reload while an EXPAND/ATTACK
// lock is still resolving) previously lost all memory of that in-flight
// command: the client's actionCurrent is empty in the fresh page load, so
// the eventual FRONTIER_RESULT/ACTION_ACCEPTED for it got silently dropped
// as "not mine" (matchesCurrentFrontierCommand's strict mode) even though
// the gateway only ever delivers those two message types privately to the
// acting player. This surfaces the gateway's own unresolved-command ledger
// so the client can re-seed actionCurrent on INIT and correctly adopt that
// later result instead of discarding it.
export function toPendingGatewayCommands(commands: readonly StoredGatewayCommand[]): PendingGatewayCommand[] {
  return commands
    .filter((command): command is StoredGatewayCommand & { status: "QUEUED" | "ACCEPTED" } =>
      command.status === "QUEUED" || command.status === "ACCEPTED")
    .map((command): PendingGatewayCommand => {
      const payload = payloadMoveCoords(command.payloadJson);
      return {
        commandId: command.commandId,
        clientSeq: command.clientSeq,
        type: command.type,
        status: command.status,
        queuedAt: command.queuedAt,
        ...(typeof command.acceptedAt === "number" ? { acceptedAt: command.acceptedAt } : {}),
        ...(payload ? { payload } : {})
      };
    });
}

function payloadMoveCoords(payloadJson: string): { fromX: number; fromY: number; toX: number; toY: number } | undefined {
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const { fromX, fromY, toX, toY } = payload;
    if (
      typeof fromX === "number" && typeof fromY === "number" &&
      typeof toX === "number" && typeof toY === "number"
    ) {
      return { fromX, fromY, toX, toY };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
