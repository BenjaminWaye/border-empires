import type { ClientState } from "../client-state/client-state.js";

// Extracted from client-network-init-message.ts (over its 500-line cap).
//
// A real page reload while an EXPAND/ATTACK lock is still resolving on the
// server previously lost all local memory of that in-flight command: the
// fresh page's actionCurrent is empty, so the eventual ACTION_ACCEPTED /
// FRONTIER_RESULT for it got silently dropped by matchesCurrentFrontierCommand
// as "not mine" -- even though the gateway only ever delivers those two
// message types privately to the acting player (see queueOrSendSessionPayload
// call sites in gateway-app.ts), so any one this client receives genuinely is
// its own. The gateway's INIT payload now reports the player's own
// unresolved commands via recovery.pendingCommands (see
// reconnect-recovery.ts); seed actionCurrent from the most recent
// EXPAND/ATTACK there so that later result is matched and adopted normally
// instead of being discarded.
export const applyInitPendingAction = (
  state: Pick<ClientState, "actionCurrent">,
  msg: unknown
): void => {
  if (state.actionCurrent) return;
  const pendingCommands = (msg as { recovery?: { pendingCommands?: unknown } }).recovery?.pendingCommands;
  if (!Array.isArray(pendingCommands)) return;
  for (const entry of pendingCommands) {
    const command = entry as {
      commandId?: unknown;
      clientSeq?: unknown;
      type?: unknown;
      status?: unknown;
      payload?: { toX?: unknown; toY?: unknown };
    };
    if (command.status !== "ACCEPTED") continue;
    if (command.type !== "EXPAND" && command.type !== "ATTACK") continue;
    const target = command.payload;
    if (typeof target?.toX !== "number" || typeof target?.toY !== "number") continue;
    state.actionCurrent = {
      x: target.toX,
      y: target.toY,
      retries: 0,
      actionType: command.type,
      ...(typeof command.commandId === "string" && command.commandId ? { commandId: command.commandId } : {}),
      ...(typeof command.clientSeq === "number" ? { clientSeq: command.clientSeq } : {})
    };
    return;
  }
};
